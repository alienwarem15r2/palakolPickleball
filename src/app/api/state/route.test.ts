import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialState } from "@/lib/state";

// In-memory fake KV shared across the route module.
const store: Record<string, unknown> = {};
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (k: string) => store[k] ?? null),
    set: vi.fn(async (k: string, v: unknown) => { store[k] = v; }),
  },
}));

const PASS = "secret";
beforeEach(() => {
  for (const k in store) delete store[k];
  process.env.ORGANIZER_PASSCODE = PASS;
  vi.resetModules();
});

async function loadRoute() {
  return await import("./route");
}

describe("POST /api/state", () => {
  it("rejects writes with a wrong passcode (401)", async () => {
    const { POST } = await loadRoute();
    const body = createInitialState();
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": "wrong" },
      body: JSON.stringify(body),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects a stale version (409)", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json(); // version 1 stored
    const stale = { ...current, version: 0 }; // client thinks it's older
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": PASS },
      body: JSON.stringify(stale),
    }));
    expect(res.status).toBe(409);
  });

  it("accepts a matching-version write and bumps the stored version", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json(); // version 1
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": PASS },
      body: JSON.stringify(current),
    }));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.version).toBe(current.version + 1);
  });
});
