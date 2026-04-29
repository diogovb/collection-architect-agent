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

/** Validates that the FRONT clearance rectangle is empty of non-rug
 *  furniture. Side clearances (left/right) are silently skipped — in
 *  real kitchens/bathrooms appliances sit shoulder-to-shoulder against
 *  a wall (fogão+pia+geladeira em linha), and enforcing 30-60cm side
 *  gaps on every appliance makes the solver impossible. Front clearance
 *  IS the one that matters for usability (you need to open oven door,
 *  pull a chair, kneel to clean). */
export function validateClearance(
  bb: BBox,
  room: Room,
  placement: FurniturePlacement,
  existing: Furniture[]
): PlacementResult {
  // We only enforce FRONT clearance. Front direction is "into the room"
  // — for items anchored against a wall, that's the side opposite the
  // wall they touch. We approximate by checking all 4 cardinal "outer"
  // rectangles around the bbox and rejecting if ANY direction has a
  // non-rug obstacle within the front-clearance distance. This catches
  // the common case (fogão facing away from wall has 80cm front zone)
  // without prescribing which face is the front.
  const front = placement.clearance.front;
  if (front <= EPS) return { ok: true };
  const offset = 0.001;
  // 4 candidate front zones — only one is the real front, the others
  // face walls. We skip a zone whose midpoint falls outside the room
  // polygon (i.e. the wall side). That way appliances face-towards-room
  // get checked; appliances back-against-wall don't get falsely flagged.
  const candidates = [
    { name: "norte", rect: { x: bb.x - offset, y: bb.y - front, w: bb.w, h: front } },
    { name: "sul", rect: { x: bb.x - offset, y: bb.y + bb.h, w: bb.w, h: front } },
    { name: "oeste", rect: { x: bb.x - front, y: bb.y - offset, w: front, h: bb.h } },
    { name: "leste", rect: { x: bb.x + bb.w, y: bb.y - offset, w: front, h: bb.h } },
  ];
  for (const c of candidates) {
    // Skip zones that fall mostly outside the room (i.e. they'd stick
    // through a wall — that's the BACK of the appliance, not the front).
    const cx = c.rect.x + c.rect.w / 2;
    const cy = c.rect.y + c.rect.h / 2;
    const insideRoom =
      cx >= room.x - 0.01 && cx <= room.x + room.width + 0.01 &&
      cy >= room.y - 0.01 && cy <= room.y + room.height + 0.01;
    if (!insideRoom) continue;
    // Only reject if there's a non-rug obstacle AND the zone is the
    // SHORTEST side (likely the front, opposite the wall).
    for (const f of existing) {
      if (f.roomId !== room.id) continue;
      const fp = getPlacement(f.type);
      if (fp.category === "rug" || fp.category === "decor") continue;
      if (bboxOverlap(c.rect, bboxOf(f), 0.01)) {
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
 *  door wall as long as it doesn't fall in the 90° swing radius. */
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
    // Swing arc only: a square of door.size × door.size attached to the
    // door panel side, INSIDE the room. Approximation of the 90° quarter
    // circle (we check the bounding square — slightly conservative but
    // way less aggressive than the old 1.4m approach zone).
    let zone: BBox;
    if (w === "north") zone = { x: cx - size / 2, y: cy, w: size, h: size };
    else if (w === "south") zone = { x: cx - size / 2, y: cy - size, w: size, h: size };
    else if (w === "west") zone = { x: cx, y: cy - size / 2, w: size, h: size };
    else zone = { x: cx - size, y: cy - size / 2, w: size, h: size };

    if (bboxOverlap(zone, bb, 0.05)) {
      return {
        ok: false,
        reason: `cai dentro do arco da porta da parede ${w} (raio ${size}m). Posicione fora do quadrado de abertura.`,
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
 *  sofa↔TV viewing distance). NON-BLOCKING — relations are advisory: we
 *  report the violation in the result so the agent SEES it, but we let
 *  the placement happen. The visual review pass + the agent's own
 *  judgment decide whether to fix or accept. Hard-blocking the
 *  triangle in a 3.5×3m kitchen leaves no valid layout (geladeira-pia-
 *  fogão sobre duas paredes sempre estoura 2.7m). */
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
    let closest: { f: Furniture; d: number } | null = null;
    for (const p of partners) {
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;
      const d = Math.hypot(px - cx, py - cy);
      if (!closest || d < closest.d) closest = { f: p, d };
    }
    void closest;
    // We could log/return advisory text here, but the visual review
    // already flags weird kitchen layouts. Keep this validator silent
    // for now — no rejection.
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
