"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveSelection } from "@/lib/floor-plan-engine";
import type {
  ChatMessage,
  FloorPlan,
  SelectedElement,
  StreamEvent,
  ToolName,
} from "@/lib/types";
import { ToolIndicator } from "./ToolIndicator";

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onApplyTool: (name: ToolName, input: unknown) => void;
  onClearSelection: () => void;
}

const SUGGESTIONS = [
  "Cria um apartamento de 70m² com 2 quartos",
  "Apartamento compacto de 45m² (studio)",
  "Apartamento de 90m² com 3 quartos e suíte",
  "Cozinha americana com ilha integrada à sala",
  "Mobília a sala com sofá, TV e mesa de centro",
  "Adiciona uma janela grande no quarto principal",
  "Troca o piso da sala pra madeira",
  "Cria uma varanda com vista pro norte",
];

type ModelId = "claude-opus-4-7" | "claude-sonnet-4-6";

const MODEL_OPTIONS: { id: ModelId; name: string; tag: string }[] = [
  { id: "claude-opus-4-7", name: "Opus 4.7", tag: "Mais inteligente" },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", tag: "Mais rápido" },
];

export function ChatPanel({ plan, selected, onApplyTool, onClearSelection }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Eu sou o agente da **Collection**. Me diga o que você quer construir — posso criar a planta inteira, mobiliar, mudar pisos, adicionar portas e janelas. É só pedir.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<ModelId>("claude-opus-4-7");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const modelRef = useRef(model);
  modelRef.current = model;
  const toolNameByIdRef = useRef<Map<string, ToolName>>(new Map());

  const selectionContext = useMemo(
    () => resolveSelection(plan, selected),
    [plan, selected]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Always pin to bottom on new messages / streaming deltas.
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Also pin to bottom while assistant is streaming token by token.
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 120);
    return () => window.clearInterval(id);
  }, [busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
      { role: "assistant", content: "", toolCalls: [] },
    ];
    setMessages(next);
    setInput("");
    setBusy(true);

    const historyToSend = next
      .slice(0, -1)
      .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0))
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyToSend,
          plan: planRef.current,
          selection: selectedRef.current
            ? resolveSelection(planRef.current, selectedRef.current)
            : null,
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
          try {
            ev = JSON.parse(json);
          } catch {
            continue;
          }
          handleEvent(ev);
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro desconhecido.";
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: (last.content || "") + `\n\n_Erro: ${m}_`,
          };
        }
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function handleEvent(ev: StreamEvent) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (!last || last.role !== "assistant") return prev;

      if (ev.type === "text_delta") {
        copy[copy.length - 1] = { ...last, content: (last.content ?? "") + ev.text };
        return copy;
      }
      if (ev.type === "tool_start") {
        toolNameByIdRef.current.set(ev.id, ev.name);
        const tc = [...(last.toolCalls ?? []), { id: ev.id, name: ev.name, input: undefined }];
        copy[copy.length - 1] = { ...last, toolCalls: tc };
        return copy;
      }
      if (ev.type === "tool_input") {
        const tc = (last.toolCalls ?? []).map((t) => (t.id === ev.id ? { ...t, input: ev.input } : t));
        copy[copy.length - 1] = { ...last, toolCalls: tc };
        return copy;
      }
      if (ev.type === "tool_result") {
        const tc = (last.toolCalls ?? []).map((t) => (t.id === ev.id ? { ...t, ok: ev.ok } : t));
        copy[copy.length - 1] = { ...last, toolCalls: tc };
        return copy;
      }
      if (ev.type === "error") {
        copy[copy.length - 1] = {
          ...last,
          content: (last.content ?? "") + `\n\n_Erro: ${ev.message}_`,
        };
        return copy;
      }
      return prev;
    });

    if (ev.type === "tool_input") {
      const tcName = toolNameByIdRef.current.get(ev.id);
      if (tcName) onApplyTool(tcName, ev.input);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-chat">
      {/* Header — fixed at top */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 bg-bg-panel/60 px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-lg">
          🏗️
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Collection Architect</div>
          <div className="text-[11px] uppercase tracking-widest text-gold/80">Agent-Powered Design</div>
        </div>
        <ModelSelector value={model} onChange={setModel} disabled={busy} />
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span className={`inline-block h-2 w-2 rounded-full ${busy ? "bg-gold tool-pulse" : "bg-emerald-500"}`} />
          {busy ? "Trabalhando" : "Pronto"}
        </div>
      </div>

      {/* Messages — flex-1 + min-h-0 so overflow-y-auto actually scrolls */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5"
      >
        {messages.map((m, i) => {
          const isLastAssistant =
            m.role === "assistant" && i === messages.length - 1 && !busy;
          return (
            <Message
              key={i}
              m={m}
              onSuggestion={isLastAssistant ? (s) => send(s) : undefined}
            />
          );
        })}
      </div>

      {/* Suggestions (only when conversation is fresh) */}
      {messages.length <= 1 && !busy && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/5 bg-bg-panel/30 px-4 py-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs text-gold-light transition hover:bg-gold/15"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Selection indicator */}
      {selectionContext && (
        <div className="flex shrink-0 items-center gap-2 border-t border-gold/20 bg-gold/[0.06] px-4 py-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-gold-light">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
            Selecionado
          </span>
          <span className="flex-1 truncate text-white/85">{selectionContext.description}</span>
          <button
            onClick={onClearSelection}
            className="rounded px-1.5 py-0.5 text-white/50 transition hover:bg-white/5 hover:text-white/80"
            title="Desselecionar (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input — fixed at bottom */}
      <form
        className="flex shrink-0 items-end gap-2 border-t border-white/5 bg-bg-panel/40 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={
            selectionContext
              ? `Pergunte sobre "${selectionContext.payload.label ?? selectionContext.payload.name ?? selectionContext.kind}"...`
              : "Descreva sua planta — ex: 'apê de 60m² com 2 quartos e cozinha americana'"
          }
          disabled={busy}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-white/10 bg-bg-card/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-gold/40"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-[42px] rounded-lg bg-gold px-4 text-sm font-semibold text-[#1a1a2e] transition hover:bg-gold-light disabled:opacity-40"
        >
          {busy ? "..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

function Message({ m, onSuggestion }: { m: ChatMessage; onSuggestion?: (s: string) => void }) {
  const isUser = m.role === "user";
  // Split assistant content into clean body + clickable suggestions.
  const { body, suggestions } = !isUser ? extractSuggestions(m.content) : { body: m.content, suggestions: [] as string[] };
  return (
    <div className={`fade-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-white/10 text-white/80" : "bg-gold/20 text-base"
        }`}
      >
        {isUser ? "Você" : "🏗️"}
      </div>
      <div className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {body.trim() && (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              isUser
                ? "bg-gold/15 text-white"
                : "bg-bg-card/70 text-white/90"
            }`}
          >
            {renderContent(body)}
          </div>
        )}
        {m.toolCalls && m.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.toolCalls.map((tc) => (
              <ToolIndicator
                key={tc.id}
                name={tc.name}
                detail={summarizeToolInput(tc.name, tc.input)}
                status={tc.ok === undefined ? "running" : tc.ok ? "ok" : "error"}
              />
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suggestions.map((s, idx) => (
              <button
                key={`${idx}-${s}`}
                disabled={!onSuggestion}
                onClick={() => onSuggestion?.(s)}
                className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1.5 text-xs text-gold-light transition hover:bg-gold/15 hover:border-gold/70 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pulls bracketed suggestions out of an assistant message.
// Recognizes `[text]` tokens that are NOT followed by `(` (so markdown links
// like `[label](url)` are preserved) and that don't contain colons (which
// would suggest some other notation). Multi-line, last-of-message preferred.
function extractSuggestions(text: string): { body: string; suggestions: string[] } {
  if (!text) return { body: text, suggestions: [] };
  const re = /\[([^\[\]\n]{1,80})\](?!\()/g;
  const found: { match: string; inner: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1].trim();
    // Skip empties and obvious markdown-image-like tokens.
    if (!inner) continue;
    found.push({ match: m[0], inner, index: m.index });
  }
  if (found.length === 0) return { body: text, suggestions: [] };

  // Strip the bracket tokens from the body and collapse extra blank lines.
  let body = text;
  // Remove from the end so indices stay valid.
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i];
    body = body.slice(0, f.index) + body.slice(f.index + f.match.length);
  }
  body = body.replace(/\n{3,}/g, "\n\n").trimEnd();

  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const f of found) {
    const key = f.inner.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(f.inner);
  }
  return { body, suggestions };
}

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-gold-light">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: ModelId;
  onChange: (m: ModelId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = MODEL_OPTIONS.find((m) => m.id === value) ?? MODEL_OPTIONS[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/5 px-2 py-1 text-[11px] text-gold-light transition hover:border-gold/50 hover:bg-gold/15 disabled:opacity-50"
        title={`Modelo: ${current.name} — ${current.tag}`}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="font-semibold">{current.name}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" className="opacity-70">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[180px] overflow-hidden rounded-md border border-white/10 bg-bg-panel/95 py-1 shadow-xl backdrop-blur">
          {MODEL_OPTIONS.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                  active ? "bg-gold/10 text-gold-light" : "text-white/85"
                }`}
              >
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-[10px] text-white/50">{m.tag}</div>
                </div>
                {active && (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="text-gold">
                    <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function summarizeToolInput(name: ToolName, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  switch (name) {
    case "create_room":
      return `${o.name ?? ""} ${o.width ?? "?"}x${o.height ?? "?"}m`;
    case "remove_room":
      return String(o.room_name ?? "");
    case "add_door":
    case "add_window":
      return `${o.room_name ?? ""} (${o.wall ?? "?"})`;
    case "add_furniture":
      return `${o.furniture_type ?? ""} em ${o.room_name ?? ""}`;
    case "remove_furniture":
      return String(o.label ?? o.furniture_id ?? "");
    case "set_floor_material":
      return `${o.room_name ?? ""} → ${o.material ?? ""}`;
    case "create_apartment_layout":
      return `${o.total_area ?? "?"}m², ${o.num_bedrooms ?? "?"}q, ${o.num_bathrooms ?? "?"}b`;
    case "furnish_room":
      return String(o.room_name ?? "");
    default:
      return undefined;
  }
}
