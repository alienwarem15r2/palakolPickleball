"use client";
import { useState } from "react";

export function ScoreEntry({
  onSubmit,
  label,
}: {
  onSubmit: (a: number, b: number) => void | boolean | Promise<void | boolean>;
  label: string;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={a} onChange={(e) => setA(e.target.value)} />
      <span className="muted">–</span>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={b} onChange={(e) => setB(e.target.value)} />
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          const x = parseInt(a, 10), y = parseInt(b, 10);
          if (Number.isNaN(x) || Number.isNaN(y)) return;
          setBusy(true);
          try {
            const ok = await onSubmit(x, y);
            if (ok !== false) { setA(""); setB(""); } // clear only if it wasn't rejected
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
    </div>
  );
}
