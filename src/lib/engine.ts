import { CourtState, FinalsTeam, Match, Pool, PlayerStats, Team, TournamentState } from "./types";

// Seed each court from its pool: first two players form team1, next two form
// team2, and the rest queue in listed order. Moves the tournament to "rotation".
export function startRotation(state: TournamentState): TournamentState {
  const courts = { ...state.courts };
  for (const pool of ["A", "B"] as Pool[]) {
    const ids = state.players.filter((p) => p.pool === pool).map((p) => p.id);
    courts[pool] = {
      team1: ids.length >= 2 ? [ids[0], ids[1]] : null,
      team2: ids.length >= 4 ? [ids[2], ids[3]] : null,
      queue: ids.slice(4),
      timerStartedAt: null,
    };
  }
  return { ...state, phase: "rotation", courts, updatedAt: Date.now() };
}

export interface StandingRow {
  playerId: string;
  name: string;
  gp: number;
  w: number;
  pd: number; // point differential = pf - pa
}

export function standings(state: TournamentState, pool: Pool): StandingRow[] {
  return state.players
    .filter((p) => p.pool === pool)
    .map((p) => {
      const st = state.stats[p.id];
      return { playerId: p.id, name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa };
    })
    .sort((a, b) => b.w - a.w || b.pd - a.pd || a.name.localeCompare(b.name));
}

export interface FinalistResult {
  A: string[];
  B: string[];
  tie: boolean;
}

function poolHasCutTie(rows: StandingRow[]): boolean {
  if (rows.length <= 4) return false;
  const fourth = rows[3];
  const fifth = rows[4];
  return fourth.w === fifth.w && fourth.pd === fifth.pd;
}

export function qualifyFinalists(state: TournamentState): FinalistResult {
  const aRows = standings(state, "A");
  const bRows = standings(state, "B");
  return {
    A: aRows.slice(0, 4).map((r) => r.playerId),
    B: bRows.slice(0, 4).map((r) => r.playerId),
    tie: poolHasCutTie(aRows) || poolHasCutTie(bRows),
  };
}

export function seedFinalists(a: string[], b: string[]): string[] {
  const seeded: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (a[i]) seeded.push(a[i]);
    if (b[i]) seeded.push(b[i]);
  }
  return seeded;
}

const SEED_PAIRS: [number, number][] = [[1, 8], [4, 5], [3, 6], [2, 7]];

export function buildSeededTeams(seeded: string[]): FinalsTeam[] {
  return SEED_PAIRS.map(([s1, s2]) => ({
    seedPair: [s1, s2] as [number, number],
    players: [seeded[s1 - 1], seeded[s2 - 1]] as Team,
  }));
}

export function shuffleTeams(seeded: string[]): FinalsTeam[] {
  const pool = [...seeded];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 2, 3].map((k) => ({
    // Random draw: seed numbers are not meaningful, so [0, 0] marks "unseeded".
    seedPair: [0, 0] as [number, number],
    players: [pool[k * 2], pool[k * 2 + 1]] as Team,
  }));
}

export function startFinals(state: TournamentState, teams: FinalsTeam[]): TournamentState {
  return {
    ...state,
    phase: "finals",
    finals: {
      ...state.finals,
      teams,
      matches: {
        semi1: { teamA: 0, teamB: 1, score1: null, score2: null },
        semi2: { teamA: 2, teamB: 3, score1: null, score2: null },
        final: { teamA: null, teamB: null, score1: null, score2: null },
      },
      champion: null,
    },
    updatedAt: Date.now(),
  };
}

function winnerIndex(m: Match): number | null {
  if (m.teamA === null || m.teamB === null || m.score1 === null || m.score2 === null) return null;
  return m.score1 >= m.score2 ? m.teamA : m.teamB;
}

export function recordFinalsMatch(
  state: TournamentState,
  key: "semi1" | "semi2" | "final",
  score1: number,
  score2: number
): TournamentState {
  assertScores(score1, score2);
  const matches = {
    semi1: { ...state.finals.matches.semi1 },
    semi2: { ...state.finals.matches.semi2 },
    final: { ...state.finals.matches.final },
  };
  matches[key] = { ...matches[key], score1, score2 };

  let champion = state.finals.champion;
  if (key === "final") {
    champion = winnerIndex(matches.final);
  } else {
    const w1 = winnerIndex(matches.semi1);
    const w2 = winnerIndex(matches.semi2);
    if (w1 !== null && w2 !== null) {
      matches.final = { teamA: w1, teamB: w2, score1: null, score2: null };
    }
  }

  return {
    ...state,
    finals: { ...state.finals, matches, champion },
    updatedAt: Date.now(),
  };
}

function cloneStats(stats: Record<string, PlayerStats>) {
  const out: Record<string, PlayerStats> = {};
  for (const k in stats) out[k] = { ...stats[k] };
  return out;
}

// Guard the last pure boundary before state is persisted: reject non-finite or
// negative scores so a bad input (e.g. an unparsed empty field -> NaN) can never
// silently corrupt stored stats.
function assertScores(score1: number, score2: number) {
  for (const s of [score1, score2]) {
    if (!Number.isFinite(s) || s < 0) {
      throw new Error(`Invalid score: ${score1}-${score2}`);
    }
  }
}

