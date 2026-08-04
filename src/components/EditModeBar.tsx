"use client";
import { useState } from "react";

export function EditModeBar(props: {
  editing: boolean;
  onUnlock: (code: string) => void;
  onLock: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const [code, setCode] = useState("");
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
            type="password" placeholder="Organizer passcode" value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn" onClick={() => props.onUnlock(code)}>Unlock edit</button>
          <span className="muted">Viewers see live updates automatically.</span>
        </span>
      )}
    </div>
  );
}
