import { PlayerStats, Skill, Team } from "@/lib/types";

export type OpenPlayPhase = "idle" | "running" | "ended";

export interface OpenPlayPlayer {
  id: string;
  name: string;
  skill: Skill;
  resting: boolean;
  left: boolean; // checked out, but kept for the session summary
}

export interface OpenPlayCourt {
  id: string;
  label: string;
  open: boolean;
  team1: Team | null;
  team2: Team | null;
  timerStartedAt: number | null;
}

export interface OpenPlayGame {
  courtId: string;
  team1: Team;
  team2: Team;
  score1: number;
  score2: number;
  ts: number;
}

export interface SummaryRow {
  name: string;
  gp: number;
  w: number;
  pd: number;
}

export interface SessionSummary {
  endedAt: number;
  totalGames: number;
  rows: SummaryRow[]; // every player who took part, best first
}

export interface OpenPlayState {
  version: number;
  updatedAt: number;
  phase: OpenPlayPhase;
  courts: OpenPlayCourt[];
  players: OpenPlayPlayer[];
  queue: string[]; // FIFO order of players waiting to play
  stats: Record<string, PlayerStats>;
  games: OpenPlayGame[];
  lastSummary: SessionSummary | null;
}
