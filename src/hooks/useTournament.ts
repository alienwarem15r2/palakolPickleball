"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TournamentState } from "@/lib/types";

const POLL_MS = 3000;
const PASS_KEY = "organizer-passcode";

export function useTournament() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [passcode, setPasscodeState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoStack = useRef<TournamentState[]>([]);
  const editing = passcode !== null;

  useEffect(() => {
    setPasscodeState(localStorage.getItem(PASS_KEY));
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = (await res.json()) as TournamentState;
      // Don't stomp a newer local optimistic state with an older poll.
      setState((prev) => (prev && prev.version > data.version ? prev : data));
    } catch {
      /* transient network error; keep last state */
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  const setPasscode = useCallback((code: string) => {
    localStorage.setItem(PASS_KEY, code);
    setPasscodeState(code);
  }, []);

  const clearPasscode = useCallback(() => {
    localStorage.removeItem(PASS_KEY);
    setPasscodeState(null);
  }, []);

  // Apply a pure transform, push previous onto undo stack, persist optimistically.
  const commit = useCallback(
    async (transform: (s: TournamentState) => TournamentState) => {
      if (!state || !passcode) return;
      const previous = state;
      const next = transform(state);
      undoStack.current.push(previous);
      setState(next);
      setError(null);
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify(next),
      });
      if (res.status === 401) { setError("Wrong passcode."); return; }
      if (res.status === 409) {
        const { current } = await res.json();
        setState(current);
        setError("Someone else updated first — reloaded latest. Re-apply your change.");
        return;
      }
      const saved = (await res.json()) as TournamentState;
      setState(saved);
    },
    [state, passcode]
  );

  const undo = useCallback(async () => {
    const previous = undoStack.current.pop();
    if (!previous || !passcode) return;
    // Re-post the previous snapshot at the CURRENT version so the server accepts it.
    const res = await fetch("/api/state", { cache: "no-store" });
    const live = (await res.json()) as TournamentState;
    const restore = { ...previous, version: live.version };
    await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": passcode },
      body: JSON.stringify(restore),
    });
    fetchState();
  }, [passcode, fetchState]);

  return { state, editing, error, setPasscode, clearPasscode, commit, undo, refetch: fetchState };
}
