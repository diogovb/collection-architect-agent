// Placement validators — run BEFORE adding/moving a piece of furniture so
// the engine can reject geometrically wrong placements with rich error
// messages the agent can act on. The actual `add_furniture` tool result
// turns these into descriptive failure strings that include the available
// alternatives ("walls disponíveis: north 2.4m livre, east 1.8m após sofá").
//
// Strategy: each validator returns either `{ ok: true }` or
// `{ ok: false, reason: string }`. Reasons read naturally to the model
// — they cite distances, list occupied vs free spots, and suggest the
// kind of fix that would unblock placement. No coords magic.

import type { Door, FloorPlan, Furniture, Room, Window } from "../types";
import type { FurniturePlacement } from "../types";
import { getPlacement } from "../furniture-placement";
import { worldAABB } from "../plan-geometry";
import { legacySwingGeometry, quarterDiscIntersectsRect } from "./door-swing";
import { TOL_CONTACT_M, TOL_WALL_TOUCH_M } from "./tolerances";

const EPS = TOL_CONTACT_M;

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bbox VISUAL do móvel — transpõe largura/altura quando rotacionado 90/270°
 *  (o renderer gira o glifo em torno do centro do bbox armazenado). */
function bboxOf(f: { x: number; y: number; width: number; height: number; rotation?: number }): BBox {
  return worldAABB(f);
}

function bboxOverlap(a: BBox, b: BBox, inset = 0.001): boolean {
  return (
    a.x + a.w - inset > b.x &&
    a.x + inset < b.x + b.w &&
    a.y + a.h - inset > b.y &&
    a.y + inset < b.y + b.h
  );
}

export interface PlacementResult {
  ok: boolean;
  reason?: string;
  /** Avisos ergonômicos NÃO bloqueantes (relações sofá↔TV etc.) — anexados
   *  à mensagem de sucesso para o agente avaliar sem ser travado. */
  advisories?: string[];
}

/** True when a side of the bbox sits flush with one of the room's 4 walls
 *  (axis-aligned tolerance). */
function touchedWalls(bb: BBox, room: Room, tol = TOL_WALL_TOUCH_M): { north: boolean; south: boolean; east: boolean; west: boolean } {
  return {
    north: Math.abs(bb.y - room.y) <= tol,
    south: Math.abs(bb.y + bb.h - (room.y + room.height)) <= tol,
    west: Math.abs(bb.x - room.x) <= tol,
    east: Math.abs(bb.x + bb.w - (room.x + room.width)) <= tol,
  };
}

function countTouching(bb: BBox, room: Room): number {
  const t = touchedWalls(bb, room);
  return Number(t.north) + Number(t.south) + Number(t.east) + Number(t.west);
}

/** Returns a human-readable list of corners with their occupation state
 *  (free / occupied by X). Drives error messages so the agent picks a
 *  free corner on retry. */
function describeCorners(room: Room, existing: Furniture[]): string {
  const corners = [
    { name: "NW", x: room.x, y: room.y },
    { name: "NE", x: room.x + room.width, y: room.y },
    { name: "SE", x: room.x + room.width, y: room.y + room.height },
    { name: "SW", x: room.x, y: room.y + room.height },
  ];
  const out: string[] = [];
  for (const c of corners) {
    const cellSize = 0.6;
    const probe = {
      x: Math.max(room.x, c.x === room.x ? room.x : room.x + room.width - cellSize),
      y: Math.max(room.y, c.y === room.y ? room.y : room.y + room.height - cellSize),
      w: cellSize,
      h: cellSize,
    };
    const occ = existing.find((f) => f.roomId === room.id && bboxOverlap(probe, bboxOf(f), 0.01));
    out.push(`${c.name} ${occ ? `(${occ.label})` : "(livre)"}`);
  }
  return out.join(", ");
}

/** Linear free length on each wall after subtracting existing furniture
 *  + door + window footprints. Used in error messages so the agent can
 *  pick a wall with enough space. */
