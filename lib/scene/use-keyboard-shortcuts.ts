"use client";

// Global keyboard shortcuts for the canvas (Fase U):
//
//   Delete / Backspace  — remove every currently-selected node.
//   Escape              — clear the selection.
//   Ctrl+Z / Cmd+Z      — undo last mutation.
//   Ctrl+Shift+Z / Cmd+Shift+Z — redo.
//
// Selection is multi-aware: `useSceneStore.selected` is a NodeId[], so
// Delete walks every id and removes the node + its dependents. The
// listener bails out if focus is in a text input so Backspace inside the
// chat composer doesn't wipe the canvas.

import { useEffect, useRef } from "react";
import { useSceneStore } from "./store";
import { logRemove } from "./user-action-log";
import { runDerivation } from "./derive";
import { applyAutoDimensions } from "./auto-dimensions";
import type { NodeId, WallNode } from "./types";
import { pushUndoSnapshot, redo, undo } from "./use-undo-redo";

/** Called BEFORE the scene store removes the nodes — gives the caller a
 *  chance to reflect the delete in the legacy `FloorPlan` so the bridge
 *  doesn't resurrect the nodes on the next plan→scene rebuild (which fires
 *  on every chat turn). Without this, deleted furniture / doors / windows
 *  reappear after the user types anything in the agent chat. */
export type SyncDeleteToPlan = (ids: NodeId[]) => void;

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useSceneKeyboardShortcuts(opts?: { syncDeleteToPlan?: SyncDeleteToPlan }): void {
  // Stash the latest callback in a ref so the keydown listener (registered
  // once with `[]`) always sees the current closure without re-registering
  // on every render.
  const syncRef = useRef<SyncDeleteToPlan | undefined>(opts?.syncDeleteToPlan);
  syncRef.current = opts?.syncDeleteToPlan;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const store = useSceneStore.getState();

      // Undo / Redo. Catch both Ctrl and Meta for cross-platform parity.
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey;
      const isRedo =
        (e.ctrlKey || e.metaKey) &&
        ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y");
      if (isUndo) {
        e.preventDefault();
        undo();
        return;
      }
      if (isRedo) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "Escape") {
        if (store.selected.length > 0) {
          store.setSelection([]);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.selected.length === 0) return;
        e.preventDefault();
        pushUndoSnapshot();
        const ids = [...store.selected];
        // Log a friendly action label per node before mutating.
        for (const id of ids) {
          const node = store.nodes[id];
          if (!node) continue;
          const label =
            (node as { name?: string; label?: string }).name ??
            (node as { name?: string; label?: string }).label ??
            node.type;
          logRemove(`${label}`);
        }
        // Mirror the delete into the legacy FloorPlan FIRST so that the
        // bridge's plan→scene rebuild (next chat turn or any plan change)
        // doesn't resurrect the nodes. Furniture / doors / windows / rooms
        // all live in the plan; walls aren't (yet) deletable through this
        // path so they're handled scene-only.
        syncRef.current?.(ids);
        store.removeNodes(ids);
        // Re-derive so rooms/slabs/cotas stay consistent after a delete.
        const derived = runDerivation(useSceneStore.getState().nodes, store.activeLevelId);
        const walls = Object.values(derived.nodes).filter(
          (n): n is WallNode => n.type === "wall",
        );
        const withDims = applyAutoDimensions(derived.nodes, walls);
        useSceneStore.setState({ nodes: withDims });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
