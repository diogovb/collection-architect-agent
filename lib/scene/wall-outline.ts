// Pixel-perfect 2D wall outline (Fase L).
//
// The previous envelope path was generated via `lib/scene/envelope.ts` which
// offsets every room polygon outward by HALF THE AVERAGE wall thickness.
// When walls have mixed thicknesses (e.g. exterior 0.20 m + interior 0.10 m)
// that average diverges from the real per-wall offset and the resulting
// stroke shows up *inside* the polygon fills — the user sees a thin line
// running through the wall body instead of hugging its edge.
//
// This module instead derives the outline directly from the mitered quads
// produced by `computeWallCorners`. Each wall contributes up to four edges:
//   - left lateral  (startLeft → endLeft)
//   - right lateral (endRight → startRight)
//   - start cap     (startRight → startLeft)  — only at FREE endpoints
//   - end cap       (endLeft → endRight)      — only at FREE endpoints
//
// Caps at vertices that are shared with another wall (junction) are dropped:
// the mitered corners coincide with those of the neighbour, so the cap edge
// is interior to the union and shouldn't be drawn. The remaining edges form
// the closed boundary of the wall union and are chained into one or more
// SVG sub-paths.

import type { Vec2, WallNode } from "./types";
import { computeWallCorners } from "./wall-mitering";

const VERTEX_TOL = 0.001; // 1 mm

interface OutlineEdge {
  a: Vec2;
  b: Vec2;
}

/** Snap-key for a vertex at 1 mm precision. Two vertices that round to the
 *  same key are treated as the same point during chaining. */
function vk(p: Vec2): string {
  return `${Math.round(p.x / VERTEX_TOL)},${Math.round(p.z / VERTEX_TOL)}`;
}

/** Build the SVG `d` attribute that traces the outer boundary of the wall
 *  union — including any inner room rings as separate sub-paths.
 *
 *  Returns `null` if there are no walls. */
export function buildWallOutlinePath(walls: WallNode[]): string | null {
  if (walls.length === 0) return null;
  const corners = computeWallCorners(walls);
  if (corners.size === 0) return null;

  // Count incidences at each endpoint so we can decide whether to draw caps.
  const endpointCount = new Map<string, number>();
  const bump = (p: Vec2) => {
    const k = vk(p);
    endpointCount.set(k, (endpointCount.get(k) ?? 0) + 1);
  };
  for (const w of walls) {
    bump(w.start);
    bump(w.end);
  }

  const edges: OutlineEdge[] = [];
  for (const w of walls) {
    const c = corners.get(w.id);
    if (!c) continue;
    // Two laterals — always part of the outline.
    edges.push({ a: c.startLeft, b: c.endLeft });
    edges.push({ a: c.endRight, b: c.startRight });
    // Caps — only when the endpoint is free (no neighbouring wall).
    if ((endpointCount.get(vk(w.start)) ?? 0) <= 1) {
      edges.push({ a: c.startRight, b: c.startLeft });
    }
    if ((endpointCount.get(vk(w.end)) ?? 0) <= 1) {
      edges.push({ a: c.endLeft, b: c.endRight });
    }
  }

  // Bridge thickness-step gaps. When two collinear walls of different
  // thicknesses share a vertex (e.g. internal 0.10 m meeting external
  // 0.15 m at an L-shape inner corner), `computeWallCorners` falls back
  // to default (un-mitered) corners on the parallel side, leaving a
  // perpendicular gap of |t1 − t2| / 2. The chain hits that gap, halts,
  // and the path's `Z` would close the open polyline with a long
  // diagonal across the building (visible bug). Adding a short bridge
  // edge between the two unmatched endpoints lets the chain continue
  // cleanly and renders the architectural step truthfully.
  bridgeUnmatchedEndpoints(edges);

  // Chain edges into closed loops.
  const loops = chainEdges(edges);
  if (loops.length === 0) return null;

  return loops
    .map((loop) => {
      if (loop.length < 2) return "";
      const head = `M ${loop[0].x} ${loop[0].z}`;
      const tail = loop.slice(1).map((p) => `L ${p.x} ${p.z}`).join(" ");
      // Defensive: only emit `Z` if the chain actually closed back to the
      // seed vertex. A non-closed loop means the bridge pass missed a
      // gap — `Z` there would draw a spurious diagonal back to the seed.
      const first = loop[0];
      const last = loop[loop.length - 1];
      const closed = vk(first) === vk(last);
      return closed ? `${head} ${tail} Z` : `${head} ${tail}`;
    })
    .filter(Boolean)
    .join(" ");
}

