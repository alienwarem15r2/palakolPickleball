"use client";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { setCourtCount, startSession, endSession } from "@/lib/openPlay/engine";

type T = ReturnType<typeof useOpenPlay>;

export function SessionBar({ t }: { t: T }) {
  const s = t.state!;
  if (!t.editing) return null;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span className="row">
          <span className="muted">Courts:</span>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              className={`tab ${s.courts.length === n ? "active" : ""}`}
              onClick={() => t.commit((st) => setCourtCount(st, n))}
            >
              {n}
            </button>
          ))}
        </span>
        {s.phase === "running" ? (
          <button
            className="btn danger"
            onClick={() => {
              if (confirm("End the session and show the summary?")) t.commit(endSession);
            }}
          >
            End session
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => {
              if (s.phase === "ended" && !confirm("Start a new session? This clears the current one.")) return;
              t.commit(startSession);
            }}
          >
            {s.phase === "ended" ? "Start new session" : "Start session"}
          </button>
        )}
      </div>
    </div>
  );
}
