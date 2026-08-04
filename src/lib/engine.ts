import { CourtState, Pool, PlayerStats, Team, TournamentState } from "./types";

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

// Placeholder — implemented in Task 4.
function advanceCourt(
  court: CourtState,
  _stats: Record<string, PlayerStats>,
  _team1: Team,
  _team2: Team,
  _score1: number,
  _score2: number
): CourtState {
  return court;
}
