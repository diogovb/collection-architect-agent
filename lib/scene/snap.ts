// Snapping helpers used during drag.

import type { Vec2, Vec3, WallNode } from "./types";
import { v2Dist } from "./types";
import { SNAP_UI_GRID_M } from "./tolerances";

const GRID_M = SNAP_UI_GRID_M;

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

/** Snap a wall direction to the nearest 0°/45°/90° axis when within
 *  `toleranceDeg` of one. Returns a new `end` such that the segment
 *  start→end has the snapped angle, preserving its length.
 *
 *  This makes ortho/diagonal walls "click" into place during a drag
 *  while still allowing arbitrary angles outside the tolerance band. */
export function snapAngle(
  start: Vec2,
  end: Vec2,
  toleranceDeg: number = 5,
): Vec2 {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return end;

  const angle = Math.atan2(dz, dx); // [-π, π]
  // Allowed angles in radians: every 45° step from -180° to 180°.
  const step = Math.PI / 4;
  const tolerance = (toleranceDeg * Math.PI) / 180;

  // Find the snap candidate: nearest multiple of step within tolerance.
  const candidate = Math.round(angle / step) * step;
  const delta = Math.abs(angle - candidate);
  if (delta > tolerance) return end;

  return {
    x: start.x + length * Math.cos(candidate),
    z: start.z + length * Math.sin(candidate),
  };
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
