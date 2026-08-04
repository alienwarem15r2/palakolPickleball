"use client";
import { useEffect, useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { Player, Pool } from "@/lib/types";
import { startRotation } from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

// Buffers the name locally and only commits on blur, so typing doesn't fire a
// network write (and version bump) per keystroke.
function NameInput({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Re-sync if the underlying name changes (e.g. another editor renamed it).
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

export function SetupScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];
  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Setup — roster & pools</strong>
          <button className="btn" onClick={() => t.commit(startRotation)}>
            Start rotation →
          </button>
        </div>
        <p className="muted">
          First 4 in each pool start on court (as two teams); the rest form the queue in listed order.
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
                      <td>{p.skill === "intermediate" ? "⭐" : ""}</td>
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
