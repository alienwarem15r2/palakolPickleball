"use client";
import { useTournament } from "@/hooks/useTournament";
import { standings } from "@/lib/engine";
import { Pool } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

export function StandingsScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];
  return (
    <div className="grid2">
      {pools.map((pool) => {
        const rows = standings(s, pool);
        return (
          <div className="card" key={pool}>
            <strong>Pool {pool} standings</strong>
            <table>
              <thead>
                <tr><th>#</th><th>Player</th><th>GP</th><th>W</th><th>Diff</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} className={i < 4 ? "nextup" : ""}>
                    <td>{i + 1}</td>
                    <td>{r.name}{i < 4 ? " ✓" : ""}</td>
                    <td>{r.gp}</td>
                    <td>{r.w}</td>
                    <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 6 }}>Top 4 (✓) qualify for finals.</div>
          </div>
        );
      })}
    </div>
  );
}
