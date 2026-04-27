"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, FloorPlan, StreamEvent, ToolName } from "@/lib/types";
import { ToolIndicator } from "./ToolIndicator";

interface Props {
  plan: FloorPlan;
  onApplyTool: (name: ToolName, input: unknown) => void;
}

const SUGGESTIONS = [
  "Cria um apartamento de 70m² com 2 quartos",
  "Coloca um sofá na sala",
  "Cozinha americana com ilha",
  "Adiciona uma janela no quarto",
  "Troca o piso da sala pra madeira",
];

export function ChatPanel({ plan, onApplyTool }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Eu sou o agente da **Collection**. Me diga o que você quer construir — posso criar a planta inteira, mobiliar, mudar pisos, adicionar portas e janelas. É só pedir.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  // Map of tool_use id -> tool name (populated on tool_start, read on tool_input)
  const toolNameByIdRef = useRef<Map<string, ToolName>>(new Map());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

    // Build conversation history to send: only role+content of plain messages
    // (assistant messages we send are the prior text-only history)
    const historyToSend = next
      .slice(0, -1) // drop the empty assistant placeholder
      .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0))
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend, plan: planRef.current }),
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
    <div className="flex h-full flex-col bg-bg-chat">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-bg-panel/60 px-5 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-lg">
          🏗️
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Collection Architect</div>
          <div className="text-[11px] uppercase tracking-widest text-gold/80">Agent-Powered Design</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span className={`inline-block h-2 w-2 rounded-full ${busy ? "bg-gold tool-pulse" : "bg-emerald-500"}`} />
          {busy ? "Trabalhando" : "Pronto"}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
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
        <div className="flex flex-wrap gap-2 border-t border-white/5 bg-bg-panel/30 px-4 py-3">
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

      {/* Input */}
      <form
        className="flex items-end gap-2 border-t border-white/5 bg-bg-panel/40 px-4 py-3"
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
          placeholder="Descreva o que você quer construir..."
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
  // Very lightweight bold rendering for **text**.
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
