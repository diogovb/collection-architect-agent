// Wall junction detection (Fase B).
//
// In a typical floor plan two or three walls meet at a vertex (corners,
// T-junctions, X-junctions). The data model stores each wall's two endpoints
// as raw coordinates with no shared-vertex notion — when the user drags one
// endpoint we have to discover the other endpoints that "live at the same
// place" so we can move them together. Otherwise junctions silently break
// and the user sees walls drifting apart.
//
// A junction is just a clustering of endpoints by proximity. We don't store
// junctions persistently; we recompute on demand from the wall list. With
// even a few hundred walls this is ~µs work.

import type { NodeId, Vec2, WallNode } from "./types";
import { v2Dist } from "./types";

/** A junction is a single point in world-space and the list of wall endpoints
 *  that snap onto it within `tolerance` metres. */
export interface Junction {
  position: Vec2;
  members: Array<{ wallId: NodeId; endpoint: "start" | "end" }>;
}

/** Default tolerance for "two endpoints share the same junction" (5 cm).
 *  This matches snapVec2's coarse grid (5 cm) so endpoints created by
 *  drawing/dragging while snap-on are guaranteed to coincide exactly. */
export const JUNCTION_TOLERANCE = 0.05;

/** Find the junction nearest `point` within `tolerance`, or null if none.
 *  Members include EVERY wall endpoint that lies inside the cluster — the
 *  caller can move them together to preserve connectivity. */
export function findJunction(
  walls: WallNode[],
  point: Vec2,
  tolerance: number = JUNCTION_TOLERANCE,
): Junction | null {
  // Center the cluster on the closest endpoint within tolerance, then
  // collect every other endpoint that falls inside the same radius.
  let best: { wallId: NodeId; endpoint: "start" | "end"; dist: number; pos: Vec2 } | null = null;
  for (const w of walls) {
    const dStart = v2Dist(w.start, point);
    if (dStart < tolerance && (!best || dStart < best.dist)) {
      best = { wallId: w.id, endpoint: "start", dist: dStart, pos: w.start };
    }
    const dEnd = v2Dist(w.end, point);
    if (dEnd < tolerance && (!best || dEnd < best.dist)) {
      best = { wallId: w.id, endpoint: "end", dist: dEnd, pos: w.end };
    }
  }
  if (!best) return null;

  const center = best.pos;
  const members: Junction["members"] = [];
  for (const w of walls) {
    if (v2Dist(w.start, center) < tolerance) {
      members.push({ wallId: w.id, endpoint: "start" });
    }
    if (v2Dist(w.end, center) < tolerance) {
      members.push({ wallId: w.id, endpoint: "end" });
    }
  }

  return { position: center, members };
}

/** Enumerate every junction in the wall list, deduplicating endpoints by
 *  proximity. Used to draw junction indicators in the canvas. */
export function findAllJunctions(
  walls: WallNode[],
  tolerance: number = JUNCTION_TOLERANCE,
): Junction[] {
  const consumed = new Set<string>(); // `${wallId}:${endpoint}`
  const out: Junction[] = [];
  for (const w of walls) {
    for (const endpoint of ["start", "end"] as const) {
      const key = `${w.id}:${endpoint}`;
      if (consumed.has(key)) continue;
      const point = endpoint === "start" ? w.start : w.end;
      const j = findJunction(walls, point, tolerance);
      if (!j) continue;
      // Mark all members consumed so we don't re-emit the same junction.
      for (const m of j.members) consumed.add(`${m.wallId}:${m.endpoint}`);
      // Only emit junctions with 2+ members (a single endpoint isn't useful
      // as a "junction").
      if (j.members.length >= 2) out.push(j);
    }
  }
  return out;
}
