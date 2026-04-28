// Slab (floor) geometry — extrude a 2D polygon into a thin slab.

import * as THREE from "three";
import type { SlabNode, Vec2 } from "./types";

export function createSlabGeometry(slab: SlabNode): THREE.BufferGeometry {
  if (slab.polygon.length < 3) return new THREE.BufferGeometry();
  return polygonToExtrudedSlab(slab.polygon, slab.thickness, slab.elevation);
}

/**
 * Extrudes a closed polygon (XZ plane) into a slab of given thickness whose top
 * face sits at `elevation` (default 0). The result is positioned in world space.
 */
export function polygonToExtrudedSlab(
  polygon: Vec2[],
  thickness: number,
  elevation: number
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].z);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, polygon[i].z);
  }
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  // ExtrudeGeometry extrudes along +Z by default, with shape on XY plane.
  // Rotate to put the shape on XZ plane, slab thickness along +Y.
  // Then position so top of slab sits at `elevation`.
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, elevation, 0);
  return geom;
}
