"use client";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { recordGame, setCourtOpen } from "@/lib/openPlay/engine";
import { CourtTimer } from "@/components/CourtTimer";
import { ScoreEntry } from "@/components/ScoreEntry";
import { OpenPlayCourt } from "@/lib/openPlay/types";

type T = ReturnType<typeof useOpenPlay>;

// Top-level (stable) component. Defining it inside CourtsBoard would remount it
// on every ~3s poll and wipe any half-typed score.
function CourtCard({ t, court }: { t: T; court: OpenPlayCourt }) {
  const s = t.state!;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="card" style={{ opacity: court.open ? 1 : 0.55 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{court.label}</strong>
        {t.editing && (
          <button
            className="btn secondary"
            onClick={() => t.commit((x) => setCourtOpen(x, court.id, !court.open))}
          >
            {court.open ? "Close" : "Reopen"}
          </button>
        )}
      </div>

      {court.team1 && court.team2 ? (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span>{name(court.team1[0])} &amp; {name(court.team1[1])}</span>
            <span className="muted">vs</span>
            <span>{name(court.team2[0])} &amp; {name(court.team2[1])}</span>
          </div>
          <CourtTimer
            startedAt={court.timerStartedAt}
            editing={t.editing}
            onStart={(v) =>
              t.commit((x) => ({
                ...x,
                courts: x.courts.map((c) => (c.id === court.id ? { ...c, timerStartedAt: v } : c)),
              }))
            }
          />
          {t.editing && (
            <ScoreEntry
              label="Record"
              onSubmit={(a, b) => t.commit((x) => recordGame(x, court.id, a, b))}
            />
          )}
        </>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>
          {court.open ? "Waiting for four players…" : "Closed"}
        </div>
      )}
    </div>
  );
}

export function CourtsBoard({ t }: { t: T }) {
  const s = t.state!;
  return (
    <div className="grid2">
      {s.courts.map((c) => (
        <CourtCard key={c.id} t={t} court={c} />
      ))}
    </div>
  );
}
