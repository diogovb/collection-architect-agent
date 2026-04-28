// Stable hash for polygons. Used to preserve room identity across edits when
// space-detection re-extracts polygons from walls.

import type { Vec2 } from "./types";

/** Round a coord to 1cm to absorb floating-point noise. */
function roundCm(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Canonicalise a polygon: rotate so the smallest (x,z) vertex is first,
 *  pick the orientation (CCW) that yields the lexicographically smallest sequence.
 *  This makes the signature invariant to rotation/flip. */
function canonicalise(poly: Vec2[]): Vec2[] {
  if (poly.length === 0) return [];
  const rounded = poly.map((p) => ({ x: roundCm(p.x), z: roundCm(p.z) }));
  const best = (cycle: Vec2[]): string =>
    cycle.map((p) => `${p.x},${p.z}`).join("|");
  let bestStart = 0;
  let bestKey = "";
  for (let i = 0; i < rounded.length; i++) {
    const cycle: Vec2[] = [];
    for (let j = 0; j < rounded.length; j++) cycle.push(rounded[(i + j) % rounded.length]);
    const k = best(cycle);
    if (i === 0 || k < bestKey) { bestKey = k; bestStart = i; }
  }
  const ccw: Vec2[] = [];
  for (let j = 0; j < rounded.length; j++) ccw.push(rounded[(bestStart + j) % rounded.length]);
  // Try reversed orientation too.
  const reversed = ccw.slice().reverse();
  const reversedKey = best(reversed);
  return reversedKey < bestKey ? reversed : ccw;
}

export function polygonSignature(poly: Vec2[]): string {
  const canon = canonicalise(poly);
  return canon.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join("|");
}
