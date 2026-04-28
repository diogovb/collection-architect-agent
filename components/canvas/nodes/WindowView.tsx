"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

import type { ViewMode, WallNode, WindowNode } from "@/lib/scene/types";
import { v2Norm, v2Perp, v2Sub } from "@/lib/scene/types";
import { PALETTE } from "../materials";

interface Props {
  win: WindowNode;
  wall: WallNode;
  viewMode: ViewMode;
  selected: boolean;
  hovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function WindowView({
  win,
  wall,
  viewMode,
  selected,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
  onPointerDown,
}: Props) {
  const geom = useMemo(() => {
    const dir = v2Norm(v2Sub(wall.end, wall.start));
    const perp = v2Perp(dir);
    const cx = wall.start.x + dir.x * win.offset;
    const cz = wall.start.z + dir.z * win.offset;
    const half = win.width / 2;
    return { dir, perp, cx, cz, half };
  }, [win, wall]);

  const stroke = selected ? PALETTE.accent : hovered ? PALETTE.hoverStroke : PALETTE.ink;

  if (viewMode === "2d") {
    const { dir, perp, cx, cz, half } = geom;
    const wt = wall.thickness;
    const aLeft = { x: cx - dir.x * half, z: cz - dir.z * half };
    const aRight = { x: cx + dir.x * half, z: cz + dir.z * half };

    // Bone rect (clear wall behind window).
    const boneCorners: [number, number, number][] = [
      [aLeft.x + perp.x * (wt / 2 + 0.005), 0.024, aLeft.z + perp.z * (wt / 2 + 0.005)],
      [aRight.x + perp.x * (wt / 2 + 0.005), 0.024, aRight.z + perp.z * (wt / 2 + 0.005)],
      [aRight.x - perp.x * (wt / 2 + 0.005), 0.024, aRight.z - perp.z * (wt / 2 + 0.005)],
      [aLeft.x - perp.x * (wt / 2 + 0.005), 0.024, aLeft.z - perp.z * (wt / 2 + 0.005)],
    ];
    // Two parallel glass lines (offset perpendicular to wall axis by wt/4 each side of centerline).
    const glassOffset = wt / 4;
    const lineA: [number, number, number][] = [
      [aLeft.x + perp.x * glassOffset, 0.027, aLeft.z + perp.z * glassOffset],
      [aRight.x + perp.x * glassOffset, 0.027, aRight.z + perp.z * glassOffset],
    ];
    const lineB: [number, number, number][] = [
      [aLeft.x - perp.x * glassOffset, 0.027, aLeft.z - perp.z * glassOffset],
      [aRight.x - perp.x * glassOffset, 0.027, aRight.z - perp.z * glassOffset],
    ];
    // Sill marker on each side.
    const sillOffset = wt / 2;
    const sillTickA: [number, number, number][] = [
      [aLeft.x + perp.x * sillOffset, 0.027, aLeft.z + perp.z * sillOffset],
      [aLeft.x - perp.x * sillOffset, 0.027, aLeft.z - perp.z * sillOffset],
    ];
    const sillTickB: [number, number, number][] = [
      [aRight.x + perp.x * sillOffset, 0.027, aRight.z + perp.z * sillOffset],
      [aRight.x - perp.x * sillOffset, 0.027, aRight.z - perp.z * sillOffset],
    ];

    const boneGeom = quadGeometry(boneCorners);
    return (
      <group
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onPointerDown={onPointerDown}
      >
        <mesh geometry={boneGeom} position={[0, 0.024, 0]} renderOrder={5}>
          <meshBasicMaterial color={PALETTE.paper} />
        </mesh>
        <Line points={lineA} color={stroke} lineWidth={1.2} />
        <Line points={lineB} color={stroke} lineWidth={1.2} />
        <Line points={sillTickA} color={stroke} lineWidth={0.9} />
        <Line points={sillTickB} color={stroke} lineWidth={0.9} />
        {/* Pick area */}
        <mesh position={[geom.cx, 0.028, geom.cz]}>
          <boxGeometry args={[win.width, 0.001, wt + 0.2]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    );
  }

  // 3D: glass plane with thin frame.
  const angle = Math.atan2(geom.dir.z, geom.dir.x);
  return (
    <group
      position={[geom.cx, win.sillHeight + win.height / 2, geom.cz]}
      rotation={[0, -angle, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <mesh>
        <boxGeometry args={[win.width * 0.92, win.height * 0.92, 0.03]} />
        <meshPhysicalMaterial
          color={"#A8C8DA"}
          transparent
          opacity={0.45}
          metalness={0}
          roughness={0.05}
          transmission={0.6}
        />
      </mesh>
    </group>
  );
}

function quadGeometry(corners: [number, number, number][]): THREE.BufferGeometry {
  const positions = new Float32Array([
    corners[0][0], corners[0][1], corners[0][2],
    corners[1][0], corners[1][1], corners[1][2],
    corners[2][0], corners[2][1], corners[2][2],
    corners[3][0], corners[3][1], corners[3][2],
  ]);
  const index = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  return g;
}
