// Server-side PNG renderer for visual feedback loop (Phase D).
//
// Strategy: build a clean architectural SVG from the legacy FloorPlan
// (rooms, doors, windows, furniture) and convert to PNG via resvg-js.
// We deliberately do NOT reuse Floorplan2D (heavy React + many hooks);
// the agent only needs a clear top-down view to spot blocking, overlap,
// missing items. Less is more.

import type { Door, FloorPlan, Furniture, Room, Window } from "../types";
import { FURN_DEFS } from "../furniture-svgs";
import { legacySwingGeometry, type SwingGeometry } from "../scene/door-swing";

const PADDING = 1.0; // metres around the building bbox
const PX_PER_M = 60; // ~60 px / metre at default zoom
// ATENÇÃO: o viewBox do SVG é em METROS — strokes são espessuras em metros.
// (Os valores antigos 2.0/0.6 desenhavam linhas de 2m/60cm e tornavam o PNG
// da revisão visual ilegível para o modelo.)
const STROKE_WALL = 0.12; // "parede" do contorno do cômodo
const STROKE_FINE = 0.025; // contornos de móveis, folhas e arcos
const STROKE_GRID = 0.012;

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Camadas de diagnóstico opcionais nos renders de revisão. */
export interface PlanRenderOverlay {
  /** Hachura as zonas que devem ficar livres (disco de giro das portas;
   *  corredores de aproximação entram junto quando disponíveis). */
  doorZones?: boolean;
  /** IDs de móveis a contornar em vermelho (achados de validador). */
  flaggedIds?: string[];
}

interface RenderOpts {
  /** Recorte do viewBox em coords de mundo (default: planta inteira). */
  bounds?: BBox;
  overlay?: PlanRenderOverlay;
}

