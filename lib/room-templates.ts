// Templates de cômodo (Fase 3 do overhaul espacial).
//
// Substituem os antigos grupos de coordenadas rx/ry fixas (que ignoravam
// portas/janelas e pulavam TODOS os validadores via skipOverlapCheck) por
// listas de INTENÇÕES resolvidas pelo solver pontuado — com validação
// ligada. Cada item declara no máximo uma âncora semântica; quando omitida,
// o scorer escolhe a melhor parede/canto usando as afinidades de janela/
// porta da metadata (lib/furniture-placement.ts).
//
// Flags:
//  - optional: falha vira omissão explicada, não erro do grupo.
//  - minArea: pula o item em cômodos menores (m²) — ex.: play_table só
//    entra em quarto infantil >= 12 m².
//  - fallbackType: re-tenta uma vez com a variante (armário de abrir →
//    portas de correr quando não há folga frontal).

import type { FloorPlan, FurnitureGroup, FurnitureType, Room, ToolInputs } from "./types";
import { FURN_DEFS } from "./furniture-svgs";
import {
  solvePlacement,
  formatSolverResult,
  type Anchor,
  type PlacementIntent,
  type SolverOutput,
} from "./scene/placement-solver";

export interface TemplateItem {
  type: FurnitureType;
  label?: string;
  anchor?: Anchor;
  position?: "start" | "mid" | "end";
  optional?: boolean;
  minArea?: number;
  fallbackType?: FurnitureType;
}

export type RoomTemplate =
  | { kind: "items"; items: TemplateItem[] }
  | { kind: "millwork"; build: (room: Room) => ToolInputs["add_millwork_run"] };

/** Parede mais longa do cômodo (norte para largura, leste para altura) —
 *  herdada do engine para os payloads de cozinha. */
function longestWall(room: Room): "north" | "south" | "east" | "west" {
  return room.width >= room.height ? "north" : "east";
}

