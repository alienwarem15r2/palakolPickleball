import { CourtState, Pool, PlayerStats, Team, TournamentState } from "./types";

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

function cloneStats(stats: Record<string, PlayerStats>) {
  const out: Record<string, PlayerStats> = {};
  for (const k in stats) out[k] = { ...stats[k] };
  return out;
}

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
  const c = state.courts[court];
  if (!c.team1 || !c.team2) throw new Error(`Court ${court} has no active game`);
  const team1 = c.team1;
  const team2 = c.team2;

  const stats = cloneStats(state.stats);
  applyGame(stats, team1, team2, score1, score2);

  const games = [
    ...state.games,
    { court, team1, team2, score1, score2, ts: Date.now() },
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
  const winners: Team = score1 >= score2 ? team1 : team2;
  const losers: Team = score1 >= score2 ? team2 : team1;

  const queueWithLosers = [...court.queue, ...losers];

  const challengers = selectNextChallengers(queueWithLosers, stats);
  if (!challengers) {
    return { ...court, team1: winners, team2: null, queue: queueWithLosers, timerStartedAt: null };
  }
  const remaining = queueWithLosers.filter((id) => !challengers.includes(id));
  return { team1: winners, team2: challengers, queue: remaining, timerStartedAt: null };
}
