import { PlayerStats, Skill, Team } from "@/lib/types";
import { OpenPlayGame, OpenPlayPlayer, OpenPlayState } from "./types";
import { makeCourt } from "./state";
import { assertScores, pairFour, partnerHistory, shuffled } from "@/lib/engine";

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
  return state.queue.slice(0, 4);
}

// Put the front four of the queue onto every open, empty court. Teams are chosen
// by the tournament's mixer pairing: even skill split first, then partners who
// haven't played together this session.
export function fillCourts(state: OpenPlayState): OpenPlayState {
  const history = partnerHistory(state.games);
  let queue = [...state.queue];
  const courts = state.courts.map((court) => {
    const empty = court.team1 === null && court.team2 === null;
    if (!court.open || !empty || queue.length < 4) return court;
    const four = queue.slice(0, 4);
    queue = queue.slice(4);
    const [team1, team2] = pairFour(four, state.players, history);
    return { ...court, team1, team2, timerStartedAt: null };
  });
  return { ...state, courts, queue, updatedAt: Date.now() };
}

// Mutates `stats` in place — callers pass a map they own.
function applyGame(
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
) {
  const ensure = (id: string) => (stats[id] ??= { gp: 0, w: 0, pf: 0, pa: 0 });
  const winners = score1 >= score2 ? team1 : team2;
  for (const id of team1) {
    const st = ensure(id);
    st.gp += 1; st.pf += score1; st.pa += score2;
  }
  for (const id of team2) {
    const st = ensure(id);
    st.gp += 1; st.pf += score2; st.pa += score1;
  }
  for (const id of winners) ensure(id).w += 1;
}

// Rebuild every player's stats by replaying the session log.
export function recomputeStats(
  players: readonly { id: string }[],
  games: readonly OpenPlayGame[]
): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  for (const g of games) applyGame(stats, g.team1, g.team2, g.score1, g.score2);
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

  const stats: Record<string, PlayerStats> = {};
  for (const id in state.stats) stats[id] = { ...state.stats[id] };
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

function courtHasGame(court: { team1: Team | null; team2: Team | null }): boolean {
  return court.team1 !== null || court.team2 !== null;
}

export function setCourtCount(state: OpenPlayState, count: number): OpenPlayState {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw new Error("Court count must be between 1 and 6.");
  }
  if (count < state.courts.length) {
    const dropped = state.courts.slice(count);
    if (dropped.some(courtHasGame)) {
      throw new Error("That court has a game on — record it before removing the court.");
    }
    return { ...state, courts: state.courts.slice(0, count), updatedAt: Date.now() };
  }
  const added = Array.from({ length: count - state.courts.length }, (_, i) =>
    makeCourt(state.courts.length + i + 1)
  );
  return fillCourts({ ...state, courts: [...state.courts, ...added], updatedAt: Date.now() });
}

export function setCourtOpen(state: OpenPlayState, courtId: string, open: boolean): OpenPlayState {
  const court = state.courts.find((c) => c.id === courtId);
  if (!court) throw new Error(`No court ${courtId}`);
  if (!open && courtHasGame(court)) {
    throw new Error("That court has a game on — record it before closing the court.");
  }
  const courts = state.courts.map((c) => (c.id === courtId ? { ...c, open } : c));
  return fillCourts({ ...state, courts, updatedAt: Date.now() });
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
      return { name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa, pf: st.pf };
    })
    .filter((r) => r.gp > 0)
    .sort((a, b) => b.w - a.w || b.pd - a.pd || b.pf - a.pf)
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
