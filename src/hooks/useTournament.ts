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
  // True while an optimistic write is in flight; the poll must not clobber it.
  const committing = useRef(false);
  const editing = passcode !== null;

  useEffect(() => {
    setPasscodeState(localStorage.getItem(PASS_KEY));
  }, []);

  const fetchState = useCallback(async () => {
    if (committing.current) return; // don't overwrite an in-flight optimistic write
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = (await res.json()) as TournamentState;
      setState((prev) => {
        // A commit may have started during the awaited fetch above.
        if (committing.current) return prev;
        return prev && prev.version > data.version ? prev : data;
      });
    } catch {
      /* transient network error; keep last state */
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  // Verify the passcode against the server before entering edit mode, so a wrong
  // or blank code shows an error instead of silently "unlocking" into a mode
  // where every edit fails. Returns true only when the passcode is accepted.
  const unlock = useCallback(async (code: string): Promise<boolean> => {
    if (!code.trim()) {
      setError("Enter the organizer passcode.");
      return false;
    }
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "x-passcode": code },
      });
      if (res.status !== 200) {
        setError("Incorrect passcode. Try again.");
        return false;
      }
      localStorage.setItem(PASS_KEY, code);
      setPasscodeState(code);
      setError(null);
      return true;
    } catch {
      setError("Couldn't reach the server to check the passcode — check your connection.");
      return false;
    }
  }, []);

  const clearPasscode = useCallback(() => {
    localStorage.removeItem(PASS_KEY);
    setPasscodeState(null);
  }, []);

  // Apply a pure transform and persist it optimistically.
  // Returns true only when the server confirmed the write.
  const commit = useCallback(
    async (transform: (s: TournamentState) => TournamentState): Promise<boolean> => {
      if (!state || !passcode) return false;
      const previous = state;
      let next: TournamentState;
      try {
        next = transform(state); // engine transforms can throw (e.g. invalid score)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid action.");
        return false;
      }
      committing.current = true;
      setState(next);
      setError(null);
      try {
        const res = await fetch("/api/state", {
          method: "POST",
          headers: { "content-type": "application/json", "x-passcode": passcode },
          body: JSON.stringify(next),
        });
        if (res.status === 401) {
          setState(previous); // roll back the phantom change
          setError("Wrong passcode — change not saved.");
          return false;
        }
        if (res.status === 409) {
          const { current } = await res.json();
          setState(current);
          setError("Someone else updated first — reloaded latest. Re-apply your change.");
          return false;
        }
        const saved = (await res.json()) as TournamentState;
        undoStack.current.push(previous); // only record confirmed writes
        setState(saved);
        return true;
      } catch {
        setState(previous);
        setError("Network error — change not saved.");
        return false;
      } finally {
        committing.current = false;
      }
    },
    [state, passcode]
  );

  const undo = useCallback(async () => {
    const previous = undoStack.current[undoStack.current.length - 1];
    if (!previous || !passcode) return;
    committing.current = true;
    setError(null);
    try {
      // Re-post the previous snapshot at the CURRENT version so the server accepts it.
      const res = await fetch("/api/state", { cache: "no-store" });
      const live = (await res.json()) as TournamentState;
      const restore = { ...previous, version: live.version };
      const post = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify(restore),
      });
      if (post.status === 401) {
        setError("Wrong passcode — undo not applied.");
        return;
      }
      if (post.status === 409) {
        setError("State changed while undoing — try again.");
        return;
      }
      const saved = (await post.json()) as TournamentState;
      undoStack.current.pop(); // drop only after a confirmed restore
      setState(saved);
    } catch {
      setError("Network error — undo not applied.");
    } finally {
      committing.current = false;
    }
  }, [passcode]);

  return { state, editing, error, unlock, clearPasscode, commit, undo, refetch: fetchState };
}
