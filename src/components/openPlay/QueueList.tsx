"use client";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { nextUp } from "@/lib/openPlay/engine";

type T = ReturnType<typeof useOpenPlay>;

export function QueueList({ t }: { t: T }) {
  const s = t.state!;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
  const up = nextUp(s);
  const resting = s.players.filter((p) => p.resting && !p.left);

  return (
    <div className="card">
      <strong>Next up</strong>
      {s.queue.length === 0 ? (
        <div className="muted" style={{ marginTop: 6 }}>Nobody waiting.</div>
      ) : (
        <ol style={{ margin: "6px 0 0 18px" }}>
          {s.queue.map((id) => (
            <li key={id} className={up.includes(id) ? "nextup" : ""}>
              {name(id)}
              {up.includes(id) ? " · on next" : ""}
              <span className="muted"> ({s.stats[id]?.gp ?? 0} gp)</span>
            </li>
          ))}
        </ol>
      )}
      {resting.length > 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          Resting: {resting.map((p) => p.name).join(", ")}
        </div>
      )}
    </div>
  );
}
