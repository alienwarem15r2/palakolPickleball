import { describe, it, expect } from "vitest";
import { createInitialOpenPlayState } from "./state";

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
