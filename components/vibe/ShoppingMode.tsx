"use client";

import { useMemo } from "react";
import type { ShoppingRow } from "@/lib/vibe-types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface Props {
  shopping: ShoppingRow[];
  lang: Lang;
}

export function ShoppingMode({ shopping, lang }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingRow[]>();
    for (const r of shopping) {
      const arr = map.get(r.room) ?? [];
      arr.push(r);
      map.set(r.room, arr);
    }
    return Array.from(map.entries());
  }, [shopping]);

  const total = shopping.reduce((sum, r) => sum + r.qty * r.unitPrice, 0);

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-bg">
      <div className="max-w-[1100px] mx-auto p-8 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 pb-4 border-b border-line">
          <div>
            <div className="label-mono mb-1">LISTA DE COMPRAS</div>
            <h1 className="font-serif italic text-[34px] leading-tight">Loft Atelier</h1>
            <div className="text-[12px] text-muted mt-1">{shopping.length} itens · {grouped.length} ambientes</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{t(lang, "shop.total")}</div>
              <div className="font-serif italic text-[28px] text-ink">R$ {total.toLocaleString("pt-BR")}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-outline">↗ {t(lang, "shop.exportPdf")}</button>
              <button className="btn-primary">{t(lang, "shop.requestQuote")}</button>
            </div>
          </div>
        </div>

        {/* Groups */}
        {grouped.map(([room, items]) => {
          const subtotal = items.reduce((s, r) => s + r.qty * r.unitPrice, 0);
          return (
            <section key={room} className="space-y-2">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <h2 className="font-serif italic text-[22px]">{room}</h2>
                <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  {items.length} itens · R$ {subtotal.toLocaleString("pt-BR")}
                </div>
              </div>
              <ul>
                {items.map((r) => <Row key={r.id} row={r} lang={lang} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({ row, lang }: { row: ShoppingRow; lang: Lang }) {
  return (
    <li className="grid grid-cols-[40px_1fr_120px_60px_110px_80px] items-center gap-4 py-3 border-b border-line/60 hover:bg-panel-alt/50 transition-colors">
      <div className="w-9 h-9 rounded" style={{ background: row.swatch }} />
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] truncate">{row.name}</span>
        {row.isCollection && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/40 rounded px-1.5 py-0.5 shrink-0">
            COLLECTION
          </span>
        )}
      </div>
      <div className="text-[12px] text-muted truncate">{row.brand ?? "—"}</div>
      <div className="font-mono text-[11px] text-muted">{t(lang, "shop.qty")} {row.qty}</div>
      <div className="font-mono text-[12px] text-ink text-right">R$ {(row.qty * row.unitPrice).toLocaleString("pt-BR")}</div>
      <button className="btn-ghost text-[11.5px] py-1 px-2.5 text-right justify-self-end">{t(lang, "shop.detail")} →</button>
    </li>
  );
}
