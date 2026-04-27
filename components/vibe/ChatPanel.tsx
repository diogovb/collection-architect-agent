"use client";

import { useEffect, useRef, useState } from "react";
import { resolveSelection } from "@/lib/floor-plan-engine";
import type { FloorPlan, SelectedElement, StreamEvent, ToolName } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SeededMessage } from "@/lib/mock-data";

type ModelId = "claude-opus-4-7" | "claude-sonnet-4-6";

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onApplyTool: (name: ToolName, input: unknown) => void;
  onClearSelection: () => void;
  history: SeededMessage[];
  setHistory: (m: SeededMessage[] | ((prev: SeededMessage[]) => SeededMessage[])) => void;
  lang: Lang;
  onApplyDiff?: () => void;
  onCompareDiff?: () => void;
}

const QUICK_PROMPTS = [
  "Mais quente",
  "Mais ar",
  "Outro material",
  "Refazer cozinha",
];

export function ChatPanel({
  plan, selected, onApplyTool, onClearSelection,
  history, setHistory, lang, onApplyDiff, onCompareDiff,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<ModelId>("claude-opus-4-7");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef(plan); planRef.current = plan;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const modelRef = useRef(model); modelRef.current = model;
  const toolNameByIdRef = useRef<Map<string, ToolName>>(new Map());

  const ctx = selected ? resolveSelection(plan, selected) : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamingText]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const userMsg: SeededMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed, time };
    const assistantId = `a-${Date.now()}`;
    setHistory((prev) => [...prev, userMsg]);
    setStreamingId(assistantId);
    setStreamingText("");
    setInput("");
    setBusy(true);

    const apiHistory = [...history, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiHistory,
          plan: planRef.current,
          selection: selectedRef.current ? resolveSelection(planRef.current, selectedRef.current) : null,
          model: modelRef.current,
        }),
      });
      if (!resp.ok || !resp.body) {
        const errTxt = await resp.text().catch(() => "");
        throw new Error(errTxt || `Falha de rede (${resp.status}).`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let ev: StreamEvent;
          try { ev = JSON.parse(json); } catch { continue; }
          if (ev.type === "text_delta") { acc += ev.text; setStreamingText(acc); }
          else if (ev.type === "tool_start") { toolNameByIdRef.current.set(ev.id, ev.name); }
          else if (ev.type === "tool_input") {
            const n = toolNameByIdRef.current.get(ev.id);
            if (n) onApplyTool(n, ev.input);
          }
          else if (ev.type === "error") { acc += `\n\n_Erro: ${ev.message}_`; setStreamingText(acc); }
        }
      }
      const time2 = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setHistory((prev) => [...prev, { id: assistantId, role: "assistant", content: acc, time: time2 }]);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro desconhecido.";
      setHistory((prev) => [...prev, {
        id: assistantId, role: "assistant", content: `_Erro: ${m}_`,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setStreamingId(null);
      setStreamingText("");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Context strip */}
      {ctx && (
        <div className="shrink-0 border-b border-line bg-accent-soft px-4 py-2.5 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">{t(lang, "chat.context")}</span>
            <span className="text-[12px] text-ink truncate">{ctx.description}</span>
          </div>
          <button onClick={onClearSelection} className="text-muted hover:text-ink text-[14px] px-1">×</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto thin-scroll px-4 py-4 space-y-5">
        {history.map((m) => <MessageRow key={m.id} m={m} lang={lang} onApplyDiff={onApplyDiff} onCompareDiff={onCompareDiff} />)}
        {streamingId && (
          <div className="space-y-1.5 fade-up">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9.5px] tracking-[0.14em] text-accent">{t(lang, "chat.vibe")}</span>
              <span className="text-[10px] text-muted pulse">{t(lang, "chat.thinking")}</span>
            </div>
            <div className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">{streamingText}<span className="inline-block w-1.5 h-3 bg-accent ml-0.5 align-middle pulse" /></div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-panel-alt px-3 pt-2.5 pb-3 space-y-2">
        {/* Quick prompts */}
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => setInput((v) => (v ? v + " " + q : q))}
              className="chip text-[11px]"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="card p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={t(lang, "chat.placeholder")}
            disabled={busy}
            rows={2}
            className="w-full resize-none bg-transparent text-[13px] placeholder:text-muted leading-relaxed"
          />
          <div className="flex items-center gap-1 pt-1.5 border-t border-line/60">
            <IconChip>◐</IconChip>
            <IconChip>@</IconChip>
            <ModelChip model={model} onChange={setModel} disabled={busy} />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="ml-auto btn-primary text-[12px] py-1.5 px-3.5 disabled:opacity-40"
            >
              {busy ? "…" : t(lang, "chat.send")} ⏎
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m, lang, onApplyDiff, onCompareDiff }: {
  m: SeededMessage; lang: Lang;
  onApplyDiff?: () => void; onCompareDiff?: () => void;
}) {
  const role = m.role;
  const labelKey = role === "system" ? "chat.system" : role === "user" ? "chat.you" : "chat.vibe";
  const labelColor = role === "assistant" ? "text-accent" : role === "user" ? "text-ink" : "text-muted";
  const proactive = m.proactive;

  return (
    <div className={`space-y-1.5 fade-up ${proactive ? "rounded-md border border-dashed border-accent/40 p-2.5 bg-accent-soft/30" : ""}`}>
      <div className="flex items-center gap-2">
        {proactive && <span className="text-accent text-[11px]">✶</span>}
        <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${labelColor}`}>{t(lang, labelKey)}</span>
        <span className="font-mono text-[9.5px] text-muted">{m.time}</span>
      </div>
      {role === "system" ? (
        <div className="editorial text-[13.5px] leading-relaxed text-muted">{m.content}</div>
      ) : (
        <div className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">{renderInline(m.content)}</div>
      )}
      {m.diff && (
        <div className="mt-2 card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="chip bg-accent text-white border-accent text-[10px] py-0.5 px-2 uppercase tracking-wider">Diff</span>
            <span className="text-[12px] text-ink">{m.diff.description}</span>
            <span className="font-mono text-[10px] text-accent ml-auto">{m.diff.badge}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onCompareDiff} className="btn-outline text-[11.5px] py-1 px-2.5">⊕ {t(lang, "chat.compare")}</button>
            <button onClick={onApplyDiff} className="btn-primary text-[11.5px] py-1 px-2.5">✓ {t(lang, "chat.apply")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("_") && p.endsWith("_")) {
      return <em key={i} className="italic text-muted">{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <button className="w-7 h-7 rounded-md text-muted hover:text-ink hover:bg-panel transition-colors flex items-center justify-center text-[13px]" type="button">
      {children}
    </button>
  );
}

function ModelChip({ model, onChange, disabled }: {
  model: ModelId; onChange: (m: ModelId) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 rounded-md text-[10.5px] font-mono uppercase tracking-wider text-muted hover:bg-panel hover:text-ink transition-colors flex items-center gap-1"
      >
        {model === "claude-opus-4-7" ? "OPUS 4.7" : "SONNET 4.6"}
        <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-panel border border-line rounded-md shadow-md p-1 min-w-[140px] z-30">
          {(["claude-opus-4-7", "claude-sonnet-4-6"] as ModelId[]).map((m) => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-panel-alt ${model === m ? "text-accent" : ""}`}
            >
              {m === "claude-opus-4-7" ? "Opus 4.7 — Mais inteligente" : "Sonnet 4.6 — Mais rápido"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