function describeWalls(room: Room, existing: Furniture[], doors: Door[], windows: Window[]): string {
  type WallKey = "north" | "south" | "east" | "west";
  const walls: Record<WallKey, number> = {
    north: room.width,
    south: room.width,
    east: room.height,
    west: room.height,
  };
  const occupants: Record<WallKey, number> = { north: 0, south: 0, east: 0, west: 0 };
  for (const f of existing) {
    if (f.roomId !== room.id) continue;
    const bb = bboxOf(f);
    const t = touchedWalls(bb, room);
    if (t.north) occupants.north += bb.w;
    if (t.south) occupants.south += bb.w;
    if (t.west) occupants.west += bb.h;
    if (t.east) occupants.east += bb.h;
  }
  for (const d of doors) {
    if (d.roomId !== room.id) continue;
    occupants[d.wall as WallKey] += d.size ?? 0.8;
  }
  for (const w of windows) {
    if (w.roomId !== room.id) continue;
    occupants[w.wall as WallKey] += w.size ?? 1.0;
  }
  const labels: Record<WallKey, string> = { north: "N", south: "S", east: "L", west: "O" };
  return (Object.keys(walls) as WallKey[])
    .map((k) => `${labels[k]} ${(walls[k] - occupants[k]).toFixed(2)}m livres`)
    .join(", ");
}

/** Validates `anchorTo` against the actual bbox+room. */
export function validateAnchor(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[]
): PlacementResult {
  if (placement.anchorTo === "free") return { ok: true };
  const touching = countTouching(bb, room);
  if (placement.anchorTo === "wall" && touching < 1) {
    return {
      ok: false,
      reason: `precisa estar contra uma parede (anchorTo: "wall") mas o item está flutuando. Paredes: ${describeWalls(room, existing, [], [])}.`,
    };
  }
  if (placement.anchorTo === "corner" && touching < 2) {
    return {
      ok: false,
      reason: `precisa estar em um canto (anchorTo: "corner") mas só ${touching} face(s) tocando parede. Cantos: ${describeCorners(room, existing)}.`,
    };
  }
  if (placement.anchorTo === "wall-or-corner" && touching < 1) {
    return {
      ok: false,
      reason: `precisa estar contra parede ou canto mas o item está flutuando. Cantos disponíveis: ${describeCorners(room, existing)}.`,
    };
  }
  return { ok: true };
}

/** Front-zone rect on a given side of the bbox. */
function frontZoneRect(bb: BBox, side: "north" | "south" | "east" | "west", depth: number): BBox {
  if (side === "north") return { x: bb.x, y: bb.y - depth, w: bb.w, h: depth };
  if (side === "south") return { x: bb.x, y: bb.y + bb.h, w: bb.w, h: depth };
  if (side === "west") return { x: bb.x - depth, y: bb.y, w: depth, h: bb.h };
  return { x: bb.x + bb.w, y: bb.y, w: depth, h: bb.h };
}

const OPPOSITE: Record<"north" | "south" | "east" | "west", "north" | "south" | "east" | "west"> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** Validates that the FRONT clearance rectangle is empty of non-rug
 *  furniture. Side clearances (left/right) are silently skipped — in
 *  real kitchens/bathrooms appliances sit shoulder-to-shoulder against
 *  a wall (fogão+pia+geladeira em linha), and enforcing 30-60cm side
 *  gaps on every appliance makes the solver impossible. Front clearance
 *  IS the one that matters for usability (you need to open oven door,
 *  pull a chair, kneel to clean).
 *
 *  Which side is "front": for wall-anchored items, the side OPPOSITE the
 *  touched wall (the back). Checking every inside-room zone — the old
 *  behaviour — falsely rejected side-by-side furniture (criado-mudo ao
 *  lado da cama tropeçava na distância FRONTAL da cama). */
