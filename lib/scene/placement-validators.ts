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

const EPS = 0.01;

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bboxOf(f: { x: number; y: number; width: number; height: number }): BBox {
  return { x: f.x, y: f.y, w: f.width, h: f.height };
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
}

/** True when a side of the bbox sits flush with one of the room's 4 walls
 *  (axis-aligned tolerance). */
function touchedWalls(bb: BBox, room: Room, tol = 0.05): { north: boolean; south: boolean; east: boolean; west: boolean } {
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

/** Validates that the clearance rectangle on each side is empty of
 *  non-rug furniture and stays within the room polygon. */
export function validateClearance(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[]
): PlacementResult {
  // Map "front/back/left/right" to absolute rectangles based on wallFace.
  // Convention: wallFace=back means the back face is on the wall (top of
  // bbox in plan view); rotation comes from which wall is touched.
  // For now we treat the FOUR sides of the bbox uniformly using the
  // smallest non-zero clearance — good enough for door/window/overlap.
  const sides = [
    { name: "frente", side: "front", rect: { x: bb.x - 0.001, y: bb.y + bb.h, w: bb.w, h: placement.clearance.front } },
    { name: "trás", side: "back", rect: { x: bb.x - 0.001, y: bb.y - placement.clearance.back, w: bb.w, h: placement.clearance.back } },
    { name: "esquerda", side: "left", rect: { x: bb.x - placement.clearance.left, y: bb.y - 0.001, w: placement.clearance.left, h: bb.h } },
    { name: "direita", side: "right", rect: { x: bb.x + bb.w, y: bb.y - 0.001, w: placement.clearance.right, h: bb.h } },
  ];
  for (const s of sides) {
    if (s.rect.w <= EPS || s.rect.h <= EPS) continue;
    for (const f of existing) {
      if (f.roomId !== room.id) continue;
      const fp = getPlacement(f.type);
      if (fp.category === "rug" || fp.category === "decor") continue;
      if (bboxOverlap(s.rect, bboxOf(f), 0.01)) {
        return {
          ok: false,
          reason: `clearance violado à ${s.name} (precisa ${(s.rect.w || s.rect.h).toFixed(2)}m livres, mas '${f.label}' está nessa área).`,
        };
      }
    }
  }
  return { ok: true };
}

/** Reject placements that fall inside the door swing arc OR the 60 cm
 *  approach zone perpendicular to the door wall. Doors are stored with
 *  `wall: "north" | "south" | "east" | "west"` and `position` ∈ [0,1]. */
export function validateDoorClearance(
  bb: BBox,
  room: Room,
  doors: Door[]
): PlacementResult {
  for (const d of doors) {
    if (d.roomId !== room.id) continue;
    const w = d.wall;
    const size = d.size ?? 0.8;
    const pos = d.position ?? 0.5;
    let cx: number, cy: number;
    if (w === "north") {
      cx = room.x + pos * room.width;
      cy = room.y;
    } else if (w === "south") {
      cx = room.x + pos * room.width;
      cy = room.y + room.height;
    } else if (w === "west") {
      cx = room.x;
      cy = room.y + pos * room.height;
    } else {
      cx = room.x + room.width;
      cy = room.y + pos * room.height;
    }
    // Approach zone: 60 cm rectangle perpendicular to wall, full door width.
    const APPROACH = 0.6;
    let zone: BBox;
    if (w === "north") zone = { x: cx - size / 2, y: cy, w: size, h: APPROACH + size };
    else if (w === "south") zone = { x: cx - size / 2, y: cy - APPROACH - size, w: size, h: APPROACH + size };
    else if (w === "west") zone = { x: cx, y: cy - size / 2, w: APPROACH + size, h: size };
    else zone = { x: cx - APPROACH - size, y: cy - size / 2, w: APPROACH + size, h: size };

    if (bboxOverlap(zone, bb, 0.02)) {
      return {
        ok: false,
        reason: `bloqueia a porta da parede ${w} (zona de aproximação ${APPROACH}m + arco da folha ${size}m). Posicione fora desse retângulo.`,
      };
    }
  }
  return { ok: true };
}

/** 30 cm front clearance from windows so iluminação não fica bloqueada. */
export function validateWindowClearance(
  bb: BBox,
  room: Room,
  windows: Window[]
): PlacementResult {
  for (const win of windows) {
    if (win.roomId !== room.id) continue;
    const w = win.wall;
    const size = win.size ?? 1.2;
    const pos = win.position ?? 0.5;
    const APPROACH = 0.3;
    let zone: BBox;
    if (w === "north") zone = { x: room.x + pos * room.width - size / 2, y: room.y, w: size, h: APPROACH };
    else if (w === "south") zone = { x: room.x + pos * room.width - size / 2, y: room.y + room.height - APPROACH, w: size, h: APPROACH };
    else if (w === "west") zone = { x: room.x, y: room.y + pos * room.height - size / 2, w: APPROACH, h: size };
    else zone = { x: room.x + room.width - APPROACH, y: room.y + pos * room.height - size / 2, w: APPROACH, h: size };

    if (bboxOverlap(zone, bb, 0.02)) {
      return {
        ok: false,
        reason: `bloqueia a janela da parede ${w} (precisa ${APPROACH}m livre na frente para iluminação).`,
      };
    }
  }
  return { ok: true };
}

/** Validates ergonomic relations declared in metadata (kitchen triangle,
 *  sofa↔TV viewing distance). Only fires when the partner already exists
 *  in the room — placement is ALLOWED if no partner present. */
export function validateRelations(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[]
): PlacementResult {
  if (!placement.relations || placement.relations.length === 0) return { ok: true };
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  for (const rel of placement.relations) {
    const partners = existing.filter((f) => f.roomId === room.id && f.type === rel.withType);
    if (partners.length === 0) continue;
    // Check at least one partner is within range; otherwise complain
    // about the closest one.
    let closest: { f: Furniture; d: number } | null = null;
    for (const p of partners) {
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;
      const d = Math.hypot(px - cx, py - cy);
      if (!closest || d < closest.d) closest = { f: p, d };
      if (d >= rel.minDist - EPS && d <= rel.maxDist + EPS) {
        // Found a partner in-range — relation satisfied.
        closest = null;
        break;
      }
    }
    if (closest) {
      return {
        ok: false,
        reason: `relação ${rel.hint} violada: distância para '${closest.f.label}' = ${closest.d.toFixed(2)}m, fora da faixa ${rel.minDist}–${rel.maxDist}m.`,
      };
    }
  }
  return { ok: true };
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

  const r5 = validateRelations(bb, room, placement, existing);
  if (!r5.ok) return r5;

  return { ok: true };
}

/** Build a one-line summary of the room's free space + occupied corners
 *  for the agent to consume on a retry. Always cheap to compute. */
export function summarizeRoomLayout(room: Room, plan: FloorPlan): string {
  const existing = plan.furniture.filter((f) => f.roomId === room.id);
  return `Cômodo '${room.name}' (${room.width}×${room.height}m). Cantos: ${describeCorners(room, plan.furniture)}. Paredes: ${describeWalls(room, plan.furniture, plan.doors, plan.windows)}. Itens: ${
    existing.length === 0 ? "nenhum" : existing.map((f) => `${f.label}(${f.x.toFixed(1)},${f.y.toFixed(1)},${f.width}×${f.height})`).join(", ")
  }.`;
}
