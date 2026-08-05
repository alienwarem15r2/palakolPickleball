import { NextResponse } from "next/server";
import { readOpenPlay, writeOpenPlay } from "@/lib/openPlay/kv";
import { OpenPlayState } from "@/lib/openPlay/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readOpenPlay());
}

export async function POST(req: Request) {
  const passcode = req.headers.get("x-passcode");
  if (!process.env.ORGANIZER_PASSCODE || passcode !== process.env.ORGANIZER_PASSCODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const incoming = (await req.json()) as OpenPlayState;
  const current = await readOpenPlay();
  if (incoming.version !== current.version) {
    return NextResponse.json({ error: "stale", current }, { status: 409 });
  }

  const saved: OpenPlayState = {
    ...incoming,
    version: current.version + 1,
    updatedAt: Date.now(),
  };
  await writeOpenPlay(saved);
  return NextResponse.json(saved);
}
