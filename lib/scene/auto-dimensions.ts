// Generate automatic dimension annotations for the building envelope.
//
// Strategy:
// - Find all exterior wall segments.
// - Group them by axis (horizontal/vertical) and side (north/south/east/west)
//   based on their position relative to the envelope bounding box.
// - For each cardinal side, emit ONE DimensionNode covering the full side.
// - The dimension's offset SIGN is chosen relative to the envelope
//   centroid so the cota always falls OUTSIDE the apartment, regardless
//   of which order the wall was drawn (Fase H).

import type { DimensionNode, NodeId, Vec2, WallNode } from "./types";

// Distance from the envelope (outermost wall edge) to the dimension line.
// Calibrated to keep the label clear of swing arcs and exterior wall thickness.
const ENVELOPE_OFFSET = 0.9;

/** Pick the sign of `magnitude` so that midpoint + perp * offset lies on
 *  the OUTSIDE of the envelope (i.e. on the opposite side of `centroid`).
 *  Renderer convention: dim_position = midpoint(start,end) + perp * offset
 *  where perp = v2Perp(normalize(end - start)). */
function outwardOffset(
  start: Vec2,
  end: Vec2,
  centroid: Vec2,
  magnitude: number,
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  // Perp matches lib/scene/types.ts:v2Perp = (x,z) -> (-z, x).
  const perpX = -dz / len;
  const perpZ = dx / len;
  const midX = (start.x + end.x) / 2;
  const midZ = (start.z + end.z) / 2;
  const outX = midX - centroid.x;
  const outZ = midZ - centroid.z;
  // Dot product: positive means perp already points outward.
  const dot = perpX * outX + perpZ * outZ;
  return dot >= 0 ? magnitude : -magnitude;
}

interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; }

function computeBounds(walls: WallNode[]): Bounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  }
  return { minX, maxX, minZ, maxZ };
}

const EPS = 0.05;

export function computeEnvelopeDimensions(walls: WallNode[]): DimensionNode[] {
  const exterior = walls.filter((w) => w.isExterior);
  if (exterior.length === 0) return [];
  const b = computeBounds(exterior);

  // Centroid from the bounding box — good enough for axis-aligned envelopes
  // and used to decide which side of the wall a dimension lives on.
  const centroid: Vec2 = {
    x: (b.minX + b.maxX) / 2,
    z: (b.minZ + b.maxZ) / 2,
  };

  const dims: DimensionNode[] = [];
  let seq = 0;
  const id = (): NodeId => `dimension:auto-${seq++}`;

  // Top (north) — y = minZ — collect intervals on this line.
  const collect = (axis: "h" | "v", fixed: number): { start: number; end: number }[] => {
    const intervals: { start: number; end: number }[] = [];
    for (const w of exterior) {
      if (axis === "h") {
        if (Math.abs(w.start.z - fixed) > EPS || Math.abs(w.end.z - fixed) > EPS) continue;
        const s = Math.min(w.start.x, w.end.x);
        const e = Math.max(w.start.x, w.end.x);
        intervals.push({ start: s, end: e });
      } else {
        if (Math.abs(w.start.x - fixed) > EPS || Math.abs(w.end.x - fixed) > EPS) continue;
        const s = Math.min(w.start.z, w.end.z);
        const e = Math.max(w.start.z, w.end.z);
        intervals.push({ start: s, end: e });
      }
    }
    intervals.sort((a, b) => a.start - b.start);
    // Merge overlapping.
    const merged: { start: number; end: number }[] = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv.start <= last.end + EPS) {
        last.end = Math.max(last.end, iv.end);
      } else {
        merged.push({ ...iv });
      }
    }
    return merged;
  };

  const pushDim = (start: Vec2, end: Vec2) => {
    dims.push({
      id: id(),
      type: "dimension",
      parentId: null,
      start,
      end,
      offset: outwardOffset(start, end, centroid, ENVELOPE_OFFSET),
      scope: "auto-envelope",
    });
  };

  // North side (z = minZ).
  for (const iv of collect("h", b.minZ)) {
    pushDim({ x: iv.start, z: b.minZ }, { x: iv.end, z: b.minZ });
  }
  // South (z = maxZ).
  for (const iv of collect("h", b.maxZ)) {
    pushDim({ x: iv.start, z: b.maxZ }, { x: iv.end, z: b.maxZ });
  }
  // West (x = minX).
  for (const iv of collect("v", b.minX)) {
    pushDim({ x: b.minX, z: iv.start }, { x: b.minX, z: iv.end });
  }
  // East (x = maxX).
  for (const iv of collect("v", b.maxX)) {
    pushDim({ x: b.maxX, z: iv.start }, { x: b.maxX, z: iv.end });
  }

  return dims;
}

/** Apply auto envelope dimensions: removes existing auto ones, adds fresh set. */
export function applyAutoDimensions(
  nodes: Record<NodeId, import("./types").AnyNode>,
  walls: WallNode[]
): Record<NodeId, import("./types").AnyNode> {
  const next = { ...nodes };
  // Remove existing auto-envelope dimensions.
  for (const [id, n] of Object.entries(next)) {
    if (n.type === "dimension" && n.scope === "auto-envelope") {
      delete next[id];
    }
  }
  // Add new ones.
  const fresh = computeEnvelopeDimensions(walls);
  for (const d of fresh) next[d.id] = d;
  return next;
}
