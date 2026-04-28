"use client";

import type { FloorPlan, SelectedElement } from "@/lib/types";

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
}

export function SelectionToolbar({ plan, selected }: Props) {
  if (!selected) return null;

  const info = describe(plan, selected);
  if (!info) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-4 z-20 pointer-events-auto fade-up">
      <div className="bg-panel border border-line rounded-md shadow-[0_8px_24px_-12px_rgba(31,27,22,0.18)] px-3 py-2 flex items-center gap-3 min-w-[460px]">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">{info.kind}</span>
          <span className="editorial text-[15px] leading-tight">{info.name}</span>
        </div>
        <span className="text-[11.5px] text-muted whitespace-nowrap">{info.meta}</span>

        <div className="ml-auto flex items-center gap-1">
          {info.actions.map((a) => (
            <button key={a} className="chip text-[11px]">{a}</button>
          ))}
        </div>

        <div className="h-6 w-px bg-line" />
        <div className="flex items-center gap-1.5">
          <input
            placeholder="ajustar… ⏎"
            className="bg-panel-alt border border-line rounded-[5px] px-2.5 py-1 text-[12px] w-[150px] placeholder:text-muted"
          />
          <span className="font-mono text-[10px] text-muted">⌘</span>
        </div>
      </div>
    </div>
  );
}

function describe(plan: FloorPlan, sel: SelectedElement) {
  if (sel.type === "room") {
    const r = plan.rooms.find((x) => x.id === sel.id);
    if (!r) return null;
    return {
      kind: "AMBIENTE",
      name: r.name,
      meta: `${r.width.toFixed(2)} × ${r.height.toFixed(2)} m · ${(r.width * r.height).toFixed(1)} m² · ${r.floor}`,
      actions: ["Renomear", "Trocar piso", "Recortar"],
    };
  }
  if (sel.type === "furniture") {
    const f = plan.furniture.find((x) => x.id === sel.id);
    if (!f) return null;
    return {
      kind: "MOBÍLIA",
      name: f.label,
      meta: `${(f.width * 1000).toFixed(0)} × ${(f.height * 1000).toFixed(0)} mm`,
      actions: ["Mover", "Girar", "Substituir", "Remover"],
    };
  }
  if (sel.type === "door") {
    return { kind: "PORTA", name: "Vão de passagem", meta: "0.90 m · folha à direita", actions: ["Reposicionar", "Trocar lado", "Largura"] };
  }
  if (sel.type === "window") {
    return { kind: "JANELA", name: "Janela", meta: "Esquadria de alumínio", actions: ["Mover", "Largura", "Altura"] };
  }
  if (sel.type === "wall") {
    return { kind: "PAREDE", name: "Parede divisória", meta: "Drywall 12 mm · estrutural não", actions: ["Mover", "Abrir vão", "Demolir"] };
  }
  return null;
}
