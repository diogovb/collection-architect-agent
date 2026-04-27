// Plan-view SVG path data for each furniture type.
// Each viewBox uses 1 unit = 1 cm so it lines up with FURN_SIZE in meters.
// Renderer (FloorPlanCanvas) scales the viewBox to the furniture rectangle in
// world pixels, then strokes/fills each path. Pen weights are post-counter-scaled
// so they stay constant in screen pixels regardless of furniture size.

import type { FurnitureType } from "./types";

export interface SvgPath {
  d: string;
  /** Stroke pen weight in screen pixels (after counter-scaling). */
  weight?: number;
  /** Fill style. If omitted, the path is not filled. */
  fill?: string;
  /** Stroke style. If omitted, the default outline color is used. */
  stroke?: string;
  /** Set to false to skip stroking entirely. */
  noStroke?: boolean;
  /** Optional dash pattern in screen pixels. */
  dash?: number[];
}

export interface FurnitureSvg {
  /** viewBox dimensions; 1 unit = 1 cm. */
  viewBox: { w: number; h: number };
  paths: SvgPath[];
}

// Reusable fill / stroke styles
const FILL_BODY = "rgba(28,38,66,0.78)"; // bluish dark — plays well with the gold trim
const FILL_LIGHT = "rgba(245,242,232,0.92)"; // off-white for sanitary/appliance
const FILL_GLASS = "rgba(126,182,255,0.18)";
const STROKE_GOLD = "rgba(198,169,98,0.95)";
const STROKE_GOLD_SOFT = "rgba(198,169,98,0.55)";
const STROKE_DARK = "rgba(15,15,25,0.85)";

// ---------- Helpers to build common shapes ----------
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h - rr}`,
    `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `L${x + rr},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - rr}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    "Z",
  ].join(" ");
}

function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`;
}

// ---------- Per-type definitions ----------

