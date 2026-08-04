import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { recordRotationGame, selectNextChallengers, standings, qualifyFinalists } from "./engine";
import {
  seedFinalists, buildSeededTeams, shuffleTeams, startFinals, recordFinalsMatch, startRotation,
} from "./engine";

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

describe("startRotation", () => {
  it("seeds each court with first-4 as two teams and the rest as the queue", () => {
    const s = startRotation(createInitialState());
    expect(s.phase).toBe("rotation");
    // Pool A has 12 players (p1..p12): p1&p2 vs p3&p4, queue p5..p12
    expect(s.courts.A.team1).toEqual(["p1", "p2"]);
    expect(s.courts.A.team2).toEqual(["p3", "p4"]);
    expect(s.courts.A.queue).toEqual(["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"]);
    // Pool B has 11 players (p13..p23)
    expect(s.courts.B.team1).toEqual(["p13", "p14"]);
    expect(s.courts.B.team2).toEqual(["p15", "p16"]);
    expect(s.courts.B.queue).toEqual(["p17", "p18", "p19", "p20", "p21", "p22", "p23"]);
  });

  it("leaves team2 null when a pool has fewer than 4 players", () => {
    const base = createInitialState();
    // Move all but 3 of pool A into pool B.
    base.players = base.players.map((p, i) =>
      p.pool === "A" && i >= 3 ? { ...p, pool: "B" as const } : p
    );
    const s = startRotation(base);
    expect(s.courts.A.team1).toEqual(["p1", "p2"]);
    expect(s.courts.A.team2).toBeNull();
    expect(s.courts.A.queue).toEqual([]);
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

  it("does not mutate the input state's stats", () => {
    const s = seededRotationState();
    recordRotationGame(s, "A", 11, 5);
    expect(s.stats.p1).toEqual({ gp: 0, w: 0, pf: 0, pa: 0 });
    expect(s.stats.p3).toEqual({ gp: 0, w: 0, pf: 0, pa: 0 });
  });

  it("awards the win to team1 on a tied score (>= convention)", () => {
    const s = seededRotationState();
    const next = recordRotationGame(s, "A", 10, 10);
    expect(next.stats.p1.w).toBe(1); // team1 credited the win
    expect(next.stats.p3.w).toBe(0);
    expect(next.courts.A.team1).toEqual(["p1", "p2"]); // team1 stays on court
  });

  it("throws on a non-finite or negative score instead of corrupting stats", () => {
    const s = seededRotationState();
    expect(() => recordRotationGame(s, "A", NaN, 5)).toThrow(/Invalid score/);
    expect(() => recordRotationGame(s, "A", 11, -1)).toThrow(/Invalid score/);
  });

  it("throws when the court has no active game", () => {
    const s = createInitialState();
    s.phase = "rotation"; // court A has no team1/team2
    expect(() => recordRotationGame(s, "A", 11, 5)).toThrow(/no active game/);
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

describe("finals seeding and bracket", () => {
  const A = ["a1", "a2", "a3", "a4"];
  const B = ["b1", "b2", "b3", "b4"];

  it("interleaves pools into seeds 1..8", () => {
    expect(seedFinalists(A, B)).toEqual(["a1", "b1", "a2", "b2", "a3", "b3", "a4", "b4"]);
  });

  it("builds seeded teams 1&8, 4&5, 3&6, 2&7", () => {
    const seeded = seedFinalists(A, B);
    const teams = buildSeededTeams(seeded);
    expect(teams.map((t) => t.seedPair)).toEqual([[1, 8], [4, 5], [3, 6], [2, 7]]);
    expect(teams[0].players).toEqual([seeded[0], seeded[7]]);
    expect(teams[1].players).toEqual([seeded[3], seeded[4]]);
  });

  it("shuffleTeams uses all 8 finalists exactly once across 4 teams", () => {
    const seeded = seedFinalists(A, B);
    const teams = shuffleTeams(seeded);
    expect(teams).toHaveLength(4);
    const used = teams.flatMap((t) => t.players);
    expect(used).toHaveLength(8);
    expect(new Set(used)).toEqual(new Set(seeded));
  });

  it("startFinals sets phase, teams, and semifinal pairings (team0v1, team2v3)", () => {
    const s = createInitialState();
    const withFinalists = { ...s, finals: { ...s.finals, finalists: { A, B } } };
    const next = startFinals(withFinalists, buildSeededTeams(seedFinalists(A, B)));
    expect(next.phase).toBe("finals");
    expect(next.finals.matches.semi1).toMatchObject({ teamA: 0, teamB: 1 });
    expect(next.finals.matches.semi2).toMatchObject({ teamA: 2, teamB: 3 });
    expect(next.finals.matches.final).toEqual({ teamA: null, teamB: null, score1: null, score2: null });
    expect(next.finals.champion).toBeNull();
  });

  it("awards a tied finals match to teamA (>= convention)", () => {
    const s = createInitialState();
    let st = startFinals(
      { ...s, finals: { ...s.finals, finalists: { A, B } } },
      buildSeededTeams(seedFinalists(A, B))
    );
    st = recordFinalsMatch(st, "semi1", 11, 11); // tie -> teamA (0) advances
    st = recordFinalsMatch(st, "semi2", 11, 4); // team2 advances
    expect(st.finals.matches.final).toMatchObject({ teamA: 0, teamB: 2 });
  });

  it("advances semi winners into the final and records the champion", () => {
    const s = createInitialState();
    let st = startFinals(
      { ...s, finals: { ...s.finals, finalists: { A, B } } },
      buildSeededTeams(seedFinalists(A, B))
    );
    st = recordFinalsMatch(st, "semi1", 11, 6);
    st = recordFinalsMatch(st, "semi2", 8, 11);
    expect(st.finals.matches.final).toMatchObject({ teamA: 0, teamB: 3 });
    st = recordFinalsMatch(st, "final", 11, 9);
    expect(st.finals.champion).toBe(0);
  });
});
