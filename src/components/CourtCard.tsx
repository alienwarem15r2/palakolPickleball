"use client";
import { Pool } from "@/lib/types";
import { recordRotationGame, nextUp } from "@/lib/engine";
import { ScoreEntry } from "./ScoreEntry";
import { CourtTimer } from "./CourtTimer";
import { useTournament } from "@/hooks/useTournament";

type T = ReturnType<typeof useTournament>;

export function CourtCard({ t, pool }: { t: T; pool: Pool }) {
  const s = t.state!;
  const c = s.courts[pool];
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
  const upNext = nextUp(c.queue); // the next four who rotate on

  return (
    <div className="card">
      <strong>Court {pool === "A" ? 1 : 2} · Pool {pool}</strong>
      {c.team1 && c.team2 ? (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span>{name(c.team1[0])} &amp; {name(c.team1[1])}</span>
            <span className="muted">vs</span>
            <span>{name(c.team2[0])} &amp; {name(c.team2[1])}</span>
          </div>
          <CourtTimer
            startedAt={c.timerStartedAt}
            editing={t.editing}
            onStart={(v) => t.commit((st) => ({
              ...st, courts: { ...st.courts, [pool]: { ...st.courts[pool], timerStartedAt: v } },
            }))}
          />
          {t.editing && (
            <ScoreEntry label="Record" onSubmit={(a, b) => t.commit((st) => recordRotationGame(st, pool, a, b))} />
          )}
        </>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>Waiting for enough players to form a game.</div>
      )}

      <div style={{ marginTop: 10 }}>
        <div className="muted">Queue</div>
        {c.queue.length === 0 ? <div className="muted">—</div> : (
          <ol style={{ margin: "4px 0 0 18px" }}>
            {c.queue.map((id) => (
              <li key={id} className={upNext.includes(id) ? "nextup" : ""}>
                {name(id)} {upNext.includes(id) ? "· next up" : ""}
                <span className="muted"> ({s.stats[id].gp} gp)</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
