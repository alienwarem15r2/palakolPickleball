import { createClient, VercelKV } from "@vercel/kv";
import { TournamentState } from "./types";
import { createInitialState } from "./state";

const KEY = "tournament:state";

// Redis REST credentials come under different env var names depending on how the
// store was added on Vercel: the classic "Vercel KV" / Marketplace Upstash inject
// KV_REST_API_*, while a native Upstash integration uses UPSTASH_REDIS_REST_*.
// Accept both so the app works regardless of which one you pick.
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasKV = Boolean(REST_URL && REST_TOKEN);

// Lazily built so it is never constructed on the in-memory (no-store) path.
let client: VercelKV | null = null;
function kv(): VercelKV {
  if (!client) client = createClient({ url: REST_URL!, token: REST_TOKEN! });
  return client;
}

// When no store is configured (e.g. local dev), fall back to a per-process
// in-memory store so `npm run dev` works out of the box. In-memory state resets
// on restart — local testing only.
let memory: TournamentState | null = null;

export async function readState(): Promise<TournamentState> {
  if (!hasKV) {
    if (!memory) memory = createInitialState();
    return memory;
  }
  const existing = await kv().get<TournamentState>(KEY);
  if (existing) return existing;
  const fresh = createInitialState();
  await kv().set(KEY, fresh);
  return fresh;
}

export async function writeState(state: TournamentState): Promise<void> {
  if (!hasKV) {
    memory = state;
    return;
  }
  await kv().set(KEY, state);
}
