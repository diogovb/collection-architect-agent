import Anthropic from "@anthropic-ai/sdk";
import { tools as legacyTools } from "@/lib/anthropic-tools";
import { applyTool, summarizePlan } from "@/lib/floor-plan-engine";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import {
  isRagConfigured,
  searchKnowledgeBase,
  type KnowledgeMatch,
} from "@/lib/embeddings";
import type { FloorPlan, SelectionContext, StreamEvent, ToolName } from "@/lib/types";
import { validatePlan, formatIssuesForAgent, diagnosticsHash } from "@/lib/agent/validate-plan";
import { renderPlanPng } from "@/lib/canvas/render-png";

/** Tools whose successful execution should trigger the visual review pass.
 *  Pure-info tools (search_knowledge_base) and trivial cosmetic ones
 *  (set_floor_material) don't require a visual sanity check. */
const VISUAL_TRIGGER_TOOLS: ReadonlySet<string> = new Set([
  "add_furniture",
  "add_furniture_group",
  "place_furniture_intent",
  "furnish_room",
  "move_furniture",
  "swap_furniture",
  "add_partition",
  "split_room",
  "merge_rooms",
  "add_door",
  "update_door",
  "remove_door",
  "add_window",
  "update_window",
  "remove_window",
  "add_balcony",
  "add_stairs",
  "add_column",
  "create_apartment_layout",
  "add_millwork_run",
  "update_millwork_module",
]);

const MAX_VISUAL_REVIEWS = 2;

// Scene tools (lib/agent/tools.ts) operate on the server-side scene graph but
// have no sync path back to the client — every change would be invisible. They
// are intentionally NOT registered with the model. The legacy tool family
// modifies the FloorPlan and round-trips through useFloorPlanBridge → SceneStore.
const tools = legacyTools as Anthropic.Tool[];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// xhigh effort + up to 8 tool iterations can legitimately run for minutes.
export const maxDuration = 300;

const MODEL = "claude-fable-5";
const MAX_TOKENS = 64000;
const MAX_ITERATIONS = 8;
/** Visual-review PNG width. Fable 5 has high-res vision (up to 2576px long
 *  edge with 1:1 pixel coordinates); 1600px doubles label legibility over the
 *  old 1024px without paying full-res image-token cost. */
const REVIEW_PNG_WIDTH = 1600;

interface ClientPayload {
  messages: { role: "user" | "assistant"; content: string }[];
  plan: FloorPlan;
  selection?: SelectionContext | null;
  /** Accepted for backward compatibility with older clients; ignored. */
  model?: string;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "ANTHROPIC_API_KEY ausente. Configure .env.local na raiz do projeto.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: ClientPayload;
  try {
    body = (await req.json()) as ClientPayload;
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido." }), { status: 400 });
  }

  const { messages, plan, selection } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Conversa vazia." }), { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      try {
        const localPlan: FloorPlan = JSON.parse(JSON.stringify(plan ?? { rooms: [], doors: [], windows: [], furniture: [] }));

