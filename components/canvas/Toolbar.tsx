"use client";

// Floating tool toolbar (top-right): Selecionar / Mover / Parede / Cota.
// Keyboard shortcuts: V (select), M (move), W (wall), D (dimension), Esc (back to select).

import { useEffect } from "react";
import { useSceneStore } from "@/lib/scene/store";
import type { Tool } from "@/lib/scene/types";

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: "select", label: "Selecionar", key: "V", hint: "Selecionar elementos" },
  { id: "move", label: "Mover", key: "M", hint: "Mover seleção" },
  { id: "wall", label: "Parede", key: "W", hint: "Desenhar nova parede (clique para iniciar e finalizar)" },
  { id: "dimension", label: "Cota", key: "D", hint: "Anotar dimensão manual" },
];

export function Toolbar() {
  const tool = useSceneStore((s) => s.tool);
  const setTool = useSceneStore((s) => s.setTool);

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
      if (k === "v") { setTool("select"); e.preventDefault(); }
      else if (k === "m") { setTool("move"); e.preventDefault(); }
      else if (k === "w") { setTool("wall"); e.preventDefault(); }
      else if (k === "d") { setTool("dimension"); e.preventDefault(); }
      else if (e.key === "Escape") { setTool("select"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool]);

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
    </div>
  );
}
