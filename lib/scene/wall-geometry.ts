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

/** Wall material group indices. Boundary edge tagging (Pascal pattern, full
 *  6-face split) — every triangle is assigned a `materialIndex` so the multi-
 *  material mesh can dress each face role independently AND so CSG output
 *  preserves the appropriate boundary material on door/window cuts.
 *
 *  Layout (looking at the wall from above, start→end going right):
 *  - LEFT  = +perp side (CCW perpendicular of start→end). Often "interior".
 *  - RIGHT = -perp side. Often "exterior".
 *  - START = the start endpoint cap.
 *  - END   = the end endpoint cap.
 *  - TOP   = +Y face.
 *  - BOTTOM= -Y face.
 *
 *  three-bvh-csg + Evaluator.useGroups=true preserves these per-triangle. */
export const WALL_GROUP_TOP = 0;
export const WALL_GROUP_BOTTOM = 1;
export const WALL_GROUP_LEFT = 2;
export const WALL_GROUP_RIGHT = 3;
export const WALL_GROUP_START = 4;
export const WALL_GROUP_END = 5;
export const WALL_GROUP_COUNT = 6;

/** Group used to tag CSG cut boundaries (door reveals). Choose LEFT — the
 *  reveal will face INTO the wall thickness, which we treat as the interior
 *  surface. Whichever group we pick must exist in the wall's material array. */
export const WALL_GROUP_CSG_BOUNDARY = WALL_GROUP_LEFT;

/** 3D box from the four wall corners extruded upward by `height`. World XYZ.
 *  Bottom is at y=0, top at y=height.
 *
 *  Geometry has 6 groups (top / bottom / left / right / start / end). When
 *  CSG cuts a door, new boundary triangles inherit WALL_GROUP_CSG_BOUNDARY
 *  (LEFT) so the reveal renders with the interior material. */
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

  // Indices grouped by face role.
  const topIndices = [
    // Top face (CCW from above = SL, EL, ER, SR → 4,5,6,7)
    4, 5, 6,
    4, 6, 7,
  ];
  const bottomIndices = [
    // Bottom face (reversed winding so normal points down)
    0, 2, 1,
    0, 3, 2,
  ];
  const leftIndices = [
    // SL → EL on the +perp side (interior face).
    0, 1, 5,
    0, 5, 4,
  ];
  const endIndices = [
    // EL → ER cap at end vertex.
    1, 2, 6,
    1, 6, 5,
  ];
  const rightIndices = [
    // ER → SR on the -perp side (exterior face).
    2, 3, 7,
    2, 7, 6,
  ];
  const startIndices = [
    // SR → SL cap at start vertex.
    3, 0, 4,
    3, 4, 7,
  ];

  const indices = new Uint16Array([
    ...topIndices,
    ...bottomIndices,
    ...leftIndices,
    ...endIndices,
    ...rightIndices,
    ...startIndices,
  ]);

  // Dummy UVs (three-bvh-csg requires the attribute to exist).
  const uvs = new Float32Array(positions.length / 3 * 2);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(indices, 1));

  // Boundary edge tagging — material groups by face role.
  let cursor = 0;
  const ranges: Array<[number, number]> = [
    [topIndices.length, WALL_GROUP_TOP],
    [bottomIndices.length, WALL_GROUP_BOTTOM],
    [leftIndices.length, WALL_GROUP_LEFT],
    [endIndices.length, WALL_GROUP_END],
    [rightIndices.length, WALL_GROUP_RIGHT],
    [startIndices.length, WALL_GROUP_START],
  ];
  for (const [count, idx] of ranges) {
    g.addGroup(cursor, count, idx);
    cursor += count;
  }

  g.computeVertexNormals();
  return g;
}
