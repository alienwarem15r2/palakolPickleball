"use client";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { leaderboard } from "@/lib/openPlay/engine";

type T = ReturnType<typeof useOpenPlay>;

export function LeaderboardScreen({ t }: { t: T }) {
  const s = t.state!;
  const rows = leaderboard(s);

  return (
    <div>
      {s.phase === "ended" && s.lastSummary && (
        <div className="card">
          <strong>🏁 Session summary</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            {s.lastSummary.totalGames} games played.
          </div>
          <table style={{ marginTop: 6 }}>
            <thead>
              <tr><th>#</th><th>Player</th><th>GP</th><th>W</th><th>Diff</th></tr>
            </thead>
            <tbody>
              {s.lastSummary.rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.gp}</td>
                  <td>{r.w}</td>
                  <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <strong>Leaderboard</strong>
        {rows.length === 0 ? (
          <div className="muted" style={{ marginTop: 6 }}>No games yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Player</th><th>GP</th><th>W</th><th>Diff</th><th>Pts</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.playerId}>
                  <td>{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.gp}</td>
                  <td>{r.w}</td>
                  <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
                  <td>{r.pf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="muted" style={{ marginTop: 6 }}>
          Ranked by wins, then point differential (Diff), then total points scored (Pts).
        </div>
      </div>
    </div>
  );
}
