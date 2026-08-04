"use client";
import { useState } from "react";

export function ScoreEntry({ onSubmit, label }: { onSubmit: (a: number, b: number) => void; label: string }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={a} onChange={(e) => setA(e.target.value)} />
      <span className="muted">–</span>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={b} onChange={(e) => setB(e.target.value)} />
      <button
        className="btn"
        onClick={() => {
          const x = parseInt(a, 10), y = parseInt(b, 10);
          if (Number.isNaN(x) || Number.isNaN(y)) return;
          onSubmit(x, y); setA(""); setB("");
        }}
      >
        {label}
      </button>
    </div>
  );
}
