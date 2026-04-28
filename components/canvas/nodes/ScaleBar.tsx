"use client";

import { Html } from "@react-three/drei";

interface Props {
  meterPx: number; // pixels per meter at current zoom
}

export function ScaleBar({ meterPx }: Props) {
  // Show 2m bar.
  const widthPx = Math.max(40, Math.min(220, meterPx * 2));
  return (
    <Html fullscreen style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 24,
          fontFamily: "var(--font-jetbrains-mono)",
          fontSize: 10,
          color: "#4A4338",
          background: "rgba(244,239,230,0.85)",
          padding: "4px 8px",
          border: "1px solid #E6DFD2",
          borderRadius: 4,
        }}
      >
        <svg width={widthPx + 4} height="14" style={{ display: "block" }}>
          <line x1="2" y1="7" x2={widthPx + 2} y2="7" stroke="#4A4338" strokeWidth="1" />
          <line x1="2" y1="3" x2="2" y2="11" stroke="#4A4338" strokeWidth="1" />
          <line x1={widthPx / 2 + 2} y1="4" x2={widthPx / 2 + 2} y2="10" stroke="#4A4338" strokeWidth="0.7" />
          <line x1={widthPx + 2} y1="3" x2={widthPx + 2} y2="11" stroke="#4A4338" strokeWidth="1" />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", letterSpacing: "0.08em" }}>
          <span>0</span>
          <span>2 m</span>
        </div>
      </div>
    </Html>
  );
}
