"use client";

// Zustand store for the 3D building model. Provides CRUD for walls / openings /
// furniture / slabs / zones and a `createRoom` helper that emits 4 walls + slab
// + zone in one go.
//
// In the current integration the canonical state still lives on the FloorPlan
// model in `useVibeState`; Scene3D derives its BuildingModel via the
// floorPlanToBuildingModel bridge. This store is provided for direct, agent-
// driven 3D editing flows in the future.

import { create } from "zustand";
import type {
  BuildingModel,
  DoorNode,
  FurnitureNode,
  LevelNode,
  SlabNode,
  Vec3,
  WallNode,
  WindowNode,
  ZoneNode,
} from "./types";
import {
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_WALL_HEIGHT,
  EXTERNAL_WALL_THICKNESS,
} from "./types";

const DEFAULT_LEVEL_ID = "level-0";

function emptyLevel(): LevelNode {
  return {
    id: DEFAULT_LEVEL_ID,
    name: "Térreo",
    elevation: 0,
    height: DEFAULT_WALL_HEIGHT,
    walls: [],
    slabs: [],
    furniture: [],
    zones: [],
  };
}

function emptyModel(): BuildingModel {
  return { levels: [emptyLevel()], activeLevel: DEFAULT_LEVEL_ID };
}

export interface BuildingStore {
  model: BuildingModel;
  dirtyNodes: Set<string>;

  // Wall CRUD
  addWall: (levelId: string, wall: WallNode) => void;
  removeWall: (levelId: string, wallId: string) => void;
  updateWall: (levelId: string, wallId: string, updates: Partial<WallNode>) => void;

  // Openings
  addDoorToWall: (levelId: string, wallId: string, door: DoorNode) => void;
  addWindowToWall: (levelId: string, wallId: string, window: WindowNode) => void;

  // Furniture
  addFurniture: (levelId: string, furniture: FurnitureNode) => void;
  removeFurniture: (levelId: string, furnitureId: string) => void;
  moveFurniture: (levelId: string, furnitureId: string, position: Vec3) => void;

  // Slabs / zones
  addSlab: (levelId: string, slab: SlabNode) => void;
  addZone: (levelId: string, zone: ZoneNode) => void;

  // Utils
  markDirty: (id: string) => void;
  clearDirty: (id: string) => void;
  getActiveLevel: () => LevelNode;
  setModel: (model: BuildingModel) => void;
  clearAll: () => void;

  /**
   * Convenience: emit 4 perimeter walls + a floor slab + a zone for an axis-
   * aligned rectangular room.
   */
  createRoom: (
    levelId: string,
    name: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    floorMaterial?: string
  ) => void;
}

function withLevel(
  model: BuildingModel,
  levelId: string,
  fn: (level: LevelNode) => LevelNode
): BuildingModel {
  return {
    ...model,
    levels: model.levels.map((l) => (l.id === levelId ? fn(l) : l)),
  };
}

export const useBuildingStore = create<BuildingStore>((set, get) => ({
  model: emptyModel(),
  dirtyNodes: new Set<string>(),

  addWall: (levelId, wall) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({ ...l, walls: [...l.walls, wall] })),
    })),

  removeWall: (levelId, wallId) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        walls: l.walls.filter((w) => w.id !== wallId),
      })),
    })),

  updateWall: (levelId, wallId, updates) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        walls: l.walls.map((w) => (w.id === wallId ? { ...w, ...updates } : w)),
      })),
    })),

  addDoorToWall: (levelId, wallId, door) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        walls: l.walls.map((w) =>
          w.id === wallId ? { ...w, children: [...w.children, door] } : w
        ),
      })),
    })),

  addWindowToWall: (levelId, wallId, win) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        walls: l.walls.map((w) =>
          w.id === wallId ? { ...w, children: [...w.children, win] } : w
        ),
      })),
    })),

  addFurniture: (levelId, furniture) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        furniture: [...l.furniture, furniture],
      })),
    })),

  removeFurniture: (levelId, furnitureId) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        furniture: l.furniture.filter((f) => f.id !== furnitureId),
      })),
    })),

  moveFurniture: (levelId, furnitureId, position) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        furniture: l.furniture.map((f) =>
          f.id === furnitureId ? { ...f, position } : f
        ),
      })),
    })),

  addSlab: (levelId, slab) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({ ...l, slabs: [...l.slabs, slab] })),
    })),

  addZone: (levelId, zone) =>
    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({ ...l, zones: [...l.zones, zone] })),
    })),

  markDirty: (id) =>
    set((s) => {
      const next = new Set(s.dirtyNodes);
      next.add(id);
      return { dirtyNodes: next };
    }),

  clearDirty: (id) =>
    set((s) => {
      const next = new Set(s.dirtyNodes);
      next.delete(id);
      return { dirtyNodes: next };
    }),

  getActiveLevel: () => {
    const m = get().model;
    return m.levels.find((l) => l.id === m.activeLevel) ?? m.levels[0];
  },

  setModel: (model) => set({ model }),

  clearAll: () => set({ model: emptyModel(), dirtyNodes: new Set() }),

  createRoom: (levelId, name, x, z, width, depth, floorMaterial = "madeira") => {
    const id = (suffix: string) => `${name.toLowerCase().replace(/\s+/g, "-")}-${suffix}-${Date.now()}`;
    const t = EXTERNAL_WALL_THICKNESS;
    const h = DEFAULT_WALL_HEIGHT;

    const corners = {
      nw: { x, z },
      ne: { x: x + width, z },
      se: { x: x + width, z: z + depth },
      sw: { x, z: z + depth },
    };

    const walls: WallNode[] = [
      // North (start = NW, end = NE)
      { id: id("w-n"), start: corners.nw, end: corners.ne, thickness: t, height: h, isExternal: true, children: [] },
      // East
      { id: id("w-e"), start: corners.ne, end: corners.se, thickness: t, height: h, isExternal: true, children: [] },
      // South
      { id: id("w-s"), start: corners.sw, end: corners.se, thickness: t, height: h, isExternal: true, children: [] },
      // West
      { id: id("w-w"), start: corners.nw, end: corners.sw, thickness: t, height: h, isExternal: true, children: [] },
    ];

    const slab: SlabNode = {
      id: id("slab"),
      polygon: [corners.nw, corners.ne, corners.se, corners.sw],
      thickness: DEFAULT_SLAB_THICKNESS,
      elevation: 0,
      material: floorMaterial,
    };

    const zone: ZoneNode = {
      id: id("zone"),
      name,
      polygon: [corners.nw, corners.ne, corners.se, corners.sw],
      area: width * depth,
      color: "#F2DDD0",
    };

    set((s) => ({
      model: withLevel(s.model, levelId, (l) => ({
        ...l,
        walls: [...l.walls, ...walls],
        slabs: [...l.slabs, slab],
        zones: [...l.zones, zone],
      })),
    }));
  },
}));