export function validateClearance(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[]
): PlacementResult {
  const front = placement.clearance.front;
  if (front <= EPS) return { ok: true };

  const t = touchedWalls(bb, room);
  const touched = (["north", "south", "east", "west"] as const).filter((k) => t[k]);

  let zonesToCheck: BBox[];
  if (touched.length >= 1) {
    // Back wall = the touched wall along the item's LONGER contact side
    // (a bed touches the headboard wall with its width). Front = opposite.
    const contactLen = (k: "north" | "south" | "east" | "west") =>
      k === "north" || k === "south" ? bb.w : bb.h;
    let back = touched[0];
    for (const k of touched) if (contactLen(k) > contactLen(back)) back = k;
    zonesToCheck = [frontZoneRect(bb, OPPOSITE[back], front)];
  } else {
    // Free-standing item: any blocked surrounding zone counts (mesas e
    // poltronas precisam de acesso ao redor). Zones outside the room are
    // skipped (they face a wall).
    zonesToCheck = (["north", "south", "east", "west"] as const)
      .map((side) => frontZoneRect(bb, side, front))
      .filter((z) => {
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        return (
          cx >= room.x - EPS && cx <= room.x + room.width + EPS &&
          cy >= room.y - EPS && cy <= room.y + room.height + EPS
        );
      });
  }

  for (const zone of zonesToCheck) {
    for (const f of existing) {
      if (f.roomId !== room.id) continue;
      const fp = getPlacement(f.type);
      if (fp.category === "rug" || fp.category === "decor") continue;
      if (bboxOverlap(zone, bboxOf(f), EPS)) {
        return {
          ok: false,
          reason: `clearance frontal violado (precisa ${front.toFixed(2)}m livres na frente, mas '${f.label}' está bloqueando).`,
        };
      }
    }
  }
  return { ok: true };
}

/** Reject placements that fall inside the door swing ARC ONLY. We used
 *  to also block a 60cm "approach zone" perpendicular to the wall, but
 *  in small rooms (cozinha 3m fundo) that ate half the room and made
 *  the solver mathematically unable to fit kitchen+door+window+three
 *  appliances. Real architects allow furniture pretty close to the
 *  door wall as long as it doesn't fall in the 90° swing radius.
 *
 *  Uses the REAL quarter-disc of the door (hinge side + swing direction),
 *  not the old size×size bounding square — the square rejected valid
 *  spots in the corner the leaf never sweeps. */
export function validateDoorClearance(
  bb: BBox,
  room: Room,
  doors: Door[]
): PlacementResult {
  for (const d of doors) {
    if (d.roomId !== room.id) continue;
    const size = d.size ?? 0.8;
    const pos = d.position ?? 0.5;
    const hinge = d.hinge ?? (pos <= 0.5 ? "near" : "far");
    const swing = d.swing ?? "in";
    if (swing === "out") continue; // a folha abre para o cômodo vizinho
    const g = legacySwingGeometry(room, d.wall, pos, size, hinge, swing);
    // Encolhe o bbox 5 cm para perdoar contatos de borda (mesmo inset do
    // antigo bboxOverlap(zone, bb, 0.05)).
    const inset = 0.05;
    const shrunk: BBox = {
      x: bb.x + inset,
      y: bb.y + inset,
      w: Math.max(0, bb.w - 2 * inset),
      h: Math.max(0, bb.h - 2 * inset),
    };
    if (quarterDiscIntersectsRect(g, shrunk)) {
      const lado = hinge === "near" ? "início" : "fim";
      return {
        ok: false,
        reason: `cai dentro do arco de abertura da porta da parede ${d.wall} (raio ${size.toFixed(2)}m, dobradiça no ${lado} da parede). Posicione fora do quadrante de giro da folha.`,
      };
    }
  }
  return { ok: true };
}

