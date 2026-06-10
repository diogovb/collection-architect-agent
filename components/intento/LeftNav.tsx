"use client";

import type { FloorPlan, SelectedElement } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onSelect: (s: SelectedElement | null) => void;
  lang: Lang;
}

export function LeftNav({ plan, selected, onSelect, lang }: Props) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col h-full">
      {/* Environments */}
      <Section label={t(lang, "nav.environments")}>
        <ul className="space-y-0.5">
          {plan.rooms.map((r) => {
            const isSel = selected?.type === "room" && selected.id === r.id;
            const area = (r.width * r.height).toFixed(1).replace(".", ",");
            return (
              <li key={r.id}>
                <button
                  onClick={() => onSelect({ type: "room", id: r.id })}
                  className={`w-full text-left px-3 py-1.5 rounded-[5px] flex items-baseline justify-between transition-colors ${
                    isSel ? "bg-accent-soft text-ink" : "hover:bg-panel-alt"
                  }`}
                >
                  <span className="text-[12.5px] truncate">{r.name}</span>
                  <span className="font-mono text-[10px] text-muted ml-2">{area}m²</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="flex-1" />

      {/* Footer / project meta */}
      <div className="p-4 border-t border-line">
        <div className="label-mono mb-2">{t(lang, "nav.project")}</div>
        <div className="text-[11.5px] text-muted leading-relaxed">
          <div>Cliente: Família Carvalho</div>
          <div>Atualizado 27/04 14:08</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ready" />
            <span>3 colaboradores online</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-2">
      <div className="label-mono px-2 mb-2">{label}</div>
      {children}
    </div>
  );
}
