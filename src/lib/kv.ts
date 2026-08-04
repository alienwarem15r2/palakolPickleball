import { kv } from "@vercel/kv";
import { TournamentState } from "./types";
import { createInitialState } from "./state";

const KEY = "tournament:state";

export async function readState(): Promise<TournamentState> {
  const existing = await kv.get<TournamentState>(KEY);
  if (existing) return existing;
  const fresh = createInitialState();
  await kv.set(KEY, fresh);
  return fresh;
}

export async function writeState(state: TournamentState): Promise<void> {
  await kv.set(KEY, state);
}
