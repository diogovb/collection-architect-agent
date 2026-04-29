// Generative placement solver (Phase E).
//
// Replaces the (rx, ry) abstraction the agent had to compute by hand
// with high-level intent — "fogão na parede norte no meio, geladeira no
// canto NE, pia na parede norte no fim". The solver reads metadata from
// `lib/furniture-placement.ts` and the room polygon, computes coords
// that respect anchor constraints + clearances + ergonomic relations,
// and then runs the same `validatePlacement` from Phase C as a final
// sanity check before mutating the plan.
//
// Why this is still "generative" (per user's decision): the agent
// continues to choose WHAT and WHERE in semantic terms (which wall,
// which corner). The solver only does the geometry, which models are
// notoriously bad at when there's no visual feedback. Combined with
// the visual-review loop (Phase D) the model can iterate purely in
// natural-language anchors.

import type { FloorPlan, Furniture, FurnitureType, Room } from "../types";
import { FURN_DEFS } from "../furniture-svgs";
import { getPlacement } from "../furniture-placement";
import { validatePlacement, summarizeRoomLayout } from "./placement-validators";

export type Anchor =
  | "wall:north"
  | "wall:south"
  | "wall:east"
  | "wall:west"
  | "corner:NW"
  | "corner:NE"
  | "corner:SW"
  | "corner:SE"
  | "center"
  | "free";

export interface PlacementIntent {
  type: FurnitureType;
  label?: string;
  anchor: Anchor;
  /** Position along the anchored wall when anchor is `wall:*`. */
  position?: "start" | "mid" | "end";
  /** Optional rotation override (degrees, multiples of 90). */
  rotation?: number;
}

export interface SolverInput {
  room: Room;
  items: PlacementIntent[];
  plan: FloorPlan;
}

export interface SolvedItem {
  intent: PlacementIntent;
  /** Absolute position in plan coords (top-left of bbox). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SolverOutput {
  ok: boolean;
  /** Items that landed cleanly with valid placement. */
  solved: SolvedItem[];
  /** Items the solver could not place — each carries the reason so the
   *  agent can rethink the anchors / drop one item. */
  failed: Array<{ intent: PlacementIntent; reason: string }>;
}

/** Compute axis-aligned bbox for an item anchored to a side or corner.
 *  When the wall has multiple items declared, `slot` is the index along
 *  the wall (0-based) and `slotsTotal` is the count — they let us
 *  distribute items along a wall instead of stacking on top of each
 *  other. */
function computeAnchoredBbox(
  intent: PlacementIntent,
  size: { w: number; h: number },
  room: Room,
  slot: number,
  slotsTotal: number,
): { x: number; y: number; width: number; height: number } {
  const a = intent.anchor;
  const pos = intent.position ?? "mid";

  // Helpers to position along an axis, given start/end coords and width.
  const along = (start: number, end: number, width: number): number => {
    const free = end - start - width;
    if (free <= 0) return start;
    if (slotsTotal > 1) {
      const seg = (end - start) / slotsTotal;
      return start + slot * seg + (seg - width) / 2;
    }
    if (pos === "start") return start;
    if (pos === "end") return end - width;
    return start + free / 2;
  };

  if (a === "wall:north") {
    return {
      x: along(room.x, room.x + room.width, size.w),
      y: room.y,
      width: size.w,
      height: size.h,
    };
  }
  if (a === "wall:south") {
    return {
      x: along(room.x, room.x + room.width, size.w),
      y: room.y + room.height - size.h,
      width: size.w,
      height: size.h,
    };
  }
  if (a === "wall:west") {
    return {
      x: room.x,
      y: along(room.y, room.y + room.height, size.h),
      width: size.w,
      height: size.h,
    };
  }
  if (a === "wall:east") {
    return {
      x: room.x + room.width - size.w,
      y: along(room.y, room.y + room.height, size.h),
      width: size.w,
      height: size.h,
    };
  }
  if (a === "corner:NW") {
    return { x: room.x, y: room.y, width: size.w, height: size.h };
  }
  if (a === "corner:NE") {
    return { x: room.x + room.width - size.w, y: room.y, width: size.w, height: size.h };
  }
  if (a === "corner:SW") {
    return { x: room.x, y: room.y + room.height - size.h, width: size.w, height: size.h };
  }
  if (a === "corner:SE") {
    return {
      x: room.x + room.width - size.w,
      y: room.y + room.height - size.h,
      width: size.w,
      height: size.h,
    };
  }
  if (a === "center") {
    return {
      x: room.x + (room.width - size.w) / 2,
      y: room.y + (room.height - size.h) / 2,
      width: size.w,
      height: size.h,
    };
  }
  // free: drop somewhere reasonable but unconstrained.
  return {
    x: room.x + (room.width - size.w) / 2,
    y: room.y + (room.height - size.h) / 2,
    width: size.w,
    height: size.h,
  };
}

