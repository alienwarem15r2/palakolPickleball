import { describe, it, expect } from "vitest";
import { createInitialOpenPlayState } from "./state";
import type { OpenPlayState } from "./types";
import { checkIn, renamePlayer, setSkill, setResting, removePlayer, isPlaying, fillCourts, nextUp, recordGame, editGame, recomputeStats, setCourtCount, setCourtOpen, startSession, endSession, leaderboard } from "./engine";

describe("createInitialOpenPlayState", () => {
  it("starts idle with two open, empty courts and nobody checked in", () => {
    const s = createInitialOpenPlayState();
    expect(s.phase).toBe("idle");
    expect(s.courts).toHaveLength(2);
    expect(s.courts.every((c) => c.open && c.team1 === null && c.team2 === null)).toBe(true);
    expect(s.players).toEqual([]);
    expect(s.queue).toEqual([]);
    expect(s.games).toEqual([]);
    expect(s.lastSummary).toBeNull();
  });
});

// Annotated as OpenPlayState so `phase` stays the wider union — otherwise the
// literal "running" narrows the type and engine results can't be assigned back.
function running(): OpenPlayState {
  return { ...createInitialOpenPlayState(), phase: "running" };
}

describe("check-in", () => {
  it("adds a player to the back of the queue with zeroed stats", () => {
    let s = running();
    s = checkIn(s, "  Igi  ", "intermediate");
    s = checkIn(s, "Yas", "novice");
    expect(s.players.map((p) => p.name)).toEqual(["Igi", "Yas"]); // trimmed
    expect(s.players[0].skill).toBe("intermediate");
    expect(s.players[0].resting).toBe(false);
    expect(s.players[0].left).toBe(false);
    expect(s.queue).toEqual([s.players[0].id, s.players[1].id]); // FIFO
    expect(s.stats[s.players[0].id]).toEqual({ gp: 0, w: 0, pf: 0, pa: 0 });
  });

  it("rejects a blank name and allows duplicate names", () => {
    let s = running();
    expect(() => checkIn(s, "   ", "novice")).toThrow(/blank/);
    s = checkIn(s, "Mike", "novice");
    s = checkIn(s, "Mike", "novice");
    expect(s.players).toHaveLength(2);
    expect(s.players[0].id).not.toBe(s.players[1].id);
  });
});

describe("roster edits", () => {
  it("renames and re-levels a player", () => {
    let s = checkIn(running(), "Igi", "novice");
    const id = s.players[0].id;
    s = renamePlayer(s, id, "  Igi R.  ");
    s = setSkill(s, id, "intermediate");
    expect(s.players[0]).toMatchObject({ name: "Igi R.", skill: "intermediate" });
    expect(() => renamePlayer(s, id, "  ")).toThrow(/blank/);
  });

  it("resting takes a player out of the queue; returning puts them at the back", () => {
    let s = running();
    for (const n of ["a", "b", "c"]) s = checkIn(s, n, "novice");
    const [a, b] = s.players.map((p) => p.id);
    s = setResting(s, a, true);
    expect(s.players.find((p) => p.id === a)!.resting).toBe(true);
    expect(s.queue).not.toContain(a);
    s = setResting(s, a, false);
    expect(s.queue[s.queue.length - 1]).toBe(a); // back of the line
    expect(s.queue[0]).toBe(b);
  });

  it("removes a player who never played, and keeps one who did", () => {
    let s = running();
    for (const n of ["a", "b"]) s = checkIn(s, n, "novice");
    const [a, b] = s.players.map((p) => p.id);
    s = removePlayer(s, a); // no games -> gone entirely
    expect(s.players.find((p) => p.id === a)).toBeUndefined();
    expect(s.stats[a]).toBeUndefined();
    expect(s.queue).not.toContain(a);

    s = { ...s, stats: { ...s.stats, [b]: { gp: 2, w: 1, pf: 20, pa: 18 } } };
    s = removePlayer(s, b); // has games -> kept for the summary, marked left
    expect(s.players.find((p) => p.id === b)!.left).toBe(true);
    expect(s.stats[b].gp).toBe(2);
    expect(s.queue).not.toContain(b);
  });

  it("refuses to remove or rest a player who is on court", () => {
    let s = running();
    for (const n of ["a", "b", "c", "d"]) s = checkIn(s, n, "novice");
    const ids = s.players.map((p) => p.id);
    s = { ...s, queue: [], courts: [{ ...s.courts[0], team1: [ids[0], ids[1]], team2: [ids[2], ids[3]] }, s.courts[1]] };
    expect(isPlaying(s, ids[0])).toBe(true);
    expect(() => removePlayer(s, ids[0])).toThrow(/on court/);
    expect(() => setResting(s, ids[0], true)).toThrow(/on court/);
  });
});

function withPlayers(names: string[]) {
  let s = running();
  for (const n of names) s = checkIn(s, n, "novice");
  return s;
}

