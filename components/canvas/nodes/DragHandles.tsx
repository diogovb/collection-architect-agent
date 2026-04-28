"use client";

import { useEffect, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { NodeId, ViewMode, WallNode } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { runDerivation } from "@/lib/scene/derive";
import { snapVec2, snapToEndpoints } from "@/lib/scene/snap";
import { PALETTE } from "../materials";

interface Props {
  wall: WallNode;
  viewMode: ViewMode;
}

export function DragHandles({ wall, viewMode }: Props) {
  if (viewMode !== "2d") return null;

  return (
    <group>
      <Handle wallId={wall.id} endpoint="start" position={[wall.start.x, 0.06, wall.start.z]} />
      <Handle wallId={wall.id} endpoint="end" position={[wall.end.x, 0.06, wall.end.z]} />
    </group>
  );
}

function Handle({
  wallId,
  endpoint,
  position,
}: {
  wallId: NodeId;
  endpoint: "start" | "end";
  position: [number, number, number];
}) {
  const { camera, raycaster, gl, scene } = useThree();
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const setLive = useSceneStore((s) => s.setLive);
  const commitLive = useSceneStore((s) => s.commitLive);
  const clearLive = useSceneStore((s) => s.clearLive);
  const liveTransforms = useSceneStore((s) => s.liveTransforms);
  const live = liveTransforms.get(wallId) ?? {};

  // The current rendered position takes any live override into account.
  const livePos = endpoint === "start" ? live.start : live.end;
  const renderPos: [number, number, number] = livePos
    ? [livePos.x, position[1], livePos.z]
    : position;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, hit);
      if (Number.isFinite(hit.x)) {
        const candidate = snapVec2({ x: hit.x, z: hit.z });
        const walls = Object.values(useSceneStore.getState().nodes).filter(
          (n) => n.type === "wall" && n.id !== wallId
        ) as WallNode[];
        const { snapped } = snapToEndpoints(candidate, walls, 0.15);
        if (endpoint === "start") setLive(wallId, { start: snapped });
        else setLive(wallId, { end: snapped });
      }
    };
    const onUp = () => {
      setDragging(false);
      // Commit live → real, then re-derive rooms/slabs.
      commitLive(wallId);
      const state = useSceneStore.getState();
      const out = runDerivation(state.nodes, state.activeLevelId);
      if (out.changed) {
        useSceneStore.setState({ nodes: out.nodes });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, endpoint, wallId, camera, raycaster, gl, setLive, commitLive]);

  return (
    <mesh
      position={renderPos}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); gl.domElement.style.cursor = "grab"; }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); if (!dragging) gl.domElement.style.cursor = ""; }}
      onPointerDown={(e) => {
        e.stopPropagation();
        setDragging(true);
        gl.domElement.style.cursor = "grabbing";
      }}
      renderOrder={20}
    >
      <sphereGeometry args={[0.08, 16, 12]} />
      <meshBasicMaterial
        color={dragging || hovered ? PALETTE.accent : PALETTE.ink}
      />
    </mesh>
  );
}
