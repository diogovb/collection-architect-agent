"use client";

import { Html } from "@react-three/drei";

interface Props {
  rotationDeg: number;
}

export function NorthArrow({ rotationDeg }: Props) {
  return (
    <Html
      fullscreen
      style={{ pointerEvents: "none", position: "absolute", inset: 0 }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid #1F1B16",
          background: "rgba(244,239,230,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-jetbrains-mono)",
          fontSize: 8,
          color: "#1F1B16",
          transform: `rotate(${rotationDeg}deg)`,
        }}
      >
        <svg width="18" height="22" viewBox="0 0 18 22">
          <path d="M9 2 L13 18 L9 14 L5 18 Z" fill="#1F1B16" />
          <text x="9" y="22" fontSize="6" textAnchor="middle" fill="#1F1B16" style={{ fontFamily: "inherit" }}>N</text>
        </svg>
      </div>
    </Html>
  );
}
