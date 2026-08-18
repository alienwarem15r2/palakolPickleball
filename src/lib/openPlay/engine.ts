import { PlayerStats, Skill, Team } from "@/lib/types";
import { OpenPlayGame, OpenPlayPlayer, OpenPlayState } from "./types";
import { makeCourt } from "./state";
import { assertScores, compareStanding, pairFour, pairKey, partnerHistory, shuffled } from "@/lib/engine";
import type { StandingRow } from "@/lib/engine";

// Unique id. Never reuses an id, so a new player can't inherit the record of
// someone who checked out earlier in the session.
function newId(): string {
  return `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name can't be blank.");
  return trimmed;
}

export function isPlaying(state: OpenPlayState, id: string): boolean {
  return state.courts.some((c) =>
    [...(c.team1 ?? []), ...(c.team2 ?? [])].includes(id)
  );
}

function assertNotPlaying(state: OpenPlayState, id: string) {
  if (isPlaying(state, id)) {
    throw new Error("That player is on court — record the current game first.");
  }
}

export function checkIn(state: OpenPlayState, name: string, skill: Skill): OpenPlayState {
  const player: OpenPlayPlayer = {
    id: newId(),
    name: requireName(name),
    skill,
    resting: false,
    left: false,
  };
  return {
    ...state,
    players: [...state.players, player],
    queue: [...state.queue, player.id], // back of the line
    stats: { ...state.stats, [player.id]: { gp: 0, w: 0, pf: 0, pa: 0 } },
    updatedAt: Date.now(),
  };
}

function mapPlayer(
  state: OpenPlayState,
  id: string,
  change: (p: OpenPlayPlayer) => OpenPlayPlayer
): OpenPlayState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? change(p) : p)),
    updatedAt: Date.now(),
  };
}

export function renamePlayer(state: OpenPlayState, id: string, name: string): OpenPlayState {
  const trimmed = requireName(name);
  return mapPlayer(state, id, (p) => ({ ...p, name: trimmed }));
}

export function setSkill(state: OpenPlayState, id: string, skill: Skill): OpenPlayState {
  return mapPlayer(state, id, (p) => ({ ...p, skill }));
}

// Resting leaves the queue; returning rejoins at the back.
export function setResting(state: OpenPlayState, id: string, resting: boolean): OpenPlayState {
  assertNotPlaying(state, id);
  const queue = state.queue.filter((q) => q !== id);
  return {
    ...mapPlayer(state, id, (p) => ({ ...p, resting })),
    queue: resting ? queue : [...queue, id],
  };
}

// A player who never played is deleted outright; one with games is kept (marked
// left) so the end-of-session summary can still name them.
export function removePlayer(state: OpenPlayState, id: string): OpenPlayState {
  assertNotPlaying(state, id);
  const played = (state.stats[id]?.gp ?? 0) > 0;
  const queue = state.queue.filter((q) => q !== id);
  if (played) {
    return { ...mapPlayer(state, id, (p) => ({ ...p, left: true })), queue };
  }
  const stats = { ...state.stats };
  delete stats[id];
  return {
    ...state,
    players: state.players.filter((p) => p.id !== id),
    stats,
    queue,
    updatedAt: Date.now(),
  };
}

// The next four in line (for the "next up" display).
export function nextUp(state: OpenPlayState): string[] {
  return chooseFour(state.queue, state.games, state.stats);
}

// How often each pair of players has shared a court (as partners OR opponents).
export function encounterCounts(
  games: readonly { team1: Team; team2: Team }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const g of games) {
    const four = [...g.team1, ...g.team2];
    for (let i = 0; i < four.length; i++) {
      for (let j = i + 1; j < four.length; j++) {
        const k = pairKey(four[i], four[j]);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// How many players beyond the front four are considered when picking a game.
const MIX_WINDOW = 8;

// Pick the four who take a free court.
//
// Taking the front four outright looks like fair FIFO, but when the headcount is
// a multiple of four the same foursome leaves the court together, rejoins the
// queue together, and comes back on together — so you spend all night playing
// the same three people. Instead the player who has waited longest is always
// included, and the other three are chosen from the front of the queue
// preferring people they have shared a court with least. Ties fall back to queue
// order, so nobody drifts down the line.
export function chooseFour(
  queue: string[],
  games: readonly { team1: Team; team2: Team }[],
  stats: Record<string, PlayerStats>
): string[] {
  if (queue.length < 4) return queue.slice(0, 4);
  const gamesPlayed = (id: string) => stats[id]?.gp ?? 0;

  // Fewest games first, then longest waiting.
  const ordered = queue
    .map((id, index) => ({ id, index }))
    .sort((a, b) => gamesPlayed(a.id) - gamesPlayed(b.id) || a.index - b.index)
    .map((x) => x.id);

  const counts = encounterCounts(games);
  const chosen = [ordered[0]];
  while (chosen.length < 4) {
    const remaining = ordered.filter((id) => !chosen.includes(id));
    // Only consider players on the fewest games still waiting. Mixing must never
    // let one person play twice while someone else is still waiting for their
    // turn, so fairness constrains the pool and freshness picks within it.
    const fewest = Math.min(...remaining.map(gamesPlayed));
    const eligible = remaining
      .filter((id) => gamesPlayed(id) === fewest)
      .slice(0, MIX_WINDOW);

    let best = eligible[0];
    let bestScore = Infinity;
    for (const id of eligible) {
      const score = chosen.reduce((sum, c) => sum + (counts[pairKey(c, id)] ?? 0), 0);
      if (score < bestScore) {
        bestScore = score; // strict <, so equal scores keep queue order
        best = id;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

// Put four players onto every open, empty court. Teams are then chosen by the
// tournament's mixer pairing: even skill split first, then partners who haven't
// played together this session.
export function fillCourts(state: OpenPlayState): OpenPlayState {
  const history = partnerHistory(state.games);
  // Sequential on purpose: each court consumes from the queue, so the courts are
  // filled in order and later ones see the shortened queue.
  let queue = [...state.queue];
  const courts: OpenPlayState["courts"] = [];
  for (const court of state.courts) {
    const empty = court.team1 === null && court.team2 === null;
    if (!court.open || !empty || queue.length < 4) {
      courts.push(court);
      continue;
    }
    const four = chooseFour(queue, state.games, state.stats);
    const [team1, team2] = pairFour(four, state.players, history);
    queue = queue.filter((id) => !four.includes(id));
    courts.push({ ...court, team1, team2, timerStartedAt: null });
  }
  return { ...state, courts, queue, updatedAt: Date.now() };
}

// Copy the stats map so `applyGame` can mutate freely without touching the
// caller's state. PlayerStats is flat (all numbers), so one level is enough.
function cloneStats(stats: Record<string, PlayerStats>): Record<string, PlayerStats> {
  const out: Record<string, PlayerStats> = {};
  for (const id in stats) out[id] = { ...stats[id] };
  return out;
}

// Mutates `stats` in place — callers pass a map they own, seeded with every
// player id the game references. Deliberately strict: a missing id means the
// roster and the game log have drifted apart, which should surface rather than
// be silently absorbed as a fabricated entry.
function applyGame(
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
) {
  const winners = score1 >= score2 ? team1 : team2;
  for (const id of team1) {
    stats[id].gp += 1; stats[id].pf += score1; stats[id].pa += score2;
  }
  for (const id of team2) {
    stats[id].gp += 1; stats[id].pf += score2; stats[id].pa += score1;
  }
  for (const id of winners) stats[id].w += 1;
}

// Rebuild every player's stats by replaying the session log. Ids that appear in
// the log but not in `players` are seeded here — the one deliberate place where
// a hard-removed player's past games stay computable.
export function recomputeStats(
  players: readonly { id: string }[],
  games: readonly OpenPlayGame[]
): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  const seed = (id: string) => {
    if (!stats[id]) stats[id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  };
  for (const p of players) seed(p.id);
  for (const g of games) {
    for (const id of [...g.team1, ...g.team2]) seed(id);
    applyGame(stats, g.team1, g.team2, g.score1, g.score2);
  }
  return stats;
}

export function recordGame(
  state: OpenPlayState,
  courtId: string,
  score1: number,
  score2: number
): OpenPlayState {
  assertScores(score1, score2);
  const court = state.courts.find((c) => c.id === courtId);
  if (!court) throw new Error(`No court ${courtId}`);
  if (!court.team1 || !court.team2) throw new Error(`Court ${courtId} has no game on`);

  const stats = cloneStats(state.stats);
  applyGame(stats, court.team1, court.team2, score1, score2);

  const games = [
    ...state.games,
    {
      courtId,
      team1: [...court.team1] as Team,
      team2: [...court.team2] as Team,
      score1,
      score2,
      ts: Date.now(),
    },
  ];

  // All four rejoin the back of the line. Shuffled among themselves so a
  // repeating foursome doesn't recycle in lockstep.
  const queue = [...state.queue, ...shuffled([...court.team1, ...court.team2])];
  const courts = state.courts.map((c) =>
    c.id === courtId ? { ...c, team1: null, team2: null, timerStartedAt: null } : c
  );

  return fillCourts({ ...state, stats, games, queue, courts, updatedAt: Date.now() });
}

// Correct a past score. The queue is untouched: in open play the result never
// decides who plays next, so only the stats need rebuilding.
export function editGame(
  state: OpenPlayState,
  index: number,
  score1: number,
  score2: number
): OpenPlayState {
  assertScores(score1, score2);
  if (index < 0 || index >= state.games.length) throw new Error(`No game at index ${index}`);
  const games = state.games.map((g, i) => (i === index ? { ...g, score1, score2 } : g));
  return { ...state, games, stats: recomputeStats(state.players, games), updatedAt: Date.now() };
}

// Players taken off a court that is closing haven't had their game, so they
// rejoin at the FRONT of the queue rather than the back.
function returnToFrontOfQueue(queue: string[], ids: string[]): string[] {
  return [...ids, ...queue.filter((id) => !ids.includes(id))];
}

// Closing or removing a court abandons any game on it and puts those players
// back at the front of the queue. This deliberately does NOT refuse when a game
// is in progress: courts auto-refill the instant a game is recorded, so a busy
// court would never present a moment in which it could be closed — the
// organiser would be permanently stuck. The UI confirms before calling this.
export function setCourtCount(state: OpenPlayState, count: number): OpenPlayState {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw new Error("Court count must be between 1 and 6.");
  }
  if (count < state.courts.length) {
    const dropped = state.courts.slice(count);
    const displaced = dropped.flatMap((c) => [...(c.team1 ?? []), ...(c.team2 ?? [])]);
    return fillCourts({
      ...state,
      courts: state.courts.slice(0, count),
      queue: returnToFrontOfQueue(state.queue, displaced),
      updatedAt: Date.now(),
    });
  }
  const added = Array.from({ length: count - state.courts.length }, (_, i) =>
    makeCourt(state.courts.length + i + 1)
  );
  return fillCourts({ ...state, courts: [...state.courts, ...added], updatedAt: Date.now() });
}

export function setCourtOpen(state: OpenPlayState, courtId: string, open: boolean): OpenPlayState {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court) throw new Error(`No court ${courtId}`);

  const displaced = open ? [] : [...(court.team1 ?? []), ...(court.team2 ?? [])];
  const courts = state.courts.map((c) =>
    c.id !== courtId
      ? c
      : open
        ? { ...c, open: true }
        : { ...c, open: false, team1: null, team2: null, timerStartedAt: null }
  );
  return fillCourts({
    ...state,
    courts,
    queue: returnToFrontOfQueue(state.queue, displaced),
    updatedAt: Date.now(),
  });
}

// True when a game is in progress — the UI uses this to warn before closing.
export function courtHasGame(court: { team1: Team | null; team2: Team | null }): boolean {
  return court.team1 !== null || court.team2 !== null;
}

export function startSession(state: OpenPlayState): OpenPlayState {
  return {
    ...state,
    phase: "running",
    players: [],
    queue: [],
    stats: {},
    games: [],
    courts: state.courts.map((c) => ({ ...c, team1: null, team2: null, timerStartedAt: null })),
    updatedAt: Date.now(),
  };
}

export function endSession(state: OpenPlayState): OpenPlayState {
  const rows = state.players
    .map((p) => {
      const st = state.stats[p.id] ?? { gp: 0, w: 0, pf: 0, pa: 0 };
      return { playerId: p.id, name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa, pf: st.pf };
    })
    .filter((r) => r.gp > 0)
    .sort(compareStanding) // same ranking rule as the live leaderboard
    .map(({ name, gp, w, pd }) => ({ name, gp, w, pd }));

  return {
    ...state,
    phase: "ended",
    queue: [],
    courts: state.courts.map((c) => ({ ...c, team1: null, team2: null, timerStartedAt: null })),
    lastSummary: { endedAt: Date.now(), totalGames: state.games.length, rows },
    updatedAt: Date.now(),
  };
}

// Everyone still checked in, ranked by the same rule as the tournament:
// wins, then point differential, then total points scored.
export function leaderboard(state: OpenPlayState): StandingRow[] {
  return state.players
    .filter((p) => !p.left)
    .map((p) => {
      const st = state.stats[p.id] ?? { gp: 0, w: 0, pf: 0, pa: 0 };
      return { playerId: p.id, name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa, pf: st.pf };
    })
    .sort(compareStanding);
}
