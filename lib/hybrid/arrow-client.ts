/**
 * Quiver Arrow 1.1 — image-to-SVG vectorization.
 *
 * Uses the REST API directly (the @quiverai/sdk is still beta and may
 * have breaking changes). If you prefer the SDK, swap the implementation
 * here — the rest of the pipeline is unaffected.
 */

const QUIVER_BASE = "https://api.quiver.ai/v1";

function getApiKey(): string {
  const key = process.env.QUIVER_API_KEY;
  if (!key) {
    throw new Error("QUIVER_API_KEY não configurada. Adicione em .env.local.");
  }
  return key;
}

export async function vectorizeImage(opts: {
  image: Buffer;
  model?: "arrow-1.1" | "arrow-1.1-max";
}): Promise<string> {
  const apiKey = getApiKey();
  const model = opts.model ?? "arrow-1.1-max";

  const formData = new FormData();
  formData.append("model", model);
  formData.append(
    "image",
    new File([new Uint8Array(opts.image)], "plan.png", { type: "image/png" }),
  );

  const res = await fetch(`${QUIVER_BASE}/vectorize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Arrow API error ${res.status}: ${text || res.statusText}`,
    );
  }

  const json = (await res.json()) as { svg?: string; data?: string };
  const svg = json.svg ?? json.data;
  if (!svg) {
    throw new Error("Arrow não retornou SVG na resposta.");
  }
  return svg;
}
