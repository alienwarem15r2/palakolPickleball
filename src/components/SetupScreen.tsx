"use client";
import { useEffect, useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { Player, Pool } from "@/lib/types";
import { startRotation, shuffleBalancedPools } from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

// Buffers a value locally and commits on blur, so typing doesn't fire a network
// write (and version bump) per keystroke.
function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) onCommit(trimmed);
        else setDraft(value);
      }}
    />
  );
}

function GamesInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 1 && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <input
      style={{ width: 56 }}
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function SetupScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];

  const setSkill = (id: string, skill: "novice" | "intermediate") =>
    t.commit((st) => ({
      ...st,
      players: st.players.map((x) => (x.id === id ? { ...x, skill } : x)),
    }));

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Setup — roster, levels & pools</strong>
          <button className="btn" onClick={() => t.commit(startRotation)}>
            Start rotation →
          </button>
        </div>
        <div className="row" style={{ gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <button className="btn secondary" onClick={() => t.commit(shuffleBalancedPools)}>
            🎲 Shuffle teams (balanced by level)
          </button>
          <span className="row">
            <span className="muted">Games per player before finals:</span>
            <GamesInput
              value={s.targetGames}
              onCommit={(n) => t.commit((st) => ({ ...st, targetGames: n }))}
            />
          </span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Set each player&apos;s level, tap <strong>Shuffle</strong> to balance the two pools, then
          <strong> Start rotation</strong>. Once everyone has played {s.targetGames} games you&apos;ll be
          prompted to start the finals.
        </p>
      </div>
      <div className="grid2">
        {pools.map((pool) => {
          const players = s.players.filter((p) => p.pool === pool);
          return (
            <div className="card" key={pool}>
              <strong>Pool {pool} · Court {pool === "A" ? 1 : 2} ({players.length})</strong>
              <table>
                <tbody>
                  {players.map((p: Player, i) => (
                    <tr key={p.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <NameInput
                          value={p.name}
                          onCommit={(name) =>
                            t.commit((st) => ({
                              ...st,
                              players: st.players.map((x) =>
                                x.id === p.id ? { ...x, name } : x
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="btn secondary"
                          title="Tap to switch level"
                          onClick={() =>
                            setSkill(p.id, p.skill === "intermediate" ? "novice" : "intermediate")
                          }
                        >
                          {p.skill === "intermediate" ? "⭐ Intermediate" : "Novice"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn secondary"
                          onClick={() =>
                            t.commit((st) => ({
                              ...st,
                              players: st.players.map((x) =>
                                x.id === p.id ? { ...x, pool: pool === "A" ? "B" : "A" } : x
                              ),
                            }))
                          }
                        >
                          → {pool === "A" ? "B" : "A"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
