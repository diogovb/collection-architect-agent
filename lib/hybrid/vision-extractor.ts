import Anthropic from "@anthropic-ai/sdk";
import type { FloorPlan } from "../types";
import type { ParsedStructure, ParsedFurniture, HybridPipelineSpec } from "./types";
import {
  VISION_EXTRACT_STRUCTURE_PROMPT,
  buildVisionFurniturePrompt,
} from "./prompts";

const VISION_MODEL = "claude-sonnet-4-6";

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
}

export async function extractStructure(
  image: Buffer,
  spec: HybridPipelineSpec,
): Promise<ParsedStructure> {
  const client = getAnthropicClient();
  const b64 = image.toString("base64");

  const contextHint =
    `Contexto: esta planta é de um apartamento de ${spec.totalArea}m² ` +
    `com ${spec.numBedrooms} quarto(s) e ${spec.numBathrooms} banheiro(s).` +
    (spec.style ? ` Estilo: ${spec.style}.` : "");

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: b64 },
          },
          {
            type: "text",
            text: `${contextHint}\n\n${VISION_EXTRACT_STRUCTURE_PROMPT}`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude Vision não retornou texto na extração estrutural.");
  }

  const raw = extractJson(textBlock.text);
  let parsed: ParsedStructure;
  try {
    parsed = JSON.parse(raw) as ParsedStructure;
  } catch {
    throw new Error(
      `Falha ao parsear JSON da extração estrutural:\n${raw.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    throw new Error("Extração estrutural não encontrou cômodos.");
  }

  parsed.confidence = parsed.confidence ?? 0.7;
  parsed.issues = parsed.issues ?? [];
  parsed.doors = parsed.doors ?? [];
  parsed.windows = parsed.windows ?? [];

  return parsed;
}

const FURNITURE_TYPES_FOR_CATALOG = [
  "sofa_2seat", "sofa_3seat", "sofa_L", "armchair", "coffee_table",
  "side_table", "tv_console", "bookshelf", "floor_lamp", "rug_rect",
  "bed_double", "bed_king", "bed_single", "bed_bunk",
  "nightstand", "dresser", "wardrobe_sliding", "wardrobe_hinged", "vanity",
  "desk_study", "desk_chair", "crib",
  "stove_4burner", "cooktop", "fridge_single", "fridge_double",
  "microwave", "dishwasher", "kitchen_sink_single", "kitchen_sink_double",
  "kitchen_island", "bar_stool", "hood", "pantry",
  "toilet", "bidet", "sink_vanity", "sink_double_vanity",
  "shower_square", "shower_rect", "bathtub_rect", "towel_rack",
  "washing_machine", "dryer", "laundry_sink", "ironing_board",
  "dining_table_4", "dining_table_6", "dining_table_8", "dining_chair", "buffet",
  "desk_L", "desk_straight", "office_chair", "filing_cabinet",
  "plant_pot", "mirror_wall", "ceiling_fan",
];

export async function extractFurniture(
  image: Buffer,
  existingPlan: FloorPlan,
): Promise<ParsedFurniture> {
  const client = getAnthropicClient();
  const b64 = image.toString("base64");

  const rooms = existingPlan.rooms.map((r) => ({
    name: r.name,
    width: r.width,
    height: r.height,
  }));

  const prompt = buildVisionFurniturePrompt(rooms, FURNITURE_TYPES_FOR_CATALOG);

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: b64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude Vision não retornou texto na extração de móveis.");
  }

  const raw = extractJson(textBlock.text);
  let parsed: ParsedFurniture;
  try {
    parsed = JSON.parse(raw) as ParsedFurniture;
  } catch {
    throw new Error(
      `Falha ao parsear JSON da extração de móveis:\n${raw.slice(0, 500)}`,
    );
  }

  parsed.items = parsed.items ?? [];
  parsed.unrecognized = parsed.unrecognized ?? [];
  parsed.confidence = parsed.confidence ?? 0.6;

  return parsed;
}
