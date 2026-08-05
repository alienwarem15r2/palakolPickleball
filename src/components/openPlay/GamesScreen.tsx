"use client";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { editGame } from "@/lib/openPlay/engine";
import { ScoreEntry } from "@/components/ScoreEntry";

type T = ReturnType<typeof useOpenPlay>;

export function GamesScreen({ t }: { t: T }) {
  const s = t.state!;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;

  if (s.games.length === 0) {
    return <div className="card muted">No games recorded yet.</div>;
  }

  const indices = s.games.map((_, i) => i).reverse(); // newest first

  return (
    <div>
      <div className="card muted">
        Session games (newest first). To fix a mistake, type the correct score and tap
        <strong> Save fix</strong> — the leaderboard updates automatically.
      </div>
      {indices.map((i) => {
        const g = s.games[i];
        const court = s.courts.find((c) => c.id === g.courtId);
        return (
          <div className="card" key={i}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>Game {i + 1} · {court?.label ?? g.courtId}</strong>
              <span className="pill">Current: {g.score1}–{g.score2}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <span>{name(g.team1[0])} &amp; {name(g.team1[1])}</span>
              <span className="muted">vs</span>
              <span>{name(g.team2[0])} &amp; {name(g.team2[1])}</span>
            </div>
            {t.editing && (
              <ScoreEntry label="Save fix" onSubmit={(a, b) => t.commit((x) => editGame(x, i, a, b))} />
            )}
          </div>
        );
      })}
    </div>
  );
}
