// Slab geometry: polygon → flat top + downward-extruded bottom.
//
// FIX BUG A: ExtrudeGeometry on a polygon in XZ extrudes along +Z (now +Y after
// rotate). To make the slab sit BELOW the floor surface (so the floor sits
// exactly at y=0 and never overflows above), we translate by -thickness so
// the top face is at y=0 and the bottom at y=-thickness.

import * as THREE from "three";
import type { SlabNode, Vec2 } from "./types";

export function createSlabGeometry2D(slab: SlabNode): THREE.BufferGeometry {
  if (slab.polygon.length < 3) return new THREE.BufferGeometry();
  const shape = polygonToShape(slab.polygon, slab.holes ?? []);
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  // Tiny lift to avoid z-fighting with grid/wall bottoms.
  g.translate(0, slab.elevation + 0.001, 0);
  return g;
}

export function createSlabGeometry3D(slab: SlabNode): THREE.BufferGeometry {
  if (slab.polygon.length < 3) return new THREE.BufferGeometry();
  const shape = polygonToShape(slab.polygon, slab.holes ?? []);
  const g = new THREE.ExtrudeGeometry(shape, { depth: slab.thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  // Translate so TOP face = elevation (y=0 by default), BOTTOM = -thickness.
  g.translate(0, slab.elevation, 0);
  // After rotateX(-π/2), the originally top of the extrude is now at y=0
  // and the depth went toward -Y. Confirmed by ExtrudeGeometry default.
  return g;
}

function polygonToShape(polygon: Vec2[], holes: Vec2[][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].z);
  for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i].x, polygon[i].z);
  shape.closePath();
  for (const h of holes) {
    if (h.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(h[0].x, h[0].z);
    for (let i = 1; i < h.length; i++) path.lineTo(h[i].x, h[i].z);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}
