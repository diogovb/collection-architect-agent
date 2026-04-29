import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { KNOWLEDGE_CHUNKS, type KnowledgeChunk } from "./knowledge-base-content";

// Voyage AI embeddings + Supabase pgvector RAG.
//
// Env vars:
//   VOYAGE_API_KEY        — chave da Voyage (https://www.voyageai.com/)
//   SUPABASE_URL          — URL do projeto Supabase
//   SUPABASE_SERVICE_KEY  — service role key (somente servidor!)
//
// Modelo: voyage-3-lite, 512 dimensões. Match com a coluna vector(512)
// definida em lib/supabase-setup.sql.

const VOYAGE_MODEL = "voyage-3-lite";
const VOYAGE_DIMENSIONS = 512;
const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export interface KnowledgeMatch {
  category: string;
  title: string;
  content: string;
  similarity: number;
}

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with optional Retry-After honor. Voyage's free
 *  tier returns 429 at 3 RPM (no payment) or briefly during the
 *  propagation window after adding a payment method. The seed used to
 *  abort on the first 429 — now we retry up to MAX_RETRIES with growing
 *  delays (and respect Retry-After if the API sends it). */
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 22_000; // safely above 60 / 3 RPM = 20s

async function callVoyage(
  inputs: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY ausente.");
  }
  let attempt = 0;
  while (true) {
    const res = await fetch(VOYAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: inputs,
        model: VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: VOYAGE_DIMENSIONS,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as VoyageResponse;
      return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
    // Retryable: 429 (rate limit) or 5xx (transient server error).
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    const txt = await res.text();
    if (!retryable || attempt >= MAX_RETRIES - 1) {
      throw new Error(`Voyage API ${res.status}: ${txt}`);
    }
    // Honor Retry-After header if present (seconds), otherwise exponential backoff.
    const ra = res.headers.get("retry-after");
    const raSec = ra ? Math.max(0, Number(ra)) : NaN;
    const wait = !Number.isNaN(raSec) && raSec > 0
      ? raSec * 1000
      : BASE_BACKOFF_MS * Math.pow(1.5, attempt);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[voyage] ${res.status} — retry em ${Math.round(wait / 1000)}s (tentativa ${attempt + 1}/${MAX_RETRIES})`);
    }
    await sleep(wait);
    attempt += 1;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [vec] = await callVoyage([text], "query");
  return vec;
}

export async function searchKnowledgeBase(
  query: string,
  limit = 5
): Promise<KnowledgeMatch[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase não configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY).");
  }
  const embedding = await generateEmbedding(query);
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_count: limit,
  });
  if (error) {
    throw new Error(`Supabase RPC: ${error.message}`);
  }
  return (data ?? []) as KnowledgeMatch[];
}

export interface SeedResult {
  total: number;
  inserted: number;
  batches: number;
}

export async function seedKnowledgeBase(): Promise<SeedResult> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase não configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY).");
  }
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY ausente.");
  }

  const { error: deleteErr } = await supabase
    .from("knowledge_chunks")
    .delete()
    .gte("id", 0);
  if (deleteErr) {
    throw new Error(`Falha limpando tabela: ${deleteErr.message}`);
  }

  const chunks: KnowledgeChunk[] = KNOWLEDGE_CHUNKS;
  const BATCH = 10;
  let inserted = 0;
  let batches = 0;

  // Spacing between batches so we don't burst right against the 3 RPM
  // ceiling that Voyage applies in free tier or during the post-billing
  // propagation window. callVoyage retries on 429 anyway (with proper
  // Retry-After honor), but baseline spacing avoids forcing the retries
  // to happen at all in the common case.
  const INTER_BATCH_MS = 1_500;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const inputs = slice.map((c) => `${c.title}\n\n${c.content}`);
    const embeddings = await callVoyage(inputs, "document");
    const rows = slice.map((c, j) => ({
      category: c.category,
      title: c.title,
      content: c.content,
      embedding: embeddings[j],
    }));
    const { error: insertErr } = await supabase
      .from("knowledge_chunks")
      .insert(rows);
    if (insertErr) {
      throw new Error(`Falha no batch ${batches + 1}: ${insertErr.message}`);
    }
    inserted += rows.length;
    batches += 1;
    if (i + BATCH < chunks.length) await sleep(INTER_BATCH_MS);
  }

  return { total: chunks.length, inserted, batches };
}

export function isRagConfigured(): boolean {
  return Boolean(
    process.env.VOYAGE_API_KEY &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_KEY
  );
}
