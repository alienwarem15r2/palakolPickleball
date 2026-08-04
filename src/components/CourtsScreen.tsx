"use client";
import { useTournament } from "@/hooks/useTournament";
import { CourtCard } from "./CourtCard";
import { qualifyFinalists, seedFinalists, buildSeededTeams, startFinals } from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

export function CourtsScreen({ t }: { t: T }) {
  const finalists = qualifyFinalists(t.state!);
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
          {finalists.tie && <div className="err">⚠ Tie at the top-4 cut — review Standings before starting.</div>}
        </div>
      )}
    </div>
  );
}