function planBounds(plan: FloorPlan): BBox {
  const rooms = plan.rooms ?? [];
  if (rooms.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return {
    minX: minX - PADDING,
    minY: minY - PADDING,
    maxX: maxX + PADDING,
    maxY: maxY + PADDING,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderRoom(r: Room): string {
  const label = escapeXml(r.name);
  const area = (r.width * r.height).toFixed(2);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const fill = r.isBalcony ? "#F0EDE3" : r.isExterior ? "#E8EBDF" : "#FAFAF6";
  // Fonte encolhe para o nome caber dentro do cômodo.
  const fs = Math.max(0.14, Math.min(0.32, (r.width * 1.7) / Math.max(1, label.length)));
  return `<g>
    <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${fill}" stroke="#222" stroke-width="${STROKE_WALL}" />
    <text x="${cx}" y="${cy - 0.1}" text-anchor="middle" font-family="serif" font-size="${fs}" fill="#222">${label}</text>
    <text x="${cx}" y="${cy + 0.3}" text-anchor="middle" font-family="monospace" font-size="${Math.min(0.22, fs * 0.7)}" fill="#666">${area} m²</text>
  </g>`;
}

/** Pontos da folha aberta e do fim do vão + sweep-flag SVG (y para baixo)
 *  para desenhar o arco do quarto de disco a partir da geometria real. */
function swingArcPoints(g: SwingGeometry): {
  leafX: number; leafY: number; endX: number; endY: number; sweep: 0 | 1;
} {
  return {
    leafX: g.hinge.x + g.v.x * g.radius,
    leafY: g.hinge.y + g.v.y * g.radius,
    endX: g.hinge.x + g.u.x * g.radius,
    endY: g.hinge.y + g.u.y * g.radius,
    sweep: g.v.x * g.u.y - g.v.y * g.u.x > 0 ? 1 : 0,
  };
}

/** Geometria de giro de uma porta legada com os mesmos defaults da migração
 *  (dobradiça posicional, abrindo para dentro do cômodo dono). */
function doorSwing(room: Room, d: Door): SwingGeometry {
  const size = d.size ?? 0.8;
  const pos = d.position ?? 0.5;
  const hinge = d.hinge ?? (pos <= 0.5 ? "near" : "far");
  const swing = d.swing ?? "in";
  return legacySwingGeometry(room, d.wall, pos, size, hinge, swing);
}

function renderDoor(plan: FloorPlan, d: Door): string {
  const room = plan.rooms.find((r) => r.id === d.roomId);
  if (!room) return "";
  const size = d.size ?? 0.8;
  const pos = d.position ?? 0.5;
  let cx: number, cy: number, dx: number, dy: number;
  if (d.wall === "north") {
    cx = room.x + pos * room.width;
    cy = room.y;
    dx = 1;
    dy = 0;
  } else if (d.wall === "south") {
    cx = room.x + pos * room.width;
    cy = room.y + room.height;
    dx = 1;
    dy = 0;
  } else if (d.wall === "west") {
    cx = room.x;
    cy = room.y + pos * room.height;
    dx = 0;
    dy = 1;
  } else {
    cx = room.x + room.width;
    cy = room.y + pos * room.height;
    dx = 0;
    dy = 1;
  }
  const x1 = cx - (dx * size) / 2;
  const y1 = cy - (dy * size) / 2;
  const x2 = cx + (dx * size) / 2;
  const y2 = cy + (dy * size) / 2;
  // Vão branco "apagando" a parede + folha/arco com a geometria REAL da
  // porta (hinge/swing persistidos) — a revisão visual depende disso.
  const g = doorSwing(room, d);
  const { leafX, leafY, endX, endY, sweep } = swingArcPoints(g);
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${STROKE_WALL * 1.5}" />
    <line class="door-leaf" x1="${g.hinge.x}" y1="${g.hinge.y}" x2="${leafX}" y2="${leafY}" stroke="#666" stroke-width="${STROKE_FINE}" />
    <path d="M ${leafX} ${leafY} A ${g.radius} ${g.radius} 0 0 ${sweep} ${endX} ${endY}" fill="none" stroke="#888" stroke-width="${STROKE_FINE}" stroke-dasharray="0.08 0.05" />
  </g>`;
}

function renderWindow(plan: FloorPlan, w: Window): string {
  const room = plan.rooms.find((r) => r.id === w.roomId);
  if (!room) return "";
  const size = w.size ?? 1.0;
  const pos = w.position ?? 0.5;
  let cx: number, cy: number, dx: number, dy: number;
  if (w.wall === "north") {
    cx = room.x + pos * room.width;
    cy = room.y;
    dx = 1;
    dy = 0;
  } else if (w.wall === "south") {
    cx = room.x + pos * room.width;
    cy = room.y + room.height;
    dx = 1;
    dy = 0;
  } else if (w.wall === "west") {
    cx = room.x;
    cy = room.y + pos * room.height;
    dx = 0;
    dy = 1;
  } else {
    cx = room.x + room.width;
    cy = room.y + pos * room.height;
    dx = 0;
    dy = 1;
  }
  const x1 = cx - (dx * size) / 2;
  const y1 = cy - (dy * size) / 2;
  const x2 = cx + (dx * size) / 2;
  const y2 = cy + (dy * size) / 2;
  // Two thin parallel lines = window.
  const px = -dy * 0.04;
  const py = dx * 0.04;
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${STROKE_WALL * 1.5}" />
    <line x1="${x1 + px}" y1="${y1 + py}" x2="${x2 + px}" y2="${y2 + py}" stroke="#1F4F7A" stroke-width="${STROKE_FINE}" />
    <line x1="${x1 - px}" y1="${y1 - py}" x2="${x2 - px}" y2="${y2 - py}" stroke="#1F4F7A" stroke-width="${STROKE_FINE}" />
  </g>`;
}

function renderFurniture(f: Furniture): string {
  const def = FURN_DEFS[f.type];
  const label = escapeXml(f.label || def?.label || f.type);
  // Tag rugs lighter so they don't dominate visually.
  const isRug = /^rug|carpet|mat/i.test(f.type);
  const fill = isRug ? "#EFEAD8" : "#E9E2D2";
  const stroke = isRug ? "#999" : "#444";
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  // Show rotation if any.
  const rotate = (f.rotation ?? 0) % 360;
  const transform = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : "";
  // Fonte encolhe para caber no móvel (piso 0.09m — legível a 1024px).
  const fs = Math.max(0.09, Math.min(0.18, (f.width * 1.6) / Math.max(1, label.length)));
  // Texto a 180° ficaria de cabeça para baixo — contra-rotaciona para ler
  // na horizontal (90/270 ficam verticais, padrão de prancheta).
  const textTransform = rotate === 180 ? ` transform="rotate(180 ${cx} ${cy})"` : "";
  return `<g${transform}>
    <rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" fill="${fill}" stroke="${stroke}" stroke-width="${STROKE_FINE}" />
    <text x="${cx}" y="${cy + fs / 3}" text-anchor="middle" font-family="sans-serif" font-size="${fs}" fill="#333"${textTransform}>${label}</text>
  </g>`;
}

/** Zonas que devem ficar livres: o quarto de disco de CADA porta, pintado
 *  por cima dos móveis com tinta leve — invasões ficam visíveis na revisão.
 *  Corredores de aproximação (lado sem giro) entram via plan-geometry. */
function renderDoorZones(plan: FloorPlan): string {
  const parts: string[] = [];
  for (const d of plan.doors ?? []) {
    const room = plan.rooms.find((r) => r.id === d.roomId);
    if (!room) continue;
    const g = doorSwing(room, d);
    const { leafX, leafY, endX, endY, sweep } = swingArcPoints(g);
    parts.push(
      `<path d="M ${g.hinge.x} ${g.hinge.y} L ${leafX} ${leafY} A ${g.radius} ${g.radius} 0 0 ${sweep} ${endX} ${endY} Z" fill="#C0392B" fill-opacity="0.10" stroke="#C0392B" stroke-opacity="0.35" stroke-width="${STROKE_FINE / 2}" stroke-dasharray="0.06 0.06" />`
    );
  }
  return parts.join("\n");
}

/** Contorno vermelho nos móveis apontados pelos validadores. */
function renderFlagged(plan: FloorPlan, ids: string[]): string {
  const wanted = new Set(ids);
  const parts: string[] = [];
  for (const f of plan.furniture ?? []) {
    if (!wanted.has(f.id)) continue;
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    const rotate = (f.rotation ?? 0) % 360;
    const transform = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : "";
    parts.push(
      `<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" fill="none" stroke="#C0392B" stroke-width="${STROKE_FINE * 2}"${transform} />`
    );
  }
  return parts.join("\n");
}

/** Build a clean architectural SVG of the plan suitable for converting
 *  to PNG and feeding back to the model. World coords are used inside
 *  the SVG; the outer viewBox handles the meter→pixel mapping. */
export function renderPlanSvg(plan: FloorPlan, opts?: RenderOpts): string {
  const bb = opts?.bounds ?? planBounds(plan);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const widthPx = Math.round(w * PX_PER_M);
  const heightPx = Math.round(h * PX_PER_M);

  const rooms = (plan.rooms ?? []).map(renderRoom).join("\n");
  const doors = (plan.doors ?? []).map((d) => renderDoor(plan, d)).join("\n");
  const windows = (plan.windows ?? []).map((wi) => renderWindow(plan, wi)).join("\n");
  const furniture = (plan.furniture ?? []).map(renderFurniture).join("\n");
  const zones = opts?.overlay?.doorZones ? renderDoorZones(plan) : "";
  const flagged = opts?.overlay?.flaggedIds?.length
    ? renderFlagged(plan, opts.overlay.flaggedIds)
    : "";

  // Grid for visual scale reference (1m squares, very subtle).
  const gridLines: string[] = [];
  for (let x = Math.ceil(bb.minX); x < bb.maxX; x++) {
    gridLines.push(`<line x1="${x}" y1="${bb.minY}" x2="${x}" y2="${bb.maxY}" stroke="#E8E5DC" stroke-width="${STROKE_GRID}" />`);
  }
  for (let y = Math.ceil(bb.minY); y < bb.maxY; y++) {
    gridLines.push(`<line x1="${bb.minX}" y1="${y}" x2="${bb.maxX}" y2="${y}" stroke="#E8E5DC" stroke-width="${STROKE_GRID}" />`);
  }

  // Régua com METROS nas bordas: transforma a imagem em instrumento de
  // medição — o agente lê uma coordenada na régua e devolve números no
  // place_items (olhar → medir → agir).
  const ruler: string[] = [];
  for (let x = Math.ceil(bb.minX); x <= Math.floor(bb.maxX); x++) {
    ruler.push(`<line x1="${x}" y1="${bb.minY}" x2="${x}" y2="${bb.minY + 0.12}" stroke="#888" stroke-width="${STROKE_GRID * 2}" />`);
    ruler.push(`<text x="${x}" y="${bb.minY + 0.36}" text-anchor="middle" font-family="monospace" font-size="0.2" fill="#777">${x}</text>`);
  }
  for (let y = Math.ceil(bb.minY); y <= Math.floor(bb.maxY); y++) {
    ruler.push(`<line x1="${bb.minX}" y1="${y}" x2="${bb.minX + 0.12}" y2="${y}" stroke="#888" stroke-width="${STROKE_GRID * 2}" />`);
    ruler.push(`<text x="${bb.minX + 0.16}" y="${y + 0.07}" text-anchor="start" font-family="monospace" font-size="0.2" fill="#777">${y}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="${bb.minX} ${bb.minY} ${w} ${h}">
  <rect x="${bb.minX}" y="${bb.minY}" width="${w}" height="${h}" fill="#FAF7F0" />
  <g class="grid" opacity="0.5">${gridLines.join("")}</g>
  <g class="rooms">${rooms}</g>
  <g class="furniture">${furniture}</g>
  <g class="zones">${zones}</g>
  <g class="doors">${doors}</g>
  <g class="windows">${windows}</g>
  <g class="flagged">${flagged}</g>
  <g class="ruler">${ruler.join("")}</g>
</svg>`;
}

async function svgToPng(svg: string, widthPx: number): Promise<Buffer> {
  // Lazy import so the dep is only loaded server-side / when used.
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: widthPx } });
  return resvg.render().asPng();
}

/** Render the plan as a PNG buffer (1024 px wide). Uses @resvg/resvg-js
 *  (Rust SVG renderer, no headless browser). */
export async function renderPlanPng(
  plan: FloorPlan,
  widthPx = 1024,
  overlay?: PlanRenderOverlay
): Promise<Buffer> {
  return svgToPng(renderPlanSvg(plan, overlay ? { overlay } : undefined), widthPx);
}

/** Render com recorte num cômodo (+1m de contexto ao redor) — num apto
 *  grande a 1024px um criado-mudo tem ~25px; o crop devolve a escala em
 *  que os detalhes (porta alcançável, cadeira na mesa) são visíveis. */
export async function renderRoomPng(
  plan: FloorPlan,
  roomId: string,
  widthPx = 1024,
  overlay?: PlanRenderOverlay
): Promise<Buffer> {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return renderPlanPng(plan, widthPx, overlay);
  const bounds: BBox = {
    minX: room.x - PADDING,
    minY: room.y - PADDING,
    maxX: room.x + room.width + PADDING,
    maxY: room.y + room.height + PADDING,
  };
  return svgToPng(renderPlanSvg(plan, { bounds, overlay }), widthPx);
}
