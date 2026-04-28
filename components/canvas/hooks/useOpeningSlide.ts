"use client";

// Drag-along-wall for doors and windows. Constrains the offset to
// [width/2, wallLength - width/2].

import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { DoorNode, NodeId, WallNode, WindowNode } from "@/lib/scene/types";
import { v2Norm, v2Sub } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { snapToGrid } from "@/lib/scene/snap";

interface SlideState { id: NodeId; wallId: NodeId; startPointerAlong: number; startOffset: number; }

export function useOpeningSlide() {
  const { camera, raycaster, gl } = useThree();
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const stateRef = useRef<SlideState | null>(null);

  const setLive = useSceneStore((s) => s.setLive);
  const commitLive = useSceneStore((s) => s.commitLive);

  const start = useCallback(
    (openingId: NodeId, clientX: number, clientY: number) => {
      const opening = useSceneStore.getState().nodes[openingId] as DoorNode | WindowNode | undefined;
      if (!opening) return;
      const wall = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
      if (!wall) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, hit);
      const dir = v2Norm(v2Sub(wall.end, wall.start));
      const along = (hit.x - wall.start.x) * dir.x + (hit.z - wall.start.z) * dir.z;
      stateRef.current = {
        id: openingId,
        wallId: wall.id,
        startPointerAlong: along,
        startOffset: opening.offset,
      };
      gl.domElement.style.cursor = "grabbing";
    },
    [camera, raycaster, gl]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!stateRef.current) return;
      const opening = useSceneStore.getState().nodes[stateRef.current.id] as DoorNode | WindowNode | undefined;
      if (!opening) return;
      const wall = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
      if (!wall) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, hit);
      const dir = v2Norm(v2Sub(wall.end, wall.start));
      const along = (hit.x - wall.start.x) * dir.x + (hit.z - wall.start.z) * dir.z;
      const delta = along - stateRef.current.startPointerAlong;
      const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      const half = opening.width / 2;
      const proposed = snapToGrid(stateRef.current.startOffset + delta);
      const clamped = Math.max(half, Math.min(wallLen - half, proposed));
      setLive(stateRef.current.id, { offset: clamped });
    };
    const onUp = () => {
      if (stateRef.current) commitLive(stateRef.current.id);
      stateRef.current = null;
      gl.domElement.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, raycaster, gl, setLive, commitLive]);

  return start;
}