describe("auto-fill", () => {
  it("puts the front four of the queue onto an open, empty court", () => {
    const s = fillCourts(withPlayers(["a", "b", "c", "d", "e"]));
    const c = s.courts[0];
    const onCourt = [...c.team1!, ...c.team2!];
    const names = onCourt.map((id) => s.players.find((p) => p.id === id)!.name);
    expect(names.sort()).toEqual(["a", "b", "c", "d"]);
    // the fifth player is still waiting
    expect(s.queue).toHaveLength(1);
    expect(s.players.find((p) => p.id === s.queue[0])!.name).toBe("e");
  });

  it("fills several courts while there are enough players", () => {
    const s = fillCourts(withPlayers(["a", "b", "c", "d", "e", "f", "g", "h"]));
    expect(s.courts[0].team1).not.toBeNull();
    expect(s.courts[1].team1).not.toBeNull();
    expect(s.queue).toEqual([]);
  });

  it("leaves a court empty when fewer than four are waiting", () => {
    const s = fillCourts(withPlayers(["a", "b", "c"]));
    expect(s.courts[0].team1).toBeNull();
    expect(s.queue).toHaveLength(3);
  });

  it("skips closed courts", () => {
    let s = withPlayers(["a", "b", "c", "d"]);
    s = { ...s, courts: [{ ...s.courts[0], open: false }, s.courts[1]] };
    s = fillCourts(s);
    expect(s.courts[0].team1).toBeNull();
    expect(s.courts[1].team1).not.toBeNull();
  });

  it("never disturbs a court that already has a game on", () => {
    let s = withPlayers(["a", "b", "c", "d", "e", "f", "g", "h"]);
    s = fillCourts(s);
    const before = s.courts[0].team1;
    s = fillCourts(s);
    expect(s.courts[0].team1).toEqual(before);
  });

  it("nextUp shows the front four of the queue", () => {
    const s = withPlayers(["a", "b", "c", "d", "e"]);
    expect(nextUp(s)).toEqual(s.queue.slice(0, 4));
  });
});

