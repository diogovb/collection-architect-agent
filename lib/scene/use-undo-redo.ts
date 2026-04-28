"use client";

// Lightweight undo/redo for the SceneStore (Fase U).
//
// We don't pull in zundo or persist middleware — those would require
// re-creating the store with a wrapper which has cascading effects on
// every component that imports `useSceneStore`. Instead this module keeps
// two module-level stacks of `nodes` snapshots and exposes:
//
//   - `pushUndoSnapshot()`  : capture the current `nodes` map. Call this
//                              BEFORE mutations that should be undoable
//                              (creating walls, deleting items, dragging
//                              a wall to a new location, etc).
//   - `undo()` / `redo()`   : restore prior / forward snapshot.
//
// Because the bridge from the legacy FloorPlan rewrites the entire scene
// on every change (`useFloorPlanBridge` calls `replaceScene`), we also
// snapshot whenever `nodes` changes via the ChatPanel agent flow — that
// way Ctrl+Z reverts an agent-applied step too. We attach that listener
// inside `useUndoRedoShortcuts`.

import type { AnyNode, NodeId } from "./types";
import { useSceneStore } from "./store";
import { runDerivation } from "./derive";
import { applyAutoDimensions } from "./auto-dimensions";
import type { WallNode } from "./types";

interface Snapshot {
  nodes: Record<NodeId, AnyNode>;
}

const MAX_HISTORY = 50;
let past: Snapshot[] = [];
let future: Snapshot[] = [];

function snapshot(): Snapshot {
  // Shallow clone of the nodes map; nodes themselves are treated as
  // immutable downstream (mutations always go through updateNode which
  // produces a new object), so a shallow copy is enough.
  return { nodes: { ...useSceneStore.getState().nodes } };
}

/** Capture a snapshot of the current scene before a user-driven mutation.
 *  Clears the redo stack — once you act after an undo, redo history is
 *  invalidated, matching standard editor expectations. */
export function pushUndoSnapshot(): void {
  past.push(snapshot());
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
}

function restore(s: Snapshot): void {
  // Rebuild derived data (slabs, rooms, dimensions) so the scene stays
  // self-consistent after the restore. Without this, restoring an older
  // wall set would leave stale rooms in the store.
  const derived = runDerivation(s.nodes, useSceneStore.getState().activeLevelId);
  const walls = Object.values(derived.nodes).filter(
    (n): n is WallNode => n.type === "wall",
  );
  const withDims = applyAutoDimensions(derived.nodes, walls);
  useSceneStore.setState({ nodes: withDims, liveTransforms: new Map() });
}

export function undo(): boolean {
  if (past.length === 0) return false;
  future.push(snapshot());
  if (future.length > MAX_HISTORY) future.shift();
  const prev = past.pop()!;
  restore(prev);
  return true;
}

export function redo(): boolean {
  if (future.length === 0) return false;
  past.push(snapshot());
  if (past.length > MAX_HISTORY) past.shift();
  const next = future.pop()!;
  restore(next);
  return true;
}

/** Reset the history (used by `replaceScene` on full project loads). */
export function clearHistory(): void {
  past = [];
  future = [];
}
