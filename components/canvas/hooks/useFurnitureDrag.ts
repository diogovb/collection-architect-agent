"use client";

// Hook that returns onPointerDown handlers turning furniture into draggable
// items. Drag uses live transforms; on release we commit + clear.

import { useCallback, useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { FurnitureNode, NodeId, RoomNode } from "@/lib/scene/types";
import { pointInPolygon } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { snapVec2, clampToPolygon } from "@/lib/scene/snap";

interface DragState {
  id: NodeId;
  startWorld: { x: number; z: number };
  /** offset from furniture corner to pointer when drag starts. */
  offsetX: number;
  offsetZ: number;
}

export function useFurnitureDrag() {
  const { camera, raycaster, gl } = useThree();
  const dragRef = useRef<DragState | null>(null);

  const setLive = useSceneStore((s) => s.setLive);
  const commitLive = useSceneStore((s) => s.commitLive);

  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const start = useCallback((id: NodeId, clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeRef.current, hit);
    const f = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
    if (!f) return;
    dragRef.current = {
      id,
      startWorld: { x: hit.x, z: hit.z },
      offsetX: hit.x - f.position.x,
      offsetZ: hit.z - f.position.z,
    };
    gl.domElement.style.cursor = "grabbing";
  }, [camera, raycaster, gl]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, hit);
      if (!Number.isFinite(hit.x)) return;
      const newCorner = snapVec2({
        x: hit.x - dragRef.current.offsetX,
        z: hit.z - dragRef.current.offsetZ,
      });
      const f = useSceneStore.getState().nodes[dragRef.current.id] as FurnitureNode | undefined;
      if (!f) return;
      // Constrain to room polygon if attached.
      let cornerX = newCorner.x;
      let cornerZ = newCorner.z;
      if (f.roomId) {
        const room = useSceneStore.getState().nodes[f.roomId] as RoomNode | undefined;
        if (room) {
          // Center the constraint check on the furniture center.
          const center = { x: cornerX + f.dimensions.x / 2, z: cornerZ + f.dimensions.z / 2 };
          if (!pointInPolygon(center, room.polygon)) {
            const c = clampToPolygon(center, room.polygon);
            cornerX = c.x - f.dimensions.x / 2;
            cornerZ = c.z - f.dimensions.z / 2;
          }
        }
      }
      setLive(dragRef.current.id, {
        position: { x: cornerX, y: f.position.y, z: cornerZ },
      });
    };
    const onUp = () => {
      if (dragRef.current) {
        commitLive(dragRef.current.id);
      }
      dragRef.current = null;
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
