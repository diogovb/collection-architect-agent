// Style Guide §6.2 — map a FurnitureNode to (a) its top-down palette token,
// (b) whether it deserves a softShadow filter, and (c) what kind of internal
// detail rendering to apply.
//
// We classify by `catalogId` (e.g. "sofa_3seat", "dining_table_8"). The
// classification keeps the SVG renderer free of nested switch ladders.

import type { FurnitureNode } from "@/lib/scene/types";
import { PALETTE } from "../materials";

export type FurnitureKind =
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "dining-table"
  | "side-table"
  | "chair"
  | "bar-stool"
  | "tv-console"
  | "bookshelf"
  | "wardrobe"
  | "desk"
  | "bed"
  | "nightstand"
  | "dresser"
  | "rug"
  | "lamp"
  | "kitchen-counter"
  | "kitchen-island"
  | "fridge"
  | "stove"
  | "sink"
  | "appliance"
  | "toilet"
  | "shower"
  | "bathtub"
  | "generic";

export interface FurnitureStyle {
  kind: FurnitureKind;
  fill: string;
  /** Drop a soft shadow under the piece (Style Guide §6.1: only "things that
   *  rest on the floor" — sofa, dining table, coffee table, island). */
  shadow: boolean;
  /** Corner radius in WORLD units (metres). 0 = sharp corner. */
  radius: number;
}

/** Resolve a FurnitureNode → palette token + render flags. */
export function styleOf(f: FurnitureNode): FurnitureStyle {
  const id = (f.catalogId || "").toLowerCase();
  const label = (f.label || "").toLowerCase();
  const m = (re: RegExp) => re.test(id) || re.test(label);

  // ---- Soft seating ----
  if (m(/sofa|couch/))
    return { kind: "sofa", fill: PALETTE.furnUpholstery, shadow: true, radius: 0.06 };
  if (m(/armchair|poltrona/))
    return { kind: "armchair", fill: PALETTE.furnUpholstery2, shadow: false, radius: 0.06 };

  // ---- Tables ----
  if (m(/coffee_?table|mesa.?centro/))
    return { kind: "coffee-table", fill: PALETTE.furnCoffee, shadow: true, radius: 0.04 };
  if (m(/dining_?table|mesa.?jantar/))
    return { kind: "dining-table", fill: PALETTE.furnWoodMid, shadow: true, radius: 0.03 };
  if (m(/side_?table|mesa.?lateral/))
    return { kind: "side-table", fill: PALETTE.furnWoodLight, shadow: false, radius: 0.03 };

  // ---- Chairs ----
  if (m(/chair|cadeira/))
    return { kind: "chair", fill: PALETTE.furnWoodLight, shadow: false, radius: 0.04 };
  if (m(/stool|banqueta/))
    return { kind: "bar-stool", fill: PALETTE.furnWoodLight, shadow: false, radius: 999 };

  // ---- Tall storage / electronics ----
  if (m(/tv_?console|credenza|estante.?tv/))
    return { kind: "tv-console", fill: PALETTE.furnWoodDark, shadow: false, radius: 0.02 };
  if (m(/bookshelf|estante|shelf/))
    return { kind: "bookshelf", fill: PALETTE.furnWoodDark, shadow: false, radius: 0 };
  if (m(/wardrobe|guarda.?roupa|closet/))
    return { kind: "wardrobe", fill: PALETTE.furnWoodMid, shadow: false, radius: 0 };
  if (m(/desk|escrivaninha|mesa.?escritorio/))
    return { kind: "desk", fill: PALETTE.furnWoodMid, shadow: true, radius: 0.02 };

  // ---- Bedroom ----
  if (m(/bed_|^bed$|cama/))
    return { kind: "bed", fill: PALETTE.furnUpholstery, shadow: true, radius: 0.06 };
  if (m(/nightstand|criado.?mudo/))
    return { kind: "nightstand", fill: PALETTE.furnWoodLight, shadow: false, radius: 0.02 };
  if (m(/dresser|comoda/))
    return { kind: "dresser", fill: PALETTE.furnWoodMid, shadow: false, radius: 0.02 };

  // ---- Floor coverings ----
  if (m(/rug|tapete|carpet/))
    return { kind: "rug", fill: PALETTE.floorCarpetBase, shadow: false, radius: 0 };

  // ---- Lighting ----
  if (m(/lamp|luminaria|pendant|pendente/))
    return { kind: "lamp", fill: "transparent", shadow: false, radius: 999 };

  // ---- Kitchen ----
  if (m(/kitchen_island|ilha/))
    return { kind: "kitchen-island", fill: PALETTE.furnIslandTop, shadow: true, radius: 0.02 };
  if (m(/counter|bancada/))
    return { kind: "kitchen-counter", fill: PALETTE.furnStoneDark, shadow: false, radius: 0.02 };
  if (m(/fridge|geladeira/))
    return { kind: "fridge", fill: PALETTE.furnAppliance, shadow: false, radius: 0.02 };
  if (m(/stove|cooktop|fogao/))
    return { kind: "stove", fill: PALETTE.furnStoneDark, shadow: false, radius: 0.02 };
  if (m(/sink|cuba|pia/))
    return { kind: "sink", fill: PALETTE.furnAppliance, shadow: false, radius: 0.02 };
  if (m(/microwave|dishwasher|hood|pantry|appliance/))
    return { kind: "appliance", fill: PALETTE.furnAppliance, shadow: false, radius: 0.02 };

  // ---- Bathroom ----
  if (m(/toilet|vaso|bidet/))
    return { kind: "toilet", fill: PALETTE.furnAppliance, shadow: false, radius: 0.02 };
  if (m(/shower|chuveiro|box/))
    return { kind: "shower", fill: PALETTE.floorTile, shadow: false, radius: 0 };
  if (m(/bathtub|banheira/))
    return { kind: "bathtub", fill: PALETTE.furnAppliance, shadow: true, radius: 0.06 };

  // ---- Fallback ----
  return { kind: "generic", fill: PALETTE.furnUpholstery, shadow: false, radius: 0.04 };
}
