import { PlayerStats, TournamentState } from "./types";
import { initialPlayers } from "./initialData";

export function createInitialState(): TournamentState {
  const players = initialPlayers();
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  const emptyCourt = () => ({
    team1: null,
    team2: null,
    queue: [] as string[],
    timerStartedAt: null,
  });
  return {
    version: 1,
    phase: "setup",
    updatedAt: Date.now(),
    targetGames: 4,
    players,
    stats,
    courts: { A: emptyCourt(), B: emptyCourt() },
    games: [],
    finals: {
      finalists: { A: [], B: [] },
      teams: [],
      matches: {
        semi1: { teamA: null, teamB: null, score1: null, score2: null },
        semi2: { teamA: null, teamB: null, score1: null, score2: null },
        final: { teamA: null, teamB: null, score1: null, score2: null },
      },
      champion: null,
    },
  };
}
