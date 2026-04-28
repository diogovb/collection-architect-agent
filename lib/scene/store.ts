"use client";

// Zustand store for the new Pascal-style scene graph.
// Owns the flat node dictionary, selection, dirty tracking, and ephemeral
// transforms used during drag.

import { create } from "zustand";
import type {
  AnyNode,
  BuildingNode,
  DiagnosticIssue,
  LevelNode,
  NodeId,
  SceneState,
  Tool,
  Vec2,
  Vec3,
  ViewMode,
} from "./types";

const ROOT_ID = "building:root";
const LEVEL_ID = "level:0";

function emptyScene(): SceneState {
  const building: BuildingNode = {
    id: ROOT_ID,
    type: "building",
    parentId: null,
    name: "Projeto",
    northRotation: 0,
  };
  const level: LevelNode = {
    id: LEVEL_ID,
    type: "level",
    parentId: ROOT_ID,
    elevation: 0,
    defaultWallHeight: 2.8,
  };
  return {
    nodes: { [ROOT_ID]: building, [LEVEL_ID]: level },
    rootId: ROOT_ID,
    activeLevelId: LEVEL_ID,
    selected: [],
    hovered: null,
    dirty: new Set<NodeId>(),
    liveTransforms: new Map(),
    diagnostics: [],
    tool: "select",
    viewMode: "2d",
    snapEnabled: readSnapPreference(),
  };
}

/** Snap preference is user-level (not per-project). Persisted in localStorage
 *  so toggling it once carries across reloads. Default ON. */
const SNAP_LS_KEY = "ca:snapEnabled";
function readSnapPreference(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(SNAP_LS_KEY);
  return v === null ? true : v === "1";
}
function writeSnapPreference(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAP_LS_KEY, v ? "1" : "0");
  } catch {
    // storage may be disabled — silently ignore.
  }
}

interface SceneStore extends SceneState {
  // Node CRUD
  addNode: (node: AnyNode) => void;
  addNodes: (nodes: AnyNode[]) => void;
  updateNode: <T extends AnyNode>(id: NodeId, patch: Partial<T>) => void;
  removeNode: (id: NodeId) => void;
  removeNodes: (ids: NodeId[]) => void;

  // Bulk replace (for migrate / load example)
  replaceScene: (state: Partial<SceneState>) => void;
  resetScene: () => void;

  // Dirty tracking
  markDirty: (...ids: NodeId[]) => void;
  clearDirty: () => void;

  // Selection
  setSelection: (ids: NodeId[]) => void;
  toggleSelection: (id: NodeId, additive: boolean) => void;
  setHover: (id: NodeId | null) => void;
  setTool: (tool: Tool) => void;
  setViewMode: (mode: ViewMode) => void;
  setSnapEnabled: (enabled: boolean) => void;

  // Ephemeral transforms (drag previews)
  setLive: (
    id: NodeId,
    transform: Partial<{ start: Vec2; end: Vec2; position: Vec3; rotation: number; offset: number }>
  ) => void;
  commitLive: (id: NodeId) => void;
  clearLive: (id: NodeId) => void;
  clearAllLive: () => void;

  // Diagnostics
  setDiagnostics: (issues: DiagnosticIssue[]) => void;

  // Helpers
  getNode: <T extends AnyNode = AnyNode>(id: NodeId) => T | undefined;
  getNodesByType: <T extends AnyNode>(type: T["type"]) => T[];
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  ...emptyScene(),

  addNode: (node) =>
    set((state) => ({
      nodes: { ...state.nodes, [node.id]: node },
      dirty: new Set(state.dirty).add(node.id),
    })),

  addNodes: (nodes) =>
    set((state) => {
      const next = { ...state.nodes };
      const dirty = new Set(state.dirty);
      for (const n of nodes) {
        next[n.id] = n;
        dirty.add(n.id);
      }
      return { nodes: next, dirty };
    }),

  updateNode: (id, patch) =>
    set((state) => {
      const existing = state.nodes[id];
      if (!existing) return state;
      const updated = { ...existing, ...patch } as AnyNode;
      return {
        nodes: { ...state.nodes, [id]: updated },
        dirty: new Set(state.dirty).add(id),
      };
    }),

