"use client";
import { useState } from "react";

export function EditModeBar(props: {
  editing: boolean;
  onUnlock: (code: string) => Promise<boolean>;
  onLock: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);

  const doUnlock = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await props.onUnlock(code);
    setChecking(false);
    if (ok) setCode(""); // clear only on success; keep it so they can fix a typo
  };

  return (
    <div className="card row" style={{ justifyContent: "space-between" }}>
      {props.editing ? (
        <>
          <span className="pill" style={{ color: "var(--accent)" }}>● Organizer mode</span>
          <span className="row">
            <button className="btn secondary" onClick={props.onUndo}>Undo</button>
            <button className="btn danger" onClick={props.onReset}>Reset</button>
            <button className="btn secondary" onClick={props.onLock}>Lock</button>
          </span>
        </>
      ) : (
        <span className="row">
          <input
            type="password"
            placeholder="Organizer passcode"
            value={code}
            disabled={checking}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doUnlock(); }}
          />
          <button className="btn" onClick={doUnlock} disabled={checking}>
            {checking ? "Checking…" : "Unlock edit"}
          </button>
          <span className="muted">Viewers see live updates automatically.</span>
        </span>
      )}
    </div>
  );
}
