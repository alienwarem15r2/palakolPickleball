import { createClient, VercelKV } from "@vercel/kv";
import { TournamentState } from "./types";
import { createInitialState } from "./state";

// Redis REST credentials come under different env var names depending on how the
// store was added on Vercel: the classic "Vercel KV" / Marketplace Upstash inject
// KV_REST_API_*, while a native Upstash integration uses UPSTASH_REDIS_REST_*.
// Accept both so the app works regardless of which one you pick.
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasKV = Boolean(REST_URL && REST_TOKEN);

let client: VercelKV | null = null;
function kv(): VercelKV {
  if (!client) client = createClient({ url: REST_URL!, token: REST_TOKEN! });
  return client;
}

// When no store is configured (e.g. local dev), fall back to a per-process
// in-memory store so `npm run dev` works out of the box. In-memory state resets
// on restart — local testing only.
const memory = new Map<string, unknown>();

export async function readRecord<T>(key: string, create: () => T): Promise<T> {
  if (!hasKV) {
    if (!memory.has(key)) memory.set(key, create());
    return memory.get(key) as T;
  }
  const existing = await kv().get<T>(key);
  if (existing) return existing;
  const fresh = create();
  await kv().set(key, fresh);
  return fresh;
}

export async function writeRecord<T>(key: string, value: T): Promise<void> {
  if (!hasKV) {
    memory.set(key, value);
    return;
  }
  await kv().set(key, value);
}

// Private, app-specific key ("drawer") so this tournament's data never collides
// with any other project sharing the same Redis database. Override with
// KV_STATE_KEY if you ever want a second, independent tournament instance.
const TOURNAMENT_KEY = process.env.KV_STATE_KEY || "palakol:tournament:state";

export function readState(): Promise<TournamentState> {
  return readRecord(TOURNAMENT_KEY, createInitialState);
}

export function writeState(state: TournamentState): Promise<void> {
  return writeRecord(TOURNAMENT_KEY, state);
}