// SOFA — 2.1m × 0.9m, 3-seat, plan view with armrests, backrest line, and 3 cushions.
const sofa: FurnitureSvg = {
  viewBox: { w: 210, h: 90 },
  paths: [
    // Outer body
    { d: rrect(0, 0, 210, 90, 8), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Backrest line (top edge of seat area)
    { d: "M22,18 L188,18", stroke: STROKE_GOLD, weight: 1.0 },
    // Armrests
    { d: "M22,18 L22,86", stroke: STROKE_GOLD, weight: 1.0 },
    { d: "M188,18 L188,86", stroke: STROKE_GOLD, weight: 1.0 },
    // Cushion separators
    { d: "M77,22 L77,86", stroke: STROKE_GOLD_SOFT, weight: 0.8 },
    { d: "M133,22 L133,86", stroke: STROKE_GOLD_SOFT, weight: 0.8 },
    // Subtle cushion crowns
    { d: "M30,26 Q53,22 75,26", stroke: STROKE_GOLD_SOFT, weight: 0.6, noStroke: false },
    { d: "M80,26 Q105,22 130,26", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    { d: "M135,26 Q158,22 180,26", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
  ],
};

// BED — 1.6m × 2.0m queen / casal, plan view from above.
const bed: FurnitureSvg = {
  viewBox: { w: 160, h: 200 },
  paths: [
    // Mattress / outer frame
    { d: rrect(0, 0, 160, 200, 6), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Headboard band (top of bed)
    { d: rrect(0, 0, 160, 18, 4), fill: "rgba(198,169,98,0.18)", stroke: STROKE_GOLD, weight: 1.0 },
    // Pillows
    { d: rrect(8, 22, 66, 26, 3), fill: FILL_LIGHT, stroke: STROKE_GOLD, weight: 0.8 },
    { d: rrect(86, 22, 66, 26, 3), fill: FILL_LIGHT, stroke: STROKE_GOLD, weight: 0.8 },
    // Comforter fold suggestion (line across mid-bed)
    { d: "M6,140 L154,140", stroke: STROKE_GOLD_SOFT, weight: 0.7, dash: [4, 3] },
  ],
};

// DINING TABLE — 1.4m × 0.9m with 4 chairs around it.
const table: FurnitureSvg = {
  viewBox: { w: 140, h: 90 },
  paths: [
    // Table top
    { d: rrect(20, 18, 100, 54, 4), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Inner inset (woodgrain hint)
    { d: rrect(26, 24, 88, 42, 2), stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    // Chairs (4) — side view squares around the table
    { d: rrect(34, 0, 32, 14, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    { d: rrect(74, 0, 32, 14, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    { d: rrect(34, 76, 32, 14, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    { d: rrect(74, 76, 32, 14, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
  ],
};

// TV / RACK — 1.6m × 0.45m, low cabinet with TV face.
const tv: FurnitureSvg = {
  viewBox: { w: 160, h: 45 },
  paths: [
    // Rack body
    { d: rrect(0, 18, 160, 27, 3), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // TV screen on top (filled black)
    { d: rrect(20, 0, 120, 16, 2), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 1.0 },
    // Screen reflection hint
    { d: "M28,4 L60,4", stroke: "rgba(255,255,255,0.25)", weight: 0.8 },
    // Drawer split lines on rack
    { d: "M53,18 L53,45", stroke: STROKE_GOLD_SOFT, weight: 0.7 },
    { d: "M107,18 L107,45", stroke: STROKE_GOLD_SOFT, weight: 0.7 },
  ],
};

// SINK — 0.6m × 0.45m. Used for both bathroom vanity and small kitchen sinks.
const sink: FurnitureSvg = {
  viewBox: { w: 60, h: 45 },
  paths: [
    // Counter / vanity surface
    { d: rrect(0, 0, 60, 45, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Basin (rounded inset)
    { d: rrect(10, 9, 40, 28, 4), fill: FILL_LIGHT, stroke: STROKE_GOLD, weight: 1.0 },
    // Drain
    { d: circle(30, 23, 2), fill: STROKE_DARK, stroke: STROKE_DARK, weight: 0.6 },
    // Faucet stub
    { d: "M28,3 L28,8 L32,8 L32,3 Z", fill: STROKE_GOLD, stroke: STROKE_GOLD, weight: 0.6 },
    // Faucet spout (curve)
    { d: "M30,8 Q30,16 30,21", stroke: STROKE_GOLD, weight: 1.0 },
  ],
};

// TOILET — 0.4m × 0.65m, classic plan with tank + bowl + seat ring.
const toilet: FurnitureSvg = {
  viewBox: { w: 40, h: 65 },
  paths: [
    // Tank
    { d: rrect(2, 0, 36, 18, 2), fill: FILL_LIGHT, stroke: STROKE_GOLD, weight: 1.2 },
    // Flush button
    { d: rrect(16, 4, 8, 4, 1), fill: STROKE_GOLD_SOFT, stroke: STROKE_GOLD, weight: 0.6 },
    // Seat ring (outer)
    { d: ellipse(20, 42, 17, 21), fill: FILL_LIGHT, stroke: STROKE_GOLD, weight: 1.2 },
    // Bowl interior
    { d: ellipse(20, 43, 12, 16), stroke: STROKE_GOLD, weight: 0.9 },
  ],
};

// SHOWER — 0.9m × 0.9m box with diagonal hatching, drain, and glass enclosure.
const shower: FurnitureSvg = {
  viewBox: { w: 90, h: 90 },
  paths: [
    // Tile floor
    { d: rrect(0, 0, 90, 90, 2), fill: FILL_GLASS, stroke: STROKE_GOLD, weight: 1.2 },
    // Diagonal hatch (tile pattern)
    { d: "M0,30 L30,0", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    { d: "M0,60 L60,0", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    { d: "M0,90 L90,0", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    { d: "M30,90 L90,30", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    { d: "M60,90 L90,60", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    // Drain
    { d: rrect(38, 38, 14, 14, 1), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 0.7 },
    { d: "M40,42 L50,42 M40,46 L50,46 M40,50 L50,50", stroke: STROKE_GOLD, weight: 0.5 },
    // Glass enclosure indication (extra-bold front edge)
    { d: "M0,90 L90,90", stroke: "rgba(126,182,255,0.85)", weight: 2.0 },
  ],
};

// STOVE — 0.6m × 0.6m, 4-burner cooktop.
const stove: FurnitureSvg = {
  viewBox: { w: 60, h: 60 },
  paths: [
    // Body
    { d: rrect(0, 0, 60, 60, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Burners (4)
    { d: circle(18, 18, 7), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 1.0 },
    { d: circle(42, 18, 7), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 1.0 },
    { d: circle(18, 42, 7), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 1.0 },
    { d: circle(42, 42, 7), fill: STROKE_DARK, stroke: STROKE_GOLD, weight: 1.0 },
    // Burner inner rings
    { d: circle(18, 18, 3), stroke: STROKE_GOLD, weight: 0.6 },
    { d: circle(42, 18, 3), stroke: STROKE_GOLD, weight: 0.6 },
    { d: circle(18, 42, 3), stroke: STROKE_GOLD, weight: 0.6 },
    { d: circle(42, 42, 3), stroke: STROKE_GOLD, weight: 0.6 },
    // Control knobs row hint
    { d: "M6,4 L54,4", stroke: STROKE_GOLD_SOFT, weight: 0.5, dash: [2, 2] },
  ],
};

// FRIDGE — 0.7m × 0.7m, double door (freezer top, fridge bottom).
const fridge: FurnitureSvg = {
  viewBox: { w: 70, h: 70 },
  paths: [
    { d: rrect(0, 0, 70, 70, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Freezer / fridge split
    { d: "M0,24 L70,24", stroke: STROKE_GOLD, weight: 1.0 },
    // Handles
    { d: rrect(60, 6, 4, 14, 1), fill: STROKE_GOLD, stroke: STROKE_GOLD, weight: 0.6 },
    { d: rrect(60, 30, 4, 32, 1), fill: STROKE_GOLD, stroke: STROKE_GOLD, weight: 0.6 },
    // Brand strip
    { d: "M6,16 L20,16", stroke: STROKE_GOLD_SOFT, weight: 0.5 },
  ],
};

// COUNTER — 1.5m × 0.6m, plain kitchen counter.
const counter: FurnitureSvg = {
  viewBox: { w: 150, h: 60 },
  paths: [
    { d: rrect(0, 0, 150, 60, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Counter front-edge accent
    { d: "M0,56 L150,56", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
    // Subtle modular splits
    { d: "M50,0 L50,60", stroke: STROKE_GOLD_SOFT, weight: 0.5, dash: [3, 3] },
    { d: "M100,0 L100,60", stroke: STROKE_GOLD_SOFT, weight: 0.5, dash: [3, 3] },
  ],
};

// KITCHEN ISLAND — 1.6m × 0.9m with seating overhang line.
const island: FurnitureSvg = {
  viewBox: { w: 160, h: 90 },
  paths: [
    // Body
    { d: rrect(0, 0, 160, 90, 4), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Inner counter line
    { d: rrect(4, 4, 152, 82, 2), stroke: STROKE_GOLD_SOFT, weight: 0.7 },
    // Stool seating overhang (3 stools facing the long side)
    { d: circle(42, 96, 7), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    { d: circle(80, 96, 7), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    { d: circle(118, 96, 7), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
    // Sink / stove inset hint
    { d: rrect(58, 16, 44, 28, 2), stroke: STROKE_GOLD_SOFT, weight: 0.6 },
  ],
};

// WARDROBE — 2.0m × 0.6m, sliding doors indicated by arrows along the front edge.
const wardrobe: FurnitureSvg = {
  viewBox: { w: 200, h: 60 },
  paths: [
    { d: rrect(0, 0, 200, 60, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.4 },
    // Door splits (3 doors)
    { d: "M67,0 L67,60", stroke: STROKE_GOLD, weight: 0.9 },
    { d: "M133,0 L133,60", stroke: STROKE_GOLD, weight: 0.9 },
    // Sliding-door track lines along the front edge
    { d: "M0,52 L200,52", stroke: STROKE_GOLD_SOFT, weight: 0.6, dash: [4, 3] },
    { d: "M0,56 L200,56", stroke: STROKE_GOLD_SOFT, weight: 0.6, dash: [4, 3] },
    // Slide direction arrow hints
    { d: "M30,46 L40,46 L37,43 M40,46 L37,49", stroke: STROKE_GOLD, weight: 0.7 },
    { d: "M170,46 L160,46 L163,43 M160,46 L163,49", stroke: STROKE_GOLD, weight: 0.7 },
  ],
};

// DESK — 1.2m × 0.6m, with a chair behind it.
const desk: FurnitureSvg = {
  viewBox: { w: 120, h: 60 },
  paths: [
    // Desktop
    { d: rrect(0, 0, 120, 42, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Drawer line
    { d: "M84,0 L84,42 M84,12 L120,12", stroke: STROKE_GOLD_SOFT, weight: 0.7 },
    // Pull
    { d: rrect(96, 4, 12, 4, 1), fill: STROKE_GOLD, stroke: STROKE_GOLD, weight: 0.5 },
    // Chair
    { d: rrect(40, 46, 40, 14, 3), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 0.9 },
  ],
};

// CHAIR — 0.5m × 0.5m, simple seat with backrest line.
const chair: FurnitureSvg = {
  viewBox: { w: 50, h: 50 },
  paths: [
    { d: rrect(4, 4, 42, 42, 4), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.1 },
    // Backrest line
    { d: "M4,12 L46,12", stroke: STROKE_GOLD, weight: 0.8 },
  ],
};

// BOOKSHELF — 1.0m × 0.4m. Shelves with vertical splits.
const bookshelf: FurnitureSvg = {
  viewBox: { w: 100, h: 40 },
  paths: [
    { d: rrect(0, 0, 100, 40, 1), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Vertical compartment splits
    { d: "M25,0 L25,40 M50,0 L50,40 M75,0 L75,40", stroke: STROKE_GOLD_SOFT, weight: 0.7 },
    // Books / titles indication (small horizontal ticks)
    { d: "M4,8 L21,8 M4,16 L21,16 M4,24 L21,24 M4,32 L21,32", stroke: STROKE_GOLD_SOFT, weight: 0.5 },
    { d: "M29,8 L46,8 M29,16 L46,16 M29,24 L46,24 M29,32 L46,32", stroke: STROKE_GOLD_SOFT, weight: 0.5 },
    { d: "M54,8 L71,8 M54,16 L71,16 M54,24 L71,24 M54,32 L71,32", stroke: STROKE_GOLD_SOFT, weight: 0.5 },
    { d: "M79,8 L96,8 M79,16 L96,16 M79,24 L96,24 M79,32 L96,32", stroke: STROKE_GOLD_SOFT, weight: 0.5 },
  ],
};

// WASHING MACHINE — 0.6m × 0.6m, top-loader plan with drum circle.
const washing_machine: FurnitureSvg = {
  viewBox: { w: 60, h: 60 },
  paths: [
    { d: rrect(0, 0, 60, 60, 2), fill: FILL_BODY, stroke: STROKE_GOLD, weight: 1.2 },
    // Drum
    { d: circle(30, 30, 20), fill: "rgba(15,15,25,0.55)", stroke: STROKE_GOLD, weight: 1.0 },
    // Inner ring
    { d: circle(30, 30, 15), stroke: STROKE_GOLD_SOFT, weight: 0.7 },
    // Drum center
    { d: circle(30, 30, 2), fill: STROKE_GOLD, stroke: STROKE_GOLD, weight: 0.5 },
    // Control panel hint at top
    { d: "M6,4 L26,4 M34,4 L54,4", stroke: STROKE_GOLD_SOFT, weight: 0.6 },
  ],
};

export const FURNITURE_SVGS: Record<FurnitureType, FurnitureSvg> = {
  sofa,
  bed,
  table,
  tv,
  sink,
  toilet,
  shower,
  stove,
  fridge,
  counter,
  island,
  wardrobe,
  desk,
  chair,
  bookshelf,
  washing_machine,
};

export const DEFAULT_OUTLINE_STROKE = STROKE_GOLD;