/** Group items by anchor target so multiple pieces on the same wall get
 *  distributed (slot index + slotsTotal) rather than stacked. */
function bucketByAnchor(items: PlacementIntent[]): Map<string, PlacementIntent[]> {
  const buckets = new Map<string, PlacementIntent[]>();
  for (const it of items) {
    const k = it.anchor;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
  }
  return buckets;
}

export function solvePlacement(input: SolverInput): SolverOutput {
  const { room, items, plan } = input;
  const solved: SolvedItem[] = [];
  const failed: SolverOutput["failed"] = [];

  // Working plan snapshot — we add solved items to a clone so subsequent
  // validations see siblings already placed (clearance / overlap checks).
  const workingPlan: FloorPlan = JSON.parse(JSON.stringify(plan));

  const buckets = bucketByAnchor(items);

  for (const it of items) {
    const def = FURN_DEFS[it.type];
    if (!def) {
      failed.push({ intent: it, reason: `tipo desconhecido: ${it.type}` });
      continue;
    }
    const size = def.sizeM;
    if (size.w > room.width + 0.01 || size.h > room.height + 0.01) {
      failed.push({
        intent: it,
        reason: `${def.label} (${size.w}×${size.h}m) não cabe em '${room.name}' (${room.width}×${room.height}m).`,
      });
      continue;
    }
    const bucket = buckets.get(it.anchor)!;
    const slot = bucket.indexOf(it);
    const slotsTotal = bucket.length;
    const bb = computeAnchoredBbox(it, size, room, slot, slotsTotal);

    // Validate against the working plan (which includes previously
    // solved items in this batch). First failure wins — agent retries
    // with different anchor.
    const check = validatePlacement(
      { type: it.type, x: bb.x, y: bb.y, width: bb.width, height: bb.height, label: it.label ?? def.label },
      room,
      workingPlan,
    );
    if (!check.ok) {
      failed.push({
        intent: it,
        reason: `âncora ${it.anchor}@${it.position ?? "mid"}: ${check.reason}`,
      });
      continue;
    }

    solved.push({ intent: it, ...bb });
    // Push into the working plan so the next item's clearance/overlap
    // checks see this one already placed.
    const placed: Furniture = {
      id: `solver-${solved.length}`,
      roomId: room.id,
      type: it.type,
      label: it.label ?? def.label,
      x: bb.x,
      y: bb.y,
      width: bb.width,
      height: bb.height,
    };
    workingPlan.furniture.push(placed);
  }

  return { ok: failed.length === 0, solved, failed };
}

/** Format the solver result as a single result string for the agent. */
export function formatSolverResult(room: Room, plan: FloorPlan, output: SolverOutput): string {
  const placedCount = output.solved.length;
  const failedCount = output.failed.length;
  if (placedCount === 0 && failedCount > 0) {
    const reasons = output.failed
      .map((f) => `- ${f.intent.label ?? f.intent.type} (${f.intent.anchor}): ${f.reason}`)
      .join("\n");
    return `Nenhum item posicionado. Problemas:\n${reasons}\n\n${summarizeRoomLayout(room, plan)}`;
  }
  if (failedCount === 0) {
    return `${placedCount} ${placedCount === 1 ? "item posicionado" : "itens posicionados"} em '${room.name}'.`;
  }
  const placedSummary = output.solved
    .map((s) => `${s.intent.label ?? s.intent.type}@${s.intent.anchor}`)
    .join(", ");
  const failedSummary = output.failed
    .map((f) => `- ${f.intent.label ?? f.intent.type} (${f.intent.anchor}): ${f.reason}`)
    .join("\n");
  return `${placedCount} item(ns) posicionado(s): ${placedSummary}.\n${failedCount} falharam:\n${failedSummary}\n\n${summarizeRoomLayout(room, plan)}`;
}
