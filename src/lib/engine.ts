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

  const nextCourt = advanceCourt(c, stats, team1, team2, score1, score2);

  return {
    ...state,
    stats,
    games,
    courts: { ...state.courts, [court]: nextCourt },
    updatedAt: Date.now(),
  };
}

export function selectNextChallengers(
  queue: string[],
  stats: Record<string, PlayerStats>
): Team | null {
  if (queue.length < 2) return null;
  const ranked = queue
    .map((id, index) => ({ id, index, gp: stats[id]?.gp ?? 0 }))
    .sort((a, b) => a.gp - b.gp || a.index - b.index);
  return [ranked[0].id, ranked[1].id];
}

function advanceCourt(
  court: CourtState,
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
): CourtState {
  // Copy tuples so the returned court never aliases the input court's arrays.
  const winners: Team = [...(score1 >= score2 ? team1 : team2)] as Team;
  const losers: Team = [...(score1 >= score2 ? team2 : team1)] as Team;

  const queueWithLosers = [...court.queue, ...losers];

  // Safety net: losers always re-add 2 players, so via recordRotationGame this
  // is unreachable (queueWithLosers.length >= 2). Guards manual queue edits that
  // could leave too few players to form a challenger team.
  const challengers = selectNextChallengers(queueWithLosers, stats);
  if (!challengers) {
    return { ...court, team1: winners, team2: null, queue: queueWithLosers, timerStartedAt: null };
  }
  const remaining = queueWithLosers.filter((id) => !challengers.includes(id));
  return { team1: winners, team2: challengers, queue: remaining, timerStartedAt: null };
}
