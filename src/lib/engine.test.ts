import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { recordRotationGame } from "./engine";

describe("createInitialState", () => {
  it("has 23 players split 12/11 into pools A/B with zeroed stats", () => {
    const s = createInitialState();
    expect(s.players).toHaveLength(23);
    expect(s.players.filter((p) => p.pool === "A")).toHaveLength(12);
    expect(s.players.filter((p) => p.pool === "B")).toHaveLength(11);
    expect(s.phase).toBe("setup");
    for (const p of s.players) {
      expect(s.stats[p.id]).toEqual({ gp: 0, w: 0, pf: 0, pa: 0 });
    }
    // ids are unique
    expect(new Set(s.players.map((p) => p.id)).size).toBe(23);
  });
});

describe("recordRotationGame — stats", () => {
  function seededRotationState() {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    return s;
  }

  it("updates gp, w, pf, pa for all four players", () => {
    const s = seededRotationState();
    const next = recordRotationGame(s, "A", 11, 7);
    expect(next.stats.p1).toEqual({ gp: 1, w: 1, pf: 11, pa: 7 });
    expect(next.stats.p2).toEqual({ gp: 1, w: 1, pf: 11, pa: 7 });
    expect(next.stats.p3).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
    expect(next.stats.p4).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
  });

  it("appends the game to the log and does not mutate the input state", () => {
    const s = seededRotationState();
    const next = recordRotationGame(s, "A", 11, 9);
    expect(next.games).toHaveLength(1);
    expect(next.games[0]).toMatchObject({
      court: "A", team1: ["p1", "p2"], team2: ["p3", "p4"], score1: 11, score2: 9,
    });
    expect(s.games).toHaveLength(0);
    expect(next.version).toBe(s.version);
  });
});
