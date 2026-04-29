// Server-side PNG renderer for visual feedback loop (Phase D).
//
// Strategy: build a clean architectural SVG from the legacy FloorPlan
// (rooms, doors, windows, furniture) and convert to PNG via resvg-js.
// We deliberately do NOT reuse Floorplan2D (heavy React + many hooks);
// the agent only needs a clear top-down view to spot blocking, overlap,
// missing items. Less is more.

import type { Door, FloorPlan, Furniture, Room, Window } from "../types";
import { FURN_DEFS } from "../furniture-svgs";

const PADDING = 1.0; // metres around the building bbox
const PX_PER_M = 60; // ~60 px / metre at default zoom
const STROKE_WALL = 2.0;
const STROKE_FINE = 0.6;

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
  return `<g>
    <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${fill}" stroke="#222" stroke-width="${STROKE_FINE}" />
    <text x="${cx}" y="${cy - 0.1}" text-anchor="middle" font-family="serif" font-size="0.32" fill="#222">${label}</text>
    <text x="${cx}" y="${cy + 0.3}" text-anchor="middle" font-family="monospace" font-size="0.22" fill="#666">${area} m²</text>
  </g>`;
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
  // White slot to "erase" the wall, plus a quarter-arc to suggest the swing.
  const px = -dy; // perpendicular into room (sign-agnostic)
  const py = dx;
  const insideOffset = (d.wall === "north" || d.wall === "west") ? 1 : -1;
  const arcEndX = x1 + px * size * insideOffset;
  const arcEndY = y1 + py * size * insideOffset;
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${STROKE_WALL * 1.2}" />
    <line x1="${x1}" y1="${y1}" x2="${arcEndX}" y2="${arcEndY}" stroke="#888" stroke-width="${STROKE_FINE}" stroke-dasharray="0.08 0.05" />
    <path d="M ${arcEndX} ${arcEndY} A ${size} ${size} 0 0 ${insideOffset > 0 ? 1 : 0} ${x2} ${y2}" fill="none" stroke="#888" stroke-width="${STROKE_FINE}" stroke-dasharray="0.08 0.05" />
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
  const px = -dy * 0.05;
  const py = dx * 0.05;
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${STROKE_WALL}" />
    <line x1="${x1 + px}" y1="${y1 + py}" x2="${x2 + px}" y2="${y2 + py}" stroke="#1F4F7A" stroke-width="${STROKE_FINE}" />
    <line x1="${x1 - px}" y1="${y1 - py}" x2="${x2 - px}" y2="${y2 - py}" stroke="#1F4F7A" stroke-width="${STROKE_FINE}" />
  </g>`;
}

function renderFurniture(f: Furniture): string {
  const def = FURN_DEFS[f.type];
  const label = escapeXml(f.label || def?.label || f.type);
  // Tag rugs lighter so they don't dominate visually.
  const isRug = /^rug|carpet|mat/i.test(f.type);
  const fill = isRug ? "#EFEAD8" : "#F4F4EF";
  const stroke = isRug ? "#999" : "#444";
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  // Show rotation if any.
  const rotate = (f.rotation ?? 0) % 360;
  const transform = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : "";
  return `<g${transform}>
    <rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" fill="${fill}" stroke="${stroke}" stroke-width="${STROKE_FINE}" />
    <text x="${cx}" y="${cy + 0.08}" text-anchor="middle" font-family="sans-serif" font-size="0.18" fill="#333">${label}</text>
  </g>`;
}

/** Build a clean architectural SVG of the plan suitable for converting
 *  to PNG and feeding back to the model. World coords are used inside
 *  the SVG; the outer viewBox handles the meter→pixel mapping. */
export function renderPlanSvg(plan: FloorPlan): string {
  const bb = planBounds(plan);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const widthPx = Math.round(w * PX_PER_M);
  const heightPx = Math.round(h * PX_PER_M);

  const rooms = (plan.rooms ?? []).map(renderRoom).join("\n");
  const doors = (plan.doors ?? []).map((d) => renderDoor(plan, d)).join("\n");
  const windows = (plan.windows ?? []).map((wi) => renderWindow(plan, wi)).join("\n");
  const furniture = (plan.furniture ?? []).map(renderFurniture).join("\n");

  // Grid for visual scale reference (1m squares, very subtle).
  const gridLines: string[] = [];
  for (let x = Math.ceil(bb.minX); x < bb.maxX; x++) {
    gridLines.push(`<line x1="${x}" y1="${bb.minY}" x2="${x}" y2="${bb.maxY}" stroke="#E8E5DC" stroke-width="${STROKE_FINE / 2}" />`);
  }
  for (let y = Math.ceil(bb.minY); y < bb.maxY; y++) {
    gridLines.push(`<line x1="${bb.minX}" y1="${y}" x2="${bb.maxX}" y2="${y}" stroke="#E8E5DC" stroke-width="${STROKE_FINE / 2}" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="${bb.minX} ${bb.minY} ${w} ${h}">
  <rect x="${bb.minX}" y="${bb.minY}" width="${w}" height="${h}" fill="#FAF7F0" />
  <g class="grid" opacity="0.5">${gridLines.join("")}</g>
  <g class="rooms">${rooms}</g>
  <g class="furniture">${furniture}</g>
  <g class="doors">${doors}</g>
  <g class="windows">${windows}</g>
</svg>`;
}

/** Render the plan as a PNG buffer (1024 px wide). Uses @resvg/resvg-js
 *  (Rust SVG renderer, no headless browser). */
export async function renderPlanPng(plan: FloorPlan, widthPx = 1024): Promise<Buffer> {
  // Lazy import so the dep is only loaded server-side / when used.
  const { Resvg } = await import("@resvg/resvg-js");
  const svg = renderPlanSvg(plan);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: widthPx } });
  const out = resvg.render();
  return out.asPng();
}
