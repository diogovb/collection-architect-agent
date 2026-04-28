"use client";

import { useState } from "react";
import type { Camera, CameraStatus } from "@/lib/intento-types";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

interface Props {
  cameras: Camera[];
  setCameras: (c: Camera[]) => void;
  activeCameraId: string;
  setActiveCameraId: (id: string) => void;
  generateCamera: (id: string) => void;
  lang: Lang;
}

const VARIATIONS = [
  { id: "morning", label: "Manhã", glyph: "◐" },
  { id: "afternoon", label: "Tarde", glyph: "◐" },
  { id: "night", label: "Noite", glyph: "◐" },
];

export function RenderMode({ cameras, setCameras, activeCameraId, setActiveCameraId, generateCamera, lang }: Props) {
  if (cameras.length === 0) {
    return (
      <div className="flex-1 min-w-0 min-h-0 h-full w-full flex items-center justify-center bg-bg p-8">
        <div className="card max-w-[420px] p-6 text-center">
          <div className="label-mono mb-2">RENDER</div>
          <div className="editorial text-[20px] mb-2">Sem câmeras ainda</div>
          <p className="text-[12.5px] text-muted leading-relaxed">
            Volte para a Planta e peça ao seu agente para posicionar uma câmera no ambiente que você quer renderizar.
          </p>
        </div>
      </div>
    );
  }

  const cam = cameras.find((c) => c.id === activeCameraId) ?? cameras[0];

  function updateAtmosphere(patch: Partial<NonNullable<Camera["atmosphere"]>>) {
    setCameras(cameras.map((c) =>
      c.id === cam.id
        ? { ...c, atmosphere: { ...(c.atmosphere ?? { lightHour: 14, warmth: 50, materialIntensity: 50 }), ...patch } }
        : c
    ));
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0 h-full w-full">
      {/* Camera rail */}
      <aside className="w-[240px] shrink-0 border-r border-line bg-panel flex flex-col h-full">
        <div className="px-4 py-3 border-b border-line">
          <div className="label-mono">{t(lang, "nav.cameras")}</div>
        </div>
        <ul className="flex-1 overflow-y-auto thin-scroll p-2 space-y-1">
          {cameras.map((c) => {
            const isSel = c.id === cam.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setActiveCameraId(c.id)}
                  className={`w-full text-left p-2.5 rounded-md transition-colors ${
                    isSel ? "bg-accent-soft" : "hover:bg-panel-alt"
                  }`}
                >
                  <div className="aspect-[4/3] rounded bg-panel-alt mb-2 flex items-center justify-center text-muted text-[10px] font-mono uppercase tracking-wider relative overflow-hidden">
                    {c.status === "ready" && (
                      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#E8C794 0%,#B8804E 100%)" }} />
                    )}
                    {c.status === "generating" && <div className="absolute inset-0 shimmer" />}
                    <span className="relative z-10 text-white mix-blend-difference">{c.status.toUpperCase()}</span>
                  </div>
                  <div className="text-[12px] text-ink leading-tight">{c.name}</div>
                  <CameraStatusPill status={c.status} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Center */}
      <section className="flex-1 min-w-0 overflow-y-auto thin-scroll bg-bg">
        <div className="max-w-[1100px] mx-auto p-8 space-y-6">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="label-mono mb-1">RENDER · {cam.id.toUpperCase()}</div>
              <h1 className="font-serif italic text-[32px] leading-tight">{cam.name}</h1>
            </div>
            <div className="flex gap-2">
              {cam.status === "empty" && (
                <button onClick={() => generateCamera(cam.id)} className="btn-primary">⊕ {t(lang, "render.generate")}</button>
              )}
              {(cam.status === "ready" || cam.status === "outdated") && (
                <>
                  <button className="btn-outline">↗ Exportar</button>
                  <button onClick={() => generateCamera(cam.id)} className="btn-primary">↻ {t(lang, "render.regenerate")}</button>
                </>
              )}
              {cam.status === "generating" && (
                <button disabled className="btn-primary opacity-60">Gerando…</button>
              )}
            </div>
          </div>

          {/* Hero render area */}
          <div className="aspect-[16/9] rounded-md border border-line overflow-hidden relative" style={{ background: cam.status === "empty" ? "var(--panel-alt)" : "transparent" }}>
            {cam.status === "empty" && (
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-muted">
                <span className="text-[28px]">◐</span>
                <span className="text-[13px]">{t(lang, "render.empty")}</span>
                <button onClick={() => generateCamera(cam.id)} className="btn-primary mt-2">⊕ {t(lang, "render.generate")}</button>
              </div>
            )}
            {cam.status === "generating" && (
              <div className="absolute inset-0 shimmer flex items-center justify-center">
                <div className="bg-panel/90 px-4 py-2 rounded-md backdrop-blur flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-accent pulse" />
                  <div>
                    <div className="text-[12px] text-ink">Gerando render…</div>
                    <div className="font-mono text-[10px] text-muted uppercase tracking-wider">Geometria · Materiais · Iluminação</div>
                  </div>
                </div>
              </div>
            )}
            {cam.status === "ready" && (
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#E8C794 0%,#B8804E 50%,#5C3D1E 100%)" }}>
                <div className="absolute bottom-3 right-3 font-mono text-[10px] text-white/85 uppercase tracking-wider">
                  Atualizado {cam.lastGeneratedAt ? new Date(cam.lastGeneratedAt).toLocaleString("pt-BR") : ""}
                </div>
              </div>
            )}
            {cam.status === "outdated" && (
              <>
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#A89679 0%,#5C5448 100%)", filter: "saturate(0.6)" }} />
                <div className="absolute top-3 left-3 chip bg-outdated text-white border-outdated text-[10px] uppercase font-mono tracking-wider">
                  ⚠ {t(lang, "render.outdated")}
                </div>
              </>
            )}
          </div>

          {/* Variations */}
          {(cam.status === "ready" || cam.status === "outdated") && (
            <div>
              <div className="label-mono mb-2">VARIAÇÕES</div>
              <div className="grid grid-cols-3 gap-3">
                {VARIATIONS.map((v) => (
                  <div key={v.id} className="card overflow-hidden cursor-pointer hover:border-[#D6CCB8] transition-colors">
                    <div className="aspect-[16/10]" style={{
                      background: v.id === "morning" ? "linear-gradient(135deg,#F5DCC0,#E8B895)"
                        : v.id === "afternoon" ? "linear-gradient(135deg,#E8C794,#B8804E)"
                        : "linear-gradient(135deg,#3F362A,#1F1B16)",
                    }} />
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-[11.5px]">{v.label}</span>
                      <span className="font-mono text-[10px] text-muted">{v.glyph}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refine */}
          <div className="card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="label-mono mb-0.5">{t(lang, "render.refine")}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{t(lang, "render.refineNote")}</div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent">⏎ ENVIAR</span>
            </div>
            <textarea
              rows={2}
              placeholder='Ex: "mais quente", "luz da tarde de inverno", "trocar piso por pedra natural"'
              className="w-full bg-panel-alt rounded-md p-3 text-[13px] placeholder:text-muted resize-none border border-line focus:border-[#D6CCB8] outline-none"
            />
          </div>
        </div>
      </section>

      {/* Right config rail */}
      <aside className="w-[280px] shrink-0 border-l border-line bg-panel flex flex-col h-full overflow-y-auto thin-scroll">
        <div className="p-4 space-y-5">
          <div>
            <div className="label-mono mb-2">CÂMERA</div>
            <div className="space-y-2">
              <Field label="Nome" value={cam.name} />
              <Field label="Posição" value={`${cam.x.toFixed(1)}, ${cam.y.toFixed(1)} m`} />
              <Field label="Direção" value={`${cam.angle}°`} />
              <Field label="FOV" value={`${cam.fov}°`} />
            </div>
          </div>

          <div className="divider" />

          <div>
            <div className="label-mono mb-2">ATMOSFERA</div>
            <div className="space-y-3">
              <Slider label="Hora do dia" value={cam.atmosphere?.lightHour ?? 14} min={0} max={24} suffix="h"
                onChange={(v) => updateAtmosphere({ lightHour: v })} />
              <Slider label="Calor da luz" value={cam.atmosphere?.warmth ?? 50} min={0} max={100} suffix="%"
                onChange={(v) => updateAtmosphere({ warmth: v })} />
              <Slider label="Materialidade" value={cam.atmosphere?.materialIntensity ?? 50} min={0} max={100} suffix="%"
                onChange={(v) => updateAtmosphere({ materialIntensity: v })} />
            </div>
          </div>

          <div className="divider" />

          <div className="card-alt p-3">
            <div className="label-mono mb-1">VÍNCULO COM PLANTA</div>
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <span className={`w-1.5 h-1.5 rounded-full ${cam.status === "outdated" ? "bg-outdated" : "bg-ready"}`} />
              <span>{cam.status === "outdated" ? "Planta alterada após o render" : "Sincronizado"}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CameraStatusPill({ status }: { status: CameraStatus }) {
  const cfg: Record<CameraStatus, { color: string; label: string }> = {
    ready: { color: "var(--status-ready)", label: "PRONTA" },
    outdated: { color: "var(--status-outdated)", label: "REVER" },
    empty: { color: "#8C8478", label: "VAZIA" },
    generating: { color: "var(--accent)", label: "GERANDO" },
  };
  const c = cfg[status];
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] mt-1.5" style={{ color: c.color, letterSpacing: "0.10em" }}>
      <span className="w-1 h-1 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-[12px] text-ink truncate">{value}</span>
    </div>
  );
}

function Slider({ label, value, min, max, suffix, onChange }:
  { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void; }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className="text-ink">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)] h-1" />
    </div>
  );
}
