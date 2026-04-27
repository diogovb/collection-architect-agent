"use client";

import { useEffect, useRef, useState } from "react";
import { resolveSelection } from "@/lib/floor-plan-engine";
import type { FloorPlan, SelectedElement, StreamEvent, ToolName } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SeededMessage, ToolCallStatus } from "@/lib/mock-data";

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

const STARTER_PROMPTS = [
  "Apartamento residencial 80m²",
  "Projeto comercial",
  "Casa de praia 120m²",
  "Studio compacto 35m²",
];

const PROJECT_PROMPTS = [
  "Mobiliar todos os ambientes",
  "Trocar piso da sala",
  "Adicionar varanda",
  "Versão econômica",
];

/** Portuguese labels surfaced in the inline tool indicator. Falls back to the
 * raw tool name if a key is missing — keeps unknown tools visible without
 * blocking the UI. */
const TOOL_LABEL_PT: Partial<Record<ToolName, string>> = {
  create_room: "Criando cômodo",
  add_furniture: "Posicionando mobiliário",
  add_door: "Inserindo porta",
  add_window: "Inserindo janela",
  set_floor_material: "Aplicando piso",
  create_apartment_layout: "Gerando layout",
  furnish_room: "Mobiliando ambiente",
  search_knowledge_base: "Consultando base técnica",
  delete_wall: "Removendo parede",
  merge_rooms: "Integrando ambientes",
  resize_room: "Redimensionando",
  clear_all: "Limpando projeto",
};

function quickPromptsFor(plan: FloorPlan, ctxKind: string | null, ctxName: string | null): string[] {
  if (ctxKind === "room" && ctxName) {
    return [
      `Mobiliar ${ctxName}`,
      `Trocar piso de ${ctxName}`,
      `Ampliar ${ctxName}`,
      `Adicionar janela em ${ctxName}`,
    ];
  }
  if (ctxKind === "furniture" && ctxName) {
    return [
      `Substituir ${ctxName}`,
      `Mais opções de ${ctxName}`,
      `Remover ${ctxName}`,
      `Girar 90°`,
    ];
  }
  if (ctxKind === "window" || ctxKind === "door") {
    const what = ctxKind === "window" ? "janela" : "porta";
    return [
      `Mover ${what}`,
      `Trocar tamanho da ${what}`,
      `Remover ${what}`,
      `Outra parede`,
    ];
  }
  if (ctxKind === "wall") {
    return ["Mover esta parede", "Abrir vão aqui", "Demolir parede", "Adicionar porta"];
  }
  if (plan.rooms.length === 0) return STARTER_PROMPTS;
  return PROJECT_PROMPTS;
}

