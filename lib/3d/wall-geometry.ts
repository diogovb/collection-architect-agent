// Wall geometry — extrusion + CSG cutouts for openings.

import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { OpeningNode, Vec2, WallNode } from "./types";

/** Length of a wall in meters. */
export function wallLength(wall: WallNode): number {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  return Math.hypot(dx, dz);
}

/** Unit vector along the wall (start → end). */
function wallDirection(wall: WallNode): { dx: number; dz: number } {
  const len = wallLength(wall);
  if (len < 1e-6) return { dx: 1, dz: 0 };
  return { dx: (wall.end.x - wall.start.x) / len, dz: (wall.end.z - wall.start.z) / len };
}

/**
 * Returns the 4 footprint corners of a wall as Vec2 (XZ).
 * Order: start-left, end-left, end-right, start-right (CCW when viewed from +Y).
 * "Left" / "right" are perpendicular to the wall direction.
 */
export function computeWallFootprint(wall: WallNode): Vec2[] {
  const { dx, dz } = wallDirection(wall);
  // Perpendicular (90° CCW around Y): (dx, dz) → (-dz, dx)
  const px = -dz;
  const pz = dx;
  const t = wall.thickness / 2;
  const a = { x: wall.start.x + px * t, z: wall.start.z + pz * t };
  const b = { x: wall.end.x + px * t,   z: wall.end.z + pz * t   };
  const c = { x: wall.end.x - px * t,   z: wall.end.z - pz * t   };
  const d = { x: wall.start.x - px * t, z: wall.start.z - pz * t };
  return [a, b, c, d];
}

/**
 * Extrude a wall into a BoxGeometry positioned and rotated to match its footprint.
 * Returns geometry in world coordinates (already transformed).
 */
export function extrudeWallGeometry(wall: WallNode): THREE.BufferGeometry {
  const len = wallLength(wall);
  if (len < 1e-6) return new THREE.BufferGeometry();
  const geom = new THREE.BoxGeometry(len, wall.height, wall.thickness);
  // Center of wall (XZ) and y = height/2
  const cx = (wall.start.x + wall.end.x) / 2;
  const cz = (wall.start.z + wall.end.z) / 2;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  // Rotate around Y so box length aligns with wall direction.
  geom.rotateY(-angle);
  geom.translate(cx, wall.height / 2, cz);
  return geom;
}

/**
 * Build an opening "brush" (box) sized to fully subtract through the wall.
 * Position is along the wall axis at the opening's `position` (0..1) and offset
 * along Y by sillHeight (or 0 for doors).
 */
export function createOpeningBrush(wall: WallNode, opening: OpeningNode): Brush {
  const { dx, dz } = wallDirection(wall);
  const len = wallLength(wall);
  // Center of opening along wall length.
  const along = opening.position * len;
  const cx = wall.start.x + dx * along;
  const cz = wall.start.z + dz * along;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);

  const sill = opening.type === "window" ? opening.sillHeight : 0;
  const cy = sill + opening.height / 2;

  // Make depth slightly larger than wall thickness to guarantee a clean cut.
  const depth = wall.thickness + 0.04;

  const geom = new THREE.BoxGeometry(opening.width, opening.height, depth);
  const brush = new Brush(geom);
  brush.position.set(cx, cy, cz);
  brush.rotation.set(0, -angle, 0);
  brush.updateMatrixWorld();
  return brush;
}

/**
 * Apply CSG subtraction of all wall openings. If no openings, returns the input
 * geometry untouched (cheap path).
 */
export function applyCSGCutouts(
  wall: WallNode,
  evaluator: Evaluator
): THREE.BufferGeometry {
  const baseGeom = extrudeWallGeometry(wall);
  if (wall.children.length === 0) return baseGeom;

  let acc = new Brush(baseGeom);
  acc.updateMatrixWorld();
  for (const opening of wall.children) {
    const cutout = createOpeningBrush(wall, opening);
    const next = evaluator.evaluate(acc, cutout, SUBTRACTION) as Brush;
    acc = next;
  }
  return acc.geometry;
}

/**
 * Find walls that share a start/end corner within tolerance — useful for future
 * mitering passes. Currently informational.
 */
export interface Junction {
  point: Vec2;
  walls: { wallId: string; end: "start" | "end" }[];
}

const CORNER_EPS = 0.01;

export function findJunctions(walls: WallNode[]): Junction[] {
  const buckets: Junction[] = [];
  function bucket(p: Vec2): Junction {
    for (const j of buckets) {
      if (Math.abs(j.point.x - p.x) < CORNER_EPS && Math.abs(j.point.z - p.z) < CORNER_EPS) return j;
    }
    const fresh: Junction = { point: { x: p.x, z: p.z }, walls: [] };
    buckets.push(fresh);
    return fresh;
  }
  for (const w of walls) {
    bucket(w.start).walls.push({ wallId: w.id, end: "start" });
    bucket(w.end).walls.push({ wallId: w.id, end: "end" });
  }
  return buckets.filter((j) => j.walls.length >= 2);
}
