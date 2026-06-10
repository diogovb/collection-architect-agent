// Editorial palette for the canvas renderer.

export const PALETTE = {
  paper: "#F4EFE6",
  bg: "#FAF7F0",
  ink: "#1F1B16",
  inkSoft: "#4A4338",
  muted: "#8C8478",
  line: "#E6DFD2",
  accent: "#B8552E",
  accentSoft: "#F2DDD0",
  wallFill: "#E6DFD2",
  wallEdge: "#1F1B16",
  // Furniture palette — calibrated terra pigments (Style Guide §2.3).
  // Each piece uses ONE token; internal details are stroke-on-fill.
  furnUpholstery: "#D9CFB8",     // sofá principal
  furnUpholstery2: "#CBBFA8",    // poltronas
  furnWoodLight: "#BFAE8E",      // cadeiras de madeira
  furnWoodMid: "#A8967A",        // mesa de jantar
  furnWoodDark: "#3F362A",       // estante TV, marcenaria escura
  furnStoneDark: "#3A332A",      // bancada, cooktop
  furnCoffee: "#C9BC9F",         // mesa de centro
  furnIslandTop: "#F0E8D6",      // tampo ilha (mármore)
  furnAppliance: "#E8DEC8",      // geladeira, vaso, cuba
  // Carpet base (pattern fill behind tapetes).
  floorCarpetBase: "#E8DDC8",
  floorWood: "#EFE8DB",
  floorWoodLine: "#1F1B16",
  floorTile: "#EEE6D6",
  floorCarpet: "#E8DDC8",
  floorPedra: "#D6CBB6",
  floorMarmore: "#F0EAE0",
  floorGrama: "#C7D6B5",
  floorDeck: "#C9B89C",
  selectionStroke: "#B8552E",
  hoverStroke: "#D78457",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Rough mapping from material id (lib/types FloorMaterial) → fill color. */
export function floorColor(material: string): string {
  switch (material) {
    case "madeira": return PALETTE.floorWood;
    case "porcelanato": case "ceramica": return PALETTE.floorTile;
    case "carpete": return PALETTE.floorCarpet;
    case "pedra": return PALETTE.floorPedra;
    case "marmore": return PALETTE.floorMarmore;
    case "grama": return PALETTE.floorGrama;
    case "deck": return PALETTE.floorDeck;
    case "cimento": return "#D6CFC1";
    default: return PALETTE.floorWood;
  }
}
