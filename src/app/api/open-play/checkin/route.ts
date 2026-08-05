import { NextResponse } from "next/server";
import { readOpenPlay, writeOpenPlay } from "@/lib/openPlay/kv";
import { checkIn, fillCourts } from "@/lib/openPlay/engine";
import { Skill } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_NAME = 30;
const MAX_PLAYERS = 60;

// The only write in the app that doesn't need the organiser passcode: players
// scan the QR and add themselves. Deliberately narrow — it can add a name to the
// waiting list and nothing else. The organiser can remove any entry.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; skill?: unknown }
    | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_NAME) {
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  }
  const skill: Skill = body?.skill === "intermediate" ? "intermediate" : "novice";

  const current = await readOpenPlay();
  if (current.phase !== "running") {
    return NextResponse.json({ error: "session not running" }, { status: 409 });
  }
  if (current.players.length >= MAX_PLAYERS) {
    return NextResponse.json({ error: "session full" }, { status: 409 });
  }

  const next = fillCourts(checkIn(current, name, skill));
  const saved = { ...next, version: current.version + 1, updatedAt: Date.now() };
  await writeOpenPlay(saved);
  return NextResponse.json({ ok: true });
}
