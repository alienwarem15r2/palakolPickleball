export type Pool = "A" | "B";
export type Phase = "setup" | "rotation" | "finals";
export type Skill = "novice" | "intermediate";

export interface Player {
  id: string;
  name: string;
  pool: Pool | null;
  skill?: Skill;
}

export interface PlayerStats {
  gp: number; // games played
  w: number; // wins
  pf: number; // points for
  pa: number; // points against
}

export type Team = [string, string]; // two player ids

export interface CourtState {
  team1: Team | null;
  team2: Team | null;
  queue: string[];
  timerStartedAt: number | null;
}

export interface Game {
  court: Pool;
  team1: Team;
  team2: Team;
  score1: number;
  score2: number;
  ts: number;
}

export interface FinalsTeam {
  seedPair: [number, number]; // e.g. [1, 8]
  players: Team;
}

export interface Match {
  teamA: number | null; // index into finals.teams
  teamB: number | null;
  score1: number | null;
  score2: number | null;
}

export interface Finals {
  finalists: { A: string[]; B: string[] };
  teams: FinalsTeam[];
  matches: { semi1: Match; semi2: Match; final: Match };
  champion: number | null; // index into finals.teams
}

export interface TournamentState {
  version: number;
  phase: Phase;
  updatedAt: number;
  players: Player[];
  stats: Record<string, PlayerStats>;
  courts: { A: CourtState; B: CourtState };
  games: Game[];
  finals: Finals;
}
