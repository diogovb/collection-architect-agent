// Slab geometry: triangulated polygon (top + bottom + sides), built directly
// in world XZ. The previous version used ShapeGeometry/ExtrudeGeometry +
// rotateX(-π/2), which numerically inverted Z and made the slab end up at
// world.z = -polygon.z while walls/doors used positive z. Building directly
// in world XZ keeps everything aligned.
//
// FIX BUG A: top face is at y = elevation, bottom at y = elevation - thickness.
// So the floor surface is exactly at elevation (default 0) and the slab
// volume sits below — never poking above the floor.

import * as THREE from "three";
import type { SlabNode, Vec2 } from "./types";

/** Triangulate a simple polygon (no holes) using THREE.ShapeUtils.
 *  Returns a flat list of triangle indices. */
function triangulatePolygon(polygon: Vec2[]): number[] {
  const contour = polygon.map((p) => new THREE.Vector2(p.x, p.z));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const flat: number[] = [];
  for (const t of tris) for (const i of t) flat.push(i);
  return flat;
}

export function createSlabGeometry2D(slab: SlabNode): THREE.BufferGeometry {
  if (slab.polygon.length < 3) return new THREE.BufferGeometry();
  // Tiny lift to avoid z-fighting with grid/wall bottoms.
  const y = slab.elevation + 0.001;
  const positions = new Float32Array(slab.polygon.length * 3);
  for (let i = 0; i < slab.polygon.length; i++) {
    positions[i * 3] = slab.polygon[i].x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = slab.polygon[i].z;
  }
  const indices = triangulatePolygon(slab.polygon);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function createSlabGeometry3D(slab: SlabNode): THREE.BufferGeometry {
  if (slab.polygon.length < 3) return new THREE.BufferGeometry();
  const n = slab.polygon.length;
  const top = slab.elevation;
  const bottom = slab.elevation - slab.thickness;

  // 2N vertices: N at top (indices 0..n-1), N at bottom (indices n..2n-1).
  const positions = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = slab.polygon[i].x;
    positions[i * 3 + 1] = top;
    positions[i * 3 + 2] = slab.polygon[i].z;
  }
  for (let i = 0; i < n; i++) {
    positions[(n + i) * 3] = slab.polygon[i].x;
    positions[(n + i) * 3 + 1] = bottom;
    positions[(n + i) * 3 + 2] = slab.polygon[i].z;
  }

  const indices: number[] = [];
  // Top face (CCW from above)
  const topTris = triangulatePolygon(slab.polygon);
  for (const idx of topTris) indices.push(idx);
  // Bottom face (reverse winding so normal points down)
  for (let i = 0; i < topTris.length; i += 3) {
    indices.push(topTris[i] + n, topTris[i + 2] + n, topTris[i + 1] + n);
  }
  // Side quads (4 vertices, 2 triangles each)
  for (let i = 0; i < n; i++) {
    const a = i;
    const b = (i + 1) % n;
    // a (top), b (top), b (bottom)
    indices.push(a, b, b + n);
    // a (top), b (bottom), a (bottom)
    indices.push(a, b + n, a + n);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