export function ChatPanel({
  plan, selected, onApplyTool, onClearSelection,
  history, setHistory, lang, onApplyDiff, onCompareDiff,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<ModelId>("claude-opus-4-7");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCallStatus[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef(plan); planRef.current = plan;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const modelRef = useRef(model); modelRef.current = model;
  const toolNameByIdRef = useRef<Map<string, ToolName>>(new Map());

  const ctx = selected ? resolveSelection(plan, selected) : null;
  const quickPrompts = quickPromptsFor(
    plan,
    ctx?.kind ?? null,
    ctx ? ((ctx.payload.label ?? ctx.payload.name ?? null) as string | null) : null
  );

  // Hide composer chips when the most recent assistant message already shows
  // suggestion chips ([brackets] in its body) — prevents visual duplication.
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const lastAssistantHasSuggestions = !!lastAssistant && stripSuggestions(lastAssistant.content).suggestions.length > 0;
  const showComposerChips = !busy && !lastAssistantHasSuggestions;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamingText, streamingTools]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const userMsg: SeededMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed, time };
    const assistantId = `a-${Date.now()}`;
    setHistory((prev) => [...prev, userMsg]);
    setStreamingId(assistantId);
    setStreamingText("");
    setStreamingTools([]);
    setInput("");
    setBusy(true);

    const apiHistory = [...history, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const localTools: ToolCallStatus[] = [];

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
          else if (ev.type === "tool_start") {
            toolNameByIdRef.current.set(ev.id, ev.name);
            localTools.push({ id: ev.id, name: ev.name, status: "running" });
            setStreamingTools([...localTools]);
          }
          else if (ev.type === "tool_input") {
            const n = toolNameByIdRef.current.get(ev.id);
            if (n) onApplyTool(n, ev.input);
          }
          else if (ev.type === "tool_result") {
            const idx = localTools.findIndex((t) => t.id === ev.id);
            if (idx >= 0) {
              localTools[idx] = { ...localTools[idx], status: ev.ok ? "done" : "error" };
              setStreamingTools([...localTools]);
            }
          }
          else if (ev.type === "error") { acc += `\n\n_Erro: ${ev.message}_`; setStreamingText(acc); }
        }
      }
      const time2 = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setHistory((prev) => [...prev, {
        id: assistantId, role: "assistant", content: acc, time: time2,
        toolCalls: localTools.length > 0 ? localTools : undefined,
      }]);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro desconhecido.";
      setHistory((prev) => [...prev, {
        id: assistantId, role: "assistant", content: `_Erro: ${m}_`,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        toolCalls: localTools.length > 0 ? localTools : undefined,
      }]);
    } finally {
      setStreamingId(null);
      setStreamingText("");
      setStreamingTools([]);
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
        {history.map((m) => <MessageRow key={m.id} m={m} lang={lang} onApplyDiff={onApplyDiff} onCompareDiff={onCompareDiff} onSuggestionClick={send} />)}
        {streamingId && (() => {
          const { stripped } = stripSuggestions(streamingText);
          return (
            <div className="space-y-1.5 fade-up">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9.5px] tracking-[0.14em] text-accent">{t(lang, "chat.vibe")}</span>
                <span className="text-[10px] text-muted pulse">{t(lang, "chat.thinking")}</span>
              </div>
              {streamingTools.length > 0 && (
                <div className="space-y-1">
                  {streamingTools.map((tc) => <ToolIndicator key={tc.id} tc={tc} />)}
                </div>
              )}
              {stripped && (
                <div className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">{stripped}<span className="inline-block w-1.5 h-3 bg-accent ml-0.5 align-middle pulse" /></div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-panel-alt px-3 pt-2.5 pb-3 space-y-2">
        {/* Quick prompts — contextual: starter chips on empty projects,
            project-level chips otherwise, and selection-aware chips when
            an element is selected. Hidden when the most recent assistant
            message already shows suggestion chips, so the user doesn't see
            two competing chip rows at once. */}
        {showComposerChips && (
          <div className="flex gap-1.5 flex-wrap">
            {quickPrompts.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={busy}
                className="chip text-[11px] disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        )}

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

function MessageRow({ m, lang, onApplyDiff, onCompareDiff, onSuggestionClick }: {
  m: SeededMessage; lang: Lang;
  onApplyDiff?: () => void; onCompareDiff?: () => void;
  onSuggestionClick?: (text: string) => void;
}) {
  const role = m.role;
  const labelKey = role === "system" ? "chat.system" : role === "user" ? "chat.you" : "chat.vibe";
  const labelColor = role === "assistant" ? "text-accent" : role === "user" ? "text-ink" : "text-muted";
  const proactive = m.proactive;
  const isAssistant = role === "assistant";
  const { stripped, suggestions } = isAssistant ? stripSuggestions(m.content) : { stripped: m.content, suggestions: [] as string[] };

  return (
    <div className={`space-y-1.5 fade-up ${proactive ? "rounded-md border border-dashed border-accent/40 p-2.5 bg-accent-soft/30" : ""}`}>
      <div className="flex items-center gap-2">
        {proactive && <span className="text-accent text-[11px]">✶</span>}
        <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${labelColor}`}>{t(lang, labelKey)}</span>
        <span className="font-mono text-[9.5px] text-muted">{m.time}</span>
      </div>
      {isAssistant && m.toolCalls && m.toolCalls.length > 0 && (
        <div className="space-y-1">
          {m.toolCalls.map((tc) => <ToolIndicator key={tc.id} tc={tc} />)}
        </div>
      )}
      {role === "system" ? (
        <div className="editorial text-[13.5px] leading-relaxed text-muted">{m.content}</div>
      ) : stripped ? (
        <div className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">{renderInline(stripped)}</div>
      ) : null}
      {isAssistant && suggestions.length > 0 && onSuggestionClick && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s, i) => (
            <button
              key={`${i}-${s}`}
              onClick={() => onSuggestionClick(s)}
              className="chip text-[11px] hover:bg-accent hover:text-white hover:border-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
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

function ToolIndicator({ tc }: { tc: ToolCallStatus }) {
  const label = TOOL_LABEL_PT[tc.name] ?? tc.name;
  const isError = tc.status === "error";
  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-panel-alt px-2 py-1 text-[11px] fade-up ${
        isError ? "border-[#B8552E]/40" : "border-line"
      }`}
    >
      <span className="text-accent text-[12px] leading-none">✶</span>
      <span
        className="font-mono uppercase tracking-[0.08em] text-[10px] text-muted"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        {tc.name}
      </span>
      <span className="text-ink">{label}</span>
      <span className="ml-auto text-[11px] leading-none">
        {tc.status === "running" ? (
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin align-middle" />
        ) : tc.status === "done" ? (
          <span className="text-accent">✓</span>
        ) : (
          <span className="text-[#B8552E]">!</span>
        )}
      </span>
    </div>
  );
}

/** Pull `[suggestion]` chips out of an assistant message body.
 * Brackets at the end of a line (or after a blank line) are surfaced as chips,
 * not rendered inline. We avoid stripping bracket text that's clearly inline
 * markdown like `[link](url)`.
 */
function stripSuggestions(text: string): { stripped: string; suggestions: string[] } {
  if (!text) return { stripped: text, suggestions: [] };
  const suggestions: string[] = [];
  // Match [..] not followed by ( (which would indicate a markdown link).
  const re = /\[([^\[\]\n]{1,80})\](?!\()/g;
  const stripped = text
    .replace(re, (_match, body: string) => {
      const trimmed = body.trim();
      if (trimmed.length > 0) suggestions.push(trimmed);
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { stripped, suggestions };
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
