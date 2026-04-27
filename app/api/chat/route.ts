import Anthropic from "@anthropic-ai/sdk";
import { tools } from "@/lib/anthropic-tools";
import { applyTool, summarizePlan } from "@/lib/floor-plan-engine";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { FloorPlan, StreamEvent, ToolName } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 8;

interface ClientPayload {
  messages: { role: "user" | "assistant"; content: string }[];
  plan: FloorPlan;
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

  const { messages, plan } = body;
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

        let iter = 0;
        while (iter < MAX_ITERATIONS) {
          iter += 1;

          const systemBlock =
            SYSTEM_PROMPT +
            "\n\n# Estado atual da planta\n" +
            summarizePlan(localPlan);

          const sdkStream = anthropic.messages.stream({
            model: MODEL,
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
            const r = applyTool(localPlan, tu.name, tu.input);
            send({ type: "tool_result", id: tu.id, ok: r.ok, message: r.message });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: r.message,
              is_error: !r.ok,
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