export const ROOM_TEMPLATES: Record<FurnitureGroup, RoomTemplate> = {
  // ---- Estar ----
  living_basic: {
    kind: "items",
    items: [
      { type: "sofa_3seat" },
      { type: "tv_console" },
      { type: "coffee_table", anchor: "free" },
      { type: "rug_rect", anchor: "center", optional: true },
    ],
  },
  living_full: {
    kind: "items",
    items: [
      { type: "sofa_L" },
      { type: "tv_console" },
      { type: "armchair", anchor: "free", optional: true },
      { type: "coffee_table", anchor: "free" },
      { type: "rug_rect", anchor: "center", optional: true },
      { type: "side_table", anchor: "free", optional: true },
      { type: "floor_lamp", optional: true },
      { type: "plant_pot", optional: true },
      { type: "bookshelf", optional: true, minArea: 16 },
    ],
  },

  // ---- Quartos ----
  bedroom_couple_basic: {
    kind: "items",
    items: [
      { type: "bed_double" },
      { type: "nightstand" },
      { type: "nightstand" },
      { type: "wardrobe_hinged", fallbackType: "wardrobe_sliding" },
    ],
  },
  bedroom_couple_full: {
    kind: "items",
    items: [
      { type: "bed_king" },
      { type: "nightstand" },
      { type: "nightstand" },
      { type: "wardrobe_sliding" },
      { type: "dresser", optional: true, minArea: 12 },
      { type: "vanity", optional: true, minArea: 14 },
    ],
  },
  bedroom_single_basic: {
    kind: "items",
    items: [
      { type: "bed_single" },
      { type: "wardrobe_hinged", fallbackType: "wardrobe_sliding" },
      { type: "desk_study", optional: true },
      { type: "desk_chair", anchor: "free", optional: true },
    ],
  },
  kids_room_basic: {
    kind: "items",
    items: [
      { type: "bed_child" },
      { type: "wardrobe_hinged", fallbackType: "wardrobe_sliding" },
      { type: "desk_study", optional: true },
      { type: "desk_chair", anchor: "free", optional: true },
      { type: "toy_shelf", optional: true },
      { type: "rug_rect", anchor: "center", optional: true },
      // Mesinha de brincar SÓ em quartos grandes e nunca no centro — o
      // scorer ancora em parede/canto.
      { type: "play_table", optional: true, minArea: 12 },
    ],
  },

  // ---- Cozinhas (delegam para marcenaria contínua) ----
  kitchen_basic: {
    kind: "millwork",
    build: (room) => ({
      room_name: room.name,
      wall: longestWall(room),
      type: "kitchen_counter",
      modules: [
        { kind: "fridge_niche", width: 0.7 },
        { kind: "cabinet_drawer_3", width: 0.6 },
        { kind: "cooktop_4", width: 0.6, hood_above: true },
        { kind: "cabinet_door", width: 0.5 },
        { kind: "sink_single", width: 0.6 },
      ],
      countertop: { material: "granito_preto", has_backsplash: true },
      upper_cabinets: "auto",
      finish: { body_material: "MDF_branco", door_style: "shaker" },
    }),
  },
  kitchen_full: {
    kind: "millwork",
    build: (room) => ({
      room_name: room.name,
      wall: longestWall(room),
      type: "kitchen_counter",
      modules: [
        { kind: "fridge_niche_double", width: 0.9 },
        { kind: "cabinet_drawer_4", width: 0.6 },
        { kind: "cooktop_5", width: 0.75, hood_above: true },
        { kind: "cabinet_door", width: 0.4 },
        { kind: "sink_double", width: 1.2 },
        { kind: "dishwasher_niche", width: 0.6 },
        { kind: "oven_tower", width: 0.6 },
      ],
      countertop: { material: "granito_preto", has_backsplash: true },
      upper_cabinets: "auto",
      finish: { body_material: "MDF_amadeirado", door_style: "shaker" },
    }),
  },

  // ---- Banheiros (louças pelo solver, clearances sanitárias da metadata) ----
  bathroom_basic: {
    kind: "items",
    items: [
      { type: "toilet" },
      { type: "sink_pedestal" },
      { type: "shower_square" },
    ],
  },
  bathroom_full: {
    kind: "items",
    items: [
      { type: "toilet" },
      { type: "bidet", optional: true, minArea: 4 },
      { type: "sink_double_vanity", fallbackType: "sink_vanity" },
      { type: "shower_rect", fallbackType: "shower_square" },
      { type: "bathtub_rect", optional: true, minArea: 6 },
      { type: "towel_rack", optional: true },
    ],
  },

  // ---- Jantar (mesa pede centro explicitamente — fidelidade vence o keep-out) ----
  dining_set_4: { kind: "items", items: [{ type: "dining_table_4", anchor: "center" }] },
  dining_set_6: { kind: "items", items: [{ type: "dining_table_6", anchor: "center" }] },
  dining_set_8: { kind: "items", items: [{ type: "dining_table_8", anchor: "center" }] },

  // ---- Escritório ----
  office_basic: {
    kind: "items",
    items: [
      { type: "desk_L" },
      { type: "office_chair", anchor: "free" },
      { type: "filing_cabinet", optional: true },
      { type: "bookshelf", optional: true },
    ],
  },

  // ---- Lavanderia (linha de máquinas na mesma parede via âncoras) ----
  laundry_basic: {
    kind: "items",
    items: [
      { type: "washing_machine" },
      { type: "dryer", optional: true },
      { type: "laundry_sink", optional: true },
      { type: "ironing_board", anchor: "free", optional: true },
    ],
  },

  // ---- Externos ----
  garden_basic: {
    kind: "items",
    items: [
      { type: "tree_large", anchor: "corner:NW", optional: true },
      { type: "tree_small", anchor: "corner:NE", optional: true },
      { type: "outdoor_table", anchor: "center", optional: true },
      { type: "planter_round", anchor: "corner:SW", optional: true },
      { type: "planter_round", anchor: "corner:SE", optional: true },
      { type: "fountain", optional: true },
    ],
  },
  pool_set: {
    kind: "items",
    items: [
      { type: "pool_rect", anchor: "center" },
      { type: "sun_lounger", optional: true },
      { type: "sun_lounger", optional: true },
      { type: "umbrella", anchor: "free", optional: true },
    ],
  },
  bbq_set: {
    kind: "items",
    items: [
      { type: "bbq_grill" },
      { type: "outdoor_table", anchor: "free", optional: true },
      { type: "pergola", anchor: "center", optional: true },
    ],
  },
};

