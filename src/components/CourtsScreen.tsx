"use client";
import { useTournament } from "@/hooks/useTournament";
import { CourtCard } from "./CourtCard";
import { qualifyFinalists, seedFinalists, buildSeededTeams, startFinals } from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

export function CourtsScreen({ t }: { t: T }) {
  const finalists = qualifyFinalists(t.state!);
  // Finals need exactly 4 qualifiers per pool (8 seeds). A pool with fewer
  // players would produce undefined seeds, so block starting until both are full.
  const canStartFinals = finalists.A.length === 4 && finalists.B.length === 4;
  return (
    <div>
      <div className="grid2">
        <CourtCard t={t} pool="A" />
        <CourtCard t={t} pool="B" />
      </div>
      {t.editing && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Rotation phase. When you're ready, lock in the finals from current standings.</span>
            <button
              className="btn"
              disabled={!canStartFinals}
              onClick={() => {
                if (finalists.tie && !confirm("There's a tie at the finals cut. Continue with current order?")) return;
                t.commit((st) => {
                  const q = qualifyFinalists(st);
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
            <div className="err">⚠ Tie at the top-4 cut — review Standings before starting.</div>
          )}
        </div>
      )}
    </div>
  );
}
