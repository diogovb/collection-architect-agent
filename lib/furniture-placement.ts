// Default placement metadata for every furniture type — drives the engine
// validators (Phase C) and the generative solver (Phase E).
//
// Strategy: ~30 types get explicit metadata; everything else falls back to
// category-based defaults derived from the type name. Manual refinements
// can be added incrementally — every entry here is data, no logic.

import type { FurniturePlacement, FurnitureType } from "./types";

const NO_CLEARANCE = { front: 0, back: 0, left: 0, right: 0 };

/** Hand-curated metadata for the items where bad placement causes the
 *  most visible damage (geladeira na frente da porta, sofá no meio do
 *  cômodo, vaso solto, etc.). */
const EXPLICIT: Partial<Record<FurnitureType, FurniturePlacement>> = {
  // ---- Sala ----
  sofa: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    relations: [{ withType: "tv", minDist: 1.8, maxDist: 3.5, hint: "distância sofá–TV (Neufert)" }],
    category: "anchor",
  },
  sofa_2seat: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.3, right: 0.3 },
    relations: [{ withType: "tv", minDist: 1.6, maxDist: 3.0, hint: "distância sofá–TV" }],
    category: "anchor",
  },
  sofa_3seat: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    relations: [{ withType: "tv", minDist: 1.8, maxDist: 3.5, hint: "distância sofá–TV" }],
    category: "anchor",
  },
  sofa_L: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.9, back: 0, left: 0.3, right: 0.3 },
    relations: [{ withType: "tv", minDist: 2.0, maxDist: 4.0, hint: "distância sofá-L–TV" }],
    category: "anchor",
  },
  armchair: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.6, back: 0.3, left: 0.3, right: 0.3 },
    category: "filler",
  },
  tv: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 1.6, back: 0, left: 0, right: 0 },
    category: "anchor",
    windowAffinity: "avoid",
  },
  tv_console: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 1.0, back: 0, left: 0, right: 0 },
    category: "anchor",
    windowAffinity: "avoid",
  },
  bookshelf: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0, right: 0 },
    category: "filler",
    windowAffinity: "avoid",
  },
  coffee_table: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.4, back: 0.4, left: 0.4, right: 0.4 },
    category: "filler",
    relations: [
      { withType: "sofa_3seat", minDist: 0.3, maxDist: 0.9, hint: "mesa de centro na frente do sofá" },
      { withType: "sofa_L", minDist: 0.3, maxDist: 0.9, hint: "mesa de centro na frente do sofá" },
      { withType: "sofa", minDist: 0.3, maxDist: 0.9, hint: "mesa de centro na frente do sofá" },
    ],
  },
  side_table: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.3, back: 0, left: 0.3, right: 0.3 },
    category: "filler",
  },
  rug_rect: {
    anchorTo: "free",
    wallFace: "any",
    clearance: NO_CLEARANCE,
    category: "rug",
  },

  // ---- Quarto ----
  bed: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.6, right: 0.6 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  bed_single: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.6, right: 0.6 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  bed_double: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.6, right: 0.6 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  bed_king: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.7, right: 0.7 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  bed_bunk: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.4, right: 0.4 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  bed_child: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.5, back: 0, left: 0.4, right: 0.4 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  crib: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.5, back: 0, left: 0.4, right: 0.4 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  nightstand: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.5, back: 0, left: 0, right: 0 },
    relations: [
      { withType: "bed_double", minDist: 0, maxDist: 0.4, hint: "criado-mudo ao lado da cama" },
      { withType: "bed_king", minDist: 0, maxDist: 0.4, hint: "criado-mudo ao lado da cama" },
      { withType: "bed_single", minDist: 0, maxDist: 0.4, hint: "criado-mudo ao lado da cama" },
    ],
    category: "filler",
  },
  dresser: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "filler",
  },
  wardrobe: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0, right: 0 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  wardrobe_sliding: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0, right: 0 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  wardrobe_hinged: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.9, back: 0, left: 0, right: 0 },
    category: "anchor",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  vanity: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "filler",
    windowAffinity: "prefer",
  },

  // ---- Cozinha ----
  stove: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    relations: [
      { withType: "kitchen_sink_single", minDist: 0.6, maxDist: 2.7, hint: "fogão↔pia (triângulo de cozinha, Neufert)" },
      { withType: "fridge_single", minDist: 0.6, maxDist: 2.7, hint: "fogão↔geladeira (triângulo)" },
    ],
    category: "appliance",
  },
  stove_4burner: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    relations: [
      { withType: "kitchen_sink_single", minDist: 0.6, maxDist: 2.7, hint: "fogão↔pia" },
      { withType: "fridge_single", minDist: 0.6, maxDist: 2.7, hint: "fogão↔geladeira" },
    ],
    category: "appliance",
  },
  stove_5burner: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    relations: [
      { withType: "kitchen_sink_double", minDist: 0.6, maxDist: 2.7, hint: "fogão↔pia" },
      { withType: "fridge_double", minDist: 0.6, maxDist: 2.7, hint: "fogão↔geladeira" },
    ],
    category: "appliance",
  },
  cooktop: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.3, right: 0.3 },
    category: "appliance",
  },
  fridge: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.9, back: 0, left: 0.05, right: 0.05 },
    relations: [
      { withType: "kitchen_sink_single", minDist: 0.6, maxDist: 2.7, hint: "geladeira↔pia (triângulo)" },
    ],
    category: "appliance",
  },
  fridge_single: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.9, back: 0, left: 0.05, right: 0.05 },
    relations: [
      { withType: "kitchen_sink_single", minDist: 0.6, maxDist: 2.7, hint: "geladeira↔pia" },
    ],
    category: "appliance",
  },
  fridge_double: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 1.0, back: 0, left: 0.05, right: 0.05 },
    relations: [
      { withType: "kitchen_sink_double", minDist: 0.6, maxDist: 2.7, hint: "geladeira↔pia" },
    ],
    category: "appliance",
  },
  sink: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.2, right: 0.2 },
    category: "sanitary",
  },
  kitchen_sink_single: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.2, right: 0.2 },
    category: "appliance",
  },
  kitchen_sink_double: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.8, back: 0, left: 0.2, right: 0.2 },
    category: "appliance",
  },
  microwave: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.4, back: 0, left: 0, right: 0 },
    category: "appliance",
  },
  dishwasher: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "appliance",
  },
  hood: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0, back: 0, left: 0, right: 0 },
    category: "appliance",
  },
  pantry: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "filler",
    windowAffinity: "avoid",
  },
  counter: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.9, back: 0, left: 0, right: 0 },
    category: "filler",
  },
  island: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.9, back: 0.9, left: 0.9, right: 0.9 },
    category: "filler",
  },
  kitchen_island: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.9, back: 0.9, left: 0.9, right: 0.9 },
    category: "filler",
  },
  bar_stool: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.5, back: 0.4, left: 0.1, right: 0.1 },
    category: "filler",
  },

  // ---- Banheiro ----
  toilet: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.2, right: 0.2 },
    category: "sanitary",
    doorAffinity: "far",
  },
  bidet: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.2, right: 0.2 },
    category: "sanitary",
    doorAffinity: "far",
    relations: [{ withType: "toilet", minDist: 0.25, maxDist: 0.6, hint: "bidê ao lado do vaso" }],
  },
  sink_pedestal: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.2, right: 0.2 },
    category: "sanitary",
  },
  sink_vanity: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "sanitary",
  },
  sink_double_vanity: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "sanitary",
  },
  shower: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
    category: "sanitary",
  },
  shower_square: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
    category: "sanitary",
  },
  shower_rect: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.05, right: 0.05 },
    category: "sanitary",
  },
  bathtub_rect: {
    anchorTo: "wall-or-corner",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "sanitary",
  },
  bathtub_corner: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "sanitary",
  },
  towel_rack: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.3, back: 0, left: 0, right: 0 },
    category: "decor",
  },

  // ---- Lavanderia ----
  washing_machine: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.05, right: 0.05 },
    category: "appliance",
  },
  dryer: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0.05, right: 0.05 },
    category: "appliance",
  },
  laundry_sink: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.6, back: 0, left: 0.2, right: 0.2 },
    category: "sanitary",
  },
  ironing_board: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.6, back: 0.3, left: 0.3, right: 0.3 },
    category: "filler",
  },

  // ---- Jantar ----
  table: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 },
    category: "anchor",
  },
  dining_table_4: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 },
    category: "anchor",
  },
  dining_table_6: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 },
    category: "anchor",
  },
  dining_table_8: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 },
    category: "anchor",
  },
  dining_table_round_4: {
    anchorTo: "free",
    wallFace: "any",
    clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 },
    category: "anchor",
  },
  dining_chair: {
    anchorTo: "free",
    wallFace: "any",
    clearance: NO_CLEARANCE,
    category: "filler",
  },
  buffet: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "filler",
  },

  // ---- Escritório ----
  desk: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.75, back: 0, left: 0.3, right: 0.3 },
    category: "anchor",
    windowAffinity: "prefer",
  },
  desk_L: {
    anchorTo: "corner",
    wallFace: "back",
    clearance: { front: 0.75, back: 0, left: 0.3, right: 0.3 },
    category: "anchor",
    windowAffinity: "prefer",
  },
  desk_straight: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.75, back: 0, left: 0.3, right: 0.3 },
    category: "anchor",
    windowAffinity: "prefer",
  },
  desk_study: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.75, back: 0, left: 0.2, right: 0.2 },
    category: "anchor",
    windowAffinity: "prefer",
  },
  desk_chair: {
    anchorTo: "free",
    wallFace: "any",
    clearance: NO_CLEARANCE,
    category: "filler",
    relations: [
      { withType: "desk_study", minDist: 0, maxDist: 0.6, hint: "cadeira junto da escrivaninha" },
      { withType: "desk", minDist: 0, maxDist: 0.6, hint: "cadeira junto da escrivaninha" },
    ],
  },
  office_chair: {
    anchorTo: "free",
    wallFace: "any",
    clearance: NO_CLEARANCE,
    category: "filler",
    relations: [
      { withType: "desk_L", minDist: 0, maxDist: 0.6, hint: "cadeira junto da mesa" },
      { withType: "desk_straight", minDist: 0, maxDist: 0.6, hint: "cadeira junto da mesa" },
    ],
  },
  filing_cabinet: {
    anchorTo: "wall",
    wallFace: "back",
    clearance: { front: 0.7, back: 0, left: 0, right: 0 },
    category: "filler",
    windowAffinity: "avoid",
    doorAffinity: "far",
  },
  chair: {
    anchorTo: "free",
    wallFace: "any",
    clearance: NO_CLEARANCE,
    category: "filler",
  },
};

