// Module-level cache for `computeWallCorners`. Pascal-style pre-pass: compute
// once per wall mutation, share across every consumer (Canvas, Floorplan2D,
// CSG cutout brushes, label placement, etc.).
//
// Previously each consumer called `useMemo(() => computeWallCorners(walls),
// [walls])` independently — Canvas.tsx and Floorplan2D.tsx duplicated the work
// because they're sibling components with their own memo cache. With a
// signature-keyed module cache, identical wall sets short-circuit instantly.

import { computeWallCorners, type WallCorners } from "./wall-mitering";
import type { WallNode } from "./types";

let cachedKey = "";
let cachedResult: Map<string, WallCorners> = new Map();

function signature(walls: WallNode[]): string {
  // Sort to make signature stable regardless of array order. Round to mm —
  // floating-point noise from drag previews shouldn't bust the cache.
  return walls
    .map(
      (w) =>
        `${w.id}:${(w.start.x * 1000) | 0},${(w.start.z * 1000) | 0}-` +
        `${(w.end.x * 1000) | 0},${(w.end.z * 1000) | 0}:` +
        `${(w.thickness * 1000) | 0}`
    )
    .sort()
    .join("|");
}

/** Cached wall corner computation. Returns the same Map reference until any
 *  wall geometry actually changes. Safe to call from render. */
export function getWallCorners(walls: WallNode[]): Map<string, WallCorners> {
  const key = signature(walls);
  if (key === cachedKey) return cachedResult;
  cachedKey = key;
  cachedResult = computeWallCorners(walls);
  return cachedResult;
}

/** Test-only: clear the cache. */
export function _resetWallCornersCache(): void {
  cachedKey = "";
  cachedResult = new Map();
}
