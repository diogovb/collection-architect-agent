"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

import type { FurnitureNode, ViewMode } from "@/lib/scene/types";
import { PALETTE } from "../materials";
import { makeToonGradient, TOON_RAMP_3 } from "@/lib/canvas/toon-gradient";
import { inflateGeometry } from "@/lib/canvas/toon-edges";

const FURN_TOON_GRADIENT = makeToonGradient(TOON_RAMP_3);

// Reusable inverted-hull geometry per (w, h, d) tuple. Inflating a box by
// 2 cm along its normals gives the silhouette outline used for the 3D
// "papel ilustrado" look (Fase J). Caching keeps the cost negligible
// across many similar furniture instances.
const HULL_CACHE = new Map<string, THREE.BufferGeometry>();
function boxHull(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let cached = HULL_CACHE.get(key);
  if (!cached) {
    const box = new THREE.BoxGeometry(w, h, d);
    cached = inflateGeometry(box, 0.02);
    box.dispose();
    HULL_CACHE.set(key, cached);
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
  /** Drag gizmo handler (Fase K, 3D only). Fired when the user grabs the
   *  small accent sphere that hovers above the selected furniture in 3D.
   *  Lets the body of the mesh stay click/orbit-friendly while still
   *  exposing a clear "move me" affordance. */
  onGizmoPointerDown?: (clientX: number, clientY: number) => void;
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

// ---- Marcenaria 3D (Iteração 7 / Fase D) -----------------------------
// In 3D, millwork modules need real extrusions:
//   - lower cabinet: 90 cm tall at floor
//   - full-height: 2.0 m tall at floor (fridge, oven tower, pantry)
//   - countertop: 4 cm slab at 85 cm elevation
//   - upper cabinet: 70 cm tall at 1.55 m elevation
//   - hood: 40 cm tall at 1.65 m elevation
//
// Returns null when the catalogId isn't millwork (caller falls through to
// the default extrusion).
const COUNTERTOP_3D_COLOR: Record<string, string> = {
  granito_preto: "#1a1d28",
  granito_branco: "#cfc8b8",
  marmore_carrara: "#f0ece2",
  marmore_travertino: "#d6c9a8",
  quartzo_branco: "#eee9dc",
  quartzo_preto: "#2a2d36",
  porcelanato: "#e6dfd2",
  madeira_macica: "#a78867",
  inox: "#c4c4be",
};

interface MillworkSpec {
  /** Extrude height in metres. */
  height: number;
  /** Bottom Y of the geometry, in metres above floor. */
  elevation: number;
  /** Body colour. */
  color: string;
  /** True for tracejado / suspended elements (uppers, hood) — render with
   *  partial transparency to suggest they're above the plan-cut. */
  isSuspended: boolean;
  /** True for stone slabs (countertop) — render with slight gloss. */
  isStoneSlab: boolean;
}

function millworkSpecFor(catalogId: string, label: string): MillworkSpec | null {
  // Bancada: thin slab at 85 cm.
  if (catalogId === "bancada_continuous") {
    const lbl = label.toLowerCase();
    let mat = "granito_preto";
    for (const k of Object.keys(COUNTERTOP_3D_COLOR)) {
      if (lbl.includes(k.replace("_", " ")) || lbl.includes(k)) { mat = k; break; }
    }
    return {
      height: 0.04,
      elevation: 0.85,
      color: COUNTERTOP_3D_COLOR[mat],
      isSuspended: false,
      isStoneSlab: true,
    };
  }
  // Hood: 40 cm at 1.65 m.
  if (catalogId === "hood_built_in") {
    return { height: 0.4, elevation: 1.65, color: "#5a6172", isSuspended: true, isStoneSlab: false };
  }
  // Uppers: 70 cm at 1.55 m.
  if (catalogId === "module_upper_cabinet") {
    return { height: 0.7, elevation: 1.55, color: "#e6dfd2", isSuspended: true, isStoneSlab: false };
  }
  if (catalogId === "module_upper_glass") {
    return { height: 0.7, elevation: 1.55, color: "#d8e4f0", isSuspended: true, isStoneSlab: false };
  }
  // Full-height modules.
  if (
    /^module_(fridge|oven_tower|pantry_tall|washer_dryer_stack|closet_hanging|tv_panel_built_in|closet_shelves)/.test(catalogId)
  ) {
    return { height: 2.1, elevation: 0, color: catalogId.includes("fridge") ? "#e8dec8" : "#d6cebc", isSuspended: false, isStoneSlab: false };
  }
  // Wall-hung toilet — short but at floor (mounted on wall).
  if (catalogId === "module_wall_hung_toilet") {
    return { height: 0.4, elevation: 0.4, color: "#fcfcfc", isSuspended: false, isStoneSlab: false };
  }
  // Lower modules — most cabinetry/appliances at counter level.
  if (/^module_/.test(catalogId)) {
    // Appliances visible on top get darker tone.
    let color = "#d6cebc";
    if (/cooktop|oven_built_in|microwave|dishwasher|wine_cellar|outdoor_cooktop|wine_fridge_outdoor|bbq|pizza_oven/.test(catalogId)) {
      color = "#3a3f4f";
    } else if (/sink|vanity|laundry_tank|outdoor_sink/.test(catalogId)) {
      color = "#cfc8b8";
    }
    return { height: 0.85, elevation: 0, color, isSuspended: false, isStoneSlab: false };
  }
  return null;
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
  onGizmoPointerDown,
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

  // 3D: marcenaria modular tem altura real (lower 0.9m, full-height 2.1m,
  // bancada slab 4cm, uppers a 1.55m, hood a 1.65m). FurnitureNode default
  // fica com altura 0.5m. Detectar via millworkSpecFor.
  const millwork = millworkSpecFor(furniture.catalogId, furniture.label);
  const millY = millwork ? millwork.height : furniture.dimensions.y;
  const millElev = millwork ? millwork.elevation : 0;
  const millColor = millwork ? millwork.color : baseColor;
  const millCenterY = millElev + millY / 2;
  const hull = boxHull(furniture.dimensions.x, millY, furniture.dimensions.z);
  return (
    <group
      position={[cx, millCenterY, cz]}
      rotation={[0, -furniture.rotation, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[furniture.dimensions.x, millY, furniture.dimensions.z]} />
        {millwork?.isStoneSlab ? (
          // Bancada: leve gloss, sem gradient toon (parece pedra polida).
          <meshStandardMaterial
            color={selected ? PALETTE.accent : millColor}
            metalness={0.15}
            roughness={0.4}
          />
        ) : millwork?.isSuspended ? (
          // Uppers / hood: opacidade levemente reduzida pra sugerir
          // que estao acima do plano de corte sem ficarem fantasmas.
          <meshToonMaterial
            color={selected ? PALETTE.accent : millColor}
            gradientMap={FURN_TOON_GRADIENT}
            transparent
            opacity={0.92}
          />
        ) : (
          <meshToonMaterial
            color={selected ? PALETTE.accent : millColor}
            gradientMap={FURN_TOON_GRADIENT}
          />
        )}
      </mesh>
      {/* Inverted-hull outline (Fase J) — apenas pra modulos NAO suspensos.
          Uppers + hood ficariam com contorno duplicado feio. */}
      {!millwork?.isSuspended && (
        <mesh geometry={hull} renderOrder={-1}>
          <meshBasicMaterial color={PALETTE.ink} side={THREE.BackSide} />
        </mesh>
      )}
      {selected && onGizmoPointerDown && (
        <mesh
          position={[0, millY / 2 + 0.18, 0]}
          renderOrder={10}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onGizmoPointerDown(e.nativeEvent.clientX, e.nativeEvent.clientY);
            document.body.style.cursor = "grabbing";
          }}
        >
          <sphereGeometry args={[0.09, 24, 24]} />
          <meshBasicMaterial color={PALETTE.accent} />
        </mesh>
      )}
    </group>
  );
}