/** Close the perpendicular gap left by `computeWallCorners` when two
 *  collinear walls of unequal thickness meet at a junction. The mitering
 *  pass returns `null` for that pair (parallel offset lines) and the two
 *  un-mitered default corners end up |Δt| / 2 apart. We detect those
 *  orphaned endpoints by in/out-degree mismatch and bridge each pair
 *  with a short directed edge, restoring chain continuity. */
function bridgeUnmatchedEndpoints(edges: OutlineEdge[]): void {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const vertexPos = new Map<string, Vec2>();
  for (const e of edges) {
    const ka = vk(e.a);
    const kb = vk(e.b);
    outDegree.set(ka, (outDegree.get(ka) ?? 0) + 1);
    inDegree.set(kb, (inDegree.get(kb) ?? 0) + 1);
    if (!vertexPos.has(ka)) vertexPos.set(ka, e.a);
    if (!vertexPos.has(kb)) vertexPos.set(kb, e.b);
  }
  // Endpoints needing an OUTGOING edge (incoming > outgoing here).
  const needsOut: string[] = [];
  // Endpoints needing an INCOMING edge (outgoing > incoming here).
  const needsIn: string[] = [];
  for (const [k] of vertexPos) {
    const inn = inDegree.get(k) ?? 0;
    const out = outDegree.get(k) ?? 0;
    if (inn > out) needsOut.push(k);
    if (out > inn) needsIn.push(k);
  }
  // Pair each `needsOut` (a chain end) with the closest `needsIn` (a
  // chain start). Cap the search at 50 cm — beyond that we assume the
  // gap is intentional (e.g. a real opening) and not a thickness step.
  const MAX_BRIDGE = 0.5;
  const usedIn = new Set<string>();
  for (const outK of needsOut) {
    const outP = vertexPos.get(outK)!;
    let best: { k: string; d: number } | null = null;
    for (const inK of needsIn) {
      if (inK === outK) continue;
      if (usedIn.has(inK)) continue;
      const inP = vertexPos.get(inK)!;
      const dx = inP.x - outP.x;
      const dz = inP.z - outP.z;
      const d = Math.hypot(dx, dz);
      if (d > MAX_BRIDGE) continue;
      if (!best || d < best.d) best = { k: inK, d };
    }
    if (best) {
      edges.push({ a: outP, b: vertexPos.get(best.k)! });
      usedIn.add(best.k);
    }
  }
}

/** Greedy chain — pick an unused edge, walk it endpoint-by-endpoint until
 *  we return to the start, then move on to the next unused edge. The result
 *  is a list of closed polylines. */
function chainEdges(edges: OutlineEdge[]): Vec2[][] {
  // Index: vertex key → list of edge indices touching it.
  const adj = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const ka = vk(e.a);
    const kb = vk(e.b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push(i);
    adj.get(kb)!.push(i);
  });

  const used = new Array<boolean>(edges.length).fill(false);
  const loops: Vec2[][] = [];

  for (let seed = 0; seed < edges.length; seed++) {
    if (used[seed]) continue;
    const startEdge = edges[seed];
    const startKey = vk(startEdge.a);
    let curEdge = startEdge;
    let curKey = startKey;
    used[seed] = true;
    const loop: Vec2[] = [startEdge.a];

    // March from a to b, then look for the next edge that starts at b.
    let nextVertex = startEdge.b;
    let nextKey = vk(nextVertex);
    loop.push(nextVertex);

    while (nextKey !== startKey) {
      // Find an unused edge adjacent to nextKey (other than curEdge).
      const candidates = adj.get(nextKey) ?? [];
      let pickedIdx = -1;
      for (const idx of candidates) {
        if (used[idx]) continue;
        if (edges[idx] === curEdge) continue;
        pickedIdx = idx;
        break;
      }
      if (pickedIdx < 0) break; // open polyline — shouldn't happen for a valid union
      used[pickedIdx] = true;
      const e = edges[pickedIdx];
      // Decide which endpoint of e is the "next" vertex.
      const ea = vk(e.a);
      const eb = vk(e.b);
      if (ea === nextKey) {
        nextVertex = e.b;
        nextKey = eb;
      } else {
        nextVertex = e.a;
        nextKey = ea;
      }
      curEdge = e;
      curKey = nextKey;
      loop.push(nextVertex);
      // Bail out if the loop is degenerate.
      if (loop.length > edges.length + 2) break;
    }
    if (loop.length >= 4) loops.push(loop);
    // suppress unused var warning while keeping intent clear
    void curKey;
  }
  return loops;
}
