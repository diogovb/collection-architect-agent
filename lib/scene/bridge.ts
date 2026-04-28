"use client";

// Bridge: keeps the new SceneStore in sync with the legacy FloorPlan state.
// On every FloorPlan change, migrate to the scene graph and run derivation
// (which auto-creates rooms, slabs, and envelope dimensions).
// This is a transitional shim while we move the agent tools to operate on the
// scene graph directly (Phase 7).

import { useEffect } from "react";
import type { FloorPlan } from "../types";
import { floorPlanToScene } from "./migrate";
import { runDerivation } from "./derive";
import { applyAutoDimensions } from "./auto-dimensions";
import { useSceneStore } from "./store";
import type { WallNode } from "./types";
import { validateScene } from "./validators";

export function useFloorPlanBridge(plan: FloorPlan): void {
  const replaceScene = useSceneStore((s) => s.replaceScene);

  useEffect(() => {
    const { scene, warnings } = floorPlanToScene(plan);
    if (warnings.length > 0 && process.env.NODE_ENV !== "production") {
      for (const w of warnings) console.warn(`[migrate] ${w}`);
    }
    const derived = runDerivation(scene.nodes, scene.activeLevelId);
    const walls = Object.values(derived.nodes).filter((n): n is WallNode => n.type === "wall");
    const withDims = applyAutoDimensions(derived.nodes, walls);
    const diagnostics = validateScene({ nodes: withDims });
    replaceScene({
      nodes: withDims,
      rootId: scene.rootId,
      activeLevelId: scene.activeLevelId,
      selected: [],
      hovered: null,
      dirty: new Set(),
      liveTransforms: new Map(),
      diagnostics,
    });
  }, [plan, replaceScene]);
}
