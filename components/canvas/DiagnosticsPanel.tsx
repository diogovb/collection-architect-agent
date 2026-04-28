"use client";

import { useState } from "react";
import { useSceneStore } from "@/lib/scene/store";

export function DiagnosticsPanel() {
  const diagnostics = useSceneStore((s) => s.diagnostics);
  const [open, setOpen] = useState(false);

  const counts = diagnostics.reduce(
    (acc, d) => {
      acc[d.severity] = (acc[d.severity] ?? 0) + 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<string, number>
  );

  const total = diagnostics.length;
  const hasIssues = total > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        right: 24,
        zIndex: 11,
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="card"
        style={{
          padding: "6px 12px",
          background: hasIssues ? "rgba(184,85,46,0.08)" : "rgba(255,255,255,0.95)",
          borderColor: hasIssues ? "rgba(184,85,46,0.4)" : "var(--line)",
          cursor: "pointer",
          textTransform: "uppercase",
          color: hasIssues ? "var(--accent)" : "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: hasIssues ? "var(--accent)" : "var(--status-ready)",
          }}
        />
        {hasIssues ? `${total} aviso${total === 1 ? "" : "s"}` : "Validado · NBR/Neufert"}
      </button>
      {open && hasIssues && (
        <div
          className="card thin-scroll fade-up"
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 6px)",
            width: 360,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--panel)",
            padding: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Diagnóstico técnico
          </div>
          {diagnostics.map((d, i) => (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 9,
                    color:
                      d.severity === "error"
                        ? "var(--status-error)"
                        : d.severity === "warning"
                        ? "var(--accent)"
                        : "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {d.severity}
                </span>
                {d.reference && (
                  <span style={{ fontSize: 9, color: "var(--muted)" }}>{d.reference}</span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-geist)", fontSize: 12, color: "var(--ink)", marginTop: 2 }}>
                {d.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