        // Conversation messages. We mutate this within the tool-use loop.
        // Empty-content messages are dropped (the API 400s on them — a
        // tool-only turn can legitimately produce an empty assistant text
        // on the client) and leading assistant messages are skipped (the
        // canvas action-log can seed history with an assistant bubble; the
        // API requires the first message to be a user turn).
        const conversation: Anthropic.MessageParam[] = messages
          .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content }));
        while (conversation.length > 0 && conversation[0].role === "assistant") {
          conversation.shift();
        }
        if (conversation.length === 0) {
          send({ type: "error", message: "Conversa sem mensagem de usuário válida." });
          return; // finally fecha o controller
        }

        // If the user has something selected, prepend a synthetic context block
        // to the most recent user message so Claude knows what "isso", "esse cômodo",
        // "essa parede" refers to.
        if (selection) {
          const lastUserIdx = (() => {
            for (let i = conversation.length - 1; i >= 0; i--) {
              if (conversation[i].role === "user") return i;
            }
            return -1;
          })();
          if (lastUserIdx >= 0) {
            const original = conversation[lastUserIdx].content;
            const ctxBlock =
              `[Contexto de seleção do usuário no canvas — referências como "isso", "esse", "essa", "aqui" se referem a este elemento]\n` +
              `Tipo: ${selection.kind}\n` +
              `${selection.description}\n` +
              `Dados: ${JSON.stringify(selection.payload)}\n\n` +
              `Pedido do usuário: `;
            if (typeof original === "string") {
              conversation[lastUserIdx] = {
                role: "user",
                content: ctxBlock + original,
              };
            }
          }
        }

        let iter = 0;
        let lastDiagnosticsHash = "";
        let validatorRounds = 0;
        let visualReviews = 0;
        let pendingVisualReview = false;
        let mutationsAny = false;
        const MAX_VALIDATOR_ROUNDS = 3;

        // Heartbeat: adaptive thinking can go tens of seconds without
        // emitting any byte; a periodic tiny SSE event keeps proxies and
        // the browser connection alive for the whole loop.
        const heartbeat = setInterval(() => {
          try {
            send({ type: "thinking" });
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);

        try {
        while (iter < MAX_ITERATIONS) {
          iter += 1;

          // Two-block system: block 1 is byte-stable across iterations and
          // turns, and its cache breakpoint covers tools + SYSTEM_PROMPT
          // (the dominant prefix cost). Block 2 carries the volatile plan
          // state AFTER the breakpoint so rebuilding it each iteration
          // never invalidates the cached prefix.
          const systemBlocks: Anthropic.TextBlockParam[] = [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: "# Estado atual da planta\n" + summarizePlan(localPlan),
            },
          ];

          const sdkStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            // Fable 5 only supports adaptive thinking; never send
            // {type:"disabled"} or budget_tokens (both 400).
            thinking: { type: "adaptive" },
            output_config: { effort: "xhigh" },
            system: systemBlocks,
            tools,
            // Second cache breakpoint on the last message block: each
            // iteration re-sends the whole conversation (which includes the
            // 1600px review PNG when present); the breakpoint lets the next
            // iteration read the prior turns from cache instead of re-paying
            // them at full price.
            messages: withMessageCacheBreakpoint(conversation),
          });

          // Real-time tool execution (Fase T2): accumulate input JSON deltas
          // per content-block index and, on `content_block_stop`, execute the
          // tool and emit `tool_input`/`tool_result` IMMEDIATELY so the canvas
          // mutates live. The assistant turn pushed back into `conversation`
          // comes from `finalMessage()` below — NOT from a hand-built copy —
          // because Fable 5 emits thinking blocks (with signatures) that must
          // be passed back verbatim in multi-turn tool loops.
          interface ToolBuffer {
            id: string;
            name: ToolName;
            json: string;
          }
          const toolBuffers = new Map<number, ToolBuffer>();
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for await (const ev of sdkStream) {
            if (ev.type === "content_block_start") {
              const cb = ev.content_block;
              if (cb.type === "tool_use") {
                send({ type: "tool_start", id: cb.id, name: cb.name as ToolName });
                toolBuffers.set(ev.index, { id: cb.id, name: cb.name as ToolName, json: "" });
              } else if (cb.type === "thinking") {
                // Keep-alive ping: adaptive thinking can pause output for
                // tens of seconds; one tiny SSE event prevents proxy idle
                // timeouts and lets the UI show a "pensando" state.
                send({ type: "thinking" });
              }
            } else if (ev.type === "content_block_delta") {
              const d = ev.delta;
              if (d.type === "text_delta") {
                send({ type: "text_delta", text: d.text });
              } else if (d.type === "input_json_delta") {
                const buf = toolBuffers.get(ev.index);
                if (buf) buf.json += d.partial_json;
              }
              // thinking_delta / signature_delta: nothing to do — display is
              // omitted by default and signatures ride in finalMessage().
            } else if (ev.type === "content_block_stop") {
              const buf = toolBuffers.get(ev.index);
              if (!buf) continue;
              let input: unknown = {};
              try {
                input = JSON.parse(buf.json || "{}");
              } catch {
                // partial / malformed JSON — bail with empty object so the
                // tool can return an error message rather than crashing.
              }
              send({ type: "tool_input", id: buf.id, input });
              let ok: boolean;
              let message: string;
              if (buf.name === "search_knowledge_base") {
                const r = await runKnowledgeSearch(input);
                ok = r.ok;
                message = r.message;
              } else {
                const r = applyTool(localPlan, buf.name, input);
                ok = r.ok;
                message = r.message;
                mutationsAny = mutationsAny || ok;
                if (ok && VISUAL_TRIGGER_TOOLS.has(buf.name)) {
                  pendingVisualReview = true;
                }
              }
              send({ type: "tool_result", id: buf.id, ok, message });
              toolResults.push({
                type: "tool_result",
                tool_use_id: buf.id,
                content: message,
                is_error: !ok,
              });
              toolBuffers.delete(ev.index);
            }
          }

          // Full assistant message with thinking blocks + signatures intact
          // and tool_use inputs fully parsed.
          const finalMessage = await sdkStream.finalMessage();

          // Always push the assistant turn and — when tools ran — the
          // matching tool_results user message as an inseparable pair.
          // An assistant turn containing tool_use blocks MUST be directly
          // followed by the tool_results ("tool_use ids were found without
          // tool_result blocks" 400 otherwise), and thinking blocks ride
          // along verbatim inside finalMessage.content.
          conversation.push({ role: "assistant", content: finalMessage.content });
          if (toolResults.length > 0) {
            conversation.push({ role: "user", content: toolResults });
          }

          // Mid-flight: while the model is still emitting tool batches, let
          // it keep building. Visual review + validators only run when it is
          // about to STOP — validating transient states (cômodo criado mas
          // ainda sem porta) queimava as rodadas de correção com falsos
          // positivos antes de a construção terminar.
          if (finalMessage.stop_reason === "tool_use" && toolResults.length > 0) {
            continue;
          }

          // Visual review pass (Phase D). Before letting the agent end its
          // turn, render the current plan to PNG and ask multimodal
          // Claude to spot blocking / overlap / orientation mistakes.
          // Capped at MAX_VISUAL_REVIEWS to avoid infinite loops on a
          // model that keeps tweaking forever.
          if (pendingVisualReview && visualReviews < MAX_VISUAL_REVIEWS) {
            try {
              const png = await renderPlanPng(localPlan, REVIEW_PNG_WIDTH);
              const b64 = png.toString("base64");
              visualReviews += 1;
              pendingVisualReview = false;
              // Consecutive user messages are legal — the API merges them.
              conversation.push({
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: "image/png", data: b64 },
                  },
                  {
                    type: "text",
                    text:
                      "Acima está o resultado visual da planta após as suas tools. Verifique de forma crítica:\n" +
                      "- Móveis na frente de portas (zona de aproximação 60cm + arco da folha)\n" +
                      "- Móveis bloqueando janelas (precisa ≥30cm livres na frente)\n" +
                      "- Sobreposições visíveis entre móveis\n" +
                      "- Camas/sofás flutuando longe de paredes\n" +
                      "- Triângulo de cozinha (geladeira-pia-fogão fora de 0.6–2.7m)\n" +
                      "- Móveis fora dos cômodos\n\n" +
                      "Se identificar problemas REAIS, corrija: móveis soltos com move_furniture/swap_furniture/remove_furniture; módulos de marcenaria com update_millwork_module ou remove_millwork_run + add_millwork_run (módulos NÃO se movem individualmente); portas/janelas com update_door/remove_door/update_window. Se estiver tudo coerente, responda apenas com um resumo curto pro usuário e finalize sem chamar mais tools.",
                  },
                ],
              });
              continue; // give the model a chance to fix what it sees
            } catch (e) {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[visual-review] render failed:", e);
              }
              // fall through to validators / break
            }
          }

          // Phase V: validate the (near-)final state and give the agent a
          // chance to self-correct. Runs only at stop so transient
          // mid-construction states never trip ROOM_NO_DOOR & friends.
          // Cap at MAX_VALIDATOR_ROUNDS to avoid infinite loops.
          if (mutationsAny && validatorRounds < MAX_VALIDATOR_ROUNDS) {
            try {
              const issues = validatePlan(localPlan);
              const hash = diagnosticsHash(issues);
              const hasFlaggedIssues = issues.some((i) => i.severity !== "info");
              if (hasFlaggedIssues && hash !== lastDiagnosticsHash) {
                lastDiagnosticsHash = hash;
                validatorRounds += 1;
                const summary = formatIssuesForAgent(issues);
                // Append a synthetic user message with diagnostics so the agent can self-correct.
                conversation.push({
                  role: "user",
                  content:
                    `[Auto-validador (NBR 15575 / NBR 9050 / Neufert)]\n` +
                    `Foram encontrados os seguintes avisos. Avalie se faz sentido auto-corrigir agora ou se devemos apresentar ao cliente:\n\n${summary}\n\n` +
                    `Se for trivial corrigir (porta menor que mínimo, área pequena, móvel sobreposto), corrija agora chamando a ferramenta apropriada. Caso contrário, mencione brevemente ao cliente as ressalvas relevantes — alguns avisos podem ser intencionais (escopo parcial sem porta de entrada, por exemplo).`,
                });
                continue; // give the agent another turn to react
              }
            } catch (e) {
              // Validators are advisory; don't break the chat on errors.
              if (process.env.NODE_ENV !== "production") {
                console.warn("[validators] error:", e);
              }
            }
          }

          break;
        }
        } finally {
          clearInterval(heartbeat);
        }

        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido.";
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Clona a conversa com um breakpoint de cache no último bloco da última
 *  mensagem. A cada iteração reenviamos a conversa inteira (incluindo o PNG
 *  de revisão); o breakpoint deixa a iteração seguinte ler o prefixo do
 *  cache em vez de repagar tudo. A conversa original não é mutada. */
