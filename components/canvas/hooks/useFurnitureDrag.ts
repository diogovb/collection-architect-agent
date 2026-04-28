"use client";

// R3F adapter over the shared drag engine. Raycasts the cursor onto the y=0
// plane to get world coords, then drives `beginFurnitureDrag` from
// lib/scene/drag-engine.ts.

import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { NodeId } from "@/lib/scene/types";
import {
  beginFurnitureDrag,
  type FurnitureDragSession,
} from "@/lib/scene/drag-engine";

export function useFurnitureDrag() {
  const { camera, raycaster, gl } = useThree();
  const sessionRef = useRef<FurnitureDragSession | null>(null);
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; z: number } | null => {
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

  const start = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      if (!world) return;
      const session = beginFurnitureDrag(id, world);
      if (!session) return;
      sessionRef.current = session;
      gl.domElement.style.cursor = "grabbing";
    },
    [screenToWorld, gl]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!sessionRef.current) return;
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      sessionRef.current.update(world);
    };
    const onUp = () => {
      if (sessionRef.current) {
        sessionRef.current.commit();
        sessionRef.current = null;
        gl.domElement.style.cursor = "";
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [screenToWorld, gl]);

  return start;
}
