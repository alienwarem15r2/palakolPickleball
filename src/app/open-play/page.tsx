"use client";
import { useState } from "react";
import Link from "next/link";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { EditModeBar } from "@/components/EditModeBar";
import { ShareQR } from "@/components/ShareQR";
import { SessionBar } from "@/components/openPlay/SessionBar";
import { CheckInCard } from "@/components/openPlay/CheckInCard";
import { CourtsBoard } from "@/components/openPlay/CourtsBoard";
import { QueueList } from "@/components/openPlay/QueueList";
import { LeaderboardScreen } from "@/components/openPlay/LeaderboardScreen";
import { GamesScreen } from "@/components/openPlay/GamesScreen";
import { createInitialOpenPlayState } from "@/lib/openPlay/state";

type Tab = "courts" | "players" | "leaderboard" | "games";

export default function OpenPlayPage() {
  const t = useOpenPlay();
  const [tab, setTab] = useState<Tab>("courts");

  if (!t.state) return <div className="container">Loading…</div>;
  const s = t.state;

  const tabs: Tab[] = t.editing
    ? ["courts", "players", "leaderboard", "games"]
    : ["courts", "players", "leaderboard"];

  return (
    <div className="container">
      <h1 className="row" style={{ gap: 12, alignItems: "center" }}>
        <img
          src="/logo.png"
          alt="Pikelbol Adiks Philippines logo"
          width={48}
          height={48}
          style={{ borderRadius: "50%", flexShrink: 0 }}
        />
        Open Play
      </h1>

      <div className="tabs">
        <Link className="tab" href="/">🏆 Tournament mode</Link>
      </div>

      <div className="tabs">
        {tabs.map((x) => (
          <button key={x} className={`tab ${tab === x ? "active" : ""}`} onClick={() => setTab(x)}>
            {x[0].toUpperCase() + x.slice(1)}
          </button>
        ))}
      </div>

      <ShareQR />

      <EditModeBar
        editing={t.editing}
        onUnlock={t.unlock}
        onLock={t.clearPasscode}
        onUndo={t.undo}
        onReset={() => {
          if (confirm("Reset open play completely?")) {
            t.commit((x) => ({ ...createInitialOpenPlayState(), version: x.version }));
          }
        }}
      />
      {t.error && <div className="err">{t.error}</div>}

      <SessionBar t={t} />

      {s.phase === "idle" && (
        <div className="card muted">
          No session running. {t.editing ? "Set your courts and tap Start session." : "Waiting for the organiser…"}
        </div>
      )}

      {tab === "courts" && s.phase !== "idle" && (
        <>
          <CourtsBoard t={t} />
          <QueueList t={t} />
        </>
      )}
      {tab === "players" && <CheckInCard t={t} />}
      {tab === "leaderboard" && <LeaderboardScreen t={t} />}
      {t.editing && tab === "games" && <GamesScreen t={t} />}
    </div>
  );
}
