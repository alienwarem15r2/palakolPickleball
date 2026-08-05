"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// Shows a scannable QR code for the live viewer link. The QR is generated
// locally (inline SVG) so it works without any network call.
export function ShareQR() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // window is only available on the client.
  // Encode the page the organiser is actually on, so the open play QR lands
  // players on the check-in rather than the tournament home page.
  useEffect(() => setUrl(window.location.origin + window.location.pathname), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the link is shown below to copy manually */
    }
  };

  return (
    <div>
      <div className="tabs">
        <button className="tab" onClick={() => setOpen((o) => !o)}>
          📱 {open ? "Hide QR" : "Share / QR"}
        </button>
      </div>
      {open && url && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ background: "#fff", display: "inline-block", padding: 14, borderRadius: 12 }}>
            <QRCodeSVG value={url} size={200} />
          </div>
          <div style={{ marginTop: 10, fontWeight: 600 }}>Scan to watch the tournament live</div>
          <div className="muted" style={{ marginTop: 4, wordBreak: "break-all" }}>{url}</div>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={copy}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
