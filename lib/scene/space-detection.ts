// Space detection: extract room polygons from a graph of walls.
//
// Algorithm (planar graph face traversal):
// 1. Snap wall endpoints to a 1mm grid to merge near-duplicate vertices.
// 2. Build half-edges: each wall produces two directed edges (a→b and b→a).
// 3. At each vertex, sort outgoing edges by angle (CCW).
// 4. For each unvisited half-edge, walk along "next CCW from the reverse edge"
//    until returning to the start. This collects one closed polygon (a face
//    of the planar graph). The unbounded outer face is identified by signed
//    area: it is the only face with positive area in our convention.
// 5. Discard the outer face and faces with very small area (< 0.5 m²).
//
// Output: room polygons, each CCW (positive area in mathematical convention,
// negative in our XZ where +Z is "down" in 2D plan space).
//
// Reference: Pascal Editor — packages/core/src/lib/space-detection.ts

import type { Vec2, WallNode } from "./types";
import { v2Angle, v2Sub, polygonArea, polygonAbsArea } from "./types";

/** Grid resolution for vertex deduplication: 1mm. */
const VERT_RES = 0.001;
const MIN_ROOM_AREA = 0.5;

interface VertId { key: string; pos: Vec2; }

function vertKey(p: Vec2): string {
  return `${Math.round(p.x / VERT_RES)},${Math.round(p.z / VERT_RES)}`;
}

interface HalfEdge {
  id: number;
  from: string; // vert key
  to: string;
  twinId: number;
  /** Angle in [-π, π] of edge direction in XZ. */
  angle: number;
  wallId: string;
  /** Index of the next CCW edge starting at `to`. Set after sort. */
  nextCcwId?: number;
}

export interface DetectedRoom {
  /** Polygon vertices in order (closed). */
  polygon: Vec2[];
  /** Wall ids that form the boundary, in order. */
  wallIds: string[];
  /** Signed area in our convention (positive = CW, negative = CCW). */
  signedArea: number;
}

export function detectSpaces(walls: WallNode[]): DetectedRoom[] {
  if (walls.length < 3) return [];

  const verts = new Map<string, Vec2>();
  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<string, number[]>();

  function addVert(p: Vec2): string {
    const k = vertKey(p);
    if (!verts.has(k)) verts.set(k, p);
    return k;
  }
  function addEdge(from: string, to: string, wallId: string, twinId: number): HalfEdge {
    const fp = verts.get(from)!;
    const tp = verts.get(to)!;
    const angle = v2Angle(v2Sub(tp, fp));
    const id = halfEdges.length;
    const he: HalfEdge = { id, from, to, twinId, angle, wallId };
    halfEdges.push(he);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push(id);
    return he;
  }

  for (const w of walls) {
    const a = addVert(w.start);
    const b = addVert(w.end);
    if (a === b) continue; // degenerate
    const aIdx = halfEdges.length;
    const bIdx = halfEdges.length + 1;
    addEdge(a, b, w.id, bIdx);
    addEdge(b, a, w.id, aIdx);
  }

  // Sort outgoing edges at each vertex CCW.
  outgoing.forEach((ids) => {
    ids.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);
  });

  // Walk faces: at the arrival vertex, the next edge bounding the same face
  // (on the right of e in our XZ screen — where +X is right, +Z is down — which
  // is the face on the LEFT in math convention) is the outgoing edge that comes
  // IMMEDIATELY AFTER twin in the math-CCW ordering. Because our 2D plan's Z axis
  // is flipped vs. math, "math-CCW next" corresponds to "screen-CW next".
  function nextEdge(eId: number): number {
    const e = halfEdges[eId];
    const twin = halfEdges[e.twinId];
    const ring = outgoing.get(twin.from)!;
    const idx = ring.indexOf(twin.id);
    const next = (idx + 1) % ring.length;
    return ring[next];
  }

  const visited = new Array<boolean>(halfEdges.length).fill(false);
  const faces: DetectedRoom[] = [];

  for (let startId = 0; startId < halfEdges.length; startId++) {
    if (visited[startId]) continue;
    const polygon: Vec2[] = [];
    const wallIds: string[] = [];
    let cur = startId;
    let safety = 0;
    while (!visited[cur]) {
      visited[cur] = true;
      const e = halfEdges[cur];
      polygon.push(verts.get(e.from)!);
      wallIds.push(e.wallId);
      cur = nextEdge(cur);
      if (++safety > halfEdges.length * 2) {
        // Defensive: malformed graph; abort this face.
        polygon.length = 0;
        wallIds.length = 0;
        break;
      }
    }
    if (polygon.length < 3) continue;
    const signedArea = polygonArea(polygon);
    const absArea = Math.abs(signedArea);
    if (absArea < MIN_ROOM_AREA) continue;
    faces.push({ polygon, wallIds, signedArea });
  }

  // Identify and drop the outer face. In our convention (XZ with +X right, +Z down,
  // and walking faces CW with respect to viewer) the OUTER face has positive
  // signed area while INNER (room) faces have negative signed area. To be robust
  // across handedness, we drop the largest face if it is significantly larger
  // than the rest (heuristic: outer is at least 1.05× the next-largest area).
  if (faces.length >= 2) {
    faces.sort((a, b) => Math.abs(b.signedArea) - Math.abs(a.signedArea));
    const largest = Math.abs(faces[0].signedArea);
    const second = Math.abs(faces[1].signedArea);
    if (largest > second * 1.05) {
      faces.shift();
    }
  } else if (faces.length === 1) {
    // Single closed polygon: keep if reasonably sized; this is the only room.
  }

  // Ensure each polygon is in a consistent orientation: CCW for downstream code.
  // In our XZ plane (Z grows downward in the 2D plan view), a CCW polygon
  // (mathematical) has NEGATIVE signed area in the formula. Flip if positive.
  for (const f of faces) {
    if (polygonArea(f.polygon) > 0) {
      f.polygon = f.polygon.slice().reverse();
      f.wallIds = f.wallIds.slice().reverse();
      f.signedArea = -f.signedArea;
    }
  }

  return faces;
}

/** Convenience: compute detected rooms with their absolute areas. */
export function detectSpacesWithAreas(walls: WallNode[]): Array<DetectedRoom & { area: number }> {
  return detectSpaces(walls).map((r) => ({ ...r, area: polygonAbsArea(r.polygon) }));
}