/** Heuristic fallback: derive metadata from the type-name pattern when no
 *  explicit entry exists. Keeps the table small while still covering 95+
 *  furniture types reasonably. */
function fallbackByName(t: FurnitureType): FurniturePlacement {
  const n = String(t).toLowerCase();
  // Rugs / decor — never anchor, never block.
  if (/^rug|carpet|mat|plant_pot|mirror_wall|towel_rack/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: NO_CLEARANCE, category: n.startsWith("plant") || n.startsWith("mirror") ? "decor" : "rug" };
  }
  // Lighting / electrical — wall- or ceiling-mounted, no footprint.
  if (/^light|^ceiling_fan|power_outlet|switch/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: NO_CLEARANCE, category: "decor" };
  }
  // Floor lamps live anywhere.
  if (/^floor_lamp/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.2, back: 0.2, left: 0.2, right: 0.2 }, category: "filler" };
  }
  // Outdoor — pools, hot tubs etc are anchors with big clearance.
  if (/^pool_|^hot_tub|^bbq|^pergola|^fountain/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.6, back: 0.6, left: 0.6, right: 0.6 }, category: "anchor" };
  }
  if (/^tree_|^planter_/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.3, back: 0.3, left: 0.3, right: 0.3 }, category: "decor" };
  }
  // Outdoor furniture — free standing.
  if (/^outdoor_table|^sun_lounger|^umbrella/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 }, category: "filler" };
  }
  // Commercial counters / desks default to wall.
  if (/^reception|^checkout|^bar_counter|^display_shelf|^cubicle|^commercial_stove/.test(n)) {
    return { anchorTo: "wall", wallFace: "back", clearance: { front: 0.9, back: 0, left: 0, right: 0 }, category: "anchor" };
  }
  if (/^waiting_chair|^dining_chair/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: NO_CLEARANCE, category: "filler" };
  }
  if (/^restaurant_table|^meeting_table/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.75, back: 0.75, left: 0.75, right: 0.75 }, category: "anchor" };
  }
  // Toy shelf / play table — kids stuff, default free.
  if (/^toy_shelf/.test(n)) {
    return { anchorTo: "wall", wallFace: "back", clearance: { front: 0.5, back: 0, left: 0, right: 0 }, category: "filler" };
  }
  if (/^play_table/.test(n)) {
    return { anchorTo: "free", wallFace: "any", clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 }, category: "filler" };
  }
  // Generic fallback: filler, free, modest clearance.
  return { anchorTo: "free", wallFace: "any", clearance: { front: 0.4, back: 0.2, left: 0.2, right: 0.2 }, category: "filler" };
}

/** Returns the placement metadata for a given furniture type — explicit
 *  entry preferred, name-pattern fallback otherwise. Always returns; never
 *  null. */
export function getPlacement(type: FurnitureType): FurniturePlacement {
  const explicit = EXPLICIT[type];
  if (explicit) return explicit;
  return fallbackByName(type);
}

/** True when the piece counts as a rug (skipped by overlap checks). */
export function isRugByPlacement(type: FurnitureType): boolean {
  return getPlacement(type).category === "rug";
}
