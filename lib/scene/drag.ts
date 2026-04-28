"use client";

// Drag state machine for the canvas. Tracks what is being dragged, the
// pointer offset, and the live transform applied during drag.
//
// Used by:
//  - DragHandles (wall endpoints)
//  - useFurnitureDrag
//  - useOpeningSlide (door/window along wall)

import type { NodeId, Vec2 } from "./types";

export type DragKind =
  | { kind: "wall-endpoint"; wallId: NodeId; endpoint: "start" | "end" }
  | { kind: "wall-body"; wallId: NodeId; origStart: Vec2; origEnd: Vec2 }
  | { kind: "furniture"; furnitureId: NodeId; offsetX: number; offsetZ: number }
  | { kind: "opening-slide"; openingId: NodeId; wallId: NodeId; startOffset: number };

export interface DragState {
  active: DragKind;
  /** World coords where the drag started (XZ plane). */
  startWorld: Vec2;
  /** Whether the user actually moved (used to suppress accidental clicks). */
  moved: boolean;
}

let _state: DragState | null = null;
const _listeners = new Set<() => void>();

export function getDragState(): DragState | null {
  return _state;
}

export function setDragState(next: DragState | null): void {
  _state = next;
  _listeners.forEach((l) => l());
}

export function subscribeDrag(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
