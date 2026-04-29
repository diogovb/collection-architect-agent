import { isHybridEnabled, runHybridPipeline } from "@/lib/hybrid/pipeline";
import type { HybridPipelineSpec } from "@/lib/hybrid/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isHybridEnabled()) {
    return Response.json(
      {
        error:
          "Pipeline híbrido desabilitado. Configure OPENAI_API_KEY e HYBRID_PIPELINE_ENABLED=true em .env.local.",
      },
      { status: 503 },
    );
  }

  let spec: HybridPipelineSpec;
  try {
    spec = (await req.json()) as HybridPipelineSpec;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!spec.totalArea || !spec.numBedrooms || spec.numBathrooms == null) {
    return Response.json(
      { error: "Campos obrigatórios: totalArea, numBedrooms, numBathrooms." },
      { status: 400 },
    );
  }

  try {
    const result = await runHybridPipeline(spec);

    return Response.json({
      ok: true,
      hybridLayers: result.hybridLayers,
      issues: result.issues,
      timings: result.timings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
