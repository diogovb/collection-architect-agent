// Greedy label placement (Pascal pattern). Pure function: given a list of
// labels with anchor points + estimated bboxes + search directions, places
// them so they don't overlap. Doesn't know about React or SVG — callers feed
// it world coordinates and receive adjusted world coordinates back.
//
// Algorithm (greedy by priority):
//   1. Sort labels by descending priority.
//   2. For each label, start at its anchor.
//   3. If its bbox collides with any already-placed bbox, walk along the
//      first search direction in 0.05 m steps (up to ~1.0 m). If still
//      colliding, try the next search direction.
//   4. If nothing fits within the search budget, keep original position
//      (better than dropping the label).
//
// This is O(n²) in the worst case but n is tiny (~30 labels for a 3-bedroom
// apartment), so it's fine to run from render.

import type { Vec2 } from "./types";

export interface LabelInput {
  id: string;
  /** Anchor in world coords (initial centre of the label). */
  x: number;
  z: number;
  /** Approximate bbox width and height in world units. */
  width: number;
  height: number;
  /** Directions to search for collision-free placement, in order of preference.
   *  Each must be a unit vector. If empty, label stays put even on collision. */
  searchDirs?: Vec2[];
  /** Higher priority = placed first; later labels move out of the way.
   *  Default 0. */
  priority?: number;
  /** Maximum search distance in world units. Default 1.0. */
  maxOffset?: number;
}

export interface LabelOutput {
  id: string;
  x: number;
  z: number;
  /** True when the label had to be moved from its anchor. */
  moved: boolean;
}

interface Bbox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const STEP = 0.05;

function bboxAt(x: number, z: number, w: number, h: number): Bbox {
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - h / 2,
    maxZ: z + h / 2,
  };
}

function intersects(a: Bbox, b: Bbox): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxZ < b.minZ || b.maxZ < a.minZ);
}

function collidesAny(box: Bbox, occupied: Bbox[]): boolean {
  for (const o of occupied) if (intersects(box, o)) return true;
  return false;
}

/** Obstáculo fixo (móvel, marcenaria) que os labels devem evitar. Mesma
 *  convenção de centro do bboxAt. */
export interface LabelObstacle {
  x: number;
  z: number;
  width: number;
  height: number;
}

export function placeLabels(
  inputs: LabelInput[],
  obstacles: LabelObstacle[] = []
): Map<string, LabelOutput> {
  // Sort by priority desc, stable on input order.
  const sorted = inputs
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (b.l.priority ?? 0) - (a.l.priority ?? 0) || a.i - b.i)
    .map((x) => x.l);

  const out = new Map<string, LabelOutput>();
  // Semeia o espaço ocupado com os obstáculos (móveis) — assim o nome do
  // cômodo escapa de um móvel central em vez de ser pintado por cima.
  const occupied: Bbox[] = obstacles.map((o) => bboxAt(o.x, o.z, o.width, o.height));

  for (const lbl of sorted) {
    const w = lbl.width;
    const h = lbl.height;
    const dirs = lbl.searchDirs ?? [];
    const maxOffset = lbl.maxOffset ?? 1.0;

    // Try original anchor first.
    let box = bboxAt(lbl.x, lbl.z, w, h);
    if (!collidesAny(box, occupied)) {
      occupied.push(box);
      out.set(lbl.id, { id: lbl.id, x: lbl.x, z: lbl.z, moved: false });
      continue;
    }

    // Walk each search direction.
    let placed = false;
    for (const dir of dirs) {
      // Normalise (defensive).
      const len = Math.hypot(dir.x, dir.z) || 1;
      const ux = dir.x / len;
      const uz = dir.z / len;
      for (let d = STEP; d <= maxOffset + 1e-6; d += STEP) {
        const nx = lbl.x + ux * d;
        const nz = lbl.z + uz * d;
        box = bboxAt(nx, nz, w, h);
        if (!collidesAny(box, occupied)) {
          occupied.push(box);
          out.set(lbl.id, { id: lbl.id, x: nx, z: nz, moved: true });
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      // Couldn't find a free spot — keep original. Still register the bbox so
      // downstream labels see something to avoid.
      const fallback = bboxAt(lbl.x, lbl.z, w, h);
      occupied.push(fallback);
      out.set(lbl.id, { id: lbl.id, x: lbl.x, z: lbl.z, moved: false });
    }
  }

  return out;
}

// ---- Convenience helpers for SVG rendering --------------------------------

/** Estimate label width in world units given a character count and a font
 *  size in world units. Ratio 0.55 is a decent average for proportional fonts;
 *  monospace is closer to 0.6, but 0.55 is a safe small bias. */
export function estimateLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}
