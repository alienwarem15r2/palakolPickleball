"use client";
import { useTournament } from "@/hooks/useTournament";
import { editGame } from "@/lib/engine";
import { ScoreEntry } from "./ScoreEntry";

type T = ReturnType<typeof useTournament>;

export function GamesScreen({ t }: { t: T }) {
  const s = t.state!;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;

  if (s.games.length === 0) {
    return <div className="card muted">No games recorded yet. Recorded games will appear here so you can fix a wrong score.</div>;
  }

  // Newest first, but keep each game's real index for editing.
  const indices = s.games.map((_, i) => i).reverse();

  return (
    <div>
      <div className="card muted">
        Recorded games (newest first). To fix a mistake, type the correct score and tap
        <strong> Save fix</strong> — standings update automatically.
      </div>
      {indices.map((i) => {
        const g = s.games[i];
        return (
          <div className="card" key={i}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>Game {i + 1} · Court {g.court === "A" ? 1 : 2}</strong>
              <span className="pill">Current: {g.score1}–{g.score2}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <span>{name(g.team1[0])} &amp; {name(g.team1[1])}</span>
              <span className="muted">vs</span>
              <span>{name(g.team2[0])} &amp; {name(g.team2[1])}</span>
            </div>
            {t.editing && (
              <ScoreEntry label="Save fix" onSubmit={(a, b) => t.commit((st) => editGame(st, i, a, b))} />
            )}
          </div>
        );
      })}
    </div>
  );
}
