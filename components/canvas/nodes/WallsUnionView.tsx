"use client";

// Single fused walls mesh (Fase M).
//
// Renders every wall as ONE `<mesh>` so junctions are continuous and no
// independent inverted hulls leak through T-junctions. Hit-testing falls
// back to the individual `WallView` (which still renders its 2D top-down
// fill in 2D mode and a transparent placeholder in 3D for click capture).

import { useMemo } from "react";
import * as THREE from "three";

import type { DoorNode, WallNode, WindowNode } from "@/lib/scene/types";
import { buildWallsUnion } from "@/lib/scene/wall-union";
import {
  WALL_GROUP_BOTTOM,
  WALL_GROUP_END,
  WALL_GROUP_LEFT,
  WALL_GROUP_RIGHT,
  WALL_GROUP_START,
  WALL_GROUP_TOP,
} from "@/lib/scene/wall-geometry";
import { PALETTE } from "../materials";
import { makeToonGradient, TOON_RAMP_3 } from "@/lib/canvas/toon-gradient";
import { inflateGeometry } from "@/lib/canvas/toon-edges";

const WALL_TOON_GRADIENT = makeToonGradient(TOON_RAMP_3);

interface Props {
  walls: WallNode[];
  doors: DoorNode[];
  windows: WindowNode[];
}

export function WallsUnionView({ walls, doors, windows }: Props) {
  const { geometry, hullGeometry } = useMemo(() => {
    const { geometry, warnings } = buildWallsUnion(walls, doors, windows);
    if (warnings.length > 0 && process.env.NODE_ENV !== "production") {
      for (const w of warnings) console.warn(`[walls-union] ${w.wallId}: ${w.message}`);
    }
    if (!geometry) return { geometry: null, hullGeometry: null };
    const hull = inflateGeometry(geometry, 0.02);
    return { geometry, hullGeometry: hull };
  }, [walls, doors, windows]);

  if (!geometry || !hullGeometry) return null;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshToonMaterial
          attach={`material-${WALL_GROUP_TOP}`}
          color={PALETTE.wallTop}
          gradientMap={WALL_TOON_GRADIENT}
        />
        <meshToonMaterial
          attach={`material-${WALL_GROUP_BOTTOM}`}
          color={PALETTE.wallBottom}
          gradientMap={WALL_TOON_GRADIENT}
        />
        <meshToonMaterial
          attach={`material-${WALL_GROUP_LEFT}`}
          color={PALETTE.wallLeft}
          gradientMap={WALL_TOON_GRADIENT}
        />
        <meshToonMaterial
          attach={`material-${WALL_GROUP_RIGHT}`}
          color={PALETTE.wallRight}
          gradientMap={WALL_TOON_GRADIENT}
        />
        <meshToonMaterial
          attach={`material-${WALL_GROUP_START}`}
          color={PALETTE.wallStart}
          gradientMap={WALL_TOON_GRADIENT}
        />
        <meshToonMaterial
          attach={`material-${WALL_GROUP_END}`}
          color={PALETTE.wallEnd}
          gradientMap={WALL_TOON_GRADIENT}
        />
      </mesh>
      <mesh geometry={hullGeometry} renderOrder={-1}>
        <meshBasicMaterial color={PALETTE.ink} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}
