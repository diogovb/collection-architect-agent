// Outline helpers for the 3D illustrated look (Fase J).
//
// Replaced the old `THREE.EdgesGeometry` per-mesh approach: at threshold 1°
// it picked up CSG and Earcut triangulation seams; at higher thresholds it
// missed legitimate corners. The new strategy is an **inverted hull** —
// render a backface-only copy of the geometry with vertices inflated along
// their normals by ~2 cm. The expanded backfaces poke past the silhouette
// of the toon-shaded body, producing a clean ink contour wherever the
// silhouette is. Triangulation inside coplanar faces becomes invisible
// because backface culling drops them; only the actual boundary survives.
//
// For thin meshes (slabs) the hull approach over-extrudes vertically, so
// callers should fall back to drawing the polygon perimeter explicitly as
// a 3D line (see SlabView).

import * as THREE from "three";

/** Inflate a geometry by `distance` metres along its vertex normals.
 *  The original geometry is left untouched; a fresh clone is returned with
 *  positions shifted outward. Normals are recomputed first to make the
 *  result robust to imported geometries that didn't have them. */
export function inflateGeometry(
  source: THREE.BufferGeometry,
  distance: number = 0.02,
): THREE.BufferGeometry {
  const g = source.clone();
  g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const norm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    pos.setXYZ(
      i,
      px + nx * distance,
      py + ny * distance,
      pz + nz * distance,
    );
  }
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
