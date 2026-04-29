/**
 * OpenAI agent loop — alternativa ao Claude para gerar plantas pelo método
 * tradicional (chamando tools como create_room/add_furniture).
 *
 * Produz a mesma stream de StreamEvents que o cliente já consome (text_delta,
 * tool_start, tool_input, tool_result, plan_replace, error, done), de modo
 * que o ChatPanel funciona sem modificações independente do provider.
 *
 * Limitações (V1):
 * - Não faz visual review (PNG para Claude Vision) — é uma feature do Claude
 * - Não faz validator self-correction (NBR/Neufert)
 * - generate_plan_hybrid funciona normalmente (continua chamando o pipeline)
 */

import OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import { applyTool } from "@/lib/floor-plan-engine";
import type {
  FloorPlan,
  StreamEvent,
  ToolName,
  ToolInputs,
} from "@/lib/types";
import { isHybridEnabled, runHybridPipeline } from "@/lib/hybrid/pipeline";
import {
  isRagConfigured,
  searchKnowledgeBase,
  type KnowledgeMatch,
} from "@/lib/embeddings";

const MAX_ITERATIONS = 8;
const MAX_TOKENS = 4096;

interface RunArgs {
  model: string;
  systemPrompt: string;
  initialMessages: Array<{ role: "user" | "assistant"; content: string }>;
  selectionBlock?: string;
  tools: Anthropic.Tool[];
  localPlan: FloorPlan;
  send: (e: StreamEvent) => void;
}

/** Converte tools do formato Anthropic ({name, description, input_schema})
 *  para o formato OpenAI ({type:"function", function:{name, description, parameters}}). */
function convertTools(
  anthropicTools: Anthropic.Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return anthropicTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: (t.input_schema ?? {
        type: "object",
        properties: {},
      }) as Record<string, unknown>,
    },
  }));
}

interface KnowledgeSearchInput {
  query?: string;
  category?: string;
}

async function runKnowledgeSearch(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  if (!isRagConfigured()) {
    return {
      ok: false,
      message:
        "Base de conhecimento não configurada (faltam VOYAGE_API_KEY/SUPABASE_URL/SUPABASE_SERVICE_KEY).",
    };
  }
  const i = (input ?? {}) as KnowledgeSearchInput;
  const q = (i.query ?? "").toString().trim();
  if (!q) return { ok: false, message: "Query vazia em search_knowledge_base." };
  try {
    const matches: KnowledgeMatch[] = await searchKnowledgeBase(q, 5);
    if (matches.length === 0)
      return {
        ok: true,
        message: `Sem resultados para "${q}" na base de conhecimento.`,
      };
    const lines = matches.map(
      (m, idx) =>
        `${idx + 1}. [${m.category}] ${m.title} (sim ${m.similarity.toFixed(2)})\n${m.content}`,
    );
    return { ok: true, message: lines.join("\n\n") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return { ok: false, message: `Falha na busca RAG: ${msg}` };
  }
}

export async function runOpenAIAgent(args: RunArgs): Promise<void> {
  const { model, systemPrompt, initialMessages, selectionBlock, tools, localPlan, send } = args;

  if (!process.env.OPENAI_API_KEY) {
    send({ type: "error", message: "OPENAI_API_KEY ausente — não é possível usar GPT-5.5." });
    send({ type: "done" });
    return;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const openaiTools = convertTools(tools);

  // Build conversation. OpenAI puts system as first message; tool results
  // come back as role="tool" with tool_call_id.
  const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...initialMessages.map((m) => {
      // Inject selection context into the last user message if provided.
      if (selectionBlock && m === initialMessages[initialMessages.length - 1] && m.role === "user") {
        return { role: "user" as const, content: selectionBlock + m.content };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const stream = await client.chat.completions.create({
      model,
      messages: conversation,
      tools: openaiTools,
      tool_choice: "auto",
      max_completion_tokens: MAX_TOKENS,
      stream: true,
    });

    // Accumulators per response. OpenAI streams chunks where each chunk has
    // `choices[0].delta` with optional content (text), tool_calls (array of
    // { index, id?, function: { name?, arguments? } }), and finish_reason.
    let assistantText = "";
    interface ToolCallBuf {
      id: string;
      name: string;
      args: string;
      announced: boolean;
    }
    const toolCallBufs: ToolCallBuf[] = [];
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta?.content) {
        assistantText += delta.content;
        send({ type: "text_delta", text: delta.content });
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          let buf = toolCallBufs[idx];
          if (!buf) {
            buf = { id: tc.id ?? `call_${idx}`, name: "", args: "", announced: false };
            toolCallBufs[idx] = buf;
          }
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) buf.args += tc.function.arguments;

          // Once we know the name, announce the tool start.
          if (!buf.announced && buf.name) {
            buf.announced = true;
            send({ type: "tool_start", id: buf.id, name: buf.name as ToolName });
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    // Append the assistant message (with tool_calls if any) to history so the
    // next iteration sees it. We must include the EXACT shape OpenAI expects.
    if (toolCallBufs.length === 0) {
      // Plain text response — done.
      conversation.push({ role: "assistant", content: assistantText });
      break;
    }

    const assistantToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
      toolCallBufs.map((b) => ({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: b.args || "{}" },
      }));

    conversation.push({
      role: "assistant",
      content: assistantText || null,
      tool_calls: assistantToolCalls,
    });

    // Execute each tool call in order, push tool result back to conversation.
    for (const buf of toolCallBufs) {
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(buf.args || "{}");
      } catch {
        // bail — empty input
      }
      send({ type: "tool_input", id: buf.id, input: parsed });

      let ok: boolean;
      let message: string;

      if (buf.name === "search_knowledge_base") {
        const r = await runKnowledgeSearch(parsed);
        ok = r.ok;
        message = r.message;
      } else if (buf.name === "generate_plan_hybrid") {
        if (!isHybridEnabled()) {
          ok = false;
          message =
            "Pipeline híbrido desabilitado. Use create_apartment_layout como fallback.";
        } else {
          try {
            const hi = parsed as ToolInputs["generate_plan_hybrid"];
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
            send({ type: "plan_replace", plan: localPlan });
          } catch (e) {
            ok = false;
            message = `Erro no pipeline híbrido: ${e instanceof Error ? e.message : "desconhecido"}.`;
          }
        }
      } else {
        const r = applyTool(localPlan, buf.name as ToolName, parsed);
        ok = r.ok;
        message = r.message;
      }

      send({ type: "tool_result", id: buf.id, ok, message });
      // OpenAI requires a `tool` role message per tool_call_id.
      conversation.push({
        role: "tool",
        tool_call_id: buf.id,
        content: message,
      });
    }

    // Continue the loop — model has new tool results to react to.
    if (finishReason !== "tool_calls") {
      // Some models may use stop after a tool call too. Re-iterate to be safe.
    }
  }
}
