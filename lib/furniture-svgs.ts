// Architectural plan-view symbols for every furniture / equipment type.
// Path coordinates are expressed in CENTIMETERS within a viewBox of size
// (sizeM.w * 100) x (sizeM.h * 100). The canvas multiplies by PX_PER_M / 100
// to render at the right scale.
//
// Style guide (AutoCAD-ish):
//   - Heavy lines (1.6–1.9px) for object outlines
//   - Medium lines (0.9–1.1px) for internal subdivisions
//   - Fine lines (0.5–0.7px) for surface texture / patterns
//   - Off-white fill (#f5f3ec) reads as "white object" against any floor
//   - Dark fills (#2c2f3a) for appliances (fogão, geladeira, micro-ondas)
//   - Dashed lines for projection elements (rugs, hood, pergola)

import type { FurnitureType } from "./types";

export interface PathSpec {
  d: string;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number; // px
  dashed?: boolean;
  /** circle helper: { cx, cy, r } shorthand instead of d */
  circle?: { cx: number; cy: number; r: number };
}

export interface FurnitureDef {
  /** real-world size in meters */
  sizeM: { w: number; h: number };
  /** PT-BR label */
  label: string;
  /** category for prompt grouping */
  category: string;
  /** ordered drawing operations (back to front) */
  paths: PathSpec[];
}

// ---------- Style tokens ----------
const BODY = "#f5f3ec";
const BODY_SOFT = "#ebe6d8";
const BODY_DARK = "#2c2f3a";
const APPLIANCE = "#3a3f4f";
const APPLIANCE_LIGHT = "#5a6172";
const STROKE = "#141826";
const STROKE_FINE = "rgba(20,24,38,0.55)";
const GLASS = "rgba(150,200,240,0.55)";
const WATER = "rgba(120,170,220,0.55)";
const WATER_DARK = "rgba(80,130,190,0.85)";
const GREEN = "rgba(110,165,90,0.72)";
const GREEN_DARK = "rgba(70,120,55,0.95)";
const STONE = "#cfc8b8";

