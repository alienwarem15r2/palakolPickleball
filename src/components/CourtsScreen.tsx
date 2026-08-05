"use client";
import { useTournament } from "@/hooks/useTournament";
import { CourtCard } from "./CourtCard";
import {
  qualifyFinalists, seedFinalists, buildSeededTeams, startFinals,
  readyForFinals, minGamesPlayed,
} from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

export function CourtsScreen({ t }: { t: T }) {
  const s = t.state!;
  const finalists = qualifyFinalists(s);
  // Finals need exactly 4 qualifiers per pool (8 seeds). A pool with fewer
  // players would produce undefined seeds, so block starting until both are full.
  const canStartFinals = finalists.A.length === 4 && finalists.B.length === 4;
  const ready = readyForFinals(s);
  const minGames = minGamesPlayed(s);
  const finalsUnderway = s.phase === "finals";
  return (
    <div>
      {finalsUnderway ? (
        <div className="card" style={{ borderColor: "var(--accent2)", fontWeight: 600 }}>
          🏆 Finals are underway — see the <strong>Finals</strong> tab.
        </div>
      ) : ready ? (
        <div className="card" style={{ borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 }}>
          🏁 Everyone has played {s.targetGames} games — ready for finals!{" "}
          {t.editing ? "Tap “Start finals” below." : "Waiting for the organizer to start the finals."}
        </div>
      ) : (
        <div className="card muted">
          Rotation in progress — everyone has played at least <strong>{minGames}</strong> of{" "}
          <strong>{s.targetGames}</strong> games.
        </div>
      )}
      <div className="grid2">
        <CourtCard t={t} pool="A" />
        <CourtCard t={t} pool="B" />
      </div>
      {/* Hidden once the finals start: re-running it would redo the draw and
          wipe any semifinal scores already recorded. */}
      {t.editing && !finalsUnderway && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Rotation phase. When you're ready, lock in the finals from current standings.</span>
            <button
              className="btn"
              disabled={!canStartFinals}
              onClick={() => {
                if (
                  finalists.tie &&
                  !confirm(
                    "Players are dead level at the last finals spot — wins, point differential and total points all equal.\n\nOK will settle it with a random draw."
                  )
                ) return;
                t.commit((st) => {
                  // drawTies: a genuine dead heat is decided by a draw, never by list order.
                  const q = qualifyFinalists(st, { drawTies: true });
                  const seeded = seedFinalists(q.A, q.B);
                  return startFinals(
                    { ...st, finals: { ...st.finals, finalists: { A: q.A, B: q.B } } },
                    buildSeededTeams(seeded)
                  );
                });
              }}
            >
              Start finals →
            </button>
          </div>
          {!canStartFinals && (
            <div className="err">
              Each pool needs at least 4 players to seed the finals (Pool A: {finalists.A.length}, Pool B: {finalists.B.length}).
            </div>
          )}
          {canStartFinals && finalists.tie && (
            <div className="err">
              ⚠ Dead heat at the last finals spot — level on wins, differential and points scored.
              Starting the finals will settle it with a random draw.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
