"use client";

import { useMemo, useState } from "react";
import type { FulfillmentChannel, ItemStatus, ShoppingRow } from "@/lib/intento-types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface Props {
  shopping: ShoppingRow[];
  lang: Lang;
}

type View = "architect" | "client";

export function ShoppingMode({ shopping, lang }: Props) {
  const [view, setView] = useState<View>("architect");

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

  // Commission math (architect view only).
  const commissionTotal = shopping.reduce((s, r) => s + r.qty * r.unitPrice * (r.commissionRate || 0), 0);
  const commissionConfirmed = shopping
    .filter((r) => r.status === "aprovado" || r.status === "comprado")
    .reduce((s, r) => s + r.qty * r.unitPrice * (r.commissionRate || 0), 0);
  const commissionPct = commissionTotal > 0 ? Math.round((commissionConfirmed / commissionTotal) * 100) : 0;
  const commissionByRoom = grouped.map(([room, items]) => ({
    room,
    value: items.reduce((s, r) => s + r.qty * r.unitPrice * (r.commissionRate || 0), 0),
  })).filter((x) => x.value > 0);

  return (
    <div className="flex-1 min-w-0 min-h-0 h-full w-full flex">
      {/* Center scroll */}
      <div className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto thin-scroll bg-bg">
        <div className={`mx-auto p-8 space-y-6 ${view === "architect" ? "max-w-[1100px]" : "max-w-[820px]"}`}>
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
                {view === "architect" ? (
                  <>
                    <button className="btn-outline">↗ {t(lang, "shop.exportPdf")}</button>
                    <button className="btn-primary">{t(lang, "shop.sendToClient")}</button>
                  </>
                ) : (
                  <>
                    <button className="btn-outline">{t(lang, "shop.talkArchitect")}</button>
                    <button className="btn-primary">{t(lang, "shop.approveAll")}</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-md bg-panel-alt border border-line">
              <button
                onClick={() => setView("architect")}
                className={`px-3 py-1 text-[12.5px] rounded-[4px] transition-colors ${
                  view === "architect" ? "bg-ink text-[#FAF7F0] font-medium" : "text-ink hover:bg-[rgba(31,27,22,0.06)]"
                }`}
              >
                {t(lang, "shop.viewArchitect")}
              </button>
              <button
                onClick={() => setView("client")}
                className={`px-3 py-1 text-[12.5px] rounded-[4px] transition-colors ${
                  view === "client" ? "bg-ink text-[#FAF7F0] font-medium" : "text-ink hover:bg-[rgba(31,27,22,0.06)]"
                }`}
              >
                {t(lang, "shop.viewClient")}
              </button>
            </div>
            <span className="text-[11.5px] text-muted">
              {view === "architect" ? t(lang, "shop.helpArchitect") : t(lang, "shop.helpClient")}
            </span>
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
                <ul className="space-y-2">
                  {items.map((r) => (
                    view === "architect"
                      ? <ArchitectRow key={r.id} row={r} lang={lang} />
                      : <ClientRow key={r.id} row={r} lang={lang} />
                  ))}
                </ul>
              </section>
            );
          })}

          {view === "client" && (
            <div className="card p-6 mt-8">
              <div className="font-serif italic text-[22px] mb-2">{t(lang, "shop.noRhythm")}</div>
              <p className="text-[13px] text-muted leading-relaxed">{t(lang, "shop.noRhythmBody")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Commission rail (architect only) */}
      {view === "architect" && (
        <aside className="w-[300px] shrink-0 border-l border-line bg-panel h-full overflow-y-auto thin-scroll">
          <div className="p-5 space-y-5">
            <div>
              <div className="label-mono mb-1.5">{t(lang, "shop.commissionTotal").toUpperCase()}</div>
              <div className="font-serif italic text-[32px] leading-none text-ink">
                R$ {commissionTotal.toLocaleString("pt-BR")}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wider mt-1.5">
                {t(lang, "shop.commissionPotential")}
              </div>
            </div>

            <div className="h-px bg-line" />

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <div className="label-mono">{t(lang, "shop.confirmed").toUpperCase()}</div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{commissionPct}%</span>
              </div>
              <div className="font-mono text-[16px] text-accent mb-2">
                R$ {commissionConfirmed.toLocaleString("pt-BR")}
              </div>
              <div className="h-[3px] bg-panel-alt rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${commissionPct}%` }} />
              </div>
            </div>

            <div className="h-px bg-line" />

            <div>
              <div className="label-mono mb-2">{t(lang, "shop.byRoom").toUpperCase()}</div>
              <ul className="space-y-1.5">
                {commissionByRoom.map((x) => (
                  <li key={x.room} className="flex justify-between items-baseline gap-2 text-[12px]">
                    <span className="truncate text-muted">{x.room}</span>
                    <span className="font-mono text-[11px] text-ink whitespace-nowrap">
                      R$ {x.value.toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="h-px bg-line" />

            <p className="font-serif italic text-[10.5px] leading-relaxed text-muted">
              {t(lang, "shop.commissionReminder")}
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

// --------- Architect row ---------

function ArchitectRow({ row, lang }: { row: ShoppingRow; lang: Lang }) {
  const commission = row.qty * row.unitPrice * (row.commissionRate || 0);
  const showRate = row.commissionRate > 0 && Math.abs(row.commissionRate - 0.05) > 1e-6;

  return (
    <li className="border-b border-line/60 hover:bg-panel-alt/40 transition-colors">
      <div className="grid grid-cols-[44px_1fr_70px_120px_140px_150px] items-center gap-3 py-3">
        <div className="w-10 h-10 rounded" style={{ background: row.swatch }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] truncate">{row.name}</span>
            {row.isCollection && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/40 rounded px-1.5 py-0.5 shrink-0">
                COLLECTION
              </span>
            )}
            <ChannelBadge channel={row.fulfillment} leadTime={row.leadTime} lang={lang} />
          </div>
          <div className="text-[11px] text-muted truncate">{row.brand ?? "—"}</div>
          {row.status === "alternativa" && row.clientNote && (
            <div className="mt-1 text-[11px] text-muted italic">
              <span className="font-mono not-italic text-[9px] uppercase tracking-wider text-[#9a3030] mr-1.5">{t(lang, "shop.clientNote")}:</span>
              {row.clientNote}
            </div>
          )}
        </div>
        <div className="font-mono text-[11px] text-muted">{t(lang, "shop.qty")} {row.qty}</div>
        <div className="font-mono text-[12px] text-ink text-right whitespace-nowrap">
          R$ {(row.qty * row.unitPrice).toLocaleString("pt-BR")}
        </div>
        <div className="text-right">
          {row.commissionRate > 0 ? (
            <>
              <div className="font-mono text-[12px] text-accent whitespace-nowrap">
                + R$ {commission.toLocaleString("pt-BR")}
              </div>
              {showRate && (
                <div className="font-serif italic text-[10.5px] text-muted">({Math.round(row.commissionRate * 100)}%)</div>
              )}
            </>
          ) : (
            <span className="font-mono text-[10px] text-muted uppercase tracking-wider">—</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <StatusPill status={row.status} lang={lang} />
        </div>
      </div>
      {/* Reason — small editorial line */}
      <div className="pl-[56px] pr-2 pb-3 -mt-1 font-serif italic text-[12px] text-muted leading-relaxed">
        {row.reason}
      </div>
      {row.fulfillment === "orcamento" && row.partner && (
        <div className="ml-[56px] mr-2 mb-3 mt-1">
          <PartnerCard row={row} lang={lang} />
        </div>
      )}
    </li>
  );
}

// --------- Client row ---------

function ClientRow({ row, lang }: { row: ShoppingRow; lang: Lang }) {
  return (
    <li className="border-b border-line/60 py-4">
      <div className="grid grid-cols-[80px_1fr_auto] items-start gap-5">
        <div className="w-[74px] h-[74px] rounded" style={{ background: row.swatch }} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[15px]">{row.name}</span>
            {row.isCollection && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-accent border border-accent/40 rounded px-1.5 py-0.5">
                COLLECTION
              </span>
            )}
            <ChannelBadge channel={row.fulfillment} leadTime={row.leadTime} lang={lang} />
          </div>
          <div className="text-[12px] text-muted mb-2">{row.brand ?? "—"}</div>
          {/* Editorial reason — prominent */}
          <p
            className="font-serif italic text-[14px] leading-relaxed text-ink pl-3"
            style={{ borderLeft: "2px solid rgba(184,85,46,0.25)" }}
          >
            {row.reason}
          </p>
          {row.fulfillment === "orcamento" && row.partner && (
            <div className="mt-3">
              <PartnerCard row={row} lang={lang} clientView />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 min-w-[180px]">
          <StatusPill status={row.status} lang={lang} />
          <div className="flex flex-col gap-1.5 mt-1">
            <ClientCTA row={row} lang={lang} />
            <button className="btn-ghost text-[11.5px] py-1 px-3">{t(lang, "shop.alternative")}</button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ClientCTA({ row, lang }: { row: ShoppingRow; lang: Lang }) {
  if (row.fulfillment === "orcamento") {
    if (row.status === "aguardando_orcamento") {
      return <button disabled className="btn-primary opacity-60 text-[11.5px] py-1 px-3">{t(lang, "status.aguardando_orcamento")}…</button>;
    }
    return <button className="btn-primary text-[11.5px] py-1 px-3">{t(lang, "shop.requestQuoteShort")}</button>;
  }
  if (row.fulfillment === "especificacao_pura") {
    return <button className="btn-ghost text-[11.5px] py-1 px-3 border border-line">{t(lang, "shop.markSpecified")}</button>;
  }
  return <button className="btn-primary text-[11.5px] py-1 px-3">{t(lang, "shop.approve")}</button>;
}

// --------- Status pill ---------

const STATUS_STYLE: Record<ItemStatus, { fg: string; bg: string; bd: string; key: string }> = {
  sugerido:              { fg: "#8C8478", bg: "transparent",       bd: "rgba(140,132,120,0.4)",  key: "status.sugerido" },
  revisao:               { fg: "#a85c2e", bg: "#F2DDD0",           bd: "rgba(168,92,46,0.4)",    key: "status.revisao" },
  aprovado:              { fg: "#3a8a48", bg: "#DEEBDF",           bd: "rgba(58,138,72,0.35)",   key: "status.aprovado" },
  alternativa:           { fg: "#9a3030", bg: "#F0DCDC",           bd: "rgba(154,48,48,0.35)",   key: "status.alternativa" },
  comprado:              { fg: "#1F1B16", bg: "#E6DFD2",           bd: "rgba(31,27,22,0.4)",     key: "status.comprado" },
  aguardando_orcamento:  { fg: "#a85c2e", bg: "#F2DDD0",           bd: "rgba(168,92,46,0.4)",    key: "status.aguardando_orcamento" },
  orcamento_recebido:    { fg: "#3a8a48", bg: "#DEEBDF",           bd: "rgba(58,138,72,0.35)",   key: "status.orcamento_recebido" },
  especificado:          { fg: "#1F1B16", bg: "#E6DFD2",           bd: "rgba(31,27,22,0.4)",     key: "status.especificado" },
};

function StatusPill({ status, lang }: { status: ItemStatus; lang: Lang }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center font-mono text-[9px] uppercase tracking-[0.10em] px-2 py-0.5 rounded-sm border whitespace-nowrap"
      style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
    >
      {t(lang, s.key)}
    </span>
  );
}

// --------- Channel badge ---------

const CHANNEL: Record<FulfillmentChannel, { glyph: string; color: string; key: string }> = {
  online_estoque:       { glyph: "●", color: "#3a8a48", key: "channel.online_estoque" },
  online_encomenda:     { glyph: "◐", color: "#a85c2e", key: "channel.online_encomenda" },
  orcamento:            { glyph: "◇", color: "#1F1B16", key: "channel.orcamento" },
  especificacao_pura:   { glyph: "○", color: "#8C8478", key: "channel.especificacao_pura" },
};

function ChannelBadge({ channel, leadTime, lang }: { channel: FulfillmentChannel; leadTime?: string; lang: Lang }) {
  const c = CHANNEL[channel];
  const label = t(lang, c.key).toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.10em] px-1.5 py-0.5 rounded-sm border whitespace-nowrap"
      style={{ color: c.color, borderColor: c.color + "4D" /* 30% alpha */ }}
    >
      <span aria-hidden>{c.glyph}</span>
      {label}
      {leadTime && <span className="text-muted normal-case tracking-normal ml-1">· {leadTime}</span>}
    </span>
  );
}

// --------- Partner card ---------

function PartnerCard({ row, lang, clientView }: { row: ShoppingRow; lang: Lang; clientView?: boolean }) {
  if (!row.partner) return null;
  return (
    <div className="card p-3 space-y-1.5">
      <div className="label-mono">{t(lang, "shop.partner").toUpperCase()}</div>
      <div className="text-[13px] text-ink">{row.partner.name}</div>
      <div className="text-[11.5px] text-muted">{row.partner.type}</div>
      {!clientView && row.partner.contact && (
        <div className="font-mono text-[10.5px] text-muted">{row.partner.contact}</div>
      )}
      {row.quote && (
        <div className="mt-2 pt-2 border-t border-line space-y-1">
          <div className="flex justify-between text-[12px]">
            <span className="text-muted">Valor</span>
            <span className="font-mono text-ink">R$ {row.quote.value.toLocaleString("pt-BR")}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-muted">{t(lang, "shop.deliveryIn")}</span>
            <span className="font-mono text-ink">{row.quote.delivery}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-muted">{t(lang, "shop.validUntil")}</span>
            <span className="font-mono text-ink">{row.quote.validity}</span>
          </div>
        </div>
      )}
    </div>
  );
}
