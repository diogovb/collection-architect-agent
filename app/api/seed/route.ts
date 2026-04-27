import { isRagConfigured, seedKnowledgeBase } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Seed pode demorar — limite máximo do Vercel hobby é 60s, mas pro/local aguenta mais.
export const maxDuration = 300;

// POST /api/seed
//   Header: Authorization: Bearer <SEED_SECRET>
//
// Limpa knowledge_chunks e popula com KNOWLEDGE_CHUNKS, gerando embeddings
// via Voyage AI. Idempotente: roda quantas vezes quiser.
export async function POST(req: Request) {
  const secret = process.env.SEED_SECRET;
  if (!secret) {
    return Response.json(
      { error: "SEED_SECRET não configurado no servidor." },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (token !== secret) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!isRagConfigured()) {
    return Response.json(
      {
        error:
          "RAG não configurado. Defina VOYAGE_API_KEY, SUPABASE_URL e SUPABASE_SERVICE_KEY.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await seedKnowledgeBase();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
