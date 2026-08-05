import { describe, it, expect, beforeEach, vi } from "vitest";

// No KV env vars are set, so the kv layer uses its in-memory fallback. That
// store is module-level, so the module registry must be reset between tests —
// otherwise one test's session leaks into the next.
beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

async function load() {
  const { POST } = await import("./route");
  const kv = await import("@/lib/openPlay/kv");
  return { POST, ...kv };
}

function checkinRequest(body: unknown) {
  return new Request("http://x/api/open-play/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/open-play/checkin", () => {
  it("adds a player to a running session without any passcode", async () => {
    const { POST, readOpenPlay, writeOpenPlay } = await load();
    await writeOpenPlay({ ...(await readOpenPlay()), phase: "running" });

    const res = await POST(checkinRequest({ name: "  Igi  ", skill: "intermediate" }));
    expect(res.status).toBe(200);

    const s = await readOpenPlay();
    expect(s.players.map((p) => p.name)).toEqual(["Igi"]); // trimmed
    expect(s.players[0].skill).toBe("intermediate");
    expect(s.queue).toHaveLength(1);
  });

  it("rejects a blank or oversized name", async () => {
    const { POST, readOpenPlay, writeOpenPlay } = await load();
    await writeOpenPlay({ ...(await readOpenPlay()), phase: "running" });

    expect((await POST(checkinRequest({ name: "   " }))).status).toBe(400);
    expect((await POST(checkinRequest({ name: "x".repeat(31) }))).status).toBe(400);
    expect((await POST(checkinRequest({}))).status).toBe(400);
    expect((await readOpenPlay()).players).toHaveLength(0);
  });

  it("defaults an unrecognised skill to novice", async () => {
    const { POST, readOpenPlay, writeOpenPlay } = await load();
    await writeOpenPlay({ ...(await readOpenPlay()), phase: "running" });

    await POST(checkinRequest({ name: "Yas", skill: "pro" }));
    expect((await readOpenPlay()).players[0].skill).toBe("novice");
  });

  it("rejects check-in when the session isn't running", async () => {
    const { POST, readOpenPlay } = await load(); // fresh state is "idle"
    const res = await POST(checkinRequest({ name: "Igi" }));
    expect(res.status).toBe(409);
    expect((await readOpenPlay()).players).toHaveLength(0);
  });

  it("rejects check-in past the player cap", async () => {
    const { POST, readOpenPlay, writeOpenPlay } = await load();
    const players = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, skill: "novice" as const, resting: false, left: false,
    }));
    await writeOpenPlay({ ...(await readOpenPlay()), phase: "running", players });

    expect((await POST(checkinRequest({ name: "One too many" }))).status).toBe(409);
    expect((await readOpenPlay()).players).toHaveLength(60);
  });
});
