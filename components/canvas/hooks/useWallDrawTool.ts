"use client";

// "Desenhar parede" tool: click to anchor the start point, click again to
// place the end point, ESC to cancel. Snaps to existing wall endpoints.

import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { Vec2, WallNode } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { snapVec2, snapToEndpoints } from "@/lib/scene/snap";
import { runDerivation } from "@/lib/scene/derive";
import { applyAutoDimensions } from "@/lib/scene/auto-dimensions";

interface ToolState { phase: "idle" | "anchored"; anchor?: Vec2; }

const EXTERNAL_THICKNESS = 0.15;
const INTERNAL_THICKNESS = 0.10;
const DEFAULT_HEIGHT = 2.8;

let _wallSeq = 0;
function newWallId(): string {
  _wallSeq += 1;
  return `wall:user-${Date.now().toString(36)}-${_wallSeq}`;
}

export function useWallDrawTool(): {
  state: ToolState;
  preview: Vec2 | null;
  pointerWorld: Vec2 | null;
  onCanvasClick: (clientX: number, clientY: number) => void;
  onCanvasMove: (clientX: number, clientY: number) => void;
  cancel: () => void;
} {
  const { camera, raycaster, gl } = useThree();
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const [state, setState] = useState<ToolState>({ phase: "idle" });
  const [pointerWorld, setPointerWorld] = useState<Vec2 | null>(null);

  const tool = useSceneStore((s) => s.tool);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);

  const cancel = useCallback(() => setState({ phase: "idle" }), []);

  useEffect(() => {
    if (tool !== "wall") {
      setState({ phase: "idle" });
      setPointerWorld(null);
    }
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tool === "wall") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, cancel]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, hit);
      if (!Number.isFinite(hit.x)) return null;
      return { x: hit.x, z: hit.z };
    },
    [camera, raycaster, gl]
  );

  const onCanvasMove = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall") return;
      const world = screenToWorld(clientX, clientY);
      if (!world) return;
      const walls = Object.values(useSceneStore.getState().nodes).filter(
        (n) => n.type === "wall"
      ) as WallNode[];
      const snapped = snapToEndpoints(snapVec2(world), walls, 0.20).snapped;
      setPointerWorld(snapped);
    },
    [tool, screenToWorld]
  );

  const onCanvasClick = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall") return;
      const world = screenToWorld(clientX, clientY);
      if (!world) return;
      const walls = Object.values(useSceneStore.getState().nodes).filter(
        (n) => n.type === "wall"
      ) as WallNode[];
      const snapped = snapToEndpoints(snapVec2(world), walls, 0.20).snapped;
      if (state.phase === "idle") {
        setState({ phase: "anchored", anchor: snapped });
      } else if (state.phase === "anchored" && state.anchor) {
        // Create wall.
        const newWall: WallNode = {
          id: newWallId(),
          type: "wall",
          parentId: activeLevelId,
          start: state.anchor,
          end: snapped,
          thickness: INTERNAL_THICKNESS,
          height: DEFAULT_HEIGHT,
          isExterior: false,
          doors: [],
          windows: [],
        };
        const store = useSceneStore.getState();
        store.addNode(newWall);
        const allWalls = Object.values(store.nodes).filter((n) => n.type === "wall") as WallNode[];
        const nextWalls = [...allWalls, newWall];
        // Re-derive rooms/slabs and dimensions.
        const out = runDerivation({ ...store.nodes, [newWall.id]: newWall }, store.activeLevelId);
        const withDims = applyAutoDimensions(out.nodes, nextWalls);
        useSceneStore.setState({ nodes: withDims });
        // Continue: anchor at the end point so we can chain walls.
        setState({ phase: "anchored", anchor: snapped });
      }
    },
    [tool, screenToWorld, state, activeLevelId]
  );

  const preview = state.phase === "anchored" && state.anchor && pointerWorld ? state.anchor : null;
  return { state, preview, pointerWorld, onCanvasClick, onCanvasMove, cancel };
}
