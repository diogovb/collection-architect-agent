import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada. Adicione em .env.local.");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const MODEL = "gpt-image-2";

/**
 * Tamanhos suportados pelo gpt-image-2 (popular set):
 *   1024x1024, 1536x1024, 1024x1536, 2048x2048, auto
 *
 * Plantas arquitetônicas se beneficiam de mais resolução para o Arrow
 * vetorizar com mais detalhe. Default: 2048x2048 (quadrado, máx detalhe).
 */
export type GptImageSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "auto";

/**
 * `quality_mode` do gpt-image-2:
 *   - "instant" (default): 3-5s, custo padrão
 *   - "thinking": 10-30s, 2-3× custo, planeja layout antes de gerar
 *     (essencial para plantas arquitetônicas com geometria precisa)
 */
export type GptImageQualityMode = "instant" | "thinking";

export async function generateFloorPlanImage(opts: {
  prompt: string;
  size?: GptImageSize;
  quality?: "low" | "medium" | "high" | "auto";
  qualityMode?: GptImageQualityMode;
}): Promise<Buffer> {
  const client = getClient();

  // O SDK pode não ter `quality_mode` tipado ainda — castamos para qualquer
  // forma que aceite a propriedade extra. Em produção a OpenAI valida server-side.
  const params = {
    model: MODEL,
    prompt: opts.prompt,
    size: opts.size ?? "2048x2048",
    quality: opts.quality ?? "high",
    quality_mode: opts.qualityMode ?? "thinking",
    n: 1,
  } as unknown as Parameters<typeof client.images.generate>[0];

  const res = (await client.images.generate(params)) as { data?: Array<{ b64_json?: string }> };

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI não retornou imagem (b64_json ausente).");
  }
  return Buffer.from(b64, "base64");
}

export async function generateFurnitureLayout(opts: {
  prompt: string;
  referenceImage: Buffer;
  size?: GptImageSize;
  quality?: "low" | "medium" | "high" | "auto";
  qualityMode?: GptImageQualityMode;
}): Promise<Buffer> {
  const client = getClient();

  const imageFile = new File(
    [new Uint8Array(opts.referenceImage)],
    "floor-plan.png",
    { type: "image/png" },
  );

  const params = {
    model: MODEL,
    prompt: opts.prompt,
    image: imageFile,
    size: opts.size ?? "2048x2048",
    quality: opts.quality ?? "high",
    quality_mode: opts.qualityMode ?? "thinking",
    n: 1,
  } as unknown as Parameters<typeof client.images.edit>[0];

  const res = (await client.images.edit(params)) as { data?: Array<{ b64_json?: string }> };

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI não retornou imagem de mobiliário.");
  }
  return Buffer.from(b64, "base64");
}
