// Collision detection between a (possibly rotated) furniture rectangle and
// wall polygons. Uses a simplified Separating Axis Theorem (SAT) for the
// "do they overlap?" test, plus a "slide along the wall" fallback so a
// dragged piece is allowed to brush against a wall rather than getting
// trapped.
//
// Coordinates: world XZ (y is up; we ignore vertical extent — furniture is
// always on the floor).
//
// Used by lib/scene/drag-engine.ts:beginFurnitureDrag.

import type { Vec2, Vec3, WallNode } from "./types";
import { computeWallCorners } from "./wall-mitering";

export interface RectXZ {
  cx: number;
  cz: number;
  /** Axis-aligned width along local-x (after rotation). */
  width: number;
  /** Axis-aligned depth along local-z (after rotation). */
  depth: number;
  /** Rotation around y in radians. */
  rotation: number;
}

interface Vec2Ext extends Vec2 {}

/** Build the four world-space corners of a rotated rectangle. */
export function rectCorners(rect: RectXZ): Vec2Ext[] {
  const cos = Math.cos(rect.rotation);
  const sin = Math.sin(rect.rotation);
  const hx = rect.width / 2;
  const hz = rect.depth / 2;
  const local: Vec2[] = [
    { x: -hx, z: -hz },
    { x: +hx, z: -hz },
    { x: +hx, z: +hz },
    { x: -hx, z: +hz },
  ];
  return local.map((p) => ({
    x: rect.cx + p.x * cos - p.z * sin,
    z: rect.cz + p.x * sin + p.z * cos,
  }));
}

/** Project a polygon onto an axis (unit vector) and return the [min, max]
 *  range of dot products. SAT building block. */
function project(poly: Vec2[], ax: number, az: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.z * az;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

/** Convex-vs-convex SAT overlap test. Returns true if the two polygons
 *  overlap. Both polygons must be convex (we assume the wall miter quad and
 *  the furniture rectangle are convex — true by construction). */
function convexOverlap(a: Vec2[], b: Vec2[]): boolean {
  const polys = [a, b];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length;
      const ex = p[j].x - p[i].x;
      const ez = p[j].z - p[i].z;
      // Normal to the edge: (-ez, ex) — direction doesn't matter for SAT.
      const len = Math.hypot(ex, ez) || 1;
      const ax = -ez / len;
      const az = ex / len;
      const [aLo, aHi] = project(a, ax, az);
      const [bLo, bHi] = project(b, ax, az);
      if (aHi < bLo || bHi < aLo) return false;
    }
  }
  return true;
}

/** Build the wall quad polygons (after mitering) for a list of walls. The
 *  wall miter cache normally lives in a separate module; we call its core
 *  function directly to keep the engine SSR-friendly. */
function wallQuads(walls: WallNode[]): Vec2[][] {
  const corners = computeWallCorners(walls);
  const out: Vec2[][] = [];
  corners.forEach((c) => {
    out.push([c.startLeft, c.endLeft, c.endRight, c.startRight]);
  });
  return out;
}

/** Returns true if the furniture rectangle overlaps any wall quad.
 *  `epsilon` is a small inset (m) so rectangles can sit flush against a wall
 *  (sharing an edge) without registering as overlap. */
export function rectIntersectsWalls(
  rect: RectXZ,
  walls: WallNode[],
  epsilon = 0.01
): boolean {
  if (epsilon !== 0) {
    rect = { ...rect, width: Math.max(0, rect.width - 2 * epsilon), depth: Math.max(0, rect.depth - 2 * epsilon) };
  }
  const r = rectCorners(rect);
  const quads = wallQuads(walls);
  for (const q of quads) {
    if (convexOverlap(r, q)) return true;
  }
  return false;
}

/** Resolve the proposed corner position so the rectangle does not overlap
 *  any wall. If the proposed position is fine, return it unchanged. If it
 *  collides, walk back toward the previous valid position in 5 cm steps and
 *  return the closest valid spot. Returns null if even the previous position
 *  is colliding (shouldn't happen — caller's previous step was clean). */
export function resolveCorner(
  proposedCorner: Vec2,
  prevCorner: Vec2,
  dim: Vec3,
  rotation: number,
  walls: WallNode[]
): Vec2 {
  const buildRect = (corner: Vec2): RectXZ => ({
    cx: corner.x + dim.x / 2,
    cz: corner.z + dim.z / 2,
    width: dim.x,
    depth: dim.z,
    rotation,
  });

  if (!rectIntersectsWalls(buildRect(proposedCorner), walls)) {
    return proposedCorner;
  }
  // Bisection between prev and proposed: find the furthest valid point along
  // the line. Constant-time — 5 iterations gives 1/32 resolution which is
  // plenty for a 5 cm slide step.
  let lo = 0; // prev is valid
  let hi = 1; // proposed is invalid
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const candidate = {
      x: prevCorner.x + (proposedCorner.x - prevCorner.x) * mid,
      z: prevCorner.z + (proposedCorner.z - prevCorner.z) * mid,
    };
    if (rectIntersectsWalls(buildRect(candidate), walls)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return {
    x: prevCorner.x + (proposedCorner.x - prevCorner.x) * lo,
    z: prevCorner.z + (proposedCorner.z - prevCorner.z) * lo,
  };
}
