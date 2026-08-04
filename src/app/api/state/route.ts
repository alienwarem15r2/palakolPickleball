import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/kv";
import { TournamentState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const passcode = req.headers.get("x-passcode");
  if (!process.env.ORGANIZER_PASSCODE || passcode !== process.env.ORGANIZER_PASSCODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const incoming = (await req.json()) as TournamentState;
  const current = await readState();

  if (incoming.version !== current.version) {
    return NextResponse.json(
      { error: "stale", current },
      { status: 409 }
    );
  }

  const saved: TournamentState = {
    ...incoming,
    version: current.version + 1,
    updatedAt: Date.now(),
  };
  await writeState(saved);
  return NextResponse.json(saved);
}