function withMessageCacheBreakpoint(
  conversation: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  if (conversation.length === 0) return conversation;
  const out = conversation.slice();
  const last = out[out.length - 1];
  const cc = { type: "ephemeral" as const };
  if (typeof last.content === "string") {
    if (last.content.length === 0) return conversation;
    out[out.length - 1] = {
      ...last,
      content: [{ type: "text", text: last.content, cache_control: cc }],
    };
    return out;
  }
  if (Array.isArray(last.content) && last.content.length > 0) {
    const blocks = last.content.slice();
    const lastBlock = blocks[blocks.length - 1];
    blocks[blocks.length - 1] = { ...lastBlock, cache_control: cc } as typeof lastBlock;
    out[out.length - 1] = { ...last, content: blocks };
    return out;
  }
  return conversation;
}

interface KnowledgeSearchInput {
  query?: string;
  category?: string;
}

async function runKnowledgeSearch(
  input: unknown
): Promise<{ ok: boolean; message: string }> {
  const { query, category } = (input ?? {}) as KnowledgeSearchInput;
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return { ok: false, message: "search_knowledge_base: parâmetro `query` é obrigatório." };
  }
  if (!isRagConfigured()) {
    return {
      ok: true,
      message:
        "Base de conhecimento indisponível neste ambiente (VOYAGE_API_KEY/SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados). " +
        "Continue baseado no seu conhecimento técnico, citando Neufert/NBR/orientação solar quando aplicável.",
    };
  }
  try {
    const all = await searchKnowledgeBase(query, 8);
    const filtered = category
      ? all.filter((m) => m.category === category)
      : all;
    const top = filtered.slice(0, 5);
    if (top.length === 0) {
      return {
        ok: true,
        message: `Nenhum trecho encontrado para "${query}"${category ? ` (categoria=${category})` : ""}.`,
      };
    }
    return { ok: true, message: formatMatches(top) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return { ok: false, message: `Falha ao consultar base: ${msg}` };
  }
}

function formatMatches(matches: KnowledgeMatch[]): string {
  return matches
    .map((m, i) => {
      const score = (m.similarity * 100).toFixed(1);
      return `[${i + 1}] (${m.category}) ${m.title} — ${score}%\n${m.content}`;
    })
    .join("\n\n---\n\n");
}
