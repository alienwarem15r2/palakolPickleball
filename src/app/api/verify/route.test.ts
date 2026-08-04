import { describe, it, expect, beforeEach } from "vitest";

const PASS = "secret";
beforeEach(() => {
  process.env.ORGANIZER_PASSCODE = PASS;
});

async function loadRoute() {
  return await import("./route");
}

function post(passcode?: string) {
  const headers: Record<string, string> = {};
  if (passcode !== undefined) headers["x-passcode"] = passcode;
  return new Request("http://x/api/verify", { method: "POST", headers });
}

describe("POST /api/verify", () => {
  it("returns 401 when the passcode header is missing", async () => {
    const { POST } = await loadRoute();
    expect((await POST(post())).status).toBe(401);
  });

  it("returns 401 for a blank passcode", async () => {
    const { POST } = await loadRoute();
    expect((await POST(post(""))).status).toBe(401);
  });

  it("returns 401 for a wrong passcode", async () => {
    const { POST } = await loadRoute();
    expect((await POST(post("nope"))).status).toBe(401);
  });

  it("returns 200 for the correct passcode", async () => {
    const { POST } = await loadRoute();
    expect((await POST(post(PASS))).status).toBe(200);
  });
});
