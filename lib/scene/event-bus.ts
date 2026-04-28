// Typed event bus for canvas interactions.
// Decouples the renderer from the store: views emit user events, the store
// observes and applies the corresponding mutations.

import mitt from "mitt";
import type { NodeId, Vec2, Vec3 } from "./types";

export type SceneEvents = {
  // Hover & click
  "node:hover": { id: NodeId | null };
  "node:click": { id: NodeId; shift: boolean; meta: boolean };
  "node:dblclick": { id: NodeId };
  "node:context": { id: NodeId; clientX: number; clientY: number };

  // Wall drag
  "wall:drag-start": { id: NodeId; endpoint: "start" | "end" | "body"; world: Vec2 };
  "wall:drag-move": { id: NodeId; endpoint: "start" | "end" | "body"; world: Vec2 };
  "wall:drag-end": { id: NodeId; commit: boolean };

  // Furniture drag
  "furniture:drag-start": { id: NodeId; world: Vec3 };
  "furniture:drag-move": { id: NodeId; world: Vec3 };
  "furniture:drag-end": { id: NodeId; commit: boolean };

  // Opening slide along wall
  "opening:slide-start": { id: NodeId };
  "opening:slide-move": { id: NodeId; offset: number };
  "opening:slide-end": { id: NodeId; commit: boolean };

  // Empty grid interaction
  "grid:click": { world: Vec2; tool: string };
  "grid:pointerdown": { world: Vec2 };
  "grid:pointermove": { world: Vec2 };
  "grid:pointerup": { world: Vec2 };

  // Selection / tool changes
  "selection:set": { ids: NodeId[] };
  "tool:set": { tool: string };
};

export const bus = mitt<SceneEvents>();
