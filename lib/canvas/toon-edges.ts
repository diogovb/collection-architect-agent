// Edge geometry helper for the 3D illustrated look (Fase D).
//
// Pairs with the cel-shaded `meshToonMaterial`s on walls / slabs / furniture:
// every mesh draws a thin black `<lineSegments>` overlay on top of its
// toon-shaded body so the apartment reads like a technical illustration —
// flat editorial colours bounded by ink-coloured contour lines, the same
// language as the 2D plan.
//
// `THREE.EdgesGeometry(geometry, thresholdAngle)` keeps only edges where the
// dihedral angle between two adjacent faces is GREATER than `thresholdAngle`.
// Use a tiny threshold (~1°) for prismatic shapes (walls, slabs) — every
// silhouette edge survives. Use a larger threshold (~30°) for furniture
// boxes when you want to drop micro-bevel noise.

import * as THREE from "three";

/** Build an EdgesGeometry from a source geometry. The threshold is in
 *  degrees; 1° captures every prismatic edge, 30° drops near-coplanar faces. */
export function buildEdgesGeometry(
  geometry: THREE.BufferGeometry,
  thresholdAngle: number = 1,
): THREE.EdgesGeometry {
  return new THREE.EdgesGeometry(geometry, thresholdAngle);
}
