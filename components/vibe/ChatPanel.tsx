"use client";

import { useEffect, useRef, useState } from "react";
import { resolveSelection } from "@/lib/floor-plan-engine";
import type { FloorPlan, SelectedElement, StreamEvent, ToolName } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { ChatBlock, SeededMessage, ToolCallStatus } from "@/lib/mock-data";
import { USER_ACTION_EVENT, type UserActionPayload } from "@/lib/scene/user-action-log";

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

// Selection type → emoji-style glyph (kept simple to avoid bringing a full
// icon library — the canvas chat is monoline anyway).
function selectionIcon(kind: string): string {
  switch (kind) {
    case "wall": return "▭";
    case "door": return "⊐";
    case "window": return "▤";
    case "furniture": return "▣";
    case "room": return "⌂";
    case "slab": return "◈";
    case "dimension": return "⤢";
    default: return "✦";
  }
}

function selectionKindLabel(kind: string): string {
  switch (kind) {
    case "wall": return "Parede";
    case "door": return "Porta";
    case "window": return "Janela";
    case "furniture": return "Móvel";
    case "room": return "Ambiente";
    case "slab": return "Piso";
    case "dimension": return "Cota";
    default: return "Seleção";
  }
}

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
  // Block-based streaming state (Fase 4A): chronological text/tool blocks
  // accumulated as events arrive. Renders verbatim — tools appear exactly
  // where they happened, between text deltas, instead of being grouped at
  // the end of the message.
  const [streamingBlocks, setStreamingBlocks] = useState<ChatBlock[]>([]);
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

  // Quick chips ALWAYS render in the composer (Style Guide consistency:
  // empty state and populated state must look the same to the user). When
  // the last assistant message already shows in-line suggestion chips, the
  // composer chips dim to opacity 0.5 so they don't compete visually but
  // remain available — never hidden.
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const lastAssistantHasSuggestions = !!lastAssistant && stripSuggestions(lastAssistant.content).suggestions.length > 0;
  const dimComposerChips = busy || lastAssistantHasSuggestions;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streamingBlocks]);

  // Bridge: the canvas context menu can dispatch a `ca:agent-prompt` event
  // ("Mobiliar Sala", "abrir vão 80cm" etc). We forward it to send() so the
  // user gets one consistent agent loop.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim() && !busy) {
        send(detail.trim());
      }
    };
    window.addEventListener("ca:agent-prompt", handler);
    return () => window.removeEventListener("ca:agent-prompt", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Synthetic user-action log (Fase 4B) — when a manual canvas mutation is
  // logged via lib/scene/user-action-log.ts, append a synthetic "assistant"
  // entry whose only content is a user-action block. The agent reads its
  // text content via apiHistory the next time the user sends a message, so
  // it knows what the user just did.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserActionPayload>).detail;
      if (!detail || detail.type !== "user-action") return;
      const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const id = `ua-${Date.now()}`;
      const fallbackText = `[${detail.label}${detail.detail ? ` — ${detail.detail}` : ""}]`;
      setHistory((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          time,
          content: fallbackText,
          blocks: [detail],
        },
      ]);
    };
    window.addEventListener(USER_ACTION_EVENT, handler);
    return () => window.removeEventListener(USER_ACTION_EVENT, handler);
  }, [setHistory]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const userMsg: SeededMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed, time };
    const assistantId = `a-${Date.now()}`;
    setHistory((prev) => [...prev, userMsg]);
    setStreamingId(assistantId);
    setStreamingBlocks([]);
    setInput("");
    setBusy(true);

    const apiHistory = [...history, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Block accumulator. Each text_delta either appends to the last text
    // block or opens a new one (right after a tool block). Each tool_start
    // pushes a fresh tool block. tool_result patches the matching tool
    // status. The order of arrival defines the order of render.
    const blocks: ChatBlock[] = [];

    function commitBlocks(): ChatBlock[] {
      // Compact consecutive text blocks (paranoia — should only occur in
      // adversarial streams).
      const out: ChatBlock[] = [];
      for (const b of blocks) {
        const last = out[out.length - 1];
        if (last && last.type === "text" && b.type === "text") {
          last.content += b.content;
        } else {
          out.push(b);
        }
      }
      return out;
    }

    function appendText(t: string) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        last.content += t;
      } else {
        blocks.push({ type: "text", content: t });
      }
      setStreamingBlocks([...blocks]);
    }

    function startTool(id: string, name: ToolName) {
      blocks.push({
        type: "tool",
        tool: { id, name, status: "running" },
      });
      setStreamingBlocks([...blocks]);
    }

    function patchTool(id: string, ok: boolean) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.type === "tool" && b.tool.id === id) {
          b.tool = { ...b.tool, status: ok ? "done" : "error" };
          break;
        }
      }
      setStreamingBlocks([...blocks]);
    }

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
          if (ev.type === "text_delta") {
            appendText(ev.text);
          } else if (ev.type === "tool_start") {
            toolNameByIdRef.current.set(ev.id, ev.name);
            startTool(ev.id, ev.name);
          } else if (ev.type === "tool_input") {
            const n = toolNameByIdRef.current.get(ev.id);
            if (n) onApplyTool(n, ev.input);
          } else if (ev.type === "tool_result") {
            patchTool(ev.id, ev.ok);
          } else if (ev.type === "error") {
            appendText(`\n\n_Erro: ${ev.message}_`);
          }
        }
      }
      const time2 = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const finalBlocks = commitBlocks();
      const finalText = finalBlocks
        .filter((b): b is { type: "text"; content: string } => b.type === "text")
        .map((b) => b.content)
        .join("");
      setHistory((prev) => [...prev, {
        id: assistantId,
        role: "assistant",
        content: finalText,
        time: time2,
        blocks: finalBlocks,
      }]);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro desconhecido.";
      const fallback: ChatBlock[] = [{ type: "text", content: `_Erro: ${m}_` }];
      setHistory((prev) => [...prev, {
        id: assistantId, role: "assistant", content: `_Erro: ${m}_`,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        blocks: fallback,
      }]);
    } finally {
      setStreamingId(null);
      setStreamingBlocks([]);
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Selection context strip — always docked above messages whenever
          something is selected on the canvas. The icon + bold label make the
          state unambiguous; the • button opens the per-type context menu. */}
      {ctx && (
        <div className="shrink-0 border-b border-line bg-accent-soft px-4 py-2.5 flex items-center gap-2.5">
          <span className="text-[14px] leading-none w-5 h-5 flex items-center justify-center bg-accent/15 rounded shrink-0">
            {selectionIcon(ctx.kind)}
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">
              {selectionKindLabel(ctx.kind)} · {t(lang, "chat.context")}
            </span>
            <span className="text-[12px] text-ink truncate font-medium">{ctx.description}</span>
          </div>
          <button
            onClick={onClearSelection}
            className="text-muted hover:text-ink text-[14px] px-1 leading-none"
            title="Limpar seleção"
          >
            ×
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto thin-scroll px-4 py-4 space-y-5">
        {history.map((m) => <MessageRow key={m.id} m={m} lang={lang} onApplyDiff={onApplyDiff} onCompareDiff={onCompareDiff} onSuggestionClick={send} />)}
        {streamingId && (
          <div className="space-y-1.5 fade-up">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9.5px] tracking-[0.14em] text-accent">{t(lang, "chat.vibe")}</span>
              <span className="text-[10px] text-muted pulse">{t(lang, "chat.thinking")}</span>
            </div>
            <BlockSequence blocks={streamingBlocks} streaming />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-panel-alt px-3 pt-2.5 pb-3 space-y-2">
        {/* Quick prompts — contextual: starter chips on empty projects,
            project-level chips otherwise, and selection-aware chips when
            an element is selected. Hidden when the most recent assistant
            message already shows suggestion chips, so the user doesn't see
            two competing chip rows at once. */}
        <div
          className="flex gap-1.5 flex-wrap transition-opacity duration-150"
          style={{ opacity: dimComposerChips ? 0.5 : 1 }}
        >
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
  const { stripped, suggestions } = isAssistant
    ? stripSuggestions(m.content)
    : { stripped: m.content, suggestions: [] as string[] };

  // Prefer block-based rendering when available (Fase 4A). Falls back to the
  // legacy "tools dropped at the end" layout for seeded messages that haven't
  // been migrated.
  const blocksForRender = isAssistant ? m.blocks ?? null : null;

  return (
    <div className={`space-y-1.5 fade-up ${proactive ? "rounded-md border border-dashed border-accent/40 p-2.5 bg-accent-soft/30" : ""}`}>
      <div className="flex items-center gap-2">
        {proactive && <span className="text-accent text-[11px]">✶</span>}
        <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${labelColor}`}>{t(lang, labelKey)}</span>
        <span className="font-mono text-[9.5px] text-muted" suppressHydrationWarning>{m.time}</span>
      </div>

      {blocksForRender ? (
        <BlockSequence blocks={blocksForRender} />
      ) : (
        <>
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
        </>
      )}
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

// Render a chronological sequence of chat blocks (text → tool → text → …).
// Used by both the in-flight streaming preview and finalized messages.
function BlockSequence({
  blocks,
  streaming = false,
}: {
  blocks: ChatBlock[];
  streaming?: boolean;
}) {
  if (blocks.length === 0 && streaming) {
    return null;
  }
  // Strip suggestion tags from text blocks so [Mobiliar Sala] etc. don't
  // appear inline; they'll render as chips at the message level.
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        if (b.type === "text") {
          const { stripped } = stripSuggestions(b.content);
          if (!stripped) return null;
          return (
            <div
              key={i}
              className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap"
            >
              {renderInline(stripped)}
              {streaming && last && (
                <span className="inline-block w-1.5 h-3 bg-accent ml-0.5 align-middle pulse" />
              )}
            </div>
          );
        }
        if (b.type === "tool") {
          return <ToolIndicator key={i} tc={b.tool} />;
        }
        if (b.type === "user-action") {
          return <UserActionBlock key={i} block={b} />;
        }
        return null;
      })}
    </div>
  );
}

// User-initiated canvas mutations (delete, drag, edit, rename) appear in the
// chat as a distinct grey card with the badge "VOCÊ", an action glyph, and a
// short label. Visually different from agent tool entries so the user can
// scan history and tell who did what.
function UserActionBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: "user-action" }>;
}) {
  const glyph = userActionGlyph(block.kind);
  return (
    <div
      className="flex items-start gap-2.5 rounded-md border border-line bg-panel-alt/70 px-2.5 py-1.5"
      style={{ borderStyle: "dashed" }}
    >
      <span
        className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted shrink-0 mt-0.5"
        title="Ação manual no canvas"
      >
        Você
      </span>
      <span className="text-muted text-[12px] shrink-0">{glyph}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-snug text-ink">{block.label}</div>
        {block.detail && (
          <div className="text-[10.5px] text-muted font-mono leading-snug mt-0.5">
            {block.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function userActionGlyph(kind: string): string {
  switch (kind) {
    case "remove": return "−";
    case "move": return "↔";
    case "edit-wall": return "▭";
    case "edit-furniture": return "▣";
    case "edit-opening": return "⊐";
    case "rename": return "Aa";
    case "material": return "▦";
    case "rotate": return "↻";
    default: return "•";
  }
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
