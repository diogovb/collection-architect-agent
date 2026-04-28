"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

import type { FurnitureNode, ViewMode } from "@/lib/scene/types";
import { PALETTE } from "../materials";
import { makeToonGradient, TOON_RAMP_3 } from "@/lib/canvas/toon-gradient";
import { buildEdgesGeometry } from "@/lib/canvas/toon-edges";

const FURN_TOON_GRADIENT = makeToonGradient(TOON_RAMP_3);

// Reusable box edges geometry — built once per (w, d, h) tuple and cached.
// Every furniture piece is a simple box, so we can keep a tiny cache here
// instead of allocating a fresh EdgesGeometry on every render.
const BOX_EDGES_CACHE = new Map<string, THREE.EdgesGeometry>();
function boxEdges(w: number, h: number, d: number): THREE.EdgesGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let cached = BOX_EDGES_CACHE.get(key);
  if (!cached) {
    const box = new THREE.BoxGeometry(w, h, d);
    cached = buildEdgesGeometry(box, 1);
    box.dispose();
    BOX_EDGES_CACHE.set(key, cached);
  }
  return cached;
}

interface Props {
  furniture: FurnitureNode;
  viewMode: ViewMode;
  selected: boolean;
  hovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}

const FURNITURE_COLORS: Record<string, string> = {
  sofa_2seat: "#D9CFB8",
  sofa_3seat: "#D9CFB8",
  sofa_L: "#D9CFB8",
  sofa: "#D9CFB8",
  armchair: "#CBBFA8",
  coffee_table: "#C9BC9F",
  side_table: "#C9BC9F",
  bed_double: "#E8DDC8",
  bed_king: "#E8DDC8",
  bed_single: "#E8DDC8",
  bed: "#E8DDC8",
  dining_table_4: "#A8967A",
  dining_table_6: "#A8967A",
  dining_table_8: "#A8967A",
  dining_table_round_4: "#A8967A",
  table: "#A8967A",
  kitchen_island: "#F0E8D6",
  island: "#F0E8D6",
  rug_rect: "#E8DDC8",
  fridge_single: "#E8DEC8",
  fridge_double: "#E8DEC8",
  fridge: "#E8DEC8",
  toilet: "#FFFFFF",
  shower_square: "#EAEAEA",
  shower_rect: "#EAEAEA",
  bathtub_rect: "#FFFFFF",
};

function colorFor(catalogId: string): string {
  return FURNITURE_COLORS[catalogId] ?? "#C7BBA0";
}

export function FurnitureView({
  furniture,
  viewMode,
  selected,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
  onPointerDown,
}: Props) {
  const baseColor = colorFor(furniture.catalogId);
  const stroke = selected ? PALETTE.accent : hovered ? PALETTE.hoverStroke : PALETTE.ink;

  // Center the box at furniture position + half dims (position is bottom-left).
  const cx = furniture.position.x + furniture.dimensions.x / 2;
  const cz = furniture.position.z + furniture.dimensions.z / 2;
  const cy = viewMode === "2d" ? 0.04 : furniture.dimensions.y / 2;

  // 2D top-down: flat rounded rect with light fill + outline.
  if (viewMode === "2d") {
    const roundedShape = useMemo(() => {
      const w = furniture.dimensions.x;
      const d = furniture.dimensions.z;
      const r = Math.min(0.04, w / 4, d / 4);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -d / 2);
      shape.lineTo(w / 2 - r, -d / 2);
      shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      shape.lineTo(w / 2, d / 2 - r);
      shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
      shape.lineTo(-w / 2 + r, d / 2);
      shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
      shape.lineTo(-w / 2, -d / 2 + r);
      shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      return g;
    }, [furniture.dimensions.x, furniture.dimensions.z]);

    return (
      <group
        position={[cx, cy, cz]}
        rotation={[0, -furniture.rotation, 0]}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onPointerDown={onPointerDown}
      >
        <mesh geometry={roundedShape} renderOrder={6}>
          <meshBasicMaterial color={baseColor} />
        </mesh>
        {/* Outline halo for selection / hover */}
        {(selected || hovered) && (
          <mesh geometry={roundedShape} position={[0, 0.001, 0]} renderOrder={7}>
            <meshBasicMaterial color={stroke} transparent opacity={0.18} />
          </mesh>
        )}
      </group>
    );
  }

  // 3D: simple box with toon body + black contour lines (Fase D).
  const edges = boxEdges(furniture.dimensions.x, furniture.dimensions.y, furniture.dimensions.z);
  return (
    <group
      position={[cx, cy, cz]}
      rotation={[0, -furniture.rotation, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <mesh castShadow>
        <boxGeometry args={[furniture.dimensions.x, furniture.dimensions.y, furniture.dimensions.z]} />
        {/* Toon material to match the editorial 3D look (Fase 5). */}
        <meshToonMaterial
          color={selected ? PALETTE.accent : baseColor}
          gradientMap={FURN_TOON_GRADIENT}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={1}>
        <lineBasicMaterial color={PALETTE.ink} />
      </lineSegments>
    </group>
  );
}
