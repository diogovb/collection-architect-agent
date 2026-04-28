// Snapping helpers used during drag.

import type { Vec2, Vec3, WallNode } from "./types";
import { v2Dist } from "./types";

const GRID_M = 0.10; // 10cm grid

export function snapToGrid(value: number, step: number = GRID_M): number {
  return Math.round(value / step) * step;
}

export function snapVec2(v: Vec2): Vec2 {
  return { x: snapToGrid(v.x), z: snapToGrid(v.z) };
}

export function snapVec3(v: Vec3): Vec3 {
  return { x: snapToGrid(v.x), y: v.y, z: snapToGrid(v.z) };
}

/** Snap to existing wall endpoints if within radius. Returns the snap or original. */
export function snapToEndpoints(
  v: Vec2,
  walls: WallNode[],
  radius: number = 0.15
): { snapped: Vec2; isSnapped: boolean } {
  let best: { p: Vec2; d: number } | null = null;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      const d = v2Dist(p, v);
      if (d < radius && (!best || d < best.d)) best = { p, d };
    }
  }
  if (best) return { snapped: best.p, isSnapped: true };
  return { snapped: v, isSnapped: false };
}

/** Constrain a vector inside a polygon using a fallback to nearest vertex if outside. */
export function clampToPolygon(p: Vec2, polygon: Vec2[]): Vec2 {
  // For axis-aligned rectangle rooms, clamp to bounds.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of polygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  return {
    x: Math.max(minX, Math.min(maxX, p.x)),
    z: Math.max(minZ, Math.min(maxZ, p.z)),
  };
}
