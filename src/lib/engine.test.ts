import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { recordRotationGame, nextUp, standings, qualifyFinalists } from "./engine";
import {
  seedFinalists, buildSeededTeams, shuffleTeams, startFinals, recordFinalsMatch, startRotation,
  shuffleBalancedPools, minGamesPlayed, readyForFinals, recomputeStats, editGame,
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

describe("nextUp", () => {
  it("returns the front four of the queue (the next players to rotate on)", () => {
    expect(nextUp(["p5", "p6", "p7", "p8", "p9"])).toEqual(["p5", "p6", "p7", "p8"]);
  });
  it("returns fewer than four when the queue is short", () => {
    expect(nextUp(["p5", "p6"])).toEqual(["p5", "p6"]);
  });
});

describe("recordRotationGame — equal rotation (everyone rotates)", () => {
  function seeded() {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    return s;
  }

  it("sends all four players to the back and brings the next four on — regardless of who won", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 11, 7); // team1 won
    const c = next.courts.A;
    // next four (p5..p8) come on as two new teams
    expect(c.team1).toEqual(["p5", "p6"]);
    expect(c.team2).toEqual(["p7", "p8"]);
    // all four who played go to the back of the queue
    expect(c.queue).toEqual(["p1", "p2", "p3", "p4"]);
    expect(c.timerStartedAt).toBeNull();
  });

  it("rotates the same way even when team2 wins (winner does not stay)", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 7, 11); // team2 won
    const c = next.courts.A;
    expect(c.team1).toEqual(["p5", "p6"]);
    expect(c.team2).toEqual(["p7", "p8"]);
    expect(c.queue).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("with exactly four players the same four re-form and keep playing", () => {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = [];
    const c = recordRotationGame(s, "A", 11, 5).courts.A;
    expect(c.team1).toEqual(["p1", "p2"]);
    expect(c.team2).toEqual(["p3", "p4"]);
    expect(c.queue).toEqual([]);
  });
});

describe("shuffleBalancedPools", () => {
  it("keeps all players and balances pool sizes and skill mix", () => {
    const s = shuffleBalancedPools(createInitialState());
    const a = s.players.filter((p) => p.pool === "A");
    const b = s.players.filter((p) => p.pool === "B");
    expect(a.length + b.length).toBe(23);
    expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(1);
    // 5 intermediates in the default roster -> split 3/2 (differ by at most 1)
    const aInt = a.filter((p) => p.skill === "intermediate").length;
    const bInt = b.filter((p) => p.skill === "intermediate").length;
    expect(Math.abs(aInt - bInt)).toBeLessThanOrEqual(1);
    expect(new Set(s.players.map((p) => p.id)).size).toBe(23);
  });
});

describe("minGamesPlayed / readyForFinals", () => {
  it("reports the slowest player's game count and flips ready at the target", () => {
    const s = createInitialState();
    s.targetGames = 2;
    // Give everyone 2 games except one player with 1.
    for (const p of s.players) s.stats[p.id] = { gp: 2, w: 0, pf: 0, pa: 0 };
    s.stats[s.players[0].id] = { gp: 1, w: 0, pf: 0, pa: 0 };
    expect(minGamesPlayed(s)).toBe(1);
    expect(readyForFinals(s)).toBe(false);
    // Bring the laggard up to target.
    s.stats[s.players[0].id] = { gp: 2, w: 0, pf: 0, pa: 0 };
    expect(minGamesPlayed(s)).toBe(2);
    expect(readyForFinals(s)).toBe(true);
  });
});

describe("recomputeStats / editGame", () => {
  it("recomputes stats by replaying the game log", () => {
    const s = createInitialState();
    const games = [
      { court: "A" as const, team1: ["p1", "p2"] as [string, string], team2: ["p3", "p4"] as [string, string], score1: 11, score2: 7, ts: 1 },
      { court: "A" as const, team1: ["p1", "p2"] as [string, string], team2: ["p5", "p6"] as [string, string], score1: 9, score2: 11, ts: 2 },
    ];
    const stats = recomputeStats(s.players, games);
    expect(stats.p1).toEqual({ gp: 2, w: 1, pf: 20, pa: 18 }); // won game1, lost game2
    expect(stats.p3).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
    expect(stats.p5).toEqual({ gp: 1, w: 1, pf: 11, pa: 9 });
  });

  it("editing a past game's score updates the log and standings", () => {
    let s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    s = recordRotationGame(s, "A", 11, 3); // p1,p2 win by +8
    expect(s.stats.p1).toEqual({ gp: 1, w: 1, pf: 11, pa: 3 });
    // Oops — it was actually 6-11 (p3,p4 won). Fix game 0.
    s = editGame(s, 0, 6, 11);
    expect(s.games[0]).toMatchObject({ score1: 6, score2: 11 });
    expect(s.stats.p1).toEqual({ gp: 1, w: 0, pf: 6, pa: 11 });
    expect(s.stats.p3).toEqual({ gp: 1, w: 1, pf: 11, pa: 6 });
  });

  it("throws when editing a game index that does not exist", () => {
    const s = createInitialState();
    expect(() => editGame(s, 0, 11, 5)).toThrow(/No game at index/);
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
