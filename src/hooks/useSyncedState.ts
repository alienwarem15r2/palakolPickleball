"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 3000;
const PASS_KEY = "organizer-passcode";

export interface Versioned {
  version: number;
}

// Polling + optimistic write + undo against a versioned JSON record.
// (useTournament predates this and is deliberately left alone so the live
// tournament isn't disturbed; it can be migrated onto this later.)
export function useSyncedState<T extends Versioned>(endpoint: string) {
  const [state, setState] = useState<T | null>(null);
  const [passcode, setPasscodeState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoStack = useRef<T[]>([]);
  // True while an optimistic write is in flight; the poll must not clobber it.
  const committing = useRef(false);
  const editing = passcode !== null;

  useEffect(() => {
    setPasscodeState(localStorage.getItem(PASS_KEY));
  }, []);

  const fetchState = useCallback(async () => {
    if (committing.current) return;
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await res.json()) as T;
      setState((prev) => {
        // A commit may have started during the awaited fetch above.
        if (committing.current) return prev;
        return prev && prev.version > data.version ? prev : data;
      });
    } catch {
      /* transient network error; keep last state */
    }
  }, [endpoint]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  // Verify the passcode before entering edit mode, so a wrong or blank code
  // shows an error instead of silently "unlocking" into a mode where every
  // edit fails.
  const unlock = useCallback(async (code: string): Promise<boolean> => {
    if (!code.trim()) {
      setError("Enter the organizer passcode.");
      return false;
    }
    try {
      const res = await fetch("/api/verify", { method: "POST", headers: { "x-passcode": code } });
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
    async (transform: (s: T) => T): Promise<boolean> => {
      if (!state || !passcode) return false;
      const previous = state;
      let next: T;
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
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-passcode": passcode },
          body: JSON.stringify(next),
        });
        if (res.status === 401) {
          setState(previous);
          setError("Wrong passcode — change not saved.");
          return false;
        }
        if (res.status === 409) {
          const { current } = await res.json();
          setState(current);
          setError("Someone else updated first — reloaded latest. Re-apply your change.");
          return false;
        }
        const saved = (await res.json()) as T;
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
    [state, passcode, endpoint]
  );

  const undo = useCallback(async () => {
    const previous = undoStack.current[undoStack.current.length - 1];
    if (!previous || !passcode) return;
    committing.current = true;
    setError(null);
    try {
      // Re-post the previous snapshot at the CURRENT version so the server accepts it.
      const live = (await (await fetch(endpoint, { cache: "no-store" })).json()) as T;
      const post = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify({ ...previous, version: live.version }),
      });
      if (post.status === 401) {
        setError("Wrong passcode — undo not applied.");
        return;
      }
      if (post.status === 409) {
        setError("State changed while undoing — try again.");
        return;
      }
      undoStack.current.pop(); // drop only after a confirmed restore
      setState((await post.json()) as T);
    } catch {
      setError("Network error — undo not applied.");
    } finally {
      committing.current = false;
    }
  }, [passcode, endpoint]);

  return { state, editing, error, unlock, clearPasscode, commit, undo, refetch: fetchState, setError };
}
