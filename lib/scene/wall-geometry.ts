// Wall geometry: produces 2D shapes and 3D extrusions from mitered wall corners.

import * as THREE from "three";
import type { Vec2, WallNode } from "./types";
import type { WallCorners } from "./wall-mitering";

/** 2D top-down quad (in XZ) ordered CCW: startLeft, endLeft, endRight, startRight. */
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

/** Flat (Y=0) ShapeGeometry for the top-down 2D wall fill. */
export function wallShapeGeometry2D(corners: WallCorners): THREE.BufferGeometry {
  const shape = wallShape2D(corners);
  const g = new THREE.ShapeGeometry(shape);
  // Shape is in XZ, but ShapeGeometry uses XY; rotate so that Y=0 plane.
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Extrude the wall footprint upward by `height` for 3D mode. */
export function wallExtrudedGeometry(corners: WallCorners, height: number): THREE.BufferGeometry {
  const shape = wallShape2D(corners);
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // ExtrudeGeometry extrudes along +Z; we want along +Y. Rotate so XY → XZ, depth → Y.
  g.rotateX(-Math.PI / 2);
  // After rotate, depth (was +Z) is now +Y; baseline is still at Y=0.
  return g;
}
