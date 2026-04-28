"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

import type { DoorNode, ViewMode, WallNode } from "@/lib/scene/types";
import { v2Norm, v2Perp, v2Sub } from "@/lib/scene/types";
import { PALETTE } from "../materials";

interface Props {
  door: DoorNode;
  wall: WallNode;
  viewMode: ViewMode;
  selected: boolean;
  hovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function DoorView({
  door,
  wall,
  viewMode,
  selected,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
  onPointerDown,
}: Props) {
  const geometry = useMemo(() => {
    const dir = v2Norm(v2Sub(wall.end, wall.start));
    const perp = v2Perp(dir); // left of dir
    const center = {
      x: wall.start.x + dir.x * door.offset,
      z: wall.start.z + dir.z * door.offset,
    };
    const half = door.width / 2;
    const aLeft = { x: center.x - dir.x * half, z: center.z - dir.z * half };
    const aRight = { x: center.x + dir.x * half, z: center.z + dir.z * half };
    // The opening is the rectangle (across wall thickness) we erase from the wall fill in 2D.
    // Render a "bone" rect (paper color) that covers the slot, and the leaf + arc lines.
    return { dir, perp, center, aLeft, aRight };
  }, [door, wall]);

  const stroke = selected ? PALETTE.accent : hovered ? PALETTE.hoverStroke : PALETTE.ink;

  if (viewMode === "2d") {
    const { dir, perp, aLeft, aRight } = geometry;
    const half = door.width / 2;
    const wt = wall.thickness;
    // Hinge point: choose left or right end of the opening based on hingeSide.
    const hinge = door.hingeSide === "start" ? aLeft : aRight;
    const tip = door.hingeSide === "start" ? aRight : aLeft;
    // Swing perpendicular: by default, into one side (use +perp for "in").
    const swingSign = door.swingDirection === "in" ? 1 : -1;
    const leafEnd = {
      x: hinge.x + perp.x * door.width * swingSign,
      z: hinge.z + perp.z * door.width * swingSign,
    };

    // Opening "bone" rect (4 corners across wall thickness).
    const bone: [number, number, number][] = [
      [aLeft.x + perp.x * (wt / 2 + 0.005), 0.024, aLeft.z + perp.z * (wt / 2 + 0.005)],
      [aRight.x + perp.x * (wt / 2 + 0.005), 0.024, aRight.z + perp.z * (wt / 2 + 0.005)],
      [aRight.x - perp.x * (wt / 2 + 0.005), 0.024, aRight.z - perp.z * (wt / 2 + 0.005)],
      [aLeft.x - perp.x * (wt / 2 + 0.005), 0.024, aLeft.z - perp.z * (wt / 2 + 0.005)],
    ];

    // Arc points (quarter circle from leafEnd to tip around hinge).
    const arcPts: [number, number, number][] = [];
    const startAngle = Math.atan2(perp.z * swingSign, perp.x * swingSign);
    const endAngle = Math.atan2(dir.z * (door.hingeSide === "start" ? 1 : -1), dir.x * (door.hingeSide === "start" ? 1 : -1));
    const sweep = ((endAngle - startAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + sweep * t;
      arcPts.push([
        hinge.x + Math.cos(a) * door.width,
        0.027,
        hinge.z + Math.sin(a) * door.width,
      ]);
    }

    const boneGeom = quadGeometry(bone);

    return (
      <group
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onPointerDown={onPointerDown}
      >
        {/* Bone (cuts the wall visually in 2D) */}
        <mesh geometry={boneGeom} position={[0, 0.024, 0]} renderOrder={5}>
          <meshBasicMaterial color={PALETTE.paper} />
        </mesh>
        {/* Door leaf (90° open) */}
        <Line
          points={[[hinge.x, 0.026, hinge.z], [leafEnd.x, 0.026, leafEnd.z]]}
          color={stroke}
          lineWidth={1.5}
        />
        {/* Swing arc */}
        <Line
          points={arcPts}
          color={stroke}
          lineWidth={0.7}
          dashed
          dashSize={0.07}
          gapSize={0.05}
        />
        {/* Pick target: an invisible larger box for click area */}
        <mesh
          position={[geometry.center.x, 0.03, geometry.center.z]}
          renderOrder={6}
        >
          <boxGeometry args={[door.width, 0.001, wt + 0.4]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>
    );
  }

  // 3D mode: simple frame + leaf box.
  const angle = Math.atan2(geometry.dir.z, geometry.dir.x);
  return (
    <group
      position={[geometry.center.x, door.height / 2, geometry.center.z]}
      rotation={[0, -angle, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <mesh castShadow>
        <boxGeometry args={[door.width * 0.9, door.height * 0.95, 0.04]} />
        <meshStandardMaterial color={selected ? PALETTE.accent : "#5C4A36"} roughness={0.7} />
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
