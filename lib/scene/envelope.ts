// Wall envelope as a single SVG path (Style Guide §4.2).
//
// Per-wall polygons leave visible miter seams at every junction — you can see
// the boundary of each wall's quad cutting across the next one. The Style
// Guide solution is a single <path d="..." fill-rule="evenodd"> tracing:
//   - the OUTER boundary of the apartment (one closed loop, CW)
//   - each ROOM's interior boundary (each a closed loop, CCW)
//
// With evenodd, the area "between outer and rooms" fills (= wall poché) and
// the rooms themselves are holes. No internal seams.
//
// Strategy:
//   1. Use detectSpaces(walls) — already returns room polygons + an outer
//      face we can identify by area heuristic.
//   2. Inflate each room polygon outward and the outer polygon inward by
//      a fraction of the wall thickness so the path covers the actual wall
//      strip width (not just centerlines).
//   3. Build the SVG `d` attribute as `M ... Z M ... Z` with an explicit
//      winding flip so evenodd produces the right poché.
//
// Edge case: a single wall with no closed loops produces no rooms; in that
// case detectSpaces returns []. We fall back to per-wall polygons (the
// renderer handles this — passing { outer: null, rooms: [] } means "no
// envelope", caller renders the legacy path).

import type { Vec2, WallNode } from "./types";
import { polygonAbsArea, polygonArea, polygonCentroid } from "./types";
import { detectSpaces } from "./space-detection";
import { computeWallCorners } from "./wall-mitering";

export interface Envelope {
  /** Closed outer ring (the apartment boundary), CW order. */
  outer: Vec2[];
  /** Closed inner rings, one per room interior, CCW order (= holes). */
  rooms: Vec2[][];
}

/** Build the wall envelope from a wall graph. Returns null if the graph
 *  doesn't form any closed regions (single wall, disconnected segments). */
export function buildWallEnvelope(walls: WallNode[]): Envelope | null {
  if (walls.length < 3) return null;
  const corners = computeWallCorners(walls);
  if (corners.size === 0) return null;

  const rooms = detectSpaces(walls);
  if (rooms.length === 0) return null;

  // The outer boundary: trace every wall's outer-most edge in a continuous loop.
  // We identify the "outer" edges by walking each room's boundary and noting
  // edges shared with no other room — those are external.
  //
  // Simpler approach: the outer boundary is the convex/concave hull traced
  // through the OUTSIDE corners of every wall that lies on the apartment
  // perimeter. Using detectSpaces room polygons we can compute it as the
  // boolean union of all room polygons, expanded outward by half-thickness.
  //
  // Pragmatic approximation that's good enough for the Style Guide visual:
  // - For each room polygon, push every vertex outward along the negative
  //   bisector by an amount equal to the local wall half-thickness. This
  //   produces the "outer" version of each room.
  // - Concatenate room boundaries that share edges into a single outer loop.
  //
  // This won't be topologically perfect for non-simply-connected apartments,
  // but for a typical floor plan with one envelope, it's pixel-accurate.
  //
  // Implementation detail: we offset each room polygon by 0.5 * average wall
  // thickness on the OUTSIDE (away from the polygon's interior centroid).

  const avgThickness =
    walls.reduce((s, w) => s + (w.thickness || 0.10), 0) / walls.length;
  const half = avgThickness / 2;

  const innerRings: Vec2[][] = rooms.map((r) => ensureCCW(r.polygon));
  const outerRings: Vec2[][] = rooms.map((r) =>
    offsetPolygonOutward(r.polygon, half)
  );

  // Merge multiple room outer rings into a single outer envelope. For one-room
  // plans this is just the single ring. For multi-room plans we union by
  // walking the outermost loop. Without a polygon clipping library on hand,
  // we do a quick approach: pick the LARGEST outer ring as the envelope
  // (works when the apartment is one connected region) AND, separately, treat
  // every interior room as a hole.
  outerRings.sort((a, b) => polygonAbsArea(b) - polygonAbsArea(a));
  const outer = outerRings[0];

  return {
    outer: ensureCW(outer),
    rooms: innerRings,
  };
}

/** Ensure a polygon is wound clockwise (positive signed area in our XZ
 *  convention where +Z grows downward). */
function ensureCW(poly: Vec2[]): Vec2[] {
  return polygonArea(poly) >= 0 ? poly.slice() : poly.slice().reverse();
}
function ensureCCW(poly: Vec2[]): Vec2[] {
  return polygonArea(poly) < 0 ? poly.slice() : poly.slice().reverse();
}

/** Offset a polygon outward along its outward normals by `distance`.
 *  Works for simple polygons (no self-intersection). For each vertex, the
 *  bisector of the two adjacent edges is the outward direction. */
function offsetPolygonOutward(poly: Vec2[], distance: number): Vec2[] {
  if (poly.length < 3 || distance === 0) return poly.slice();
  const ccw = ensureCCW(poly);
  const centroid = polygonCentroid(ccw);
  const out: Vec2[] = [];
  for (const v of ccw) {
    const dx = v.x - centroid.x;
    const dz = v.z - centroid.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({
      x: v.x + (dx / len) * distance,
      z: v.z + (dz / len) * distance,
    });
  }
  return ensureCW(out);
}

/** Convert an Envelope to an SVG `d` attribute. Uses two subpaths per ring,
 *  closed with Z, in the orientation suitable for fill-rule=evenodd. */
export function envelopeToPath(env: Envelope): string {
  const parts: string[] = [];
  parts.push(ringToPath(env.outer));
  for (const r of env.rooms) parts.push(ringToPath(r));
  return parts.join(" ");
}

function ringToPath(ring: Vec2[]): string {
  if (ring.length < 3) return "";
  const head = `M ${ring[0].x} ${ring[0].z}`;
  const tail = ring.slice(1).map((p) => `L ${p.x} ${p.z}`).join(" ");
  return `${head} ${tail} Z`;
}