export interface TemplateRunResult {
  output: SolverOutput;
  /** Itens pulados por minArea, com o motivo (para a mensagem). */
  skipped: string[];
}

/** Resolve um template em intents concretos e roda o solver. O commit dos
 *  itens fica no engine (commitSolvedItems) para reusar a re-derivação de
 *  rotação 90/270. Fallbacks: cada item com `fallbackType` que falhar é
 *  re-tentado uma vez com a variante. */
export function solveRoomTemplate(
  plan: FloorPlan,
  room: Room,
  items: TemplateItem[],
): TemplateRunResult {
  const area = room.width * room.height;
  const skipped: string[] = [];
  const intents: PlacementIntent[] = [];
  for (const item of items) {
    if (item.minArea !== undefined && area < item.minArea) {
      const def = FURN_DEFS[item.type];
      skipped.push(`${def?.label ?? item.type} (cômodo de ${area.toFixed(1)}m² < ${item.minArea}m²)`);
      continue;
    }
    intents.push({
      type: item.type,
      ...(item.label ? { label: item.label } : {}),
      ...(item.anchor ? { anchor: item.anchor } : {}),
      ...(item.position ? { position: item.position } : {}),
      // Variante tentada NA MESMA vaga (in-loop, antes dos itens seguintes
      // ocuparem as paredes) — ex.: armário de abrir → portas de correr.
      ...(item.fallbackType ? { fallbackTypes: [item.fallbackType] } : {}),
    });
  }

  let output = solvePlacement({ room, items: intents, plan });

  // Itens optional que falharam viram omissões (saem da lista de falhas).
  const optionalTypes = new Set(items.filter((i) => i.optional).map((i) => i.type));
  for (const item of items) {
    if (item.optional && item.fallbackType) optionalTypes.add(item.fallbackType);
  }

  // Backtrack de UMA rodada: se um item OBRIGATÓRIO não coube na ordem
  // gulosa (ex.: armário de 2,5m perdeu a única parede viável para a cama),
  // re-resolve do zero com os reprovados priorizados — eles escolhem a
  // parede primeiro e o resto se acomoda ao redor.
  const requiredFailed = output.failed.filter((f) => !optionalTypes.has(f.intent.type));
  if (requiredFailed.length > 0) {
    const failedTypes = new Set(requiredFailed.map((f) => f.intent.type));
    const boosted: PlacementIntent[] = intents.map((i) =>
      failedTypes.has(i.type) || (i.fallbackTypes ?? []).some((t) => failedTypes.has(t))
        ? { ...i, priorityBoost: true }
        : i
    );
    const retry = solvePlacement({ room, items: boosted, plan });
    const retryRequiredFailed = retry.failed.filter((f) => !optionalTypes.has(f.intent.type));
    if (retryRequiredFailed.length < requiredFailed.length) {
      output = retry;
    }
  }
  const omitted = output.failed.filter((f) => optionalTypes.has(f.intent.type));
  let finalOutput = output;
  if (omitted.length > 0) {
    for (const o of omitted) {
      const def = FURN_DEFS[o.intent.type];
      skipped.push(`${def?.label ?? o.intent.type} (sem posição válida: ${o.reason.split(".")[0]})`);
    }
    const remaining = output.failed.filter((f) => !optionalTypes.has(f.intent.type));
    finalOutput = { solved: output.solved, failed: remaining, ok: remaining.length === 0 };
  }

  return { output: finalOutput, skipped };
}

export { formatSolverResult };
