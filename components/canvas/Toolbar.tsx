"use client";

// Floating tool toolbar (top-right): Selecionar / Parede / Cota / Snap.
// Keyboard shortcuts:
//   V — select (default)
//   M — move (alias of select; preserved for muscle memory)
//   W — wall draw
//   D — dimension (manual cota)
//   S — toggle snap
//   Esc — back to select

import { useEffect } from "react";
import { useSceneStore } from "@/lib/scene/store";
import type { Tool } from "@/lib/scene/types";

interface ToolDef {
  id: Tool;
  label: string;
  key: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Selecionar", key: "V", hint: "Selecionar e mover (V/M)" },
  { id: "wall", label: "Parede", key: "W", hint: "Desenhar nova parede (clique 1: anchor, clique 2: cria)" },
  { id: "dimension", label: "Cota", key: "D", hint: "Anotar dimensão manual (clique 1: anchor, clique 2: cria)" },
];

export function Toolbar() {
  const tool = useSceneStore((s) => s.tool);
  const setTool = useSceneStore((s) => s.setTool);
  const snapEnabled = useSceneStore((s) => s.snapEnabled);
  const setSnapEnabled = useSceneStore((s) => s.setSnapEnabled);

  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "v" || k === "m") {
        // M used to be its own "Mover" tool but it duplicated select+drag
        // semantics. Both keys now resolve to select.
        setTool("select");
        e.preventDefault();
      } else if (k === "w") { setTool("wall"); e.preventDefault(); }
      else if (k === "d") { setTool("dimension"); e.preventDefault(); }
      else if (k === "s") { setSnapEnabled(!snapEnabled); e.preventDefault(); }
      else if (e.key === "Escape") { setTool("select"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, setSnapEnabled, snapEnabled]);

  return (
    <div
      className="fade-up"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 12,
        display: "inline-flex",
        gap: 0,
        padding: 3,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        boxShadow: "0 1px 2px rgba(31,27,22,0.06)",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {TOOLS.map((t) => {
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            title={`${t.hint} (${t.key})`}
            onClick={() => setTool(t.id)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--bg)" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{t.label}</span>
            <span style={{ opacity: 0.6, fontSize: 9 }}>{t.key}</span>
          </button>
        );
      })}

      {/* Vertical separator */}
      <span
        style={{
          width: 1,
          background: "var(--line)",
          margin: "4px 4px",
          alignSelf: "stretch",
        }}
      />

      {/* Snap toggle — magnet glyph + on/off chip. */}
      <button
        title={`Snap a grid 10 cm + cantos de parede ${snapEnabled ? "ATIVO" : "DESLIGADO"} (S)`}
        onClick={() => setSnapEnabled(!snapEnabled)}
        style={{
          padding: "5px 10px",
          borderRadius: 999,
          background: snapEnabled ? "var(--accent)" : "transparent",
          color: snapEnabled ? "var(--bg)" : "var(--muted)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {/* Magnet glyph (U-shape) drawn inline so we don't bring an icon lib. */}
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <path
            d="M1.5 2 L1.5 6.2 A4 4 0 0 0 9.5 6.2 L9.5 2 L7.5 2 L7.5 6.2 A2 2 0 0 1 3.5 6.2 L3.5 2 Z"
            fill="currentColor"
          />
          <rect x="1.5" y="2" width="2" height="1.6" fill="currentColor" />
          <rect x="7.5" y="2" width="2" height="1.6" fill="currentColor" />
        </svg>
        <span>Snap</span>
        <span style={{ opacity: 0.6, fontSize: 9 }}>S</span>
      </button>
    </div>
  );
}
