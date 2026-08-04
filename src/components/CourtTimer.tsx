"use client";
import { useEffect, useState } from "react";

const CAP_MS = 12 * 60 * 1000;

export function CourtTimer({ startedAt, onStart, editing }: {
  startedAt: number | null; onStart: (v: number | null) => void; editing: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = startedAt ? Math.max(0, CAP_MS - (now - startedAt)) : CAP_MS;
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  const expired = startedAt && remaining === 0;
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <span className="pill" style={{ color: expired ? "var(--danger)" : "var(--accent2)" }}>
        ⏱ {mm}:{ss}{expired ? " — CAP" : ""}
      </span>
      {editing && (
        <>
          <button className="btn secondary" onClick={() => onStart(Date.now())}>Start 12:00</button>
          <button className="btn secondary" onClick={() => onStart(null)}>Reset</button>
        </>
      )}
    </div>
  );
}
