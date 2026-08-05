import { readRecord, writeRecord } from "@/lib/kv";
import { createInitialOpenPlayState } from "./state";
import { OpenPlayState } from "./types";

// Open play lives in its own record, so running a session never touches the
// tournament and vice versa.
const OPEN_PLAY_KEY = process.env.KV_OPEN_PLAY_KEY || "palakol:openplay:state";

export function readOpenPlay(): Promise<OpenPlayState> {
  return readRecord(OPEN_PLAY_KEY, createInitialOpenPlayState);
}

export function writeOpenPlay(state: OpenPlayState): Promise<void> {
  return writeRecord(OPEN_PLAY_KEY, state);
}
