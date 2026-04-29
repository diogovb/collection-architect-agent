/**
 * Pipeline Híbrido v2 — GPT Image + Arrow puros.
 *
 * Diferente da v1 (que usava Claude Vision para extrair rooms e reconstruir
 * uma FloorPlan retangular), a v2 EXIBE EXATAMENTE o que GPT Image gera +
 * Arrow vetoriza, sem reinterpretação. O canvas renderiza as SVGs como
 * camadas de background.
 */

import type {
  HybridPipelineSpec,
  HybridPipelineResult,
  PipelineProgressEvent,
} from "./types";
import { generateFloorPlanImage, generateFurnitureLayout } from "./openai-client";
import { vectorizeImage } from "./arrow-client";
import { buildStructuralPrompt, buildFurniturePrompt } from "./prompts";

export function isHybridEnabled(): boolean {
  return (
    process.env.HYBRID_PIPELINE_ENABLED === "true" &&
    !!process.env.OPENAI_API_KEY
  );
}

export async function runHybridPipeline(
  spec: HybridPipelineSpec,
  onProgress?: (ev: PipelineProgressEvent) => void,
): Promise<HybridPipelineResult> {
  const t0 = Date.now();
  const issues: string[] = [];

  // ---------- Phase A: Estrutura ----------
  onProgress?.({ kind: "stage", label: "Gerando planta estrutural com GPT Image..." });
  const structuralPrompt = buildStructuralPrompt(spec);

  const tImgA0 = Date.now();
  const structuralImage = await generateFloorPlanImage({
    prompt: structuralPrompt,
    size: "2048x2048",
    quality: "high",
    qualityMode: "thinking",
  });
  const tImgA1 = Date.now();
  onProgress?.({ kind: "structural_image", image: structuralImage });

  onProgress?.({ kind: "stage", label: "Vetorizando com Arrow 1.1..." });
  const tVecA0 = Date.now();
  let structuralSvg: string | undefined;
  try {
    structuralSvg = await vectorizeImage({
      image: structuralImage,
      model: "arrow-1.1-max",
    });
    onProgress?.({ kind: "structural_svg", svg: structuralSvg });
  } catch (e) {
    issues.push(
      `Arrow falhou na fase estrutural: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
    );
  }
  const tVecA1 = Date.now();

  // ---------- Phase B: Móveis (opcional) ----------
  let furnitureImage: Buffer | undefined;
  let furnitureSvg: string | undefined;
  let tImgB0: number | undefined;
  let tImgB1: number | undefined;
  let tVecB0: number | undefined;
  let tVecB1: number | undefined;

  if (spec.includeFurniture) {
    onProgress?.({ kind: "stage", label: "Gerando layout de móveis com GPT Image..." });
    const furniturePrompt = buildFurniturePrompt(spec, []); // sem rooms — GPT Image se vira

    tImgB0 = Date.now();
    try {
      furnitureImage = await generateFurnitureLayout({
        prompt: furniturePrompt,
        referenceImage: structuralImage,
        size: "2048x2048",
        quality: "high",
        qualityMode: "thinking",
      });
      onProgress?.({ kind: "furniture_image", image: furnitureImage });
    } catch (e) {
      issues.push(
        `GPT Image falhou na fase de móveis: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
      );
    }
    tImgB1 = Date.now();

    if (furnitureImage) {
      onProgress?.({ kind: "stage", label: "Vetorizando móveis com Arrow 1.1..." });
      tVecB0 = Date.now();
      try {
        furnitureSvg = await vectorizeImage({
          image: furnitureImage,
          model: "arrow-1.1-max",
        });
        onProgress?.({ kind: "furniture_svg", svg: furnitureSvg });
      } catch (e) {
        issues.push(
          `Arrow falhou nos móveis: ${e instanceof Error ? e.message : "erro desconhecido"}.`,
        );
      }
      tVecB1 = Date.now();
    }
  }

  const tEnd = Date.now();

  return {
    hybridLayers: {
      structuralImageDataUrl: bufferToDataUrl(structuralImage),
      structuralSvg,
      furnitureImageDataUrl: furnitureImage ? bufferToDataUrl(furnitureImage) : undefined,
      furnitureSvg,
      worldFit: { widthMeters: 20, heightMeters: 12 },
    },
    issues,
    timings: {
      structuralImage: tImgA1 - tImgA0,
      structuralVectorize: tVecA1 - tVecA0,
      furnitureImage: tImgB0 != null && tImgB1 != null ? tImgB1 - tImgB0 : undefined,
      furnitureVectorize: tVecB0 != null && tVecB1 != null ? tVecB1 - tVecB0 : undefined,
      total: tEnd - t0,
    },
  };
}

function bufferToDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}
