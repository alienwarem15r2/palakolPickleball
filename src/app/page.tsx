"use client";
import { useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { EditModeBar } from "@/components/EditModeBar";
import { createInitialState } from "@/lib/state";
import { SetupScreen } from "@/components/SetupScreen";
import { CourtsScreen } from "@/components/CourtsScreen";
import { StandingsScreen } from "@/components/StandingsScreen";
import { FinalsScreen } from "@/components/FinalsScreen";

type Tab = "courts" | "standings" | "finals" | "setup";

export default function Page() {
  const t = useTournament();
  const [tab, setTab] = useState<Tab>("courts");

  if (!t.state) return <div className="container">Loading…</div>;
  const phase = t.state.phase;

  return (
    <div className="container">
      <h1>🏓 Pickleball Mini-Tournament</h1>
      {t.editing && (
        <div className="tabs">
          {(["setup", "courts", "standings", "finals"] as Tab[]).map((x) => (
            <button key={x} className={`tab ${tab === x ? "active" : ""}`} onClick={() => setTab(x)}>
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      )}
      {!t.editing && (
        <div className="tabs">
          {(["courts", "standings", "finals"] as Tab[]).map((x) => (
            <button key={x} className={`tab ${tab === x ? "active" : ""}`} onClick={() => setTab(x)}>
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      )}

      <EditModeBar
        editing={t.editing}
        onUnlock={t.setPasscode}
        onLock={t.clearPasscode}
        onUndo={t.undo}
        onReset={() => {
          if (confirm("Reset the whole tournament to setup?")) {
            t.commit(() => ({ ...createInitialState(), version: t.state!.version }));
          }
        }}
      />
      {t.error && <div className="err">{t.error}</div>}

      {t.editing && tab === "setup" && <SetupScreen t={t} />}
      {tab === "courts" && (phase === "setup"
        ? <div className="card muted">Tournament not started. {t.editing ? "Use the Setup tab." : "Waiting for organizer…"}</div>
        : <CourtsScreen t={t} />)}
      {tab === "standings" && <StandingsScreen t={t} />}
      {tab === "finals" && <FinalsScreen t={t} />}
    </div>
  );
}
