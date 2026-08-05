import { OpenPlayCourt, OpenPlayState } from "./types";

export function makeCourt(n: number): OpenPlayCourt {
  return {
    id: `c${n}`,
    label: `Court ${n}`,
    open: true,
    team1: null,
    team2: null,
    timerStartedAt: null,
  };
}

export function createInitialOpenPlayState(): OpenPlayState {
  return {
    version: 1,
    updatedAt: Date.now(),
    phase: "idle",
    courts: [makeCourt(1), makeCourt(2)],
    players: [],
    queue: [],
    stats: {},
    games: [],
    lastSummary: null,
  };
}
