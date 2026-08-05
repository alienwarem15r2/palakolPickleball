import { describe, it, expect } from "vitest";
import { createInitialOpenPlayState } from "./state";
import { checkIn, renamePlayer, setSkill, setResting, removePlayer, isPlaying } from "./engine";

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

function running() {
  const s = createInitialOpenPlayState();
  return { ...s, phase: "running" as const };
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
