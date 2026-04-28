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

  // mergeGeometries(_, useGroups=true) preserves the per-triangle group
  // (material index) tags so the multi-material mesh keeps painting each
  // face role separately.
  const merged = mergeGeometries(pieces, true);
  if (!merged) {
    for (const p of pieces) p.dispose();
    return { geometry: null, warnings };
  }

  // Weld vertices that coincide within 1 mm. After `Fase N`'s 5 cm snap
  // the mitered corners of neighbouring walls land on EXACT coordinates,
  // so welding fuses them into single vertices — normals get averaged
  // across both walls and the toon shading reads continuously instead
  // of banding at the seam.
  const welded = mergeVertices(merged, 0.001);
  welded.computeVertexNormals();

  // Dispose intermediates.
  for (const p of pieces) p.dispose();
  if (welded !== merged) merged.dispose();

  return { geometry: welded, warnings };
}
