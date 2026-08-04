import { kv } from "@vercel/kv";
import { TournamentState } from "./types";
import { createInitialState } from "./state";

const KEY = "tournament:state";

// When Vercel KV isn't configured (e.g. local dev without a store), fall back to
// an in-memory store so `npm run dev` works out of the box. This in-memory state
// is per server-process and resets on restart — local testing only. On Vercel,
// attach a KV store and KV_REST_API_URL / KV_REST_API_TOKEN are injected, so the
// real KV path is used automatically.
const hasKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

let memory: TournamentState | null = null;

export async function readState(): Promise<TournamentState> {
  if (!hasKV) {
    if (!memory) memory = createInitialState();
    return memory;
  }
  const existing = await kv.get<TournamentState>(KEY);
  if (existing) return existing;
  const fresh = createInitialState();
  await kv.set(KEY, fresh);
  return fresh;
}

export async function writeState(state: TournamentState): Promise<void> {
  if (!hasKV) {
    memory = state;
    return;
  }
  await kv.set(KEY, state);
}
