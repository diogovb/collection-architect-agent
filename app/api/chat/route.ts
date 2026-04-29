import Anthropic from "@anthropic-ai/sdk";
import { tools as legacyTools } from "@/lib/anthropic-tools";
import { applyTool, summarizePlan } from "@/lib/floor-plan-engine";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import {
  isRagConfigured,
  searchKnowledgeBase,
  type KnowledgeMatch,
} from "@/lib/embeddings";
import type { FloorPlan, SelectionContext, StreamEvent, ToolName, ToolInputs } from "@/lib/types";
import { isHybridEnabled, runHybridPipeline } from "@/lib/hybrid/pipeline";
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
  "add_window",
  "add_balcony",
  "add_stairs",
  "add_column",
  "create_apartment_layout",
  "generate_plan_hybrid",
]);

const MAX_VISUAL_REVIEWS = 2;

// Scene tools (lib/agent/tools.ts) operate on the server-side scene graph but
// have no sync path back to the client — every change would be invisible. They
// are intentionally NOT registered with the model. The legacy tool family
// modifies the FloorPlan and round-trips through useFloorPlanBridge → SceneStore.
const tools = legacyTools as Anthropic.Tool[];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hybrid pipeline com thinking mode pode levar até ~60s (2× ~30s).
// Sem isso o Vercel mata a função em 10s no plano free.
export const maxDuration = 120;

const DEFAULT_MODEL = "claude-opus-4-7";
const ALLOWED_MODELS = new Set(["claude-opus-4-7", "claude-sonnet-4-6"]);
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 8;

interface ClientPayload {
  messages: { role: "user" | "assistant"; content: string }[];
  plan: FloorPlan;
  selection?: SelectionContext | null;
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

