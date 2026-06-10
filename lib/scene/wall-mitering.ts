// Wall mitering: at each shared vertex, compute the corners of every wall's
// 4-vertex shape (startLeft, startRight, endLeft, endRight) such that adjacent
// walls meet cleanly along their offset edges.
//
// For each wall A, "left" and "right" are determined by the perpendicular to
// the centerline (start→end). Left = +90° CCW perpendicular.
//
// Algorithm at each junction vertex:
// 1. Collect all walls incident to this vertex with the side they emanate
//    from (start vs end).
// 2. Sort by outgoing direction angle CCW.
// 3. For each pair of consecutive walls, intersect the corresponding offset
//    edges to get the miter corner.
// 4. If only one wall is incident (free endpoint), cap the wall with a flat
//    perpendicular.

import {
  v2Add,
  v2Angle,
  v2Cross,
  v2Norm,
  v2Perp,
  v2Scale,
  v2Sub,
  type Vec2,
  type WallNode,
} from "./types";
import { PARALLEL_EPS } from "./tolerances";

const EPS = PARALLEL_EPS;

export interface WallCorners {
  startLeft: Vec2;
  startRight: Vec2;
  endLeft: Vec2;
  endRight: Vec2;
}

interface Incidence {
  wallId: string;
  /** Whether the wall starts (true) or ends (false) at this vertex. */
  fromStart: boolean;
  /** Direction of the wall AWAY from the vertex (always points OUT). */
  outDir: Vec2;
  /** Angle of outDir in [-π, π]. */
  outAngle: number;
  thickness: number;
}

interface WallShape {
  start: Vec2;
  end: Vec2;
  thickness: number;
  /** Unit direction start→end. */
  dir: Vec2;
  /** Unit perpendicular (left of dir). */
  perp: Vec2;
}

function wallShape(w: WallNode, override?: { start?: Vec2; end?: Vec2 }): WallShape {
  const start = override?.start ?? w.start;
  const end = override?.end ?? w.end;
  const dir = v2Norm(v2Sub(end, start));
  const perp = v2Perp(dir); // left
  return { start, end, thickness: w.thickness, dir, perp };
}

/** Intersect two infinite lines, each defined by a point and direction.
 *  Returns null if parallel. */
function lineIntersect(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denom = v2Cross(d1, d2);
  if (Math.abs(denom) < EPS) return null;
  const diff = v2Sub(p2, p1);
  const t = v2Cross(diff, d2) / denom;
  return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
}

/** Snap key for vertex deduplication (1mm). */
function vk(p: Vec2): string {
  return `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;
}

export function computeWallCorners(walls: WallNode[]): Map<string, WallCorners> {
  const out = new Map<string, WallCorners>();
  if (walls.length === 0) return out;

  // Build incidence map: vertex key → list of incident walls.
  const incidence = new Map<string, Incidence[]>();
  for (const w of walls) {
    const sk = vk(w.start);
    const ek = vk(w.end);
    const dir = v2Norm(v2Sub(w.end, w.start));
    if (!incidence.has(sk)) incidence.set(sk, []);
    if (!incidence.has(ek)) incidence.set(ek, []);
    // From start vertex, outgoing direction is start→end.
    incidence.get(sk)!.push({
      wallId: w.id,
      fromStart: true,
      outDir: dir,
      outAngle: v2Angle(dir),
      thickness: w.thickness,
    });
    // From end vertex, outgoing direction is end→start (negated).
    const negDir: Vec2 = { x: -dir.x, z: -dir.z };
    incidence.get(ek)!.push({
      wallId: w.id,
      fromStart: false,
      outDir: negDir,
      outAngle: v2Angle(negDir),
      thickness: w.thickness,
    });
  }

  // Initialise corners with flat caps (used when wall is alone or for fallback).
  const cornerMap = new Map<string, WallCorners>();
  for (const w of walls) {
    const s = wallShape(w);
    const half = s.thickness / 2;
    cornerMap.set(w.id, {
      startLeft: v2Add(s.start, v2Scale(s.perp, half)),
      startRight: v2Add(s.start, v2Scale(s.perp, -half)),
      endLeft: v2Add(s.end, v2Scale(s.perp, half)),
      endRight: v2Add(s.end, v2Scale(s.perp, -half)),
    });
  }

  // Process each vertex.
  incidence.forEach((list, _key) => {
    if (list.length < 2) return; // keep flat cap

    // Sort by angle CCW.
    list.sort((a, b) => a.outAngle - b.outAngle);

    // For each pair of CONSECUTIVE walls (a, b) in CCW order, the region
    // between them (going CCW from a's outDir to b's outDir) is "outside" of
    // both walls — we compute the miter point where their LEFT-of-a edge and
    // RIGHT-of-b edge intersect (since a's left and b's right are the same
    // physical surface in the wedge).
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const b = list[(i + 1) % n];
      const wA = walls.find((w) => w.id === a.wallId)!;
      const wB = walls.find((w) => w.id === b.wallId)!;
      const sA = wallShape(wA);
      const sB = wallShape(wB);

      // Vertex point.
      const vertex = a.fromStart ? wA.start : wA.end;

      // a's left perpendicular relative to outDir from vertex:
      // outDir is start→end if fromStart, else end→start (already negated).
      // The "left of outgoing" perpendicular for a is +90° CCW from outDir.
      const aLeftPerp = v2Perp(a.outDir);
      // b's right is -90° from outDir.
      const bRightPerp = v2Scale(v2Perp(b.outDir), -1);

      // Offset lines: parallel to outDir, passing through the offset point.
      const aOffPoint = v2Add(vertex, v2Scale(aLeftPerp, a.thickness / 2));
      const bOffPoint = v2Add(vertex, v2Scale(bRightPerp, b.thickness / 2));
      const isect = lineIntersect(aOffPoint, a.outDir, bOffPoint, b.outDir);

      if (!isect) {
        // Parallel walls (collinear or anti-parallel) — keep the flat cap on
        // both for now. (Could compute butt joint, but rare.)
        continue;
      }

      // Apply to A: it's the LEFT-of-outgoing corner, which depends on
      // whether A starts or ends here.
      const cornersA = cornerMap.get(a.wallId)!;
      if (a.fromStart) {
        // outDir = start→end, "left of outgoing" = perpA = wall.perp = wallShape.perp
        // So this is startLeft.
        cornersA.startLeft = isect;
      } else {
        // outDir = end→start, perp of that is opposite of wall.perp.
        // So "left of outgoing" at end = endRight in wall-local terms.
        cornersA.endRight = isect;
      }

      // Apply to B: the "right-of-outgoing" corner.
      const cornersB = cornerMap.get(b.wallId)!;
      if (b.fromStart) {
        cornersB.startRight = isect;
      } else {
        cornersB.endLeft = isect;
      }
    }
  });

  cornerMap.forEach((c, id) => out.set(id, c));
  return out;
}
