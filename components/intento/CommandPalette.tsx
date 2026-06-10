"use client";

import { useEffect, useState } from "react";
import type { Mode } from "@/lib/intento-types";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  setMode: (m: Mode) => void;
}

interface Cmd { id: string; label: string; group: string; run: () => void; }

export function CommandPalette({ open, setOpen, setMode }: Props) {
  const [q, setQ] = useState("");

  const cmds: Cmd[] = [
    { id: "mode-plan", group: "Modo", label: "Ir para Planta", run: () => setMode("plan") },
    { id: "mode-presentation", group: "Modo", label: "Ir para Apresentação", run: () => setMode("presentation") },
    { id: "mode-shopping", group: "Modo", label: "Ir para Lista de Compras", run: () => setMode("shopping") },
    { id: "ai-suggest", group: "IA", label: "Sugerir melhorias para a planta atual", run: () => setMode("plan") },
    { id: "ai-quote", group: "IA", label: "Gerar lista de compras automática", run: () => setMode("shopping") },
    { id: "export-pdf", group: "Exportar", label: "Exportar apresentação em PDF", run: () => {} },
    { id: "share-link", group: "Compartilhar", label: "Copiar link de visualização", run: () => navigator.clipboard?.writeText?.(location.href) },
  ];

  const filtered = q
    ? cmds.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(q.toLowerCase()))
    : cmds;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-[560px] max-w-[92vw] bg-panel border border-line rounded-md shadow-2xl overflow-hidden fade-up">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span className="text-muted text-[14px]">⌕</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Comandos, ações, ambientes…"
            className="flex-1 bg-transparent text-[14px] placeholder:text-muted outline-none"
          />
          <span className="font-mono text-[10px] text-muted">ESC</span>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto thin-scroll p-2">
          {filtered.length === 0 && <li className="text-[13px] text-muted px-3 py-4">Nenhum comando encontrado.</li>}
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { c.run(); setOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-panel-alt transition-colors text-left"
              >
                <span className="text-[13px] text-ink">{c.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{c.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
