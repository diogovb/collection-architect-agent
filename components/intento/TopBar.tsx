"use client";

import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { Mode } from "@/lib/intento-types";
import type { FloorPlan } from "@/lib/types";

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  onCommandPalette: () => void;
  plan: FloorPlan;
  versionLabel?: string;
}

const MODES: Mode[] = ["plan", "render", "presentation", "shopping"];

export function TopBar({ mode, setMode, lang, setLang, onCommandPalette, plan, versionLabel }: Props) {
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
  const projectLabel =
    plan.rooms.length === 0
      ? "Novo projeto"
      : `Projeto — ${totalArea.toFixed(1).replace(".", ",")} m²`;

  return (
    <header className="h-[52px] shrink-0 border-b border-line bg-panel flex items-center px-5 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="font-serif italic text-[19px] tracking-tight">Intento</span>
        <span className="w-[5px] h-[5px] rounded-full bg-accent" />
        <span className="font-serif italic text-[19px] tracking-tight">Project</span>
      </div>

      <div className="h-5 w-px bg-line" />

      {/* Project info */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="label-mono">PROJETO</span>
        <span className="text-[13px] font-medium truncate max-w-[260px]">{projectLabel}</span>
        {versionLabel && <span className="text-[11px] text-muted">{versionLabel}</span>}
      </div>

      {/* Segmented mode control */}
      <div className="ml-auto" />
      <div className="flex items-center gap-1 p-1 rounded-md bg-panel-alt border border-line">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-[12.5px] rounded-[4px] transition-colors ${
              mode === m
                ? "bg-ink text-[#FAF7F0] font-medium"
                : "text-ink hover:bg-[rgba(31,27,22,0.06)]"
            }`}
          >
            {t(lang, `mode.${m}`)}
          </button>
        ))}
      </div>

      {/* Right side actions. Undo/Redo and Command palette buttons were
          removed — the keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z,
          Ctrl/Cmd+K) cover the same ground without the toolbar clutter. */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setLang(lang === "pt" ? "en" : "pt")}
          className="ml-1 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted hover:text-ink rounded-md hover:bg-panel-alt transition-colors"
          title="Idioma / Language"
        >
          {lang}
        </button>
        <button className="btn-primary ml-2">
          ↗ {t(lang, "top.share")}
        </button>
      </div>
    </header>
  );
}
