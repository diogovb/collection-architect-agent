// CSG cutouts for doors and windows on 3D wall extrusions.
//
// Pattern (inspired by https://github.com/pascalorg/editor):
//  - Single shared Evaluator (no per-wall instantiation).
//  - BVH pre-computed on every brush via three-mesh-bvh — turns CSG from O(n²)
//    triangle pair tests into O(log n).
//  - Cut brushes are 2× wall thickness so the subtract clears both faces of
//    the wall cleanly even with miter offsets.
//
// FIX BUG B: when an opening doesn't fit (offset out of range or wall too
// thin), we LOG a warning and skip the cutout instead of silently dropping.

import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import type { DoorNode, WallNode, WindowNode } from "./types";
import { v2Norm, v2Sub } from "./types";
import { WALL_GROUP_CSG_BOUNDARY } from "./wall-geometry";

// One-time install: extend BufferGeometry/Mesh prototypes with BVH helpers.
// three-bvh-csg uses these under the hood; without them every Brush rebuilds
// its bounds tree on demand (slow).
// NOTE: three-mesh-bvh already augments the "three" module — no re-declaration
// needed here (it would cause TS2689 "duplicate modifiers" if repeated).
let _bvhInstalled = false;
function ensureBvhInstalled(): void {
  if (_bvhInstalled) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  _bvhInstalled = true;
}

/** Shared Evaluator. Pascal does the same — instantiating per-wall blows up cost.
 *  `useGroups = true` preserves materialIndex per triangle through subtraction:
 *  cut faces inherit the wall side group, so door reveals render with the side
 *  material. Without this, CSG output is a single ungrouped triangle list. */
const SHARED_EVALUATOR = new Evaluator();
SHARED_EVALUATOR.useGroups = true;

export interface CsgWarning {
  wallId: string;
  openingId: string;
  message: string;
}

interface Opening {
  id: string;
  offset: number;
  width: number;
  height: number;
  /** Distance from floor to bottom of opening. 0 for doors. */
  bottom: number;
}

function toOpening(o: DoorNode | WindowNode): Opening {
  return o.type === "door"
    ? { id: o.id, offset: o.offset, width: o.width, height: o.height, bottom: 0 }
    : { id: o.id, offset: o.offset, width: o.width, height: o.height, bottom: o.sillHeight };
}

/** Build a brush with pre-computed BVH for fast CSG.
 *  Caller is responsible for disposing the geometry afterward. */
function makeBrush(geom: THREE.BufferGeometry): Brush {
  ensureBvhInstalled();
  if (geom.computeBoundsTree) {
    geom.computeBoundsTree({ maxLeafTris: 10 });
  }
  const b = new Brush(geom);
  b.updateMatrixWorld();
  return b;
}

/** Apply CSG subtractions for all openings on a wall.
 *  Returns the resulting BufferGeometry along with any warnings. */
export function applyWallCutouts(
  baseGeometry: THREE.BufferGeometry,
  wall: WallNode,
  openings: Array<DoorNode | WindowNode>,
  evaluator?: Evaluator
): { geometry: THREE.BufferGeometry; warnings: CsgWarning[] } {
  const warnings: CsgWarning[] = [];
  if (openings.length === 0) return { geometry: baseGeometry, warnings };

  const ev = evaluator ?? SHARED_EVALUATOR;
  const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const dir = v2Norm(v2Sub(wall.end, wall.start));
  const angle = Math.atan2(dir.z, dir.x);

  let acc = makeBrush(baseGeometry);

  for (const o of openings) {
    const op = toOpening(o);
    if (op.offset - op.width / 2 < -1e-3 || op.offset + op.width / 2 > wallLen + 1e-3) {
      warnings.push({
        wallId: wall.id,
        openingId: op.id,
        message: `opening ${op.id} (${op.width.toFixed(2)}m wide @ offset ${op.offset.toFixed(2)}m) does not fit wall length ${wallLen.toFixed(2)}m`,
      });
      continue;
    }
    if (op.height > wall.height + 1e-3) {
      warnings.push({
        wallId: wall.id,
        openingId: op.id,
        message: `opening ${op.id} height ${op.height.toFixed(2)}m exceeds wall height ${wall.height.toFixed(2)}m`,
      });
      continue;
    }

    // Box that bites through the wall: 2× thickness on the wall normal axis,
    // exact width along the wall, exact height vertically.
    const cutGeom = new THREE.BoxGeometry(op.width, op.height, wall.thickness * 2.0);
    const centerWorld = {
      x: wall.start.x + dir.x * op.offset,
      z: wall.start.z + dir.z * op.offset,
    };
    const centerY = op.bottom + op.height / 2;
    const m = new THREE.Matrix4()
      .makeTranslation(centerWorld.x, centerY, centerWorld.z)
      .multiply(new THREE.Matrix4().makeRotationY(-angle));
    cutGeom.applyMatrix4(m);
    // Tag the cut brush as the CSG boundary group so SUBTRACTION boundary
    // triangles inherit a sensible material (door reveals/window jambs).
    // Without clearing first BoxGeometry's default 6 face groups would carry
    // through, producing wrong materials per-face on the cut surface.
    cutGeom.clearGroups();
    const totalCount =
      cutGeom.getIndex()?.count ?? cutGeom.attributes.position.count;
    cutGeom.addGroup(0, totalCount, WALL_GROUP_CSG_BOUNDARY);
    const cutBrush = makeBrush(cutGeom);

    // Wrap in try/catch: three-bvh-csg can throw on degenerate geometry. We
    // skip the cutout in that case rather than crashing the whole canvas.
    try {
      const next = ev.evaluate(acc, cutBrush, SUBTRACTION) as Brush;
      acc.geometry.dispose();
      cutBrush.geometry.dispose();
      acc = next;
    } catch (e) {
      cutBrush.geometry.dispose();
      warnings.push({
        wallId: wall.id,
        openingId: op.id,
        message: `CSG subtract failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return { geometry: acc.geometry, warnings };
}
