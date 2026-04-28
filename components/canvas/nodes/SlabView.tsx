"use client";

import { useMemo } from "react";
import * as THREE from "three";

import type { SlabNode, ViewMode } from "@/lib/scene/types";
import { createSlabGeometry2D, createSlabGeometry3D } from "@/lib/scene/slab-geometry";
import { floorTextureFor, PALETTE } from "../materials";

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
        texConfig ? (
          <meshStandardMaterial color={"#FFFFFF"} map={texConfig} roughness={0.85} metalness={0} />
        ) : (
          <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
        )
      )}
    </mesh>
  );
}
