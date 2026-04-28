// 3D walls as a single fused mesh (Fase M).
//
// Earlier each wall rendered as its own `<mesh>` with `wallExtrudedGeometry`
// + per-wall CSG cutouts + per-wall inverted-hull silhouette. Even with
// mitered corners coming from `computeWallCorners`, neighbouring walls had
// independent vertex normals on the shared corners — so the toon shading
// banded inconsistently across the seam, and the inverted hull leaked black
// strips into the inside of T-junctions.
//
// This module merges every wall extrusion into ONE BufferGeometry, applies
// CSG cutouts on it, then welds coincident vertices via `mergeVertices`.
// The single mesh has one set of normals, one outline, and CSG never has to
// deal with disjoint islands. Rendering goes through `WallsUnionView`.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { DoorNode, WallNode, WindowNode } from "./types";
import { computeWallCorners } from "./wall-mitering";
import { wallExtrudedGeometry } from "./wall-geometry";
import { applyWallCutouts, type CsgWarning } from "./csg-cutouts";

export interface WallsUnionResult {
  /** Welded multi-material BufferGeometry covering every wall. Six material
   *  groups (top / bottom / left / right / start / end) match the per-face
   *  layout from `wall-geometry.ts` so the same material array works. */
  geometry: THREE.BufferGeometry | null;
  warnings: CsgWarning[];
}

/** Build the unified wall geometry. Returns null if there are no walls or
 *  the merge fails (BufferGeometryUtils returns null when input is empty). */
export function buildWallsUnion(
  walls: WallNode[],
  doors: DoorNode[],
  windows: WindowNode[],
): WallsUnionResult {
  if (walls.length === 0) return { geometry: null, warnings: [] };

  const corners = computeWallCorners(walls);
  const cutoutsByWall = new Map<string, Array<DoorNode | WindowNode>>();
  for (const d of doors) {
    if (!cutoutsByWall.has(d.wallId)) cutoutsByWall.set(d.wallId, []);
    cutoutsByWall.get(d.wallId)!.push(d);
  }
  for (const w of windows) {
    if (!cutoutsByWall.has(w.wallId)) cutoutsByWall.set(w.wallId, []);
    cutoutsByWall.get(w.wallId)!.push(w);
  }

  const warnings: CsgWarning[] = [];
  const pieces: THREE.BufferGeometry[] = [];
  for (const wall of walls) {
    const c = corners.get(wall.id);
    if (!c) continue;
    const base = wallExtrudedGeometry(c, wall.height);
    const openings = cutoutsByWall.get(wall.id) ?? [];
    if (openings.length === 0) {
      pieces.push(base);
      continue;
    }
    const { geometry, warnings: ws } = applyWallCutouts(base, wall, openings);
    base.dispose();
    pieces.push(geometry);
    warnings.push(...ws);
  }

  if (pieces.length === 0) return { geometry: null, warnings };

  // Pre-compute the consolidated group layout (Fase O fix). Each piece
  // carries 6 groups tagged with WALL_GROUP_TOP..END (material indices
  // 0..5). We sum the index counts for each role across all pieces so
  // that AFTER merging we can rebuild ONE consolidated group per role.
  //
  // We don't pass useGroups=true to mergeGeometries: that helper assigns
  // materialIndex = pieceIndex (0..N-1), which destroys the per-face
  // role tagging and leaves the multi-material mesh invisible because
  // <meshToonMaterial attach="material-0..5"> never matches groups
  // 0..N-1. We pass useGroups=false (it just concatenates indices) and
  // re-create the 6 role groups manually below.
  const totalsByRole = new Map<number, number>();
  for (const piece of pieces) {
    for (const g of piece.groups) {
      const idx = g.materialIndex ?? 0;
      totalsByRole.set(idx, (totalsByRole.get(idx) ?? 0) + g.count);
    }
  }

  const merged = mergeGeometries(pieces, false);
  if (!merged) {
    for (const p of pieces) p.dispose();
    return { geometry: null, warnings };
  }

  // Reorder the merged index buffer so all triangles of the same
  // materialIndex are contiguous, then describe each role as a single
  // group. This matches the `<meshToonMaterial attach="material-N">`
  // expectation in WallsUnionView and keeps the existing 6-face
  // material layout unchanged.
  reorderIndicesByRole(merged, pieces);
  merged.clearGroups();
  let cursor = 0;
  // Sort roles by material index for determinism.
  const roles = [...totalsByRole.keys()].sort((a, b) => a - b);
  for (const role of roles) {
    const count = totalsByRole.get(role) ?? 0;
    if (count > 0) {
      merged.addGroup(cursor, count, role);
      cursor += count;
    }
  }

  // Weld vertices that coincide within 1 mm. After `Fase N`'s 5 cm snap
  // the mitered corners of neighbouring walls land on EXACT coordinates,
  // so welding fuses them into single vertices — normals get averaged
  // across both walls and the toon shading reads continuously instead
  // of banding at the seam. mergeVertices preserves the index ordering
  // (and therefore the groups we just rebuilt).
  const welded = mergeVertices(merged, 0.001);
  welded.computeVertexNormals();

  // Dispose intermediates.
  for (const p of pieces) p.dispose();
  if (welded !== merged) merged.dispose();

  return { geometry: welded, warnings };
}

/** Permute the index buffer of `merged` so that triangles are grouped by
 *  their original materialIndex (face role: top/bottom/left/right/start/
 *  end). This is the inverse of the per-piece interleaving that
 *  mergeGeometries(_, false) produces — it just concatenates each piece's
 *  index buffer in input order, keeping each piece's own group ordering.
 *  We rebuild the order so all "top" triangles come first across every
 *  piece, then "bottom", etc. */
function reorderIndicesByRole(
  merged: THREE.BufferGeometry,
  pieces: THREE.BufferGeometry[],
): void {
  const idxAttr = merged.getIndex();
  if (!idxAttr) return;

  // Bucket triangle indices by role.
  const buckets = new Map<number, number[]>();
  // Walk each piece in input order; mergeGeometries(_, false) appended
  // their index arrays end-to-end, with each piece's vertices offset by
  // the running vertex count. We mirror that walk to map merged-buffer
  // positions back to per-piece groups.
  let triCursor = 0; // running triangle index inside merged
  for (const piece of pieces) {
    const pIdx = piece.getIndex();
    if (!pIdx) continue;
    const pTriCount = pIdx.count / 3;
    for (const g of piece.groups) {
      const role = g.materialIndex ?? 0;
      const startTri = triCursor + Math.floor(g.start / 3);
      const triCount = Math.floor(g.count / 3);
      let bucket = buckets.get(role);
      if (!bucket) {
        bucket = [];
        buckets.set(role, bucket);
      }
      for (let t = 0; t < triCount; t++) {
        const tri = startTri + t;
        bucket.push(tri * 3, tri * 3 + 1, tri * 3 + 2);
      }
    }
    triCursor += pTriCount;
  }

  // Reassemble the index buffer ordered by role.
  const roles = [...buckets.keys()].sort((a, b) => a - b);
  const reordered = new Uint32Array(idxAttr.count);
  let writeCursor = 0;
  for (const role of roles) {
    const list = buckets.get(role)!;
    for (const i of list) {
      reordered[writeCursor++] = idxAttr.getX(i);
    }
  }
  merged.setIndex(new THREE.BufferAttribute(reordered, 1));
}