  const { messages, plan, selection, model: requestedModel } = body;
  const model =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
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
        const conversation: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

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
        const MAX_VALIDATOR_ROUNDS = 3;
        while (iter < MAX_ITERATIONS) {
          iter += 1;

          const systemBlock =
            SYSTEM_PROMPT +
            "\n\n# Estado atual da planta\n" +
            summarizePlan(localPlan);

          const sdkStream = anthropic.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system: systemBlock,
            tools,
            messages: conversation,
          });

          // Real-time tool execution (Fase T2). The previous version waited
          // for `sdkStream.finalMessage()` before running any tool — meaning
          // the canvas only mutated after the agent had emitted ALL tool
          // calls in the iteration. Now we accumulate input JSON deltas
          // per content-block index and, on `content_block_stop`, execute
          // the tool and emit `tool_input`/`tool_result` IMMEDIATELY.
          interface ToolBuffer {
            id: string;
            name: ToolName;
            json: string;
          }
          const toolBuffers = new Map<number, ToolBuffer>();
          const accumulatedContent: Anthropic.ContentBlockParam[] = [];
          const blockIndexToOrdinal = new Map<number, number>();
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          let mutationsHappened = false;
          let stopReason: string | null = null;

          for await (const ev of sdkStream) {
            if (ev.type === "content_block_start") {
              const cb = ev.content_block;
              if (cb.type === "tool_use") {
                send({ type: "tool_start", id: cb.id, name: cb.name as ToolName });
                toolBuffers.set(ev.index, { id: cb.id, name: cb.name as ToolName, json: "" });
                blockIndexToOrdinal.set(ev.index, accumulatedContent.length);
                accumulatedContent.push({
                  type: "tool_use",
                  id: cb.id,
                  name: cb.name,
                  input: {},
                });
              } else if (cb.type === "text") {
                blockIndexToOrdinal.set(ev.index, accumulatedContent.length);
                accumulatedContent.push({ type: "text", text: "" });
              }
            } else if (ev.type === "content_block_delta") {
              const d = ev.delta;
              if (d.type === "text_delta") {
                send({ type: "text_delta", text: d.text });
                const ord = blockIndexToOrdinal.get(ev.index);
                if (ord !== undefined) {
                  const blk = accumulatedContent[ord];
                  if (blk && blk.type === "text") blk.text += d.text;
                }
              } else if (d.type === "input_json_delta") {
                const buf = toolBuffers.get(ev.index);
                if (buf) buf.json += d.partial_json;
              }
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
              const ord = blockIndexToOrdinal.get(ev.index);
              if (ord !== undefined) {
                const blk = accumulatedContent[ord];
                if (blk && blk.type === "tool_use") {
                  (blk as { input: unknown }).input = input;
                }
              }
              send({ type: "tool_input", id: buf.id, input });
              let ok: boolean;
              let message: string;
              if (buf.name === "search_knowledge_base") {
                const r = await runKnowledgeSearch(input);
                ok = r.ok;
                message = r.message;
              } else if (buf.name === "generate_plan_hybrid") {
                if (!isHybridEnabled()) {
                  ok = false;
                  message = "Pipeline híbrido desabilitado. Use create_apartment_layout como fallback.";
                } else {
                  try {
                    const hi = input as ToolInputs["generate_plan_hybrid"];
                    const result = await runHybridPipeline(
                      {
                        totalArea: hi.total_area,
                        numBedrooms: hi.num_bedrooms,
                        numBathrooms: hi.num_bathrooms,
                        style: hi.style,
                        includeFurniture: hi.include_furniture,
                        additionalNotes: hi.additional_notes,
                      },
                      (ev) => {
                        // Stream debug artifacts to the chat as they arrive.
                        if (ev.kind === "stage") {
                          send({ type: "text_delta", text: `\n_${ev.label}_\n` });
                        } else if (ev.kind === "structural_image") {
                          send({
                            type: "debug_image",
                            mediaType: "image/png",
                            dataUrl: `data:image/png;base64,${ev.image.toString("base64")}`,
                            label: "GPT Image — planta estrutural",
                            phase: "structural",
                          });
                        } else if (ev.kind === "structural_svg") {
                          send({
                            type: "debug_svg",
                            svg: ev.svg,
                            label: "Arrow 1.1 — vetorização estrutural",
                            phase: "structural",
                          });
                        } else if (ev.kind === "furniture_image") {
                          send({
                            type: "debug_image",
                            mediaType: "image/png",
                            dataUrl: `data:image/png;base64,${ev.image.toString("base64")}`,
                            label: "GPT Image — layout de móveis",
                            phase: "furniture",
                          });
                        } else if (ev.kind === "furniture_svg") {
                          send({
                            type: "debug_svg",
                            svg: ev.svg,
                            label: "Arrow 1.1 — vetorização de móveis",
                            phase: "furniture",
                          });
                        }
                      },
                    );

                    // Hybrid v2: NÃO reconstrói rooms/doors. A planta é puramente
                    // visual (SVG do Arrow), exibida no canvas como background layer.
                    localPlan.rooms = [];
                    localPlan.doors = [];
                    localPlan.windows = [];
                    localPlan.furniture = [];
                    localPlan.stairs = [];
                    localPlan.columns = [];
                    localPlan.annotations = [];
                    localPlan.northArrow = null;
                    localPlan.millworkRuns = [];
                    localPlan.hybridLayers = result.hybridLayers;

                    ok = true;
                    const layerInfo: string[] = [];
                    if (result.hybridLayers.structuralSvg) layerInfo.push("estrutura vetorizada");
                    if (result.hybridLayers.furnitureSvg) layerInfo.push("móveis vetorizados");
                    message =
                      `Planta híbrida gerada (${(result.timings.total / 1000).toFixed(1)}s). ` +
                      `Camadas: ${layerInfo.join(", ") || "nenhuma"}.` +
                      (result.issues.length > 0 ? ` Avisos: ${result.issues.join("; ")}` : "");
                    mutationsHappened = true;
                    // Sync the new plan to the client.
                    send({ type: "plan_replace", plan: localPlan });
                  } catch (e) {
                    ok = false;
                    message = `Erro no pipeline híbrido: ${e instanceof Error ? e.message : "desconhecido"}. Use create_apartment_layout como fallback.`;
                  }
                }
              } else {
                const r = applyTool(localPlan, buf.name, input);
                ok = r.ok;
                message = r.message;
                mutationsHappened = mutationsHappened || ok;
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
            } else if (ev.type === "message_delta") {
              if (ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
            }
          }

          if (stopReason !== "tool_use" || toolResults.length === 0) {
            // Visual review pass (Phase D). Before letting the agent end its
            // turn, render the current plan to PNG and ask multimodal
            // Claude to spot blocking / overlap / orientation mistakes.
            // Capped at MAX_VISUAL_REVIEWS to avoid infinite loops on a
            // model that keeps tweaking forever.
            if (pendingVisualReview && visualReviews < MAX_VISUAL_REVIEWS) {
              try {
                const png = await renderPlanPng(localPlan);
                const b64 = png.toString("base64");
                visualReviews += 1;
                pendingVisualReview = false;
                conversation.push({ role: "assistant", content: accumulatedContent });
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
                        "Se identificar problemas REAIS, chame as ferramentas (move_furniture, swap_furniture, remove_furniture) para corrigir. Se estiver tudo coerente, responda apenas com um resumo curto pro usuário e finalize sem chamar mais tools.",
                    },
                  ],
                });
                continue; // give the model a chance to fix what it sees
              } catch (e) {
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[visual-review] render failed:", e);
                }
                // fall through to break
              }
            }
            break;
          }

          // Append the assistant message AND the synthesized tool_results
          // user message so the next iteration of the agent sees the full
          // conversation context. Missing this pair was the cause of the
          // "tool_use ids were found without tool_result blocks" 400 from
          // the Anthropic API after the Fase T2 refactor.
          conversation.push({ role: "assistant", content: accumulatedContent });
          conversation.push({ role: "user", content: toolResults });

          // After mutations, run validators and surface issues to the agent.
          // Cap at MAX_VALIDATOR_ROUNDS to avoid infinite self-correction loops.
          if (mutationsHappened && validatorRounds < MAX_VALIDATOR_ROUNDS) {
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
                    `Se for trivial corrigir (porta menor que mínimo, área pequena, móvel sobreposto), corrija agora chamando a ferramenta apropriada. Caso contrário, mencione brevemente ao cliente as ressalvas relevantes.`,
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
