import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lightweight passcode check used by the Unlock-edit button. Does not touch
// tournament state — it only reports whether the passcode is valid so the UI
// can refuse to enter edit mode (and show an error) on a wrong or blank code.
export async function POST(req: Request) {
  const passcode = req.headers.get("x-passcode");
  if (!process.env.ORGANIZER_PASSCODE || !passcode || passcode !== process.env.ORGANIZER_PASSCODE) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