describe("recording a game", () => {
  // 12 players across 2 courts: 8 play, 4 genuinely wait in the queue.
  function onePlayedGame() {
    let s = fillCourts(
      withPlayers(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"])
    );
    const court = s.courts[0];
    const winners = court.team1!;
    const losers = court.team2!;
    s = recordGame(s, court.id, 11, 7);
    return { s, winners, losers };
  }

  it("credits both teams and logs the game", () => {
    const { s, winners, losers } = onePlayedGame();
    for (const id of winners) expect(s.stats[id]).toEqual({ gp: 1, w: 1, pf: 11, pa: 7 });
    for (const id of losers) expect(s.stats[id]).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
    expect(s.games).toHaveLength(1);
    expect(s.games[0]).toMatchObject({ score1: 11, score2: 7 });
  });

  it("sends all four to the back of the queue and refills the court", () => {
    const { s, winners, losers } = onePlayedGame();
    const played = [...winners, ...losers];
    // court 1 now holds the four who had been waiting
    const nowOn = [...s.courts[0].team1!, ...s.courts[0].team2!];
    expect(nowOn.some((id) => played.includes(id))).toBe(false);
    // and the four who played are at the back of the line
    expect([...s.queue].sort()).toEqual([...played].sort());
  });

  it("puts the same four straight back on when nobody else is waiting", () => {
    // 8 players on 2 courts leaves no queue, so the four who just played are the
    // only ones available — they carry on, repaired into different teams.
    let s = fillCourts(withPlayers(["a", "b", "c", "d", "e", "f", "g", "h"]));
    const court = s.courts[0];
    const played = [...court.team1!, ...court.team2!];
    s = recordGame(s, court.id, 11, 7);
    const nowOn = [...s.courts[0].team1!, ...s.courts[0].team2!];
    expect([...nowOn].sort()).toEqual([...played].sort());
    expect(s.queue).toEqual([]);
  });

  it("rejects impossible scores and unknown courts", () => {
    const s = fillCourts(withPlayers(["a", "b", "c", "d"]));
    expect(() => recordGame(s, s.courts[0].id, NaN, 5)).toThrow(/Invalid score/);
    expect(() => recordGame(s, "nope", 11, 5)).toThrow(/No court/);
    expect(() => recordGame(s, s.courts[1].id, 11, 5)).toThrow(/no game/);
  });
});

describe("correcting a game", () => {
  it("recomputes stats and leaves the queue alone", () => {
    let s = fillCourts(withPlayers(["a", "b", "c", "d", "e", "f", "g", "h"]));
    const court = s.courts[0];
    const winners = court.team1!;
    s = recordGame(s, court.id, 11, 3);
    const queueBefore = [...s.queue];
    expect(s.stats[winners[0]]).toEqual({ gp: 1, w: 1, pf: 11, pa: 3 });

    s = editGame(s, 0, 6, 11); // it was actually the other team's win
    expect(s.games[0]).toMatchObject({ score1: 6, score2: 11 });
    expect(s.stats[winners[0]]).toEqual({ gp: 1, w: 0, pf: 6, pa: 11 });
    expect(s.queue).toEqual(queueBefore);
    expect(() => editGame(s, 5, 11, 5)).toThrow(/No game/);
  });

  it("recomputeStats replays the log from scratch", () => {
    const stats = recomputeStats(
      [{ id: "x" }, { id: "y" }, { id: "z" }, { id: "w" }],
      [
        { courtId: "c1", team1: ["x", "y"], team2: ["z", "w"], score1: 11, score2: 4, ts: 1 },
        { courtId: "c1", team1: ["x", "z"], team2: ["y", "w"], score1: 8, score2: 11, ts: 2 },
      ]
    );
    expect(stats.x).toEqual({ gp: 2, w: 1, pf: 19, pa: 15 });
    expect(stats.w).toEqual({ gp: 2, w: 1, pf: 15, pa: 19 });
  });
});

describe("courts", () => {
  it("grows and shrinks the number of courts", () => {
    let s = createInitialOpenPlayState();
    s = setCourtCount(s, 4);
    expect(s.courts.map((c) => c.label)).toEqual(["Court 1", "Court 2", "Court 3", "Court 4"]);
    s = setCourtCount(s, 1);
    expect(s.courts).toHaveLength(1);
  });

  it("rejects a court count outside 1-6", () => {
    const s = createInitialOpenPlayState();
    expect(() => setCourtCount(s, 0)).toThrow(/between 1 and 6/);
    expect(() => setCourtCount(s, 7)).toThrow(/between 1 and 6/);
  });

  it("refuses to remove or close a court with a game on", () => {
    // 8 players fill both courts, so shrinking would drop a court mid-game.
    const s = fillCourts(withPlayers(["a", "b", "c", "d", "e", "f", "g", "h"]));
    expect(() => setCourtCount(s, 1)).toThrow(/game on/);
    expect(() => setCourtOpen(s, s.courts[0].id, false)).toThrow(/game on/);
  });

  it("allows shrinking when the courts being dropped are empty", () => {
    // 4 players fill only court 1; court 2 is empty and can go.
    const s = fillCourts(withPlayers(["a", "b", "c", "d"]));
    expect(setCourtCount(s, 1).courts).toHaveLength(1);
  });

  it("closing an empty court takes it out of rotation", () => {
    let s = createInitialOpenPlayState();
    s = setCourtOpen(s, "c2", false);
    expect(s.courts.find((c) => c.id === "c2")!.open).toBe(false);
  });
});

describe("session lifecycle", () => {
  it("starting clears everyone but keeps the court count and last summary", () => {
    let s = fillCourts(withPlayers(["a", "b", "c", "d"]));
    s = setCourtCount(s, 3);
    s = { ...s, lastSummary: { endedAt: 1, totalGames: 9, rows: [] } };
    const started = startSession(s);
    expect(started.phase).toBe("running");
    expect(started.players).toEqual([]);
    expect(started.queue).toEqual([]);
    expect(started.games).toEqual([]);
    expect(started.courts).toHaveLength(3);
    expect(started.courts.every((c) => c.team1 === null)).toBe(true);
    expect(started.lastSummary!.totalGames).toBe(9);
  });

  it("ending builds a summary of everyone who took part, best first", () => {
    let s = fillCourts(withPlayers(["a", "b", "c", "d"]));
    s = recordGame(s, s.courts[0].id, 11, 5);
    const ended = endSession(s);
    expect(ended.phase).toBe("ended");
    expect(ended.lastSummary!.totalGames).toBe(1);
    expect(ended.lastSummary!.rows).toHaveLength(4);
    expect(ended.lastSummary!.rows[0].w).toBe(1); // winners ranked first
    expect(ended.lastSummary!.rows[3].w).toBe(0);
    expect(ended.courts.every((c) => c.team1 === null)).toBe(true);
    expect(ended.queue).toEqual([]);
  });
});

describe("leaderboard", () => {
  it("ranks by wins, then differential, then points scored, and hides players who left", () => {
    let s = withPlayers(["win", "diff", "pts", "gone"]);
    const [win, diff, pts, gone] = s.players.map((p) => p.id);
    s = {
      ...s,
      stats: {
        [win]: { gp: 3, w: 3, pf: 33, pa: 20 },
        [diff]: { gp: 3, w: 2, pf: 30, pa: 20 },
        [pts]: { gp: 3, w: 2, pf: 24, pa: 14 }, // same diff as above, fewer points
        [gone]: { gp: 3, w: 3, pf: 33, pa: 0 },
      },
      players: s.players.map((p) => (p.id === gone ? { ...p, left: true } : p)),
    };
    const rows = leaderboard(s);
    expect(rows.map((r) => r.playerId)).toEqual([win, diff, pts]);
    expect(rows[0]).toMatchObject({ name: "win", gp: 3, w: 3, pd: 13, pf: 33 });
  });
});
