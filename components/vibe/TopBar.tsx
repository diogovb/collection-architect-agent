"use client";

import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import type { Mode } from "@/lib/vibe-types";

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  onCommandPalette: () => void;
}

const MODES: Mode[] = ["plan", "render", "presentation", "shopping"];

export function TopBar({ mode, setMode, lang, setLang, onCommandPalette }: Props) {
  return (
    <header className="h-[52px] shrink-0 border-b border-line bg-panel flex items-center px-5 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="font-serif italic text-[19px] tracking-tight">Vibe</span>
        <span className="w-[5px] h-[5px] rounded-full bg-accent" />
        <span className="font-serif italic text-[19px] tracking-tight">Project</span>
      </div>

      <div className="h-5 w-px bg-line" />

      {/* Project info */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="label-mono">PROJETO</span>
        <span className="text-[13px] font-medium truncate max-w-[260px]">Loft Atelier — 168 m²</span>
        <span className="text-[11px] text-muted">v5</span>
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

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        <IconBtn label="Desfazer">↶</IconBtn>
        <IconBtn label="Refazer">↷</IconBtn>
        <button
          onClick={onCommandPalette}
          className="ml-2 flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted hover:text-ink rounded-md border border-line bg-panel hover:bg-panel-alt transition-colors"
        >
          <span className="font-mono text-[11px]">⌘K</span>
          <span className="hidden md:inline">{t(lang, "top.command")}</span>
        </button>
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

function IconBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      title={label}
      className="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-panel-alt transition-colors flex items-center justify-center text-[15px]"
    >
      {children}
    </button>
  );
}
