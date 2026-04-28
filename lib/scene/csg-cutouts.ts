// CSG cutouts for doors and windows on 3D wall extrusions.
//
// For each wall with one or more openings, build a brush per opening that
// SUBSUMES the wall thickness, position it at the opening's centerline along
// the wall, and subtract from the base wall geometry.
//
// FIX BUG B: when an opening is requested but the wall doesn't accommodate it
// (offset out of range or wall too thin), we LOG a warning instead of silently
// dropping the cutout. The warning surfaces in dev console + diagnostics.

import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { DoorNode, WallNode, WindowNode } from "./types";
import { v2Norm, v2Sub } from "./types";

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

/** Apply CSG subtractions for all openings on a wall.
 *  Returns the resulting BufferGeometry along with any warnings. */
export function applyWallCutouts(
  baseGeometry: THREE.BufferGeometry,
  wall: WallNode,
  openings: Array<DoorNode | WindowNode>,
  evaluator: Evaluator
): { geometry: THREE.BufferGeometry; warnings: CsgWarning[] } {
  const warnings: CsgWarning[] = [];
  if (openings.length === 0) return { geometry: baseGeometry, warnings };

  const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const dir = v2Norm(v2Sub(wall.end, wall.start));
  const angle = Math.atan2(dir.z, dir.x);

  let acc = new Brush(baseGeometry);
  acc.updateMatrixWorld();

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

    const cutGeom = new THREE.BoxGeometry(op.width, op.height, wall.thickness * 1.5);
    const centerWorld = {
      x: wall.start.x + dir.x * op.offset,
      z: wall.start.z + dir.z * op.offset,
    };
    const centerY = op.bottom + op.height / 2;
    const m = new THREE.Matrix4()
      .makeTranslation(centerWorld.x, centerY, centerWorld.z)
      .multiply(new THREE.Matrix4().makeRotationY(-angle));
    cutGeom.applyMatrix4(m);
    const cutBrush = new Brush(cutGeom);
    cutBrush.updateMatrixWorld();

    const next = evaluator.evaluate(acc, cutBrush, SUBTRACTION) as Brush;
    acc.geometry.dispose();
    cutBrush.geometry.dispose();
    acc = next;
  }

  return { geometry: acc.geometry, warnings };
}