/** Window clearance — DISABLED FOR PLACEMENT. Sink under window is a
 *  classic kitchen layout, dressers under window is a classic bedroom
 *  layout, etc. The old 30cm rule rejected those sensible patterns.
 *  Kept as a no-op so call sites don't need to change; we leave the
 *  visual review pass (Phase D) to flag truly bad cases like a giant
 *  wardrobe blocking a window. */
export function validateWindowClearance(
  _bb: BBox,
  _room: Room,
  _windows: Window[]
): PlacementResult {
  return { ok: true };
}

/** Validates ergonomic relations declared in metadata (kitchen triangle,
 *  sofa↔TV viewing distance). NON-BLOCKING — relations are advisory: the
 *  violation goes into `advisories` so the agent SEES it, but the
 *  placement happens. Hard-blocking the triangle in a 3.5×3m kitchen
 *  leaves no valid layout (geladeira-pia-fogão sobre duas paredes sempre
 *  estoura 2.7m). */
export function validateRelations(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[],
  label?: string,
): PlacementResult {
  if (!placement.relations || placement.relations.length === 0) return { ok: true };
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  const advisories: string[] = [];
  for (const rel of placement.relations) {
    const partners = existing.filter((f) => f.roomId === room.id && f.type === rel.withType);
    if (partners.length === 0) continue;
    let closest: { f: Furniture; d: number } | null = null;
    for (const p of partners) {
      const pb = bboxOf(p);
      const px = pb.x + pb.w / 2;
      const py = pb.y + pb.h / 2;
      const d = Math.hypot(px - cx, py - cy);
      if (!closest || d < closest.d) closest = { f: p, d };
    }
    if (!closest) continue;
    if (closest.d < rel.minDist || closest.d > rel.maxDist) {
      const hint = rel.hint ? ` — ${rel.hint}` : "";
      advisories.push(
        `Atenção: ${label ?? "o item"} ficou a ${closest.d.toFixed(2)}m de ${closest.f.label} (recomendado ${rel.minDist.toFixed(1)}–${rel.maxDist.toFixed(1)}m${hint}).`
      );
    }
  }
  return { ok: true, ...(advisories.length > 0 ? { advisories } : {}) };
}

/** All-in-one entry point. Runs every validator in order; first failure
 *  wins — we want a single clear reason instead of a wall-of-errors. */
export function validatePlacement(
  proposed: { type: import("../types").FurnitureType; x: number; y: number; width: number; height: number; label?: string },
  room: Room,
  plan: FloorPlan,
): PlacementResult {
  const bb: BBox = { x: proposed.x, y: proposed.y, w: proposed.width, h: proposed.height };
  const placement = getPlacement(proposed.type);
  const existing = plan.furniture;

  const r1 = validateAnchor(bb, room, placement, existing);
  if (!r1.ok) return r1;

  const r2 = validateDoorClearance(bb, room, plan.doors);
  if (!r2.ok) return r2;

  const r3 = validateWindowClearance(bb, room, plan.windows);
  if (!r3.ok) return r3;

  const r4 = validateClearance(bb, room, placement, existing);
  if (!r4.ok) return r4;

  const r5 = validateRelations(bb, room, placement, existing, proposed.label);
  if (!r5.ok) return r5;

  return { ok: true, ...(r5.advisories ? { advisories: r5.advisories } : {}) };
}

/** Build a one-line summary of the room's free space + occupied corners
 *  for the agent to consume on a retry. Always cheap to compute. */
export function summarizeRoomLayout(room: Room, plan: FloorPlan): string {
  const existing = plan.furniture.filter((f) => f.roomId === room.id);
  return `Cômodo '${room.name}' (${room.width}×${room.height}m). Cantos: ${describeCorners(room, plan.furniture)}. Paredes: ${describeWalls(room, plan.furniture, plan.doors, plan.windows)}. Itens: ${
    existing.length === 0 ? "nenhum" : existing.map((f) => `${f.label}(${f.x.toFixed(1)},${f.y.toFixed(1)},${f.width}×${f.height})`).join(", ")
  }.`;
}