  removeNode: (id) =>
    set((state) => {
      if (!state.nodes[id]) return state;
      const next = { ...state.nodes };
      delete next[id];
      const dirty = new Set(state.dirty);
      dirty.delete(id);
      return {
        nodes: next,
        dirty,
        selected: state.selected.filter((s) => s !== id),
        hovered: state.hovered === id ? null : state.hovered,
      };
    }),

  removeNodes: (ids) =>
    set((state) => {
      const next = { ...state.nodes };
      const dirty = new Set(state.dirty);
      for (const id of ids) {
        delete next[id];
        dirty.delete(id);
      }
      return {
        nodes: next,
        dirty,
        selected: state.selected.filter((s) => !ids.includes(s)),
        hovered: state.hovered && ids.includes(state.hovered) ? null : state.hovered,
      };
    }),

  replaceScene: (state) =>
    set((prev) => ({
      ...prev,
      ...state,
      // Always reset transient state on replace.
      liveTransforms: new Map(),
      hovered: null,
    })),

  resetScene: () => set(emptyScene()),

  markDirty: (...ids) =>
    set((state) => {
      const next = new Set(state.dirty);
      for (const id of ids) next.add(id);
      return { dirty: next };
    }),

  clearDirty: () => set({ dirty: new Set() }),

  setSelection: (ids) => set({ selected: ids }),
  toggleSelection: (id, additive) =>
    set((state) => {
      if (!additive) return { selected: [id] };
      const idx = state.selected.indexOf(id);
      if (idx >= 0) {
        const next = state.selected.slice();
        next.splice(idx, 1);
        return { selected: next };
      }
      return { selected: [...state.selected, id] };
    }),
  setHover: (id) => set({ hovered: id }),
  setTool: (tool) => set({ tool }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSnapEnabled: (enabled) => {
    writeSnapPreference(enabled);
    set({ snapEnabled: enabled });
  },

  setLive: (id, transform) =>
    set((state) => {
      const next = new Map(state.liveTransforms);
      const cur = next.get(id) ?? {};
      next.set(id, { ...cur, ...transform });
      return { liveTransforms: next };
    }),

  commitLive: (id) =>
    set((state) => {
      const live = state.liveTransforms.get(id);
      if (!live) return state;
      const node = state.nodes[id];
      if (!node) return state;
      const updated = { ...node, ...live } as AnyNode;
      const nextLive = new Map(state.liveTransforms);
      nextLive.delete(id);
      return {
        nodes: { ...state.nodes, [id]: updated },
        liveTransforms: nextLive,
        dirty: new Set(state.dirty).add(id),
      };
    }),

  clearLive: (id) =>
    set((state) => {
      const next = new Map(state.liveTransforms);
      next.delete(id);
      return { liveTransforms: next };
    }),

  clearAllLive: () => set({ liveTransforms: new Map() }),

  setDiagnostics: (issues) => set({ diagnostics: issues }),

  getNode: <T extends AnyNode = AnyNode>(id: NodeId) => get().nodes[id] as T | undefined,

  getNodesByType: <T extends AnyNode>(type: T["type"]) =>
    Object.values(get().nodes).filter((n) => n.type === type) as T[],
}));

// Stable selector helpers (avoid re-renders when unrelated parts change).
export const selectWalls = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "wall");
export const selectRooms = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "room");
export const selectSlabs = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "slab");
export const selectDoors = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "door");
export const selectWindows = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "window");
export const selectFurniture = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "furniture");
export const selectDimensions = (s: SceneStore) =>
  Object.values(s.nodes).filter((n) => n.type === "dimension");

/** Effective node taking liveTransforms into account. */
export function effectiveNode<T extends AnyNode>(
  state: Pick<SceneState, "nodes" | "liveTransforms">,
  id: NodeId
): T | undefined {
  const node = state.nodes[id] as T | undefined;
  if (!node) return undefined;
  const live = state.liveTransforms.get(id);
  if (!live) return node;
  return { ...node, ...live } as T;
}
