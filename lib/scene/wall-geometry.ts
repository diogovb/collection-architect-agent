// Wall geometry: produces 2D shapes and 3D extrusions from mitered wall corners.
//
// IMPORTANT: geometry is built directly in world-space XZ (no shape rotation).
// Earlier versions used `THREE.ShapeGeometry` + `rotateX(-π/2)`, which numerically
// inverted Z (rotateX(-π/2) sends shape.y → -world.z). That caused walls to
// render at world.z = -corners.z while doors/windows used corners.z directly,
// floating outside the walls in 3D.

import * as THREE from "three";
import type { Vec2 } from "./types";
import type { WallCorners } from "./wall-mitering";

/** 2D top-down quad (in XZ) ordered CCW: startLeft, endLeft, endRight, startRight.
 *  Kept for callers that want a Three.Shape — not used for rendering anymore. */
export function wallShape2D(corners: WallCorners): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(corners.startLeft.x, corners.startLeft.z);
  shape.lineTo(corners.endLeft.x, corners.endLeft.z);
  shape.lineTo(corners.endRight.x, corners.endRight.z);
  shape.lineTo(corners.startRight.x, corners.startRight.z);
  shape.closePath();
  return shape;
}

/** 2D plan footprint as a closed polyline (4 points + return). */
export function wallOutline2D(corners: WallCorners): Vec2[] {
  return [corners.startLeft, corners.endLeft, corners.endRight, corners.startRight, corners.startLeft];
}

/** Flat (Y=0) BufferGeometry for the top-down 2D wall fill, in world XZ. */
export function wallShapeGeometry2D(corners: WallCorners): THREE.BufferGeometry {
  const positions = new Float32Array([
    corners.startLeft.x,  0, corners.startLeft.z,   // 0
    corners.endLeft.x,    0, corners.endLeft.z,     // 1
    corners.endRight.x,   0, corners.endRight.z,    // 2
    corners.startRight.x, 0, corners.startRight.z,  // 3
  ]);
  // CCW from above (Y up) so face normal points up.
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  // Dummy UVs (three-bvh-csg iterates all attributes; missing uv → crash).
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

/** Wall material group indices. Boundary edge tagging (Pascal pattern) —
 *  every triangle is assigned a `materialIndex` so the multi-material mesh
 *  can show different finishes on caps vs sides, AND so CSG output preserves
 *  the side material on cut boundaries (door jambs, window reveals).
 *
 *  three-bvh-csg + Evaluator.useGroups=true preserves these per-triangle. */
export const WALL_GROUP_TOP = 0;
export const WALL_GROUP_BOTTOM = 1;
export const WALL_GROUP_SIDE = 2;
export const WALL_GROUP_COUNT = 3;

/** 3D box from the four wall corners extruded upward by `height`. World XYZ.
 *  Bottom is at y=0, top at y=height.
 *
 *  Geometry has 3 groups (top / bottom / side). Side group covers all 4 lateral
 *  faces — that way when CSG cuts a door, the new boundary triangles inherit
 *  materialIndex 2, so the door reveal renders with the side material. */
export function wallExtrudedGeometry(corners: WallCorners, height: number): THREE.BufferGeometry {
  const sl = corners.startLeft;
  const el = corners.endLeft;
  const er = corners.endRight;
  const sr = corners.startRight;

  // 8 vertices: 4 bottom (y=0) at indices 0..3, 4 top (y=height) at 4..7.
  // Order around the perimeter (CCW from above): SL, EL, ER, SR.
  const positions = new Float32Array([
    // bottom ring (y=0)
    sl.x, 0, sl.z,  // 0
    el.x, 0, el.z,  // 1
    er.x, 0, er.z,  // 2
    sr.x, 0, sr.z,  // 3
    // top ring (y=height)
    sl.x, height, sl.z,  // 4
    el.x, height, el.z,  // 5
    er.x, height, er.z,  // 6
    sr.x, height, sr.z,  // 7
  ]);

  // Indices grouped by face — the `addGroup` calls below tag each chunk
  // with a materialIndex so CSG preserves it.
  const topIndices = [
    // Top face (looking down: CCW = SL, EL, ER, SR → 4,5,6,7)
    4, 5, 6,
    4, 6, 7,
  ];
  const bottomIndices = [
    // Bottom face (looking up: reverse order)
    0, 2, 1,
    0, 3, 2,
  ];
  const sideIndices = [
    // Side: SL-EL (left of wall, from start to end)
    0, 1, 5,
    0, 5, 4,
    // Side: EL-ER (end cap)
    1, 2, 6,
    1, 6, 5,
    // Side: ER-SR (right of wall, from end to start)
    2, 3, 7,
    2, 7, 6,
    // Side: SR-SL (start cap)
    3, 0, 4,
    3, 4, 7,
  ];

  const indices = new Uint16Array([...topIndices, ...bottomIndices, ...sideIndices]);

  // Dummy UVs (three-bvh-csg requires the attribute to exist).
  const uvs = new Float32Array(positions.length / 3 * 2);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(indices, 1));

  // Boundary edge tagging — material groups by face role.
  let cursor = 0;
  g.addGroup(cursor, topIndices.length, WALL_GROUP_TOP);
  cursor += topIndices.length;
  g.addGroup(cursor, bottomIndices.length, WALL_GROUP_BOTTOM);
  cursor += bottomIndices.length;
  g.addGroup(cursor, sideIndices.length, WALL_GROUP_SIDE);

  g.computeVertexNormals();
  return g;
}
