// Derivation pipeline: given the current node graph (walls + doors + windows +
// furniture + manual rooms/slabs), recompute derived state.
//
// Strategy:
// - Migration from a legacy FloorPlan provides RoomNode+SlabNode directly.
// - For walls created interactively via the canvas/agent, run space-detection
//   to find any *new* closed regions and add slabs for them. We never DELETE
//   legacy-derived rooms/slabs from this path.

import type { AnyNode, NodeId, RoomNode, SlabNode, WallNode } from "./types";
import { applySyncResult, syncSlabsAndRooms } from "./slab-sync";

export interface DeriveOutput {
  nodes: Record<NodeId, AnyNode>;
  changed: boolean;
}

export function runDerivation(
  nodes: Record<NodeId, AnyNode>,
  activeLevelId: NodeId
): DeriveOutput {
  const walls = Object.values(nodes).filter((n): n is WallNode => n.type === "wall" && n.parentId === activeLevelId);
  // Treat legacy-derived rooms (id prefix `room:legacy-`) as authoritative —
  // sync only adds NEW rooms/slabs detected in the wall graph that don't
  // already match a legacy room signature.
  const existingRooms = Object.values(nodes).filter((n): n is RoomNode => n.type === "room");
  const existingSlabs = Object.values(nodes).filter((n): n is SlabNode => n.type === "slab");

  // If legacy rooms are present, they're the source of truth — skip detection.
  // Detection runs only for plans built entirely from walls (agent / draw tool).
  const hasLegacyRooms = existingRooms.some((r) => r.id.startsWith("room:legacy-"));
  if (hasLegacyRooms) {
    return { nodes, changed: false };
  }

  const result = syncSlabsAndRooms({
    walls,
    existingRooms,
    existingSlabs,
    levelId: activeLevelId,
  });

  const changed =
    result.roomsToAdd.length > 0 ||
    result.roomsToRemove.length > 0 ||
    result.slabsToAdd.length > 0 ||
    result.slabsToRemove.length > 0 ||
    result.roomsToUpdate.length > 0 ||
    result.slabsToUpdate.length > 0;

  if (!changed) return { nodes, changed: false };
  const next = applySyncResult(nodes, result);
  return { nodes: next, changed: true };
}
