"use client";

// R3F adapter over the shared drag engine for the wall-draw tool.
// Click to anchor, click again to commit, ESC cancels. Snaps via
// `snapDrawPoint`; commits via `commitDrawWall`.

import { useCallback, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { Vec2 } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { commitDrawWall, snapDrawPoint } from "@/lib/scene/drag-engine";

interface ToolState { phase: "idle" | "anchored"; anchor?: Vec2; }

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
      setPointerWorld(snapDrawPoint(world));
    },
    [tool, screenToWorld]
  );

  const onCanvasClick = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall") return;
      const world = screenToWorld(clientX, clientY);
      if (!world) return;
      const snapped = snapDrawPoint(world);
      if (state.phase === "idle") {
        setState({ phase: "anchored", anchor: snapped });
        return;
      }
      if (state.phase === "anchored" && state.anchor) {
        commitDrawWall(state.anchor, snapped);
        // Chain — anchor at endpoint so the next click extends the wall run.
        setState({ phase: "anchored", anchor: snapped });
      }
    },
    [tool, screenToWorld, state]
  );

  const preview =
    state.phase === "anchored" && state.anchor && pointerWorld ? state.anchor : null;
  return { state, preview, pointerWorld, onCanvasClick, onCanvasMove, cancel };
}
