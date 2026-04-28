"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

import type { DoorNode, ViewMode, WallNode, WindowNode } from "@/lib/scene/types";
import type { WallCorners } from "@/lib/scene/wall-mitering";
import {
  WALL_GROUP_BOTTOM,
  WALL_GROUP_END,
  WALL_GROUP_LEFT,
  WALL_GROUP_RIGHT,
  WALL_GROUP_START,
  WALL_GROUP_TOP,
  wallExtrudedGeometry,
  wallShapeGeometry2D,
} from "@/lib/scene/wall-geometry";
import { applyWallCutouts } from "@/lib/scene/csg-cutouts";
import { PALETTE } from "../materials";
import { makeToonGradient, TOON_RAMP_3 } from "@/lib/canvas/toon-gradient";
import { inflateGeometry } from "@/lib/canvas/toon-edges";

// Shared toon ramp for the whole 3D scene — lives at module scope so the
// gradient texture isn't rebuilt on every render. Three editorial bands
// (shadow → mid → highlight) give the cel-shaded look without losing the
// volumetric read of the apartment.
const WALL_TOON_GRADIENT = makeToonGradient(TOON_RAMP_3);

interface Props {
  wall: WallNode;
  corners: WallCorners;
  viewMode: ViewMode;
  selected: boolean;
  hovered: boolean;
  doors: DoorNode[];
  windows: WindowNode[];
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}

export function WallView({
  wall,
  corners,
  viewMode,
  selected,
  hovered,
  doors,
  windows,
  onPointerOver,
  onPointerOut,
  onClick,
  onPointerDown,
}: Props) {
  const geom2D = useMemo(() => wallShapeGeometry2D(corners), [corners]);

  const geom3D = useMemo(() => {
    if (viewMode !== "3d") return null;
    const base = wallExtrudedGeometry(corners, wall.height);
    const openings = [...doors, ...windows];
    if (openings.length === 0) return base;
    const { geometry, warnings } = applyWallCutouts(base, wall, openings);
    if (warnings.length > 0 && process.env.NODE_ENV !== "production") {
      for (const w of warnings) console.warn(`[csg] ${w.wallId}: ${w.message}`);
    }
    base.dispose();
    return geometry;
  }, [viewMode, corners, wall, doors, windows]);

  // Inverted hull silhouette (Fase J). Extrudes vertices along their
  // normals by 2 cm and renders the result with BackSide + ink colour:
  // the inflated backfaces poke past the toon body and form a clean
  // outline wherever the silhouette is, without picking up any CSG or
  // Earcut triangulation seams.
  const hullGeom = useMemo(() => (geom3D ? inflateGeometry(geom3D, 0.02) : null), [geom3D]);

  const fillColor = PALETTE.wallFill;
  const edgeColor = selected ? PALETTE.accent : hovered ? PALETTE.hoverStroke : PALETTE.ink;
  const edgeWidth = selected ? 0.025 : 0.018;

  const outlineGeom = useMemo(() => buildOutlineGeometry(corners, edgeWidth), [corners, edgeWidth]);

  return (
    <group>
      {viewMode === "2d" ? (
        <>
          {/* Wall fill */}
          <mesh
            geometry={geom2D}
            position={[0, 0.02, 0]}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
            onClick={onClick}
            onPointerDown={onPointerDown}
            renderOrder={3}
          >
            <meshBasicMaterial color={fillColor} side={THREE.DoubleSide} />
          </mesh>
          {/* Wall outline (top-down silhouette) */}
          <mesh geometry={outlineGeom} position={[0, 0.025, 0]} renderOrder={4}>
            <meshBasicMaterial color={edgeColor} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        geom3D && (
          <mesh
            geometry={geom3D}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
            onClick={onClick}
            onPointerDown={onPointerDown}
            castShadow
            receiveShadow
          >
            {/* Multi-material per boundary tag (Pascal pattern, 6-face split).
                Style Guide §13 + Fase 5: meshToonMaterial with a 3-stop
                gradient ramp gives the cel-shaded "ilustração técnica" look
                that mirrors the 2D editorial style. Per-face colours from
                the palette modulate the ramp. */}
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
        )
      )}
      {viewMode === "3d" && hullGeom && (
        <mesh geometry={hullGeom} renderOrder={-1}>
          <meshBasicMaterial color={PALETTE.ink} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

/** Build a thin outline strip around the wall quad as triangles. */
function buildOutlineGeometry(corners: WallCorners, width: number): THREE.BufferGeometry {
  const points = [corners.startLeft, corners.endLeft, corners.endRight, corners.startRight];
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const nx = -dz / len;
    const nz = dx / len;
    const half = width / 2;
    const i0 = positions.length / 3;
    positions.push(a.x + nx * half, 0, a.z + nz * half);
    positions.push(a.x - nx * half, 0, a.z - nz * half);
    positions.push(b.x + nx * half, 0, b.z + nz * half);
    positions.push(b.x - nx * half, 0, b.z - nz * half);
    indices.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
  g.computeVertexNormals();
  return g;
}
