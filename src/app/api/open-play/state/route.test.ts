import { describe, it, expect, beforeEach, vi } from "vitest";

const PASS = "secret";
beforeEach(() => {
  vi.resetModules(); // the in-memory KV store is module-level; start each test clean
  process.env.ORGANIZER_PASSCODE = PASS;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

async function loadRoute() {
  return await import("./route");
}

function post(passcode: string, body: unknown) {
  return new Request("http://x/api/open-play/state", {
    method: "POST",
    headers: { "content-type": "application/json", "x-passcode": passcode },
    body: JSON.stringify(body),
  });
}

describe("POST /api/open-play/state", () => {
  it("rejects a wrong passcode", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json();
    expect((await POST(post("wrong", current))).status).toBe(401);
  });

  it("rejects a stale version", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json();
    expect((await POST(post(PASS, { ...current, version: 0 }))).status).toBe(409);
  });

  it("accepts a matching version and bumps it", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json();
    const res = await POST(post(PASS, current));
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(current.version + 1);
  });
});
