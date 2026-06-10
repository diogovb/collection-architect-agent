"use client";

import { useEffect, useState } from "react";
import type { FloorPlan } from "@/lib/types";
import type { Slide, SlideKind } from "@/lib/intento-types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { FloorPlan as FloorPlanSvg } from "./FloorPlan";

interface Props {
  slides: Slide[];
  setSlides: (s: Slide[]) => void;
  activeSlideId: string;
  setActiveSlideId: (id: string) => void;
  plan: FloorPlan;
  lang: Lang;
}

const TONES = [
  { id: "client", label: "Cliente" },
  { id: "investor", label: "Investidor" },
  { id: "competition", label: "Concurso" },
];

const KIND_LABEL: Record<SlideKind, string> = {
  cover: "CAPA",
  concept: "CONCEITO",
  plan: "PLANTA",
  materials: "MATERIAIS",
  products: "PRODUTOS",
  list: "LISTA",
  text: "TEXTO",
  section: "SEÇÃO",
};

export function PresentationMode({ slides, setSlides, activeSlideId, setActiveSlideId, plan, lang }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [tone, setTone] = useState("client");

  useEffect(() => {
    if (!fullscreen || slides.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
      else if (e.key === "ArrowRight") {
        const i = slides.findIndex((s) => s.id === activeSlideId);
        if (i < slides.length - 1) setActiveSlideId(slides[i + 1].id);
      }
      else if (e.key === "ArrowLeft") {
        const i = slides.findIndex((s) => s.id === activeSlideId);
        if (i > 0) setActiveSlideId(slides[i - 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen, slides, activeSlideId, setActiveSlideId]);

  if (slides.length === 0) {
    return (
      <div className="flex-1 min-w-0 min-h-0 h-full w-full flex items-center justify-center bg-bg p-8">
        <div className="card max-w-[420px] p-6 text-center">
          <div className="label-mono mb-2">APRESENTAÇÃO</div>
          <div className="editorial text-[20px] mb-2">Nenhum slide ainda</div>
          <p className="text-[12.5px] text-muted leading-relaxed">
            Conforme o projeto evolui, peça ao seu agente para gerar uma apresentação a partir da planta e dos materiais.
          </p>
        </div>
      </div>
    );
  }

  const slide = slides.find((s) => s.id === activeSlideId) ?? slides[0];
  const idx = slides.findIndex((s) => s.id === slide.id);

  function updateSlide(patch: Partial<Slide>) {
    setSlides(slides.map((s) => s.id === slide.id ? { ...s, ...patch } : s));
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-ink flex items-center justify-center">
        <div className="aspect-[16/9] w-[90vw] max-w-[1600px] bg-bg shadow-2xl">
          <SlideContent slide={slide} plan={plan} editable={false} onChange={() => {}} />
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/60">{idx + 1} / {slides.length}</span>
          <button onClick={() => setFullscreen(false)} className="px-3 py-1.5 rounded-md bg-white/10 text-white text-[12px] hover:bg-white/20 transition-colors">
            ESC · {t(lang, "pres.exit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0 h-full w-full">
      {/* Slides rail */}
      <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col h-full">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="label-mono">SLIDES</div>
          <button className="text-muted hover:text-ink text-[14px]" title="Adicionar slide">⊕</button>
        </div>
        <ul className="flex-1 overflow-y-auto thin-scroll p-2 space-y-1">
          {slides.map((s, i) => {
            const isSel = s.id === slide.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => setActiveSlideId(s.id)}
                  className={`w-full text-left p-2 rounded-md transition-colors ${
                    isSel ? "bg-accent-soft" : "hover:bg-panel-alt"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-[9px] text-muted">{(i + 1).toString().padStart(2, "0")}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-accent">{KIND_LABEL[s.kind]}</span>
                  </div>
                  <div className="aspect-[16/9] rounded bg-panel-alt mb-1.5 overflow-hidden">
                    <SlideThumb slide={s} />
                  </div>
                  <div className="text-[11px] text-ink truncate">{s.title ?? "—"}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Active slide */}
      <section className="flex-1 min-w-0 bg-bg overflow-y-auto thin-scroll">
        <div className="max-w-[1100px] mx-auto p-8 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="label-mono mb-1">{KIND_LABEL[slide.kind]} · SLIDE {idx + 1}</div>
              <div className="font-serif italic text-[22px]">{slide.title ?? "—"}</div>
            </div>
            <button onClick={() => setFullscreen(true)} className="btn-primary">▸ {t(lang, "pres.present")}</button>
          </div>

          <div className="aspect-[16/9] bg-panel border border-line rounded-md overflow-hidden">
            <SlideContent slide={slide} plan={plan} editable onChange={updateSlide} />
          </div>
        </div>
      </section>

      {/* Narrative rail */}
      <aside className="w-[320px] shrink-0 border-l border-line bg-panel flex flex-col h-full overflow-y-auto thin-scroll">
        <div className="p-4 space-y-4">
          <div>
            <div className="label-mono mb-2">CAPÍTULOS</div>
            <ol className="space-y-1.5">
              {slides.map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="font-mono text-[10px] text-muted w-5">{(i + 1).toString().padStart(2, "0")}</span>
                  <button onClick={() => setActiveSlideId(s.id)} className={`text-left flex-1 truncate hover:text-accent ${s.id === slide.id ? "text-accent" : "text-ink"}`}>
                    {s.title ?? KIND_LABEL[s.kind]}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="divider" />

          <div>
            <div className="label-mono mb-2">SUGESTÕES IA</div>
            <ul className="space-y-2 text-[12px]">
              <li className="card-alt p-2.5">
                <span className="text-accent text-[11px] mr-1">✶</span>
                Adicionar slide de comparação antes/depois entre v3 e v5
              </li>
              <li className="card-alt p-2.5">
                <span className="text-accent text-[11px] mr-1">✶</span>
                Mover slide de materiais para logo após a planta
              </li>
            </ul>
          </div>

          <div className="divider" />

          <div>
            <div className="label-mono mb-2">TOM DA NARRATIVA</div>
            <div className="flex flex-col gap-1">
              {TONES.map((t) => (
                <button key={t.id} onClick={() => setTone(t.id)}
                  className={`text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
                    tone === t.id ? "bg-accent-soft text-ink" : "hover:bg-panel-alt text-muted"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary w-full">↻ {t(lang, "pres.recompose")}</button>
        </div>
      </aside>
    </div>
  );
}

function SlideThumb({ slide }: { slide: Slide }) {
  if (slide.kind === "cover") return <div className="w-full h-full" style={{ background: "linear-gradient(135deg,#FAF7F0,#E6DFD2)" }} />;
  if (slide.kind === "plan") return <div className="w-full h-full bg-bg" />;
  if (slide.kind === "materials") return <div className="w-full h-full grid grid-cols-3"><div style={{ background: "#A8967A" }} /><div style={{ background: "#3F362A" }} /><div style={{ background: "#D9CFB8" }} /></div>;
  return <div className="w-full h-full bg-panel-alt" />;
}

function SlideContent({ slide, plan, editable, onChange }:
  { slide: Slide; plan: FloorPlan; editable: boolean; onChange: (p: Partial<Slide>) => void; }) {
  if (slide.kind === "cover") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center" style={{ background: "linear-gradient(135deg,#FAF7F0,#E6DFD2)" }}>
        <div className="label-mono mb-4">INTENTO · PROJECT</div>
        <h1
          className="font-serif italic text-[64px] leading-[0.95] mb-3"
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={(e) => onChange({ title: e.currentTarget.innerText })}
        >{slide.title}</h1>
        <div
          className="text-[15px] text-muted"
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={(e) => onChange({ subtitle: e.currentTarget.innerText })}
        >{slide.subtitle}</div>
      </div>
    );
  }
  if (slide.kind === "concept") {
    return (
      <div className="w-full h-full p-12 grid grid-cols-2 gap-8 items-center">
        <div className="aspect-square rounded" style={{ background: "linear-gradient(135deg,#B8552E,#E8B895)" }} />
        <div>
          <div className="label-mono mb-3">CONCEITO</div>
          <h2
            className="font-serif italic text-[36px] leading-tight mb-4"
            contentEditable={editable}
            suppressContentEditableWarning
            onBlur={(e) => onChange({ title: e.currentTarget.innerText })}
          >{slide.title}</h2>
          <p
            className="text-[14px] leading-relaxed text-ink"
            contentEditable={editable}
            suppressContentEditableWarning
            onBlur={(e) => onChange({ body: e.currentTarget.innerText })}
          >{slide.body}</p>
        </div>
      </div>
    );
  }
  if (slide.kind === "plan") {
    return (
      <div className="w-full h-full p-8 flex flex-col">
        <div className="label-mono mb-2">PLANTA HUMANIZADA</div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <FloorPlanSvg
            plan={plan} selected={null} onSelect={() => {}}
            variant="presentation"
          />
        </div>
      </div>
    );
  }
  if (slide.kind === "materials") {
    const swatches = ["#A8967A", "#3F362A", "#D9CFB8", "#5C5448", "#E8DDC8", "#B8552E"];
    return (
      <div className="w-full h-full p-12">
        <div className="label-mono mb-3">PALETA DE MATERIAIS</div>
        <h2 className="font-serif italic text-[32px] mb-6"
            contentEditable={editable} suppressContentEditableWarning
            onBlur={(e) => onChange({ title: e.currentTarget.innerText })}>{slide.title}</h2>
        <div className="grid grid-cols-6 gap-3">
          {swatches.map((s, i) => (
            <div key={i}>
              <div className="aspect-square rounded mb-1.5" style={{ background: s }} />
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted">M0{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full h-full p-12 flex flex-col">
      <div className="label-mono mb-3">{KIND_LABEL[slide.kind]}</div>
      <h2 className="font-serif italic text-[36px] leading-tight"
          contentEditable={editable} suppressContentEditableWarning
          onBlur={(e) => onChange({ title: e.currentTarget.innerText })}>{slide.title}</h2>
      {slide.body && <p className="mt-4 text-[14px] leading-relaxed text-ink"
                        contentEditable={editable} suppressContentEditableWarning
                        onBlur={(e) => onChange({ body: e.currentTarget.innerText })}>{slide.body}</p>}
    </div>
  );
}
