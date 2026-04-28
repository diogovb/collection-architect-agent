// Generate automatic dimension annotations for the building envelope.
//
// Strategy:
// - Find all exterior wall segments.
// - Group them by axis (horizontal/vertical) and side (north/south/east/west)
//   based on their position relative to the envelope bounding box.
// - For each cardinal side, emit ONE DimensionNode covering the full side.
// - The dimension is offset 0.6m outside the envelope.

import type { DimensionNode, NodeId, Vec2, WallNode } from "./types";

const ENVELOPE_OFFSET = 0.6;

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

  // North side (z = minZ) — emit dimensions on each merged interval at offset -ENVELOPE_OFFSET in z.
  for (const iv of collect("h", b.minZ)) {
    const start: Vec2 = { x: iv.start, z: b.minZ };
    const end: Vec2 = { x: iv.end, z: b.minZ };
    dims.push({
      id: id(),
      type: "dimension",
      parentId: null,
      start,
      end,
      offset: -ENVELOPE_OFFSET,
      scope: "auto-envelope",
    });
  }
  // South (z = maxZ).
  for (const iv of collect("h", b.maxZ)) {
    const start: Vec2 = { x: iv.start, z: b.maxZ };
    const end: Vec2 = { x: iv.end, z: b.maxZ };
    dims.push({
      id: id(),
      type: "dimension",
      parentId: null,
      start,
      end,
      offset: ENVELOPE_OFFSET,
      scope: "auto-envelope",
    });
  }
  // West (x = minX).
  for (const iv of collect("v", b.minX)) {
    const start: Vec2 = { x: b.minX, z: iv.start };
    const end: Vec2 = { x: b.minX, z: iv.end };
    dims.push({
      id: id(),
      type: "dimension",
      parentId: null,
      start,
      end,
      offset: -ENVELOPE_OFFSET,
      scope: "auto-envelope",
    });
  }
  // East (x = maxX).
  for (const iv of collect("v", b.maxX)) {
    const start: Vec2 = { x: b.maxX, z: iv.start };
    const end: Vec2 = { x: b.maxX, z: iv.end };
    dims.push({
      id: id(),
      type: "dimension",
      parentId: null,
      start,
      end,
      offset: ENVELOPE_OFFSET,
      scope: "auto-envelope",
    });
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
