import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { recordRotationGame, selectNextChallengers, standings, qualifyFinalists } from "./engine";

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

describe("selectNextChallengers — fairness (fewest games played)", () => {
  it("picks the two queue members with the fewest games played", () => {
    const stats = {
      p5: { gp: 2, w: 0, pf: 0, pa: 0 },
      p6: { gp: 0, w: 0, pf: 0, pa: 0 },
      p7: { gp: 1, w: 0, pf: 0, pa: 0 },
      p8: { gp: 0, w: 0, pf: 0, pa: 0 },
    } as any;
    expect(selectNextChallengers(["p5", "p6", "p7", "p8"], stats)).toEqual(["p6", "p8"]);
  });

  it("breaks ties by longest wait (earliest queue index)", () => {
    const stats = {
      p5: { gp: 1, w: 0, pf: 0, pa: 0 },
      p6: { gp: 1, w: 0, pf: 0, pa: 0 },
      p7: { gp: 1, w: 0, pf: 0, pa: 0 },
    } as any;
    expect(selectNextChallengers(["p5", "p6", "p7"], stats)).toEqual(["p5", "p6"]);
  });

  it("returns null when fewer than two are waiting", () => {
    expect(selectNextChallengers(["p5"], {} as any)).toBeNull();
  });
});

describe("recordRotationGame — court transition", () => {
  function seeded() {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    return s;
  }

  it("keeps winners on court, sends losers to back of queue, pulls next-up as new team", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 11, 7);
    const c = next.courts.A;
    expect(c.team1).toEqual(["p1", "p2"]);
    expect(c.team2).toEqual(["p5", "p6"]);
    expect(c.queue).toEqual(["p7", "p8", "p3", "p4"]);
    expect(c.timerStartedAt).toBeNull();
  });

  it("when team2 wins, they become the staying team1", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 7, 11);
    const c = next.courts.A;
    expect(c.team1).toEqual(["p3", "p4"]);
    expect(c.team2).toEqual(["p5", "p6"]);
    expect(c.queue).toEqual(["p7", "p8", "p1", "p2"]);
  });
});

describe("standings", () => {
  it("sorts a pool by wins desc, then point differential desc", () => {
    const s = createInitialState();
    s.stats.p1 = { gp: 3, w: 3, pf: 33, pa: 20 };
    s.stats.p2 = { gp: 3, w: 2, pf: 30, pa: 25 };
    s.stats.p3 = { gp: 3, w: 2, pf: 30, pa: 28 };
    const rows = standings(s, "A");
    const ids = rows.map((r) => r.playerId);
    expect(ids.indexOf("p1")).toBe(0);
    expect(ids.indexOf("p2")).toBeLessThan(ids.indexOf("p3"));
    expect(rows[0]).toMatchObject({ playerId: "p1", gp: 3, w: 3, pd: 13 });
  });

  it("only includes players from the requested pool", () => {
    const s = createInitialState();
    const rows = standings(s, "A");
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => s.players.find((p) => p.id === r.playerId)?.pool === "A")).toBe(true);
  });
});

describe("qualifyFinalists", () => {
  it("returns top 4 by wins (tiebreak pd) from each pool", () => {
    const s = createInitialState();
    const a = s.players.filter((p) => p.pool === "A").map((p) => p.id);
    a.forEach((id, i) => (s.stats[id] = { gp: 5, w: 12 - i, pf: 50, pa: 40 }));
    const b = s.players.filter((p) => p.pool === "B").map((p) => p.id);
    b.forEach((id, i) => (s.stats[id] = { gp: 5, w: 11 - i, pf: 50, pa: 40 }));
    const res = qualifyFinalists(s);
    expect(res.A).toEqual(a.slice(0, 4));
    expect(res.B).toEqual(b.slice(0, 4));
    expect(res.tie).toBe(false);
  });

  it("flags a tie when the 4th and 5th players are equal on wins AND point diff", () => {
    const s = createInitialState();
    const a = s.players.filter((p) => p.pool === "A").map((p) => p.id);
    a.forEach((id, i) => {
      const w = i < 3 ? 10 : 5;
      s.stats[id] = { gp: 5, w, pf: 30, pa: 20 };
    });
    const res = qualifyFinalists(s);
    expect(res.tie).toBe(true);
  });
});
