"use client";
import { useTournament } from "@/hooks/useTournament";
import { Player, Pool, TournamentState } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

function movePlayer(s: TournamentState, id: string, pool: Pool): TournamentState {
  return { ...s, players: s.players.map((p) => (p.id === id ? { ...p, pool } : p)) };
}

function startRotation(s: TournamentState): TournamentState {
  const courts = { ...s.courts };
  for (const pool of ["A", "B"] as Pool[]) {
    const ids = s.players.filter((p) => p.pool === pool).map((p) => p.id);
    courts[pool] = {
      team1: ids.length >= 2 ? [ids[0], ids[1]] : null,
      team2: ids.length >= 4 ? [ids[2], ids[3]] : null,
      queue: ids.slice(4),
      timerStartedAt: null,
    };
  }
  return { ...s, phase: "rotation", courts };
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
                        <input
                          value={p.name}
                          onChange={(e) =>
                            t.commit((st) => ({
                              ...st,
                              players: st.players.map((x) =>
                                x.id === p.id ? { ...x, name: e.target.value } : x
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>{p.skill === "intermediate" ? "⭐" : ""}</td>
                      <td>
                        <button
                          className="btn secondary"
                          onClick={() => t.commit((st) => movePlayer(st, p.id, pool === "A" ? "B" : "A"))}
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
