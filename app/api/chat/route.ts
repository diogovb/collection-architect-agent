import Anthropic from "@anthropic-ai/sdk";
import { tools } from "@/lib/anthropic-tools";
import { applyTool, summarizePlan } from "@/lib/floor-plan-engine";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import {
  isRagConfigured,
  searchKnowledgeBase,
  type KnowledgeMatch,
} from "@/lib/embeddings";
import type { FloorPlan, SelectionContext, StreamEvent, ToolName } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

          const announcedToolIds = new Set<string>();

          for await (const ev of sdkStream) {
            if (ev.type === "content_block_start") {
              const cb = ev.content_block;
              if (cb.type === "tool_use" && !announcedToolIds.has(cb.id)) {
                announcedToolIds.add(cb.id);
                send({ type: "tool_start", id: cb.id, name: cb.name as ToolName });
              }
            } else if (ev.type === "content_block_delta") {
              const d = ev.delta;
              if (d.type === "text_delta") {
                send({ type: "text_delta", text: d.text });
              }
            }
          }

          const final = await sdkStream.finalMessage();

          // Collect any tool uses to execute
          const toolUses: { id: string; name: ToolName; input: unknown }[] = [];
          for (const block of final.content) {
            if (block.type === "tool_use") {
              toolUses.push({ id: block.id, name: block.name as ToolName, input: block.input });
            }
          }

          if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
            break;
          }

          // Append assistant message (with original content blocks) to conversation
          conversation.push({ role: "assistant", content: final.content });

          // Execute tools and emit results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ type: "tool_input", id: tu.id, input: tu.input });
            let ok: boolean;
            let message: string;
            if (tu.name === "search_knowledge_base") {
              const r = await runKnowledgeSearch(tu.input);
              ok = r.ok;
              message = r.message;
            } else {
              const r = applyTool(localPlan, tu.name, tu.input);
              ok = r.ok;
              message = r.message;
            }
            send({ type: "tool_result", id: tu.id, ok, message });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: message,
              is_error: !ok,
            });
          }

          conversation.push({ role: "user", content: toolResults });
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
