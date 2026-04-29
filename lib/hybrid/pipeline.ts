import type { HybridPipelineSpec, HybridPipelineResult } from "./types";
import { generateFloorPlanImage, generateFurnitureLayout } from "./openai-client";
import { vectorizeImage } from "./arrow-client";
import { extractStructure, extractFurniture } from "./vision-extractor";
import { reconstructFloorPlan } from "./reconstruct";
import { buildStructuralPrompt, buildFurniturePrompt } from "./prompts";

export function isHybridEnabled(): boolean {
  return (
    process.env.HYBRID_PIPELINE_ENABLED === "true" &&
    !!process.env.OPENAI_API_KEY &&
    !!process.env.ANTHROPIC_API_KEY
  );
}

export async function runHybridPipeline(
  spec: HybridPipelineSpec,
): Promise<HybridPipelineResult> {
  const t0 = Date.now();
  const issues: string[] = [];

  // ---- Phase A: structural plan ----
  const structPrompt = buildStructuralPrompt(spec);

  const tImageStart = Date.now();
  const structuralImage = await generateFloorPlanImage({
    prompt: structPrompt,
    size: "1536x1024",
    quality: "high",
  });
  const tImageEnd = Date.now();

  // Vision extraction + Arrow vectorization in parallel
  const [structure, structuralSvg] = await Promise.all([
    extractStructure(structuralImage, spec),
    vectorizeSafe(structuralImage),
  ]);
  const tVisionEnd = Date.now();

  if (structure.issues.length > 0) {
    issues.push(...structure.issues);
  }

  // Reconstruct FloorPlan from extracted data
  const tReconStart = Date.now();
  let plan = reconstructFloorPlan(structure);
  const tReconEnd = Date.now();

  // ---- Phase B: furniture (optional) ----
  let furnitureImage: Buffer | undefined;
  let furnitureSvg: string | undefined;
  let tFurnitureEnd: number | undefined;

  if (spec.includeFurniture && plan.rooms.length > 0) {
    const tFurnStart = Date.now();
    const roomNames = plan.rooms.map((r) => r.name);
    const furnPrompt = buildFurniturePrompt(spec, roomNames);

    try {
      furnitureImage = await generateFurnitureLayout({
        prompt: furnPrompt,
        referenceImage: structuralImage,
      });

      const [furnitureData, furnSvg] = await Promise.all([
        extractFurniture(furnitureImage, plan),
        vectorizeSafe(furnitureImage),
      ]);

      furnitureSvg = furnSvg ?? undefined;

      if (furnitureData.items.length > 0) {
        plan = reconstructFloorPlan(structure, furnitureData);
      }

      if (furnitureData.unrecognized.length > 0) {
        issues.push(
          `${furnitureData.unrecognized.length} móvel(is) não reconhecido(s).`,
        );
      }
    } catch (e) {
      issues.push(
        `Falha na geração de móveis: ${e instanceof Error ? e.message : "erro desconhecido"}. Estrutura mantida.`,
      );
    }
    tFurnitureEnd = Date.now();
  }

  const tTotal = Date.now();

  return {
    plan,
    structuralImage,
    structuralSvg: structuralSvg ?? undefined,
    furnitureImage,
    furnitureSvg,
    confidence: structure.confidence,
    issues,
    timings: {
      imageGen: tImageEnd - tImageStart,
      vectorize: tVisionEnd - tImageEnd,
      visionExtract: tVisionEnd - tImageEnd,
      reconstruct: tReconEnd - tReconStart,
      furnitureGen: tFurnitureEnd ? tFurnitureEnd - tReconEnd : undefined,
      total: tTotal - t0,
    },
  };
}

async function vectorizeSafe(image: Buffer): Promise<string | null> {
  if (!process.env.QUIVER_API_KEY) return null;
  try {
    return await vectorizeImage({ image, model: "arrow-1.1-max" });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[hybrid] Arrow vectorization failed:", e);
    }
    return null;
  }
}