// ---------- Helpers (terse path builders) ----------
function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
}
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1} ${y1}L${x2} ${y2}`;
}
function circ(cx: number, cy: number, r: number): PathSpec {
  return { circle: { cx, cy, r }, d: "" };
}

// ---------- Definitions ----------
// Each W,H below in cm (= meters * 100).

export const FURN_DEFS: Record<FurnitureType, FurnitureDef> = {
  // =========================================================
  // LEGACY GENERIC TYPES (rendered by canvas's bespoke code,
  // but we still need sizeM/label for the engine).
  // =========================================================
  sofa: { sizeM: { w: 2.0, h: 0.9 }, label: "Sofá", category: "Sala", paths: [] },
  bed: { sizeM: { w: 1.6, h: 2.0 }, label: "Cama", category: "Quarto", paths: [] },
  table: { sizeM: { w: 1.2, h: 0.8 }, label: "Mesa", category: "Geral", paths: [] },
  tv: { sizeM: { w: 1.6, h: 0.4 }, label: "TV", category: "Sala", paths: [] },
  sink: { sizeM: { w: 0.6, h: 0.45 }, label: "Pia", category: "Banheiro", paths: [] },
  toilet: { sizeM: { w: 0.4, h: 0.6 }, label: "Vaso", category: "Banheiro", paths: [] },
  shower: { sizeM: { w: 0.9, h: 0.9 }, label: "Box", category: "Banheiro", paths: [] },
  stove: { sizeM: { w: 0.6, h: 0.6 }, label: "Fogão", category: "Cozinha", paths: [] },
  fridge: { sizeM: { w: 0.7, h: 0.7 }, label: "Geladeira", category: "Cozinha", paths: [] },
  counter: { sizeM: { w: 1.5, h: 0.6 }, label: "Bancada", category: "Cozinha", paths: [] },
  island: { sizeM: { w: 1.5, h: 0.9 }, label: "Ilha", category: "Cozinha", paths: [] },
  wardrobe: { sizeM: { w: 2.0, h: 0.6 }, label: "Guarda-roupa", category: "Quarto", paths: [] },
  desk: { sizeM: { w: 1.2, h: 0.6 }, label: "Escrivaninha", category: "Escritório", paths: [] },
  chair: { sizeM: { w: 0.5, h: 0.5 }, label: "Cadeira", category: "Geral", paths: [] },
  bookshelf: { sizeM: { w: 1.0, h: 0.4 }, label: "Estante", category: "Sala", paths: [] },
  washing_machine: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Máquina de Lavar",
    category: "Lavanderia",
    paths: [],
  },

  // =========================================================
  // SALA
  // =========================================================
  sofa_2seat: {
    sizeM: { w: 1.4, h: 0.8 },
    label: "Sofá 2 Lugares",
    category: "Sala",
    paths: [
      // body
      { d: rrect(0, 0, 140, 80, 6), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // back cushion
      { d: rrect(8, 4, 124, 22, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      // arms
      { d: rrect(0, 4, 12, 72, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(128, 4, 12, 72, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      // seat cushions (2)
      { d: rrect(14, 30, 56, 46, 4), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(72, 30, 56, 46, 4), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  sofa_3seat: {
    sizeM: { w: 2.1, h: 0.9 },
    label: "Sofá 3 Lugares",
    category: "Sala",
    paths: [
      { d: rrect(0, 0, 210, 90, 7), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rrect(8, 4, 194, 24, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(0, 4, 14, 82, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(196, 4, 14, 82, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(16, 32, 58, 54, 4), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(76, 32, 58, 54, 4), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(136, 32, 58, 54, 4), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  sofa_L: {
    sizeM: { w: 2.4, h: 2.0 },
    label: "Sofá em L",
    category: "Sala",
    paths: [
      // L-shape body: long arm 240 wide, deep arm 90 wide returning down
      {
        d: `M0 0H240V90H90V200H0Z`,
        fill: BODY,
        stroke: STROKE,
        strokeWidth: 1.7,
      },
      // back cushions (along top + along left)
      { d: rrect(8, 4, 224, 22, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(4, 28, 22, 168, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      // arms
      { d: rrect(228, 4, 12, 82, 3), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(78, 188, 12, 12, 3), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      // seat cushions
      { d: rrect(28, 30, 64, 58, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(94, 30, 64, 58, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(160, 30, 66, 58, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(28, 90, 60, 50, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(28, 142, 60, 56, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  armchair: {
    sizeM: { w: 0.8, h: 0.8 },
    label: "Poltrona",
    category: "Sala",
    paths: [
      { d: rrect(0, 0, 80, 80, 8), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rrect(6, 4, 68, 22, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(0, 4, 12, 72, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(68, 4, 12, 72, 4), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      { d: rrect(14, 30, 52, 46, 3), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  coffee_table: {
    sizeM: { w: 1.2, h: 0.6 },
    label: "Mesa de Centro",
    category: "Sala",
    paths: [
      { d: rrect(0, 0, 120, 60, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(5, 5, 110, 50, 4), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  side_table: {
    sizeM: { w: 0.45, h: 0.45 },
    label: "Mesa Lateral",
    category: "Sala",
    paths: [
      { d: rrect(0, 0, 45, 45, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.5 },
      circ(22.5, 22.5, 6),
    ],
  },
  tv_console: {
    sizeM: { w: 1.8, h: 0.45 },
    label: "Rack TV",
    category: "Sala",
    paths: [
      { d: rrect(0, 0, 180, 45, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // TV outline on top edge
      { d: rect(35, 6, 110, 14), fill: BODY_DARK, stroke: STROKE, strokeWidth: 1.0 },
      // drawer dividers
      { d: line(60, 6, 60, 39), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(120, 6, 120, 39), stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  floor_lamp: {
    sizeM: { w: 0.3, h: 0.3 },
    label: "Luminária",
    category: "Sala",
    paths: [
      circ(15, 15, 14),
      { d: line(15, 1, 15, 29), stroke: STROKE, strokeWidth: 0.6 },
      { d: line(1, 15, 29, 15), stroke: STROKE, strokeWidth: 0.6 },
      { d: "", circle: { cx: 15, cy: 15, r: 3 }, fill: STROKE },
    ],
  },
  rug_rect: {
    sizeM: { w: 2.0, h: 1.5 },
    label: "Tapete",
    category: "Sala",
    paths: [
      { d: rect(0, 0, 200, 150), fill: "rgba(198,169,98,0.10)", stroke: "rgba(198,169,98,0.6)", strokeWidth: 1.2, dashed: true },
      { d: rect(8, 8, 184, 134), fill: null, stroke: "rgba(198,169,98,0.4)", strokeWidth: 0.6, dashed: true },
    ],
  },

  // =========================================================
  // QUARTO CASAL
  // =========================================================
  bed_double: {
    sizeM: { w: 1.58, h: 1.98 },
    label: "Cama Casal",
    category: "Quarto",
    paths: [
      // headboard
      { d: rect(0, 0, 158, 12), fill: "#7a6750", stroke: STROKE, strokeWidth: 1.6 },
      // mattress
      { d: rrect(4, 12, 150, 184, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      // pillows
      { d: rrect(14, 18, 60, 28, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(82, 18, 60, 28, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      // duvet fold
      { d: line(10, 130, 148, 130), stroke: STROKE_FINE, strokeWidth: 0.7 },
      { d: line(10, 132, 148, 132), stroke: STROKE_FINE, strokeWidth: 0.5 },
    ],
  },
  bed_king: {
    sizeM: { w: 1.93, h: 2.03 },
    label: "Cama King",
    category: "Quarto",
    paths: [
      { d: rect(0, 0, 193, 12), fill: "#7a6750", stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(4, 12, 185, 189, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(16, 18, 74, 30, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      { d: rrect(103, 18, 74, 30, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      { d: line(10, 134, 183, 134), stroke: STROKE_FINE, strokeWidth: 0.7 },
      { d: line(10, 136, 183, 136), stroke: STROKE_FINE, strokeWidth: 0.5 },
    ],
  },
  nightstand: {
    sizeM: { w: 0.5, h: 0.4 },
    label: "Criado-mudo",
    category: "Quarto",
    paths: [
      { d: rrect(0, 0, 50, 40, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.5 },
      { d: line(0, 22, 50, 22), stroke: STROKE_FINE, strokeWidth: 0.6 },
      circ(25, 32, 1.5),
    ],
  },
  dresser: {
    sizeM: { w: 1.2, h: 0.45 },
    label: "Cômoda",
    category: "Quarto",
    paths: [
      { d: rrect(0, 0, 120, 45, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(40, 0, 40, 45), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(80, 0, 80, 45), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(0, 22, 120, 22), stroke: STROKE_FINE, strokeWidth: 0.6 },
      circ(20, 11, 1.5),
      circ(60, 11, 1.5),
      circ(100, 11, 1.5),
      circ(20, 33, 1.5),
      circ(60, 33, 1.5),
      circ(100, 33, 1.5),
    ],
  },
  wardrobe_sliding: {
    sizeM: { w: 2.5, h: 0.6 },
    label: "Guarda-roupa Deslizante",
    category: "Quarto",
    paths: [
      { d: rect(0, 0, 250, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rect(0, 0, 125, 60), fill: null, stroke: STROKE, strokeWidth: 0.9 },
      { d: rect(125, 0, 125, 60), fill: null, stroke: STROKE, strokeWidth: 0.9 },
      // sliding indicator arrows
      { d: "M50 30L72 30M68 26L72 30L68 34", stroke: STROKE_FINE, strokeWidth: 0.8 },
      { d: "M178 30L200 30M196 26L200 30L196 34", stroke: STROKE_FINE, strokeWidth: 0.8 },
    ],
  },
  wardrobe_hinged: {
    sizeM: { w: 2.0, h: 0.6 },
    label: "Guarda-roupa",
    category: "Quarto",
    paths: [
      { d: rect(0, 0, 200, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: line(50, 0, 50, 60), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(100, 0, 100, 60), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(150, 0, 150, 60), stroke: STROKE_FINE, strokeWidth: 0.6 },
      // door swing arcs
      { d: "M0 60A50 50 0 0 1 50 10", stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      { d: "M100 60A50 50 0 0 0 50 10", stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      { d: "M100 60A50 50 0 0 1 150 10", stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      { d: "M200 60A50 50 0 0 0 150 10", stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
    ],
  },
  vanity: {
    sizeM: { w: 1.0, h: 0.45 },
    label: "Penteadeira",
    category: "Quarto",
    paths: [
      { d: rrect(0, 0, 100, 45, 2), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rect(35, 4, 30, 8), fill: GLASS, stroke: STROKE, strokeWidth: 0.8 },
      circ(20, 22, 2),
      circ(80, 22, 2),
    ],
  },

  // =========================================================
  // QUARTO SOLTEIRO / ESTUDO
  // =========================================================
  bed_single: {
    sizeM: { w: 0.88, h: 1.88 },
    label: "Cama Solteiro",
    category: "Quarto",
    paths: [
      { d: rect(0, 0, 88, 12), fill: "#7a6750", stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(4, 12, 80, 174, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(14, 18, 60, 30, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      { d: line(10, 122, 78, 122), stroke: STROKE_FINE, strokeWidth: 0.7 },
    ],
  },
  bed_bunk: {
    sizeM: { w: 0.88, h: 1.88 },
    label: "Beliche",
    category: "Quarto",
    paths: [
      { d: rect(0, 0, 88, 12), fill: "#7a6750", stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(4, 12, 80, 174, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(14, 18, 60, 30, 4), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
      // ladder
      { d: rect(76, 60, 8, 80), fill: null, stroke: STROKE, strokeWidth: 0.9 },
      { d: line(76, 76, 84, 76), stroke: STROKE, strokeWidth: 0.7 },
      { d: line(76, 96, 84, 96), stroke: STROKE, strokeWidth: 0.7 },
      { d: line(76, 116, 84, 116), stroke: STROKE, strokeWidth: 0.7 },
      // upper-bed shadow (corner mark)
      { d: "M4 6L84 6", stroke: STROKE_FINE, strokeWidth: 0.6, dashed: true },
    ],
  },
  desk_study: {
    sizeM: { w: 1.2, h: 0.6 },
    label: "Escrivaninha",
    category: "Escritório",
    paths: [
      { d: rrect(0, 0, 120, 60, 2), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(0, 15, 120, 15), stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  desk_chair: {
    sizeM: { w: 0.5, h: 0.5 },
    label: "Cadeira de Escritório",
    category: "Escritório",
    paths: [
      circ(25, 25, 22),
      // 5-star base
      { d: "M25 25L8 13M25 25L42 13M25 25L8 37M25 25L42 37M25 25L25 5", stroke: STROKE_FINE, strokeWidth: 0.7 },
      circ(25, 25, 6),
    ],
  },

  // =========================================================
  // INFANTIL
  // =========================================================
  crib: {
    sizeM: { w: 0.65, h: 1.3 },
    label: "Berço",
    category: "Infantil",
    paths: [
      { d: rrect(0, 0, 65, 130, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // bars (top & bottom)
      ...Array.from({ length: 11 }, (_, i) => ({
        d: line(8 + i * 5, 4, 8 + i * 5, 12),
        stroke: STROKE_FINE,
        strokeWidth: 0.6,
      })),
      ...Array.from({ length: 11 }, (_, i) => ({
        d: line(8 + i * 5, 118, 8 + i * 5, 126),
        stroke: STROKE_FINE,
        strokeWidth: 0.6,
      })),
      // mattress
      { d: rrect(6, 14, 53, 102, 3), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  bed_child: {
    sizeM: { w: 0.7, h: 1.5 },
    label: "Cama Infantil",
    category: "Infantil",
    paths: [
      { d: rect(0, 0, 70, 10), fill: "#7a6750", stroke: STROKE, strokeWidth: 1.5 },
      { d: rrect(2, 10, 66, 138, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rrect(10, 16, 50, 24, 3), fill: "#fff", stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  toy_shelf: {
    sizeM: { w: 1.0, h: 0.35 },
    label: "Estante de Brinquedos",
    category: "Infantil",
    paths: [
      { d: rect(0, 0, 100, 35), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(33, 0, 33, 35), stroke: STROKE_FINE, strokeWidth: 0.7 },
      { d: line(66, 0, 66, 35), stroke: STROKE_FINE, strokeWidth: 0.7 },
    ],
  },
  play_table: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Mesa de Atividades",
    category: "Infantil",
    paths: [
      circ(30, 30, 28),
      circ(30, 30, 22),
    ],
  },

  // =========================================================
  // COZINHA — STOVES
  // =========================================================
  stove_4burner: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Fogão 4 Bocas",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 60), fill: APPLIANCE, stroke: STROKE, strokeWidth: 1.7 },
      circ(18, 18, 8),
      circ(42, 18, 8),
      circ(18, 42, 8),
      circ(42, 42, 8),
      // small dials at top
      circ(10, 4, 1.5),
      circ(50, 4, 1.5),
    ],
  },
  stove_5burner: {
    sizeM: { w: 0.75, h: 0.6 },
    label: "Fogão 5 Bocas",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 75, 60), fill: APPLIANCE, stroke: STROKE, strokeWidth: 1.7 },
      circ(15, 15, 7),
      circ(60, 15, 7),
      circ(15, 45, 7),
      circ(60, 45, 7),
      circ(37.5, 30, 9),
    ],
  },
  cooktop: {
    sizeM: { w: 0.6, h: 0.5 },
    label: "Cooktop",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 50), fill: BODY_DARK, stroke: STROKE, strokeWidth: 1.6 },
      circ(18, 16, 7),
      circ(42, 16, 7),
      circ(18, 36, 7),
      circ(42, 36, 7),
    ],
  },
  fridge_single: {
    sizeM: { w: 0.6, h: 0.65 },
    label: "Geladeira",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 65), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // freezer divider
      { d: line(0, 22, 60, 22), stroke: STROKE, strokeWidth: 0.9 },
      // hinge tick
      { d: line(58, 5, 58, 18), stroke: STROKE_FINE, strokeWidth: 1.0 },
      { d: line(58, 26, 58, 60), stroke: STROKE_FINE, strokeWidth: 1.2 },
    ],
  },
  fridge_double: {
    sizeM: { w: 0.9, h: 0.7 },
    label: "Geladeira Frost Free",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 90, 70), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // french doors
      { d: line(45, 0, 45, 70), stroke: STROKE, strokeWidth: 0.9 },
      // handles
      { d: line(43, 8, 43, 22), stroke: STROKE_FINE, strokeWidth: 1.2 },
      { d: line(47, 8, 47, 22), stroke: STROKE_FINE, strokeWidth: 1.2 },
    ],
  },
  microwave: {
    sizeM: { w: 0.45, h: 0.35 },
    label: "Micro-ondas",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 45, 35), fill: APPLIANCE, stroke: STROKE, strokeWidth: 1.5 },
      { d: rect(2, 2, 30, 31), fill: GLASS, stroke: STROKE, strokeWidth: 0.7 },
      circ(39, 8, 1.5),
      circ(39, 16, 1.5),
      circ(39, 24, 1.5),
    ],
  },
  dishwasher: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Lava-louças",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rect(4, 4, 52, 52), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(0, 8, 60, 8), stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  kitchen_sink_single: {
    sizeM: { w: 0.6, h: 0.5 },
    label: "Pia Cozinha",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 50), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rrect(6, 8, 48, 36, 3), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 1.0 },
      circ(30, 4, 2),
      circ(30, 26, 1.5),
    ],
  },
  kitchen_sink_double: {
    sizeM: { w: 0.8, h: 0.5 },
    label: "Pia Dupla",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 80, 50), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rrect(5, 8, 33, 36, 3), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 1.0 },
      { d: rrect(42, 8, 33, 36, 3), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 1.0 },
      circ(40, 4, 2),
      circ(21, 26, 1.5),
      circ(58, 26, 1.5),
    ],
  },
  kitchen_island: {
    sizeM: { w: 1.8, h: 0.9 },
    label: "Ilha de Cozinha",
    category: "Cozinha",
    paths: [
      { d: rrect(0, 0, 180, 90, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.8 },
      { d: rrect(4, 4, 172, 82, 3), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
      // 4 stools beneath (south side)
      circ(30, 108, 14),
      circ(70, 108, 14),
      circ(110, 108, 14),
      circ(150, 108, 14),
    ],
  },
  bar_stool: {
    sizeM: { w: 0.35, h: 0.35 },
    label: "Banqueta",
    category: "Cozinha",
    paths: [circ(17.5, 17.5, 16), circ(17.5, 17.5, 6)],
  },
  hood: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Coifa",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 60), fill: null, stroke: STROKE_FINE, strokeWidth: 0.9, dashed: true },
      { d: rect(8, 8, 44, 44), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6, dashed: true },
      circ(30, 30, 6),
    ],
  },
  pantry: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Despensa",
    category: "Cozinha",
    paths: [
      { d: rect(0, 0, 60, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(0, 15, 60, 15), stroke: STROKE_FINE, strokeWidth: 0.5 },
      { d: line(0, 30, 60, 30), stroke: STROKE_FINE, strokeWidth: 0.5 },
      { d: line(0, 45, 60, 45), stroke: STROKE_FINE, strokeWidth: 0.5 },
    ],
  },

  // =========================================================
  // BANHEIRO
  // =========================================================
  bidet: {
    sizeM: { w: 0.37, h: 0.55 },
    label: "Bidê",
    category: "Banheiro",
    paths: [
      // base
      { d: rect(8, 0, 21, 8), fill: BODY, stroke: STROKE, strokeWidth: 1.5 },
      // bowl ellipse
      { d: "M3 12C3 36 34 36 34 12L34 8C34 4 3 4 3 8Z", fill: BODY, stroke: STROKE, strokeWidth: 1.5 },
      { d: "M8 14C8 30 29 30 29 14", fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  sink_pedestal: {
    sizeM: { w: 0.45, h: 0.4 },
    label: "Pia Coluna",
    category: "Banheiro",
    paths: [
      { d: rrect(0, 0, 45, 40, 5), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: "M22.5 6Q22.5 30 22.5 30", stroke: STROKE_FINE, strokeWidth: 0.6 },
      circ(22.5, 22, 2),
      circ(22.5, 4, 1.5),
    ],
  },
  sink_vanity: {
    sizeM: { w: 0.8, h: 0.5 },
    label: "Bancada Pia",
    category: "Banheiro",
    paths: [
      { d: rect(0, 0, 80, 50), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: "M40 30m-15 0a15 11 0 1 0 30 0a15 11 0 1 0 -30 0", fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.9 },
      circ(40, 6, 2),
    ],
  },
  sink_double_vanity: {
    sizeM: { w: 1.2, h: 0.5 },
    label: "Bancada Dupla",
    category: "Banheiro",
    paths: [
      { d: rect(0, 0, 120, 50), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: "M30 30m-13 0a13 10 0 1 0 26 0a13 10 0 1 0 -26 0", fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.9 },
      { d: "M90 30m-13 0a13 10 0 1 0 26 0a13 10 0 1 0 -26 0", fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.9 },
      circ(30, 6, 2),
      circ(90, 6, 2),
    ],
  },
  shower_square: {
    sizeM: { w: 0.9, h: 0.9 },
    label: "Box Quadrado",
    category: "Banheiro",
    paths: [
      { d: rect(0, 0, 90, 90), fill: "rgba(220,228,238,0.5)", stroke: STROKE, strokeWidth: 1.6 },
      { d: line(0, 0, 90, 90), stroke: STROKE_FINE, strokeWidth: 0.5 },
      { d: line(90, 0, 0, 90), stroke: STROKE_FINE, strokeWidth: 0.5 },
      circ(76, 14, 4),
      circ(45, 45, 2.5),
    ],
  },
  shower_rect: {
    sizeM: { w: 1.2, h: 0.9 },
    label: "Box Retangular",
    category: "Banheiro",
    paths: [
      { d: rect(0, 0, 120, 90), fill: "rgba(220,228,238,0.5)", stroke: STROKE, strokeWidth: 1.6 },
      { d: line(0, 0, 120, 90), stroke: STROKE_FINE, strokeWidth: 0.5 },
      { d: line(120, 0, 0, 90), stroke: STROKE_FINE, strokeWidth: 0.5 },
      circ(106, 14, 4),
      circ(60, 45, 2.5),
    ],
  },
  bathtub_rect: {
    sizeM: { w: 1.7, h: 0.75 },
    label: "Banheira",
    category: "Banheiro",
    paths: [
      { d: rrect(0, 0, 170, 75, 8), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rrect(8, 8, 154, 59, 12), fill: "rgba(220,228,238,0.55)", stroke: STROKE, strokeWidth: 1.0 },
      circ(20, 38, 2),
      circ(150, 38, 1.4),
    ],
  },
  bathtub_corner: {
    sizeM: { w: 1.4, h: 1.4 },
    label: "Banheira de Canto",
    category: "Banheiro",
    paths: [
      { d: "M0 0H140V70Q140 140 70 140H0Z", fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: "M8 8H132V70Q132 132 70 132H8Z", fill: "rgba(220,228,238,0.55)", stroke: STROKE, strokeWidth: 1.0 },
      circ(15, 15, 2.5),
    ],
  },
  towel_rack: {
    sizeM: { w: 0.6, h: 0.05 },
    label: "Toalheiro",
    category: "Banheiro",
    paths: [
      { d: rect(0, 0, 60, 5), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.9 },
    ],
  },

  // =========================================================
  // LAVANDERIA
  // =========================================================
  dryer: {
    sizeM: { w: 0.6, h: 0.6 },
    label: "Secadora",
    category: "Lavanderia",
    paths: [
      { d: rect(0, 0, 60, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rect(0, 0, 60, 9), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.9 },
      circ(30, 35, 18),
      circ(30, 35, 12),
    ],
  },
  laundry_sink: {
    sizeM: { w: 0.5, h: 0.55 },
    label: "Tanque",
    category: "Lavanderia",
    paths: [
      { d: rect(0, 0, 50, 55), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: rect(4, 8, 42, 43), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.9 },
      circ(25, 4, 1.6),
      circ(25, 30, 1.4),
    ],
  },
  ironing_board: {
    sizeM: { w: 1.2, h: 0.35 },
    label: "Mesa de Passar",
    category: "Lavanderia",
    paths: [
      { d: "M0 17.5Q15 0 35 5L120 17.5L35 30Q15 35 0 17.5Z", fill: BODY, stroke: STROKE, strokeWidth: 1.0, dashed: true },
    ],
  },

  // =========================================================
  // JANTAR
  // =========================================================
  dining_table_4: {
    sizeM: { w: 1.2, h: 0.8 },
    label: "Mesa de Jantar 4",
    category: "Jantar",
    paths: [
      { d: rrect(0, 0, 120, 80, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      // chairs (4): 2 N, 2 S
      circ(30, -16, 14),
      circ(90, -16, 14),
      circ(30, 96, 14),
      circ(90, 96, 14),
    ],
  },
  dining_table_6: {
    sizeM: { w: 1.6, h: 0.9 },
    label: "Mesa de Jantar 6",
    category: "Jantar",
    paths: [
      { d: rrect(0, 0, 160, 90, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      circ(30, -16, 14),
      circ(80, -16, 14),
      circ(130, -16, 14),
      circ(30, 106, 14),
      circ(80, 106, 14),
      circ(130, 106, 14),
    ],
  },
  dining_table_8: {
    sizeM: { w: 2.2, h: 1.0 },
    label: "Mesa de Jantar 8",
    category: "Jantar",
    paths: [
      { d: rrect(0, 0, 220, 100, 3), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      circ(35, -16, 14),
      circ(85, -16, 14),
      circ(135, -16, 14),
      circ(185, -16, 14),
      circ(35, 116, 14),
      circ(85, 116, 14),
      circ(135, 116, 14),
      circ(185, 116, 14),
    ],
  },
  dining_table_round_4: {
    sizeM: { w: 1.1, h: 1.1 },
    label: "Mesa Redonda 4",
    category: "Jantar",
    paths: [
      circ(55, 55, 53),
      circ(55, -16, 14),
      circ(55, 126, 14),
      circ(-16, 55, 14),
      circ(126, 55, 14),
    ],
  },
  buffet: {
    sizeM: { w: 1.6, h: 0.45 },
    label: "Buffet / Aparador",
    category: "Jantar",
    paths: [
      { d: rect(0, 0, 160, 45), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(53, 0, 53, 45), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(107, 0, 107, 45), stroke: STROKE_FINE, strokeWidth: 0.6 },
      circ(26, 22, 1.4),
      circ(80, 22, 1.4),
      circ(134, 22, 1.4),
    ],
  },
  dining_chair: {
    sizeM: { w: 0.45, h: 0.45 },
    label: "Cadeira",
    category: "Jantar",
    paths: [
      { d: rrect(0, 0, 45, 45, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.4 },
      { d: rect(0, 0, 45, 8), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },

  // =========================================================
  // ESCRITÓRIO
  // =========================================================
  desk_L: {
    sizeM: { w: 1.6, h: 1.2 },
    label: "Mesa em L",
    category: "Escritório",
    paths: [
      { d: "M0 0H160V60H60V120H0Z", fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: "M4 4H156V56H56V116H4Z", fill: null, stroke: STROKE_FINE, strokeWidth: 0.5 },
    ],
  },
  desk_straight: {
    sizeM: { w: 1.4, h: 0.7 },
    label: "Mesa de Trabalho",
    category: "Escritório",
    paths: [
      { d: rrect(0, 0, 140, 70, 2), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: line(0, 14, 140, 14), stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  office_chair: {
    sizeM: { w: 0.5, h: 0.5 },
    label: "Cadeira Escritório",
    category: "Escritório",
    paths: [
      circ(25, 25, 22),
      { d: "M25 25L8 13M25 25L42 13M25 25L8 37M25 25L42 37M25 25L25 5", stroke: STROKE_FINE, strokeWidth: 0.7 },
      circ(25, 25, 6),
    ],
  },
  filing_cabinet: {
    sizeM: { w: 0.4, h: 0.5 },
    label: "Arquivo",
    category: "Escritório",
    paths: [
      { d: rect(0, 0, 40, 50), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(0, 17, 40, 17), stroke: STROKE_FINE, strokeWidth: 0.5 },
      { d: line(0, 34, 40, 34), stroke: STROKE_FINE, strokeWidth: 0.5 },
      circ(20, 8, 1.4),
      circ(20, 25, 1.4),
      circ(20, 42, 1.4),
    ],
  },

  // =========================================================
  // COMERCIAL
  // =========================================================
  meeting_table_large: {
    sizeM: { w: 3.0, h: 1.2 },
    label: "Mesa de Reunião",
    category: "Comercial",
    paths: [
      { d: rrect(0, 0, 300, 120, 6), fill: BODY, stroke: STROKE, strokeWidth: 1.8 },
      // 8 chairs along long edges, 2 on short
      ...[...Array(4)].map((_, i) => circ(45 + i * 65, -16, 14)),
      ...[...Array(4)].map((_, i) => circ(45 + i * 65, 136, 14)),
      circ(-16, 60, 14),
      circ(316, 60, 14),
    ],
  },
  reception_desk: {
    sizeM: { w: 2.0, h: 0.7 },
    label: "Recepção",
    category: "Comercial",
    paths: [
      { d: "M0 0H200V40Q200 70 170 70H30Q0 70 0 40Z", fill: BODY, stroke: STROKE, strokeWidth: 1.8 },
      { d: "M8 36Q8 8 30 8H170Q192 8 192 36", fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  waiting_chair: {
    sizeM: { w: 0.55, h: 0.55 },
    label: "Cadeira Espera",
    category: "Comercial",
    paths: [
      { d: rrect(0, 0, 55, 55, 6), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 1.4 },
      { d: rect(0, 0, 55, 12), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  cubicle_desk: {
    sizeM: { w: 1.4, h: 1.4 },
    label: "Cubículo",
    category: "Comercial",
    paths: [
      { d: "M0 0H140V60H60V140H0Z", fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      // partition walls (taller)
      { d: line(0, 0, 140, 0), stroke: STROKE, strokeWidth: 2.5 },
      { d: line(0, 0, 0, 140), stroke: STROKE, strokeWidth: 2.5 },
      circ(40, 95, 12),
    ],
  },
  display_shelf: {
    sizeM: { w: 1.2, h: 0.4 },
    label: "Expositor",
    category: "Comercial",
    paths: [
      { d: rect(0, 0, 120, 40), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      { d: line(30, 0, 30, 40), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(60, 0, 60, 40), stroke: STROKE_FINE, strokeWidth: 0.6 },
      { d: line(90, 0, 90, 40), stroke: STROKE_FINE, strokeWidth: 0.6 },
    ],
  },
  checkout_counter: {
    sizeM: { w: 1.5, h: 0.6 },
    label: "Caixa",
    category: "Comercial",
    paths: [
      { d: rect(0, 0, 150, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.7 },
      { d: rect(110, 4, 36, 22), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.9 },
      circ(20, 30, 4),
    ],
  },
  restaurant_table_2: {
    sizeM: { w: 0.7, h: 0.7 },
    label: "Mesa 2",
    category: "Comercial",
    paths: [circ(35, 35, 32), circ(-16, 35, 14), circ(86, 35, 14)],
  },
  restaurant_table_4: {
    sizeM: { w: 0.9, h: 0.9 },
    label: "Mesa 4",
    category: "Comercial",
    paths: [
      { d: rrect(0, 0, 90, 90, 4), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      circ(20, -16, 14),
      circ(70, -16, 14),
      circ(20, 106, 14),
      circ(70, 106, 14),
    ],
  },
  bar_counter: {
    sizeM: { w: 3.0, h: 0.6 },
    label: "Balcão de Bar",
    category: "Comercial",
    paths: [
      { d: rect(0, 0, 300, 60), fill: BODY, stroke: STROKE, strokeWidth: 1.8 },
      { d: rect(4, 4, 292, 52), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6 },
      ...[...Array(6)].map((_, i) => circ(30 + i * 50, 78, 14)),
    ],
  },
  commercial_stove: {
    sizeM: { w: 1.2, h: 0.8 },
    label: "Fogão Industrial",
    category: "Comercial",
    paths: [
      { d: rect(0, 0, 120, 80), fill: APPLIANCE, stroke: STROKE, strokeWidth: 1.8 },
      ...[0, 1, 2].flatMap((i) =>
        [0, 1].map((j) => circ(20 + i * 40, 20 + j * 40, 9))
      ),
    ],
  },

  // =========================================================
  // EXTERNO / JARDIM
  // =========================================================
  pool_rect: {
    sizeM: { w: 6.0, h: 3.0 },
    label: "Piscina",
    category: "Externo",
    paths: [
      { d: rrect(0, 0, 600, 300, 14), fill: WATER, stroke: WATER_DARK, strokeWidth: 2.4 },
      // wave hatch
      ...[...Array(8)].map((_, i) => ({
        d: `M40 ${40 + i * 32}Q120 ${30 + i * 32} 200 ${40 + i * 32}T360 ${40 + i * 32}T520 ${40 + i * 32}T560 ${40 + i * 32}`,
        stroke: "rgba(255,255,255,0.45)",
        strokeWidth: 0.8,
        fill: null,
      })),
    ],
  },
  hot_tub: {
    sizeM: { w: 2.0, h: 2.0 },
    label: "Hidromassagem",
    category: "Externo",
    paths: [
      circ(100, 100, 96),
      { d: "", circle: { cx: 100, cy: 100, r: 96 }, fill: WATER },
      circ(100, 100, 84),
      // bubble dots
      circ(60, 100, 4),
      circ(140, 100, 4),
      circ(100, 60, 4),
      circ(100, 140, 4),
    ],
  },
  bbq_grill: {
    sizeM: { w: 1.5, h: 0.8 },
    label: "Churrasqueira",
    category: "Externo",
    paths: [
      { d: rect(0, 0, 150, 80), fill: STONE, stroke: STROKE, strokeWidth: 1.8 },
      { d: rect(10, 10, 130, 60), fill: BODY_DARK, stroke: STROKE, strokeWidth: 1.0 },
      ...[...Array(6)].map((_, i) => ({
        d: line(20 + i * 22, 14, 20 + i * 22, 66),
        stroke: "rgba(220,180,80,0.7)",
        strokeWidth: 0.7,
      })),
    ],
  },
  outdoor_table: {
    sizeM: { w: 1.5, h: 0.9 },
    label: "Mesa Externa",
    category: "Externo",
    paths: [
      { d: rrect(0, 0, 150, 90, 6), fill: BODY, stroke: STROKE, strokeWidth: 1.6 },
      circ(30, -16, 13),
      circ(75, -16, 13),
      circ(120, -16, 13),
      circ(30, 106, 13),
      circ(75, 106, 13),
      circ(120, 106, 13),
    ],
  },
  sun_lounger: {
    sizeM: { w: 1.8, h: 0.6 },
    label: "Espreguiçadeira",
    category: "Externo",
    paths: [
      { d: rrect(0, 0, 180, 60, 6), fill: BODY, stroke: STROKE, strokeWidth: 1.5 },
      { d: rect(0, 0, 40, 60), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.7 },
    ],
  },
  umbrella: {
    sizeM: { w: 2.5, h: 2.5 },
    label: "Guarda-sol",
    category: "Externo",
    paths: [
      { d: "", circle: { cx: 125, cy: 125, r: 120 }, fill: "rgba(180,140,80,0.30)", stroke: "rgba(120,80,40,0.7)", strokeWidth: 1.5, dashed: true },
      { d: line(125, 5, 125, 245), stroke: "rgba(120,80,40,0.6)", strokeWidth: 0.7, dashed: true },
      { d: line(5, 125, 245, 125), stroke: "rgba(120,80,40,0.6)", strokeWidth: 0.7, dashed: true },
      circ(125, 125, 5),
    ],
  },
  planter_round: {
    sizeM: { w: 0.5, h: 0.5 },
    label: "Vaso",
    category: "Externo",
    paths: [
      circ(25, 25, 24),
      { d: "", circle: { cx: 25, cy: 25, r: 24 }, fill: "rgba(120,90,60,0.4)" },
      circ(25, 25, 18),
      { d: "", circle: { cx: 25, cy: 25, r: 18 }, fill: GREEN },
    ],
  },
  tree_small: {
    sizeM: { w: 2.0, h: 2.0 },
    label: "Árvore Pequena",
    category: "Externo",
    paths: [
      { d: "", circle: { cx: 100, cy: 100, r: 95 }, fill: GREEN, stroke: GREEN_DARK, strokeWidth: 1.5 },
      // foliage texture: small lobes
      ...[0, 60, 120, 180, 240, 300].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const cx = 100 + Math.cos(a) * 60;
        const cy = 100 + Math.sin(a) * 60;
        return { d: "", circle: { cx, cy, r: 26 }, fill: null, stroke: GREEN_DARK, strokeWidth: 0.9 };
      }),
      // trunk
      circ(100, 100, 8),
      { d: "", circle: { cx: 100, cy: 100, r: 8 }, fill: "rgba(90,60,40,0.95)" },
    ],
  },
  tree_large: {
    sizeM: { w: 4.0, h: 4.0 },
    label: "Árvore",
    category: "Externo",
    paths: [
      { d: "", circle: { cx: 200, cy: 200, r: 195 }, fill: GREEN, stroke: GREEN_DARK, strokeWidth: 1.8 },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const cx = 200 + Math.cos(a) * 130;
        const cy = 200 + Math.sin(a) * 130;
        return { d: "", circle: { cx, cy, r: 50 }, fill: null, stroke: GREEN_DARK, strokeWidth: 0.9 };
      }),
      circ(200, 200, 16),
      { d: "", circle: { cx: 200, cy: 200, r: 16 }, fill: "rgba(90,60,40,0.95)" },
    ],
  },
  pergola: {
    sizeM: { w: 3.0, h: 3.0 },
    label: "Pergolado",
    category: "Externo",
    paths: [
      { d: rect(0, 0, 300, 300), fill: null, stroke: "rgba(140,100,60,0.85)", strokeWidth: 2.0, dashed: true },
      // grid (slats)
      ...[...Array(7)].map((_, i) => ({
        d: line(0, (i + 1) * 37.5, 300, (i + 1) * 37.5),
        stroke: "rgba(140,100,60,0.5)",
        strokeWidth: 1.0,
        dashed: true,
      })),
      ...[...Array(7)].map((_, i) => ({
        d: line((i + 1) * 37.5, 0, (i + 1) * 37.5, 300),
        stroke: "rgba(140,100,60,0.5)",
        strokeWidth: 1.0,
        dashed: true,
      })),
    ],
  },
  fountain: {
    sizeM: { w: 1.5, h: 1.5 },
    label: "Fonte",
    category: "Externo",
    paths: [
      { d: "", circle: { cx: 75, cy: 75, r: 72 }, fill: STONE, stroke: STROKE, strokeWidth: 1.7 },
      { d: "", circle: { cx: 75, cy: 75, r: 60 }, fill: WATER, stroke: WATER_DARK, strokeWidth: 1.0 },
      { d: "", circle: { cx: 75, cy: 75, r: 28 }, fill: STONE, stroke: STROKE, strokeWidth: 1.0 },
      circ(75, 75, 8),
    ],
  },

  // =========================================================
  // DECORAÇÃO
  // =========================================================
  plant_pot: {
    sizeM: { w: 0.3, h: 0.3 },
    label: "Planta",
    category: "Decoração",
    paths: [
      { d: "", circle: { cx: 15, cy: 15, r: 14 }, fill: GREEN, stroke: GREEN_DARK, strokeWidth: 1.0 },
      { d: "", circle: { cx: 15, cy: 15, r: 6 }, fill: "rgba(120,90,60,0.7)" },
    ],
  },
  mirror_wall: {
    sizeM: { w: 0.8, h: 0.05 },
    label: "Espelho",
    category: "Decoração",
    paths: [
      { d: rect(0, 0, 80, 5), fill: GLASS, stroke: STROKE, strokeWidth: 1.0 },
    ],
  },
  ceiling_fan: {
    sizeM: { w: 1.2, h: 1.2 },
    label: "Ventilador de Teto",
    category: "Decoração",
    paths: [
      { d: "", circle: { cx: 60, cy: 60, r: 58 }, fill: null, stroke: STROKE_FINE, strokeWidth: 0.7, dashed: true },
      { d: "M60 60L100 50L100 70Z", fill: null, stroke: STROKE_FINE, strokeWidth: 0.9 },
      { d: "M60 60L20 50L20 70Z", fill: null, stroke: STROKE_FINE, strokeWidth: 0.9 },
      { d: "M60 60L70 100L50 100Z", fill: null, stroke: STROKE_FINE, strokeWidth: 0.9 },
      { d: "M60 60L70 20L50 20Z", fill: null, stroke: STROKE_FINE, strokeWidth: 0.9 },
      circ(60, 60, 6),
    ],
  },

  // =========================================================
  // ELÉTRICO
  // =========================================================
  light_ceiling: {
    sizeM: { w: 0.3, h: 0.3 },
    label: "Lustre",
    category: "Elétrico",
    paths: [
      circ(15, 15, 13),
      { d: line(2, 15, 28, 15), stroke: STROKE, strokeWidth: 0.9 },
      { d: line(15, 2, 15, 28), stroke: STROKE, strokeWidth: 0.9 },
    ],
  },
  light_spot: {
    sizeM: { w: 0.15, h: 0.15 },
    label: "Spot",
    category: "Elétrico",
    paths: [
      { d: "", circle: { cx: 7.5, cy: 7.5, r: 6.5 }, fill: STROKE, stroke: STROKE, strokeWidth: 0.8 },
    ],
  },
  power_outlet: {
    sizeM: { w: 0.2, h: 0.1 },
    label: "Tomada",
    category: "Elétrico",
    paths: [
      { d: rect(0, 0, 20, 10), fill: BODY, stroke: STROKE, strokeWidth: 1.0 },
      circ(7, 5, 1.2),
      circ(13, 5, 1.2),
    ],
  },
  switch: {
    sizeM: { w: 0.15, h: 0.15 },
    label: "Interruptor",
    category: "Elétrico",
    paths: [
      circ(7.5, 7.5, 6.5),
      { d: "M5 9L7 11L11 5", stroke: STROKE, strokeWidth: 1.0, fill: null },
    ],
  },

  // =========================================================
  // MARCENARIA MODULAR (Fase A) — paths placeholder, full
  // arquitetônico CAD vem na Fase C. Aqui só registramos
  // sizeM/label pra engine + back-compat.
  // =========================================================
  // Storage genérico
  // Convention: width × height of viewBox = sizeM × 100. Module rendered
  // in plan view from above — wall is at y=0, room interior at y=height.
  // For cabinets: subtle box outline + door swing arc OR drawer lines.
  module_cabinet_door: {
    sizeM: { w: 0.5, h: 0.6 }, label: "Armário 1 porta", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 46, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // door swing arc (dashed)
      { d: `M2 58 A56 56 0 0 1 48 58`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      // door panel hairline
      { d: line(25, 2, 25, 58), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  module_cabinet_door_double: {
    sizeM: { w: 0.9, h: 0.6 }, label: "Armário 2 portas", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(45, 2, 45, 58), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      // 2 swing arcs from center outward (dashed)
      { d: `M2 58 A43 43 0 0 1 45 58`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      { d: `M88 58 A43 43 0 0 0 45 58`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
    ],
  },
  module_cabinet_drawer_3: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Gaveteiro 3", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // 3 horizontal drawer divider lines
      { d: line(2, 21, 58, 21), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 39, 58, 39), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      // small handle bar per drawer (centered)
      { d: line(24, 12, 36, 12), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(24, 30, 36, 30), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(24, 49, 36, 49), fill: null, stroke: STROKE, strokeWidth: 0.5 },
    ],
  },
  module_cabinet_drawer_4: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Gaveteiro 4", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 16, 58, 16), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 30, 58, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 44, 58, 44), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(24, 9, 36, 9), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(24, 23, 36, 23), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(24, 37, 36, 37), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(24, 51, 36, 51), fill: null, stroke: STROKE, strokeWidth: 0.5 },
    ],
  },
  module_cabinet_open: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Nicho aberto", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.7 },
      // shelves (horizontal lines)
      { d: line(2, 22, 58, 22), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(2, 40, 58, 40), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_cabinet_glass: {
    sizeM: { w: 0.6, h: 0.4 }, label: "Vitrine vidro", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 36), fill: GLASS, stroke: STROKE, strokeWidth: 0.7 },
      // diagonal cross hatch inside (glass marker)
      { d: line(2, 2, 58, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(58, 2, 2, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_corner_carrousel: {
    sizeM: { w: 0.9, h: 0.9 }, label: "Canto giratório", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 86), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // diagonal line + circular carrousel hint
      { d: line(2, 2, 88, 88), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4, dashed: true },
      circ(45, 45, 36),
    ],
  },
  module_gap_filler: {
    sizeM: { w: 0.1, h: 0.6 }, label: "Filler", category: "Marcenaria",
    paths: [
      { d: rect(0, 2, 10, 56), fill: BODY_SOFT, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  // Cozinha — appliances rendered IN PLAN view, on top of the bancada.
  // Conventions: dark appliance fill (#3a3f4f) for stove/microwave/oven;
  // sink basins as ellipses; fridge as full-height with vertical door line.
  module_cooktop_4: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Cooktop", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      // 4 burners 2×2 grid
      circ(18, 18, 6), circ(42, 18, 6), circ(18, 42, 6), circ(42, 42, 6),
      // smaller inner ring for each
      { d: `M14 18 A4 4 0 1 1 22 18 A4 4 0 1 1 14 18`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: `M38 18 A4 4 0 1 1 46 18 A4 4 0 1 1 38 18`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: `M14 42 A4 4 0 1 1 22 42 A4 4 0 1 1 14 42`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: `M38 42 A4 4 0 1 1 46 42 A4 4 0 1 1 38 42`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  module_cooktop_5: {
    sizeM: { w: 0.75, h: 0.6 }, label: "Cooktop", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 71, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      circ(15, 18, 5), circ(37, 18, 7), circ(59, 18, 5),
      circ(26, 42, 5), circ(48, 42, 5),
    ],
  },
  module_cooktop_induction: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Indução", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: "#1a1d28", stroke: STROKE, strokeWidth: 0.7 },
      // 4 induction zones (squares)
      { d: rect(10, 10, 18, 18), fill: null, stroke: "#888", strokeWidth: 0.4 },
      { d: rect(32, 10, 18, 18), fill: null, stroke: "#888", strokeWidth: 0.4 },
      { d: rect(10, 32, 18, 18), fill: null, stroke: "#888", strokeWidth: 0.4 },
      { d: rect(32, 32, 18, 18), fill: null, stroke: "#888", strokeWidth: 0.4 },
    ],
  },
  module_oven_built_in: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Forno", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      // oven door (smaller inner rect)
      { d: rect(8, 18, 44, 32), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.5 },
      // handle bar
      { d: rect(14, 11, 32, 3), fill: STONE, stroke: STROKE, strokeWidth: 0.3 },
    ],
  },
  module_oven_tower: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Torre forno", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.8 },
      // upper oven (microwave?) zone
      { d: rect(8, 8, 44, 18), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.5 },
      // lower oven zone
      { d: rect(8, 32, 44, 22), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.5 },
      // handles
      { d: rect(14, 5, 32, 2), fill: STONE, stroke: null, strokeWidth: 0 },
      { d: rect(14, 28, 32, 2), fill: STONE, stroke: null, strokeWidth: 0 },
    ],
  },
  module_microwave_niche: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Microondas", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: rect(8, 12, 44, 36), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.5 },
      { d: rect(38, 18, 10, 24), fill: APPLIANCE_LIGHT, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_fridge_niche: {
    sizeM: { w: 0.7, h: 0.7 }, label: "Geladeira", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 66, 66), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.8 },
      // appliance face (diagonal hatch suggesting machine)
      { d: line(8, 8, 62, 62), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(8, 62, 62, 8), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      // door split line
      { d: line(35, 4, 35, 66), fill: null, stroke: STROKE, strokeWidth: 0.5 },
    ],
  },
  module_fridge_niche_double: {
    sizeM: { w: 0.9, h: 0.7 }, label: "Geladeira duplex", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 66), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.8 },
      { d: line(45, 4, 45, 66), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(8, 8, 82, 62), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(8, 62, 82, 8), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_fridge_french_door: {
    sizeM: { w: 0.9, h: 0.7 }, label: "French door", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 66), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.8 },
      // 2 french doors top + 1 freezer drawer bottom
      { d: line(45, 4, 45, 40), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(4, 40, 86, 40), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      { d: line(8, 8, 82, 36), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_sink_single: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Pia", category: "Marcenaria",
    paths: [
      // sink basin (rounded rect with darker interior)
      { d: rrect(8, 8, 44, 44, 4), fill: "#dad6c8", stroke: STROKE, strokeWidth: 0.6 },
      { d: rrect(12, 12, 36, 36, 3), fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.3 },
      // drain (small circle in center)
      circ(30, 30, 1.6),
      // faucet base (back of sink)
      { d: rect(26, 2, 8, 4), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_sink_double: {
    sizeM: { w: 1.2, h: 0.6 }, label: "Pia dupla", category: "Marcenaria",
    paths: [
      // 2 basins side by side
      { d: rrect(8, 8, 50, 44, 4), fill: "#dad6c8", stroke: STROKE, strokeWidth: 0.6 },
      { d: rrect(12, 12, 42, 36, 3), fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.3 },
      circ(33, 30, 1.6),
      { d: rrect(62, 8, 50, 44, 4), fill: "#dad6c8", stroke: STROKE, strokeWidth: 0.6 },
      { d: rrect(66, 12, 42, 36, 3), fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.3 },
      circ(87, 30, 1.6),
      // shared faucet base
      { d: rect(56, 2, 8, 4), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_dishwasher_niche: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Lava-louças", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE_LIGHT, stroke: STROKE, strokeWidth: 0.7 },
      // panel front
      { d: rect(6, 6, 48, 48), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      // small handle bar
      { d: rect(20, 50, 20, 2), fill: STONE, stroke: null, strokeWidth: 0 },
      // suggestion: subtle interior cross
      { d: line(8, 30, 52, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3, dashed: true },
    ],
  },
  module_wine_cellar: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Adega", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      // glass front (transparent rect with bottle hint)
      { d: rect(6, 6, 48, 48), fill: GLASS, stroke: STROKE_FINE, strokeWidth: 0.4 },
      // 3 bottle hints
      { d: rect(14, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
      { d: rect(28, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
      { d: rect(42, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
    ],
  },
  module_pantry_tall: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Despensa", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.8 },
      // tall door split + handle
      { d: line(30, 4, 30, 56), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(28, 28, 32, 28), fill: null, stroke: STROKE, strokeWidth: 0.5 },
      // shelves hint inside (dashed horizontal lines)
      { d: line(4, 18, 56, 18), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3, dashed: true },
      { d: line(4, 36, 56, 36), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3, dashed: true },
    ],
  },
  // Banheiro
  module_vanity_sink_single: {
    sizeM: { w: 0.7, h: 0.5 }, label: "Vanity 1 cuba", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 66, 46), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // single oval basin (encaixada no centro)
      { d: `M35 24 m-15 0 a15 11 0 1 0 30 0 a15 11 0 1 0 -30 0`, fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.4 },
      // drain
      circ(35, 24, 1.5),
      { d: rect(31, 4, 8, 3), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_vanity_sink_double: {
    sizeM: { w: 1.4, h: 0.5 }, label: "Vanity 2 cubas", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 136, 46), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // 2 ovals
      { d: `M40 24 m-15 0 a15 11 0 1 0 30 0 a15 11 0 1 0 -30 0`, fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.4 },
      circ(40, 24, 1.5),
      { d: `M100 24 m-15 0 a15 11 0 1 0 30 0 a15 11 0 1 0 -30 0`, fill: "#a8a8a0", stroke: STROKE_FINE, strokeWidth: 0.4 },
      circ(100, 24, 1.5),
      { d: rect(36, 4, 8, 3), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: rect(96, 4, 8, 3), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_vanity_drawer_3: {
    sizeM: { w: 0.5, h: 0.5 }, label: "Gaveteiro banh.", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 46, 46), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 17, 48, 17), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 32, 48, 32), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(20, 9, 30, 9), fill: null, stroke: STROKE, strokeWidth: 0.4 },
      { d: line(20, 24, 30, 24), fill: null, stroke: STROKE, strokeWidth: 0.4 },
      { d: line(20, 40, 30, 40), fill: null, stroke: STROKE, strokeWidth: 0.4 },
    ],
  },
  module_wall_hung_toilet: {
    sizeM: { w: 0.4, h: 0.65 }, label: "Vaso suspenso", category: "Marcenaria",
    paths: [
      // tank (back, against wall)
      { d: rect(4, 2, 32, 18), fill: BODY, stroke: STROKE, strokeWidth: 0.6 },
      // bowl (oval forward into room)
      { d: `M20 38 m-14 0 a14 18 0 1 0 28 0 a14 18 0 1 0 -28 0`, fill: BODY, stroke: STROKE, strokeWidth: 0.6 },
    ],
  },
  // Closet — em planta o tracejado fino sugere cabide; gavetas iguais aos
  // gaveteiros genericos; sapateira como serie de prateleiras inclinadas.
  module_closet_hanging_full: {
    sizeM: { w: 0.9, h: 0.6 }, label: "Cabide", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // hanger rod indication: thick line down center top
      { d: line(2, 12, 88, 12), fill: null, stroke: STROKE, strokeWidth: 0.6 },
      // hanger silhouettes
      { d: `M14 18 L10 24 L22 24 L18 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M34 18 L30 24 L42 24 L38 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M54 18 L50 24 L62 24 L58 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M74 18 L70 24 L82 24 L78 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_closet_hanging_double: {
    sizeM: { w: 0.9, h: 0.6 }, label: "Cabide duplo", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 86, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 12, 88, 12), fill: null, stroke: STROKE, strokeWidth: 0.6 },
      { d: line(2, 36, 88, 36), fill: null, stroke: STROKE, strokeWidth: 0.6 },
      // hangers x 4 in each rod
      { d: `M14 18 L10 24 L22 24 L18 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M44 18 L40 24 L52 24 L48 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M74 18 L70 24 L82 24 L78 18 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M14 42 L10 48 L22 48 L18 42 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M44 42 L40 48 L52 48 L48 42 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: `M74 42 L70 48 L82 48 L78 42 Z`, fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_closet_drawer_4: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Gaveteiro 4", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 16, 58, 16), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 30, 58, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 44, 58, 44), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  module_closet_drawer_6: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Gaveteiro 6", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 11, 58, 11), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 20, 58, 20), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 29, 58, 29), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 38, 58, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 47, 58, 47), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  module_closet_shoe: {
    sizeM: { w: 0.6, h: 0.4 }, label: "Sapateira", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 36), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.7 },
      // angled shelves (inclined lines suggesting shoe storage)
      { d: line(4, 12, 56, 8), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(4, 22, 56, 18), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(4, 32, 56, 28), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_closet_shelves: {
    sizeM: { w: 0.6, h: 0.4 }, label: "Prateleiras", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 36), fill: BODY_SOFT, stroke: STROKE, strokeWidth: 0.7 },
      { d: line(2, 11, 58, 11), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(2, 20, 58, 20), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(2, 29, 58, 29), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_closet_jewelry: {
    sizeM: { w: 0.45, h: 0.5 }, label: "Joias", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 41, 46), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // small compartments grid
      { d: line(2, 16, 43, 16), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(2, 30, 43, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(15, 2, 15, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(28, 2, 28, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  // Lavanderia — máquinas com porta circular características.
  module_washer_niche: {
    sizeM: { w: 0.65, h: 0.65 }, label: "Lavadora", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 61, 61), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // circular door
      circ(32, 32, 18),
      { d: `M14 32 A18 18 0 0 1 50 32 A18 18 0 0 1 14 32`, fill: GLASS, stroke: STROKE, strokeWidth: 0.5 },
      circ(32, 32, 12),
      // control panel
      { d: rect(8, 6, 50, 6), fill: APPLIANCE_LIGHT, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_dryer_niche: {
    sizeM: { w: 0.65, h: 0.65 }, label: "Secadora", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 61, 61), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      circ(32, 32, 18),
      { d: `M14 32 A18 18 0 0 1 50 32 A18 18 0 0 1 14 32`, fill: GLASS, stroke: STROKE, strokeWidth: 0.5 },
      circ(32, 32, 12),
      { d: rect(8, 6, 50, 6), fill: APPLIANCE_LIGHT, stroke: STROKE_FINE, strokeWidth: 0.3 },
      // little flame icon to differentiate (heat indicator)
      circ(54, 54, 2),
    ],
  },
  module_washer_dryer_stack: {
    sizeM: { w: 0.65, h: 0.65 }, label: "Lav+sec vert", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 61, 61), fill: BODY, stroke: STROKE, strokeWidth: 0.8 },
      // 2 stacked circular doors
      circ(32, 18, 13),
      { d: `M19 18 A13 13 0 0 1 45 18 A13 13 0 0 1 19 18`, fill: GLASS, stroke: STROKE, strokeWidth: 0.4 },
      circ(32, 46, 13),
      { d: `M19 46 A13 13 0 0 1 45 46 A13 13 0 0 1 19 46`, fill: GLASS, stroke: STROKE, strokeWidth: 0.4 },
      // divider
      { d: line(2, 32, 63, 32), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_laundry_tank: {
    sizeM: { w: 0.6, h: 0.55 }, label: "Tanque", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 51), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // big rectangular basin
      { d: rect(8, 8, 44, 39), fill: "#a8a8a0", stroke: STROKE, strokeWidth: 0.5 },
      { d: rect(11, 11, 38, 33), fill: "#888880", stroke: STROKE_FINE, strokeWidth: 0.3 },
      // drain
      circ(30, 27, 1.5),
      // washboard ridges (3 horizontal lines)
      { d: line(11, 18, 49, 18), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(11, 24, 49, 24), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
      { d: line(11, 30, 49, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_drying_rack_built_in: {
    sizeM: { w: 1.0, h: 0.5 }, label: "Varal", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 96, 46), fill: BODY_SOFT, stroke: STROKE_FINE, strokeWidth: 0.5 },
      // 4 horizontal rods
      { d: line(2, 14, 98, 14), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 22, 98, 22), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 30, 98, 30), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(2, 38, 98, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  // Churrasqueira / gourmet
  module_bbq_built_in: {
    sizeM: { w: 0.8, h: 0.7 }, label: "Churrasqueira", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 76, 66), fill: BODY_DARK, stroke: STROKE, strokeWidth: 0.8 },
      // grill grid
      { d: rect(8, 12, 64, 48), fill: "#222", stroke: STROKE, strokeWidth: 0.5 },
      { d: line(8, 22, 72, 22), fill: null, stroke: "#555", strokeWidth: 0.3 },
      { d: line(8, 32, 72, 32), fill: null, stroke: "#555", strokeWidth: 0.3 },
      { d: line(8, 42, 72, 42), fill: null, stroke: "#555", strokeWidth: 0.3 },
      { d: line(8, 52, 72, 52), fill: null, stroke: "#555", strokeWidth: 0.3 },
      // chimney mark (small rect at back)
      { d: rect(30, 4, 20, 5), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_pizza_oven: {
    sizeM: { w: 0.7, h: 0.7 }, label: "Forno pizza", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 66, 66), fill: BODY_DARK, stroke: STROKE, strokeWidth: 0.8 },
      // dome (semi-circle)
      { d: `M14 50 A20 18 0 0 1 54 50 L54 56 L14 56 Z`, fill: "#3a3a30", stroke: STROKE, strokeWidth: 0.5 },
      { d: `M20 50 A14 12 0 0 1 48 50`, fill: null, stroke: "#666", strokeWidth: 0.3 },
      // fire opening
      { d: rect(28, 44, 12, 8), fill: "#882200", stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_outdoor_cooktop: {
    sizeM: { w: 0.75, h: 0.6 }, label: "Cooktop ext.", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 71, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      circ(18, 18, 6), circ(54, 18, 6), circ(18, 42, 6), circ(54, 42, 6),
    ],
  },
  module_outdoor_sink: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Cuba ext.", category: "Marcenaria",
    paths: [
      { d: rrect(8, 8, 44, 44, 4), fill: "#dad6c8", stroke: STROKE, strokeWidth: 0.6 },
      { d: rrect(12, 12, 36, 36, 3), fill: "#888", stroke: STROKE_FINE, strokeWidth: 0.3 },
      circ(30, 30, 1.5),
      { d: rect(26, 2, 8, 4), fill: STONE, stroke: STROKE_FINE, strokeWidth: 0.3 },
    ],
  },
  module_wine_fridge_outdoor: {
    sizeM: { w: 0.6, h: 0.6 }, label: "Frigobar ext.", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 56), fill: APPLIANCE, stroke: STROKE, strokeWidth: 0.7 },
      { d: rect(6, 6, 48, 48), fill: GLASS, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: rect(14, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
      { d: rect(28, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
      { d: rect(42, 12, 4, 36), fill: WATER_DARK, stroke: null, strokeWidth: 0 },
    ],
  },
  // Sala
  module_tv_console: {
    sizeM: { w: 1.8, h: 0.4 }, label: "Console TV", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 176, 36), fill: BODY, stroke: STROKE, strokeWidth: 0.7 },
      // 3 doors
      { d: line(60, 2, 60, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
      { d: line(120, 2, 120, 38), fill: null, stroke: STROKE_FINE, strokeWidth: 0.4 },
    ],
  },
  module_tv_panel_built_in: {
    sizeM: { w: 2.4, h: 0.2 }, label: "Painel TV", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 236, 16), fill: BODY_DARK, stroke: STROKE, strokeWidth: 0.7 },
      // ripado vertical lines indicating wood slat finish
      ...Array.from({ length: 14 }, (_, i) => ({
        d: line(20 + i * 16, 2, 20 + i * 16, 18), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3,
      })),
    ],
  },
  // Composição (geradas pela engine) — render especial em Floorplan2D.tsx
  bancada_continuous: {
    sizeM: { w: 1.0, h: 0.04 }, label: "Bancada", category: "Marcenaria",
    // Paths vazios — bancada renderiza via custom branch em Floorplan2D
    // que usa cutouts pra furar onde tem sink/cooktop e aplica hachura
    // por material via <pattern>.
    paths: [],
  },
  module_upper_cabinet: {
    sizeM: { w: 0.6, h: 0.35 }, label: "Sup", category: "Marcenaria",
    // Tracejado porque está suspenso (acima do plano de corte de 1m).
    paths: [
      { d: rect(2, 2, 56, 31), fill: null, stroke: STROKE_FINE, strokeWidth: 0.6, dashed: true },
      // door split hairline
      { d: line(30, 2, 30, 33), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3, dashed: true },
    ],
  },
  module_upper_glass: {
    sizeM: { w: 0.6, h: 0.35 }, label: "Sup vidro", category: "Marcenaria",
    paths: [
      { d: rect(2, 2, 56, 31), fill: GLASS, stroke: STROKE_FINE, strokeWidth: 0.6, dashed: true },
      { d: line(30, 2, 30, 33), fill: null, stroke: STROKE_FINE, strokeWidth: 0.3, dashed: true },
    ],
  },
  hood_built_in: {
    sizeM: { w: 0.6, h: 0.5 }, label: "Exaustor", category: "Marcenaria",
    paths: [
      // Hood is suspended above the cooktop — dashed outline + hatch.
      { d: rect(2, 2, 56, 46), fill: null, stroke: STROKE_FINE, strokeWidth: 0.5, dashed: true },
      // diagonal hatch
      { d: line(2, 2, 58, 48), fill: null, stroke: STROKE_FINE, strokeWidth: 0.25, dashed: true },
      { d: line(58, 2, 2, 48), fill: null, stroke: STROKE_FINE, strokeWidth: 0.25, dashed: true },
    ],
  },
};

// ---------- Utilities ----------

export function defaultFurnitureSize(t: FurnitureType): { w: number; h: number } {
  return FURN_DEFS[t].sizeM;
}

export function defaultFurnitureLabel(t: FurnitureType): string {
  return FURN_DEFS[t].label;
}

export function furnitureCategory(t: FurnitureType): string {
  return FURN_DEFS[t].category;
}

/** True when this type has a path-based SVG drawing in the registry. */
export function hasSvgPaths(t: FurnitureType): boolean {
  return FURN_DEFS[t].paths.length > 0;
}

/** Render the registry's paths into the canvas at the given pixel rect. */
export function drawFurnitureSvg(
  ctx: CanvasRenderingContext2D,
  type: FurnitureType,
  px: number,
  py: number,
  pw: number,
  ph: number
) {
  const def = FURN_DEFS[type];
  if (!def || def.paths.length === 0) return;
  const vbW = def.sizeM.w * 100;
  const vbH = def.sizeM.h * 100;
  if (vbW <= 0 || vbH <= 0) return;

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(pw / vbW, ph / vbH);
  for (const ps of def.paths) {
    ctx.save();
    if (ps.dashed) ctx.setLineDash([3, 3]);
    if (ps.circle) {
      ctx.beginPath();
      ctx.arc(ps.circle.cx, ps.circle.cy, ps.circle.r, 0, Math.PI * 2);
      if (ps.fill !== null) {
        ctx.fillStyle = ps.fill ?? BODY;
        ctx.fill();
      }
      ctx.strokeStyle = ps.stroke ?? STROKE;
      ctx.lineWidth = (ps.strokeWidth ?? 1.2) * (vbW / Math.max(pw, 1));
      ctx.stroke();
    } else if (ps.d) {
      const path = new Path2D(ps.d);
      if (ps.fill !== null) {
        ctx.fillStyle = ps.fill ?? BODY;
        ctx.fill(path);
      }
      if (ps.stroke !== null) {
        ctx.strokeStyle = ps.stroke ?? STROKE;
        // Counter the scale so stroke width renders in true pixels.
        ctx.lineWidth = (ps.strokeWidth ?? 1.2) * (vbW / Math.max(pw, 1));
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
