"use client";
import { useState } from "react";
import { useOpenPlay } from "@/hooks/useOpenPlay";
import { isPlaying, removePlayer, renamePlayer, setResting, setSkill } from "@/lib/openPlay/engine";
import { Skill } from "@/lib/types";

type T = ReturnType<typeof useOpenPlay>;

// Anyone can check themselves in while a session is running — this posts to the
// public check-in route rather than the passcode-gated state route.
function SelfCheckIn({ onDone, setError }: { onDone: () => void; setError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [skill, setSkillValue] = useState<Skill>("novice");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/open-play/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, skill }),
      });
      if (res.ok) {
        setName("");
        onDone();
      } else {
        const { error } = await res.json().catch(() => ({ error: "check-in failed" }));
        setError(`Couldn't check in: ${error}`);
      }
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <strong>👋 I&apos;m here</strong>
      <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <input
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button
          className="btn secondary"
          onClick={() => setSkillValue(skill === "intermediate" ? "novice" : "intermediate")}
        >
          {skill === "intermediate" ? "⭐ Intermediate" : "Novice"}
        </button>
        <button className="btn" onClick={submit} disabled={busy || !name.trim()}>
          Join the queue
        </button>
      </div>
    </div>
  );
}

export function CheckInCard({ t }: { t: T }) {
  const s = t.state!;
  const here = s.players.filter((p) => !p.left);

  return (
    <div>
      {s.phase === "running" && <SelfCheckIn onDone={t.refetch} setError={t.setError} />}

      {t.editing && (
        <div className="card">
          <strong>Checked in ({here.length})</strong>
          {here.length === 0 ? (
            <div className="muted" style={{ marginTop: 6 }}>Nobody yet.</div>
          ) : (
            <table>
              <tbody>
                {here.map((p) => {
                  const playing = isPlaying(s, p.id);
                  const st = s.stats[p.id] ?? { gp: 0, w: 0, pf: 0, pa: 0 };
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          defaultValue={p.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== p.name) t.commit((x) => renamePlayer(x, p.id, v));
                          }}
                        />
                      </td>
                      <td className="muted">{st.gp} gp</td>
                      <td>
                        <button
                          className="btn secondary"
                          onClick={() =>
                            t.commit((x) => setSkill(x, p.id, p.skill === "intermediate" ? "novice" : "intermediate"))
                          }
                        >
                          {p.skill === "intermediate" ? "⭐" : "N"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn secondary"
                          disabled={playing}
                          title={playing ? "On court — record the game first" : "Take a break / rejoin"}
                          onClick={() => t.commit((x) => setResting(x, p.id, !p.resting))}
                        >
                          {p.resting ? "Rejoin" : "Rest"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn danger"
                          disabled={playing}
                          title={playing ? "On court — record the game first" : `Check out ${p.name}`}
                          onClick={() => {
                            if (confirm(`Check ${p.name} out for the day?`)) {
                              t.commit((x) => removePlayer(x, p.id));
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
          )}
        </div>
      )}
    </div>
  );
}
