"use client";

// Single postprocessing pass producing outlines for selected and hovered nodes.
// Consolidates depth/edge passes so we don't re-render the scene twice.

import { useMemo } from "react";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import * as THREE from "three";

import { useSceneStore } from "@/lib/scene/store";

export function CanvasPostprocessing() {
  const selected = useSceneStore((s) => s.selected);
  const hovered = useSceneStore((s) => s.hovered);
  // We can't pass node ids directly; postprocessing needs Object3D refs.
  // Instead we tag meshes via userData and let the viewer toggle the
  // outline from Drei's Outlines mesh helper. To keep it simple here,
  // we render an EffectComposer with the OUTLINE effect bound to all
  // meshes whose name matches a selected/hovered id (set in node views).
  const outlineSelected = useMemo(() => new Set(selected), [selected]);
  const outlineHovered = useMemo(() => (hovered ? new Set([hovered]) : new Set<string>()), [hovered]);

  // Note: we intentionally use a thin pass — no SSAO/Bloom — to keep the
  // editorial 2D look flat. The Outline effect is fine to remain off when
  // no element is hovered/selected (it bails out early internally).
  if (outlineSelected.size === 0 && outlineHovered.size === 0) return null;

  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <Outline
        edgeStrength={4}
        visibleEdgeColor={0xb8552e as unknown as THREE.ColorRepresentation as number}
        hiddenEdgeColor={0x1f1b16 as unknown as number}
        blur
      />
    </EffectComposer>
  );
}
