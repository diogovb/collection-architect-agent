// Live derivation of room polygons, areas, slabs and floor zones during a
// wall drag. Without this, the 2D canvas freezes the slab + label area + zone
// position at their migration-time values until commitLive runs runDerivation.
// Now the renderer can call these pure helpers per frame and everything
// follows the wall in real time, the same way the 3D path does.
//
// Strategy:
// 1. Each RoomNode carries `boundaryAnchors` — for each polygon vertex, which
//    wall endpoint anchors it. Migration / runDerivation populate this.
// 2. `liveRoomPolygon` walks anchors, looks up each wall via effectiveNode,
//    and emits the polygon vertex from the wall's live endpoint.
// 3. Slab is `outsetPolygon` of that live polygon. Area is `polygonAbsArea`.
// 4. Floor zones with `bounds` re-project to the live room's bbox so they
//    stretch proportionally; zones without bounds keep their stored polygon.

import { effectiveNode } from "./store";
import {
  outsetPolygon,
  polygonAbsArea,
  type FloorZone,
  type RoomNode,
  type SceneState,
  type Vec2,
  type WallNode,
} from "./types";
import { EXTERNAL_WALL_THICKNESS_M } from "./wall-constants";

const SLAB_OUTSET_DEFAULT = EXTERNAL_WALL_THICKNESS_M / 2;

type LiveState = Pick<SceneState, "nodes" | "liveTransforms">;

/** Compute the room's polygon as it should appear right now, given any
 *  in-flight wall drags. Returns the stored polygon when no anchors exist
 *  (back-compat). */
export function liveRoomPolygon(room: RoomNode, state: LiveState): Vec2[] {
  if (!room.boundaryAnchors || room.boundaryAnchors.length !== room.polygon.length) {
    return room.polygon;
  }
  const out: Vec2[] = new Array(room.polygon.length);
  for (const a of room.boundaryAnchors) {
    const wall = effectiveNode<WallNode>(state, a.wallId);
    if (!wall) {
      // Anchor lost — fall back to stored vertex so we don't silently
      // collapse the polygon.
      out[a.vertexIndex] = room.polygon[a.vertexIndex];
      continue;
    }
    out[a.vertexIndex] = a.endpoint === "start" ? wall.start : wall.end;
  }
  // Defensive: if any vertex is undefined (shouldn't happen given the
  // length check above), restore it from the stored polygon.
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) out[i] = room.polygon[i];
  }
  return out;
}

/** Slab polygon = outset of the live room polygon by SLAB_OUTSET. */
export function liveSlabPolygon(roomPolygon: Vec2[], outset = SLAB_OUTSET_DEFAULT): Vec2[] {
  return outsetPolygon(roomPolygon, outset);
}

/** Live floor area derived from the live polygon. */
export function liveRoomArea(roomPolygon: Vec2[]): number {
  return polygonAbsArea(roomPolygon);
}

/** Re-derive a floor zone polygon from its relative bounds against the
 *  live room polygon's axis-aligned bbox. Falls back to the stored polygon
 *  when bounds aren't available. */
export function liveZonePolygon(zone: FloorZone, roomPolygon: Vec2[]): Vec2[] {
  if (!zone.bounds) return zone.polygon;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of roomPolygon) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  const ax = minX + zone.bounds.rx * w;
  const ay = minZ + zone.bounds.ry * h;
  const aw = zone.bounds.rw * w;
  const ah = zone.bounds.rh * h;
  return [
    { x: ax, z: ay },
    { x: ax + aw, z: ay },
    { x: ax + aw, z: ay + ah },
    { x: ax, z: ay + ah },
  ];
}

/** Convenience: computes everything live for a single room in one call. */
export interface LiveRoomDerivation {
  polygon: Vec2[];
  slabPolygon: Vec2[];
  area: number;
  zones: FloorZone[];
}
export function deriveLiveRoom(
  room: RoomNode,
  state: LiveState,
  outset = SLAB_OUTSET_DEFAULT
): LiveRoomDerivation {
  const polygon = liveRoomPolygon(room, state);
  const slabPolygon = liveSlabPolygon(polygon, outset);
  const area = liveRoomArea(polygon);
  const zones = (room.floorZones ?? []).map((z) => ({
    ...z,
    polygon: liveZonePolygon(z, polygon),
  }));
  return { polygon, slabPolygon, area, zones };
}

// Re-export LiveState so callers can build the slice without depending on
// the store internals directly.
export type { LiveState };
