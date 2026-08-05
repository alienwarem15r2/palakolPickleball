"use client";
import { useEffect, useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { Player, Pool } from "@/lib/types";
import {
  startRotation, shuffleBalancedPools,
  addPlayer, removePlayer, renamePlayer, setPlayerSkill, setPlayerPool, isOnCourt,
} from "@/lib/engine";

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

// Name box + Add button for a pool. Clears only after a successful save.
function AddPlayerRow({ pool, onAdd }: { pool: Pool; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(name);
    setBusy(false);
    if (ok !== false) setName("");
  };
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <input
        placeholder={`Add player to Pool ${pool}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        style={{ flex: 1 }}
      />
      <button className="btn" onClick={submit} disabled={busy || !name.trim()}>
        + Add
      </button>
    </div>
  );
}

export function SetupScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Setup — roster, levels &amp; pools ({s.players.length} players)</strong>
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
          Add or remove players, tap a name to rename, set each player&apos;s level, then
          <strong> Shuffle</strong> to balance the pools and <strong>Start rotation</strong>. Once
          everyone has played {s.targetGames} games you&apos;ll be prompted to start the finals.
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
                  {players.map((p: Player, i) => {
                    const playing = isOnCourt(s, p.id);
                    return (
                      <tr key={p.id}>
                        <td className="muted">{i + 1}</td>
                        <td>
                          <NameInput
                            value={p.name}
                            onCommit={(name) => t.commit((st) => renamePlayer(st, p.id, name))}
                          />
                        </td>
                        <td>
                          <button
                            className="btn secondary"
                            title="Tap to switch level"
                            onClick={() =>
                              t.commit((st) =>
                                setPlayerSkill(st, p.id, p.skill === "intermediate" ? "novice" : "intermediate")
                              )
                            }
                          >
                            {p.skill === "intermediate" ? "⭐ Intermediate" : "Novice"}
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn secondary"
                            disabled={playing}
                            title={playing ? "On court — record the current game first" : "Move to the other pool"}
                            onClick={() =>
                              t.commit((st) => setPlayerPool(st, p.id, pool === "A" ? "B" : "A"))
                            }
                          >
                            → {pool === "A" ? "B" : "A"}
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn danger"
                            disabled={playing}
                            title={playing ? "On court — record the current game first" : `Remove ${p.name}`}
                            onClick={() => {
                              if (confirm(`Remove ${p.name} from the tournament?`)) {
                                t.commit((st) => removePlayer(st, p.id));
                              }
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <AddPlayerRow
                pool={pool}
                onAdd={(name) => t.commit((st) => addPlayer(st, name, pool))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
