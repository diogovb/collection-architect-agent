"use client";

import { useState } from "react";
import type { FloorPlan, SelectedElement, ToolName } from "@/lib/types";
import type { CollectionItem, ReferenceImage, RightTab, Version } from "@/lib/vibe-types";
import { resolveSelection } from "@/lib/floor-plan-engine";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SeededMessage } from "@/lib/mock-data";
import { ChatPanel } from "./ChatPanel";

interface Props {
  active: RightTab;
  onActive: (t: RightTab) => void;
  plan: FloorPlan;
  selected: SelectedElement | null;
  onClearSelection: () => void;
  onApplyTool: (name: ToolName, input: unknown) => void;
  history: SeededMessage[];
  setHistory: (m: SeededMessage[] | ((prev: SeededMessage[]) => SeededMessage[])) => void;
  refs: ReferenceImage[];
  setRefs: (r: ReferenceImage[]) => void;
  library: CollectionItem[];
  versions: Version[];
  lang: Lang;
  onApplyDiff?: () => void;
  onCompareDiff?: () => void;
}

const TABS: { id: RightTab; key: string }[] = [
  { id: "chat", key: "tab.chat" },
  { id: "refs", key: "tab.refs" },
  { id: "collection", key: "tab.collection" },
  { id: "versions", key: "tab.versions" },
];

