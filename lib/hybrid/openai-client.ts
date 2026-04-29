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

export async function generateFloorPlanImage(opts: {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
}): Promise<Buffer> {
  const client = getClient();
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: opts.prompt,
    size: opts.size ?? "1536x1024",
    quality: opts.quality ?? "high",
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI não retornou imagem (b64_json ausente).");
  }
  return Buffer.from(b64, "base64");
}

export async function generateFurnitureLayout(opts: {
  prompt: string;
  referenceImage: Buffer;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
}): Promise<Buffer> {
  const client = getClient();

  const imageFile = new File(
    [new Uint8Array(opts.referenceImage)],
    "floor-plan.png",
    { type: "image/png" },
  );

  const res = await client.images.edit({
    model: "gpt-image-1",
    prompt: opts.prompt,
    image: imageFile,
    size: opts.size ?? "1536x1024",
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI não retornou imagem de mobiliário.");
  }
  return Buffer.from(b64, "base64");
}