// NOTE: mutates `stats` in place. Callers must pass a freshly-cloned map
// (never `state.stats` directly), or they will corrupt shared state.
function applyGame(
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
) {
  const winners = score1 >= score2 ? team1 : team2;
  for (const id of team1) {
    stats[id].gp += 1;
    stats[id].pf += score1;
    stats[id].pa += score2;
  }
  for (const id of team2) {
    stats[id].gp += 1;
    stats[id].pf += score2;
    stats[id].pa += score1;
  }
  for (const id of winners) stats[id].w += 1;
}

export function recordRotationGame(
  state: TournamentState,
  court: Pool,
  score1: number,
  score2: number
): TournamentState {
  assertScores(score1, score2);
  const c = state.courts[court];
  if (!c.team1 || !c.team2) throw new Error(`Court ${court} has no active game`);
  const team1 = c.team1;
  const team2 = c.team2;

  const stats = cloneStats(state.stats);
  applyGame(stats, team1, team2, score1, score2);

  // Copy the tuples into the immutable game log so the log never aliases the
  // live court arrays (protects the history if a later feature edits teams).
  const games = [
    ...state.games,
    { court, team1: [...team1] as Team, team2: [...team2] as Team, score1, score2, ts: Date.now() },
  ];

  const nextCourt = advanceCourt(c, team1, team2);

  return {
    ...state,
    stats,
    games,
    courts: { ...state.courts, [court]: nextCourt },
    updatedAt: Date.now(),
  };
}

// Equal rotation ("everyone rotates"): after a game all four players go to the
// back of the queue and the next four in line come on, so games played stay
// even for everyone. The winner is irrelevant to who plays next (it only affects
// standings), which also makes editing a past score safe — see editGame.
function advanceCourt(court: CourtState, team1: Team, team2: Team): CourtState {
  const queue = [...court.queue, ...team1, ...team2];
  // A game only happens with 4 on court, so queue.length is always >= 4 here.
  const next = queue.slice(0, 4);
  return {
    team1: [next[0], next[1]] as Team,
    team2: [next[2], next[3]] as Team,
    queue: queue.slice(4),
    timerStartedAt: null,
  };
}

// The next four players who will rotate onto a court (for the "next up" hint).
export function nextUp(queue: string[]): string[] {
  return queue.slice(0, 4);
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Randomly split every player into pools A and B, balanced by skill: shuffle the
// intermediates and novices separately, then deal each into whichever pool is
// currently smaller. That keeps both the skill mix and the pool sizes even, and
// randomizes the within-pool order so starting teams differ each shuffle.
export function shuffleBalancedPools(state: TournamentState): TournamentState {
  const intermediates = shuffled(state.players.filter((p) => p.skill === "intermediate"));
  const novices = shuffled(state.players.filter((p) => p.skill !== "intermediate"));
  const A: TournamentState["players"] = [];
  const B: TournamentState["players"] = [];
  for (const p of [...intermediates, ...novices]) {
    (A.length <= B.length ? A : B).push(p);
  }
  const players = [
    ...A.map((p) => ({ ...p, pool: "A" as const })),
    ...B.map((p) => ({ ...p, pool: "B" as const })),
  ];
  return { ...state, players, updatedAt: Date.now() };
}

// Fewest games played across all pooled players (the slowest player's count).
export function minGamesPlayed(state: TournamentState): number {
  const pooled = state.players.filter((p) => p.pool);
  if (pooled.length === 0) return 0;
  return Math.min(...pooled.map((p) => state.stats[p.id]?.gp ?? 0));
}

// Rotation is "done" once every pooled player has played the target number of
// games — the signal to show "Ready for finals".
export function readyForFinals(state: TournamentState): boolean {
  const pooled = state.players.filter((p) => p.pool);
  if (pooled.length === 0) return false;
  return pooled.every((p) => (state.stats[p.id]?.gp ?? 0) >= state.targetGames);
}

// Rebuild every player's stats from scratch by replaying the game log. Used after
// a past game's score is corrected so standings stay consistent.
export function recomputeStats(
  players: TournamentState["players"],
  games: TournamentState["games"]
): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  const ensure = (id: string) => {
    if (!stats[id]) stats[id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  };
  for (const g of games) {
    for (const id of [...g.team1, ...g.team2]) ensure(id);
    applyGame(stats, g.team1, g.team2, g.score1, g.score2);
  }
  return stats;
}

// Correct a previously recorded game's score and recompute standings. Does not
// touch the current court/queue — with equal rotation the score never affected
// who plays next, so only the stats need fixing.
export function editGame(
  state: TournamentState,
  index: number,
  score1: number,
  score2: number
): TournamentState {
  assertScores(score1, score2);
  if (index < 0 || index >= state.games.length) {
    throw new Error(`No game at index ${index}`);
  }
  const games = state.games.map((g, i) =>
    i === index ? { ...g, score1, score2 } : g
  );
  const stats = recomputeStats(state.players, games);
  return { ...state, games, stats, updatedAt: Date.now() };
}