export function RightPanel(p: Props) {
  return (
    <aside className="w-[360px] shrink-0 border-l border-line bg-panel flex flex-col h-full">
      {/* Tabs */}
      <div className="shrink-0 border-b border-line px-4 flex">
        {TABS.map((tab) => {
          const isActive = p.active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => p.onActive(tab.id)}
              className={`relative py-3 px-3 text-[12px] transition-colors ${
                isActive ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {t(p.lang, tab.key)}
              {isActive && (
                <span className="absolute bottom-[-1px] left-2 right-2 h-[1.5px] bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {p.active === "chat" && (
          <ChatPanel
            plan={p.plan}
            selected={p.selected}
            onApplyTool={p.onApplyTool}
            onClearSelection={p.onClearSelection}
            history={p.history}
            setHistory={p.setHistory}
            lang={p.lang}
            onApplyDiff={p.onApplyDiff}
            onCompareDiff={p.onCompareDiff}
          />
        )}
        {p.active === "refs" && <RefsTab plan={p.plan} selected={p.selected} refs={p.refs} setRefs={p.setRefs} lang={p.lang} />}
        {p.active === "collection" && <CollectionTab plan={p.plan} selected={p.selected} library={p.library} lang={p.lang} />}
        {p.active === "versions" && <VersionsTab versions={p.versions} lang={p.lang} />}
      </div>
    </aside>
  );
}

function ContextHeader({ plan, selected, lang, suffix }: { plan: FloorPlan; selected: SelectedElement | null; lang: Lang; suffix: string }) {
  const ctx = selected ? resolveSelection(plan, selected) : null;
  return (
    <div className="px-4 py-3 border-b border-line">
      {ctx ? (
        <>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent mb-1">
            {t(lang, "chat.context")} · {ctx.kind.toUpperCase()}
          </div>
          <div className="editorial text-[15px] text-ink">{(ctx.payload.label ?? ctx.payload.name ?? ctx.kind) as string}</div>
        </>
      ) : (
        <div className="text-[12px] text-muted">{suffix}</div>
      )}
    </div>
  );
}

/* -------------------- References -------------------- */
function RefsTab({ plan, selected, refs, setRefs, lang }: {
  plan: FloorPlan; selected: SelectedElement | null; refs: ReferenceImage[]; setRefs: (r: ReferenceImage[]) => void; lang: Lang;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto thin-scroll flex flex-col">
      <ContextHeader plan={plan} selected={selected} lang={lang}
        suffix="Selecione um elemento na planta para anexar referências." />
      <div className="p-4 space-y-4">
        <Dropzone />
        <div className="space-y-3">
          {refs.map((r) => <RefCard key={r.id} r={r} onChange={(patch) => setRefs(refs.map((x) => x.id === r.id ? { ...x, ...patch } : x))} />)}
        </div>
      </div>
    </div>
  );
}

function Dropzone() {
  return (
    <div className="rounded-md border border-dashed border-line bg-panel-alt/40 p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-panel-alt transition-colors">
      <span className="text-[18px] text-muted">⊕</span>
      <div className="text-[12.5px] text-ink">Arraste imagens ou cole um link</div>
      <div className="font-mono text-[10px] text-muted uppercase tracking-wider">PNG · JPG · URL Pinterest</div>
    </div>
  );
}

function RefCard({ r, onChange }: { r: ReferenceImage; onChange: (p: Partial<ReferenceImage>) => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="h-[110px] relative" style={{ background: r.thumb }}>
        <span className="absolute top-2 left-2 chip text-[10px] py-0.5 px-2 bg-panel/90 backdrop-blur uppercase font-mono tracking-wider">REF</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="text-[12.5px] text-ink truncate">{r.label}</div>
        <div className="space-y-1">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
            <span>Influência</span>
            <span>{r.influence}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={r.influence}
            onChange={(e) => onChange({ influence: Number(e.target.value) })}
            className="w-full accent-[var(--accent)] h-1"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------- Collection -------------------- */
function CollectionTab({ plan, selected, library, lang }: {
  plan: FloorPlan; selected: SelectedElement | null; library: CollectionItem[]; lang: Lang;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const cats = Array.from(new Set(library.map((l) => l.category)));
  const filtered = library.filter((l) => {
    if (cat !== "all" && l.category !== cat) return false;
    if (q && !(`${l.name} ${l.designer ?? ""} ${l.brand ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  return (
    <div className="flex-1 min-h-0 overflow-y-auto thin-scroll flex flex-col">
      <ContextHeader plan={plan} selected={selected} lang={lang}
        suffix="Catálogo Collection — busque ou filtre por categoria." />
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 card px-2.5 py-1.5">
          <span className="text-muted text-[12px]">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "common.search")} className="bg-transparent flex-1 text-[12.5px] placeholder:text-muted outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCat("all")} className={`chip text-[11px] ${cat === "all" ? "active" : ""}`}>{t(lang, "common.all")}</button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`chip text-[11px] ${cat === c ? "active" : ""}`}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((it) => (
            <div key={it.id} className="card p-2.5 hover:border-[#D6CCB8] transition-colors cursor-pointer">
              <div className="aspect-[4/3] rounded mb-2" style={{ background: it.swatch }} />
              <div className="text-[11.5px] leading-tight truncate">{it.name}</div>
              <div className="text-[10px] text-muted truncate">{it.designer ?? it.brand}</div>
              <div className="font-mono text-[10px] text-ink mt-1">R$ {it.price.toLocaleString("pt-BR")}</div>
              {it.inProject && <div className="font-mono text-[9px] uppercase tracking-wider text-accent mt-1">no projeto</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Versions -------------------- */
function VersionsTab({ versions, lang }: { versions: Version[]; lang: Lang }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto thin-scroll flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <button className="btn-outline text-[11.5px] py-1 px-2.5">⊟ Branch</button>
        <button className="btn-outline text-[11.5px] py-1 px-2.5">◫ Comparar</button>
      </div>
      <div className="p-4 relative">
        <div className="absolute left-[26px] top-6 bottom-6 w-px bg-line" />
        <ul className="space-y-4">
          {versions.map((v) => (
            <li key={v.id} className="flex gap-3 relative">
              <div className={`mt-1 w-3 h-3 rounded-full border-2 z-10 shrink-0 ${
                v.current ? "bg-accent border-accent" : "bg-panel border-line"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-ink truncate">{v.label}</span>
                  {v.current && <span className="font-mono text-[9px] uppercase tracking-wider text-accent shrink-0">atual</span>}
                </div>
                <div className="font-mono text-[9.5px] text-muted uppercase tracking-wider mt-0.5">
                  {v.author} · {new Date(v.createdAt).toLocaleDateString("pt-BR")}
                </div>
                {v.note && <div className="text-[11.5px] text-muted mt-1 italic">{v.note}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
