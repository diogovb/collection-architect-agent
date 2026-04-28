"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { SlabNode, ViewMode } from "@/lib/scene/types";
import { createSlabGeometry2D, createSlabGeometry3D } from "@/lib/scene/slab-geometry";
import { floorTextureFor, PALETTE } from "../materials";
import { makeToonGradient, TOON_RAMP_3 } from "@/lib/canvas/toon-gradient";

const SLAB_TOON_GRADIENT = makeToonGradient(TOON_RAMP_3);

interface Props {
  slab: SlabNode;
  viewMode: ViewMode;
}

export function SlabView({ slab, viewMode }: Props) {
  const geom = useMemo(
    () => (viewMode === "2d" ? createSlabGeometry2D(slab) : createSlabGeometry3D(slab)),
    [slab, viewMode]
  );

  const { tex, tileM, color } = useMemo(() => floorTextureFor(slab.material), [slab.material]);

  // For repeating texture, derive repeat from polygon bounds.
  const texConfig = useMemo(() => {
    if (!tex) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of slab.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(width / tileM, depth / tileM);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, [tex, tileM, slab.polygon]);

  return (
    <mesh geometry={geom} receiveShadow>
      {viewMode === "2d" ? (
        texConfig ? (
          <meshBasicMaterial color={PALETTE.paper} map={texConfig} side={THREE.DoubleSide} />
        ) : (
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        )
      ) : (
        // Toon material in 3D so the slabs read as the same illustrated
        // editorial language as the walls (Fase 5).
        texConfig ? (
          <meshToonMaterial color={"#FFFFFF"} map={texConfig} gradientMap={SLAB_TOON_GRADIENT} />
        ) : (
          <meshToonMaterial color={color} gradientMap={SLAB_TOON_GRADIENT} />
        )
      )}
    </mesh>
  );
}
