"use client";

// 3D post-processing pipeline. Runs only on the 3D path — the 2D SVG
// renderer doesn't go through this.
//
// As of Fase D the depth and contour come from per-mesh `<lineSegments>`
// (THREE.EdgesGeometry) drawn over each toon-shaded body — the cel-shading
// reads as flat editorial colour bounded by ink-coloured contour lines, the
// same language as the 2D plan.
//
// SSAO was removed: it added soft ambient occlusion that competes with the
// flat cel-shaded read. Toon + edges already give the volumes enough
// definition. The only effect kept is `Outline`, which paints an accent
// halo on the hovered / selected node (orange editorial palette).

import { useMemo } from "react";
import { EffectComposer, Outline } from "@react-three/postprocessing";

import { useSceneStore } from "@/lib/scene/store";

const ACCENT = 0xb8552e;
const HIDDEN_INK = 0x1f1b16;

export function CanvasPostprocessing() {
  const selected = useSceneStore((s) => s.selected);
  const hovered = useSceneStore((s) => s.hovered);
  const hasOutline = useMemo(
    () => selected.length > 0 || !!hovered,
    [selected, hovered]
  );

  return (
    <EffectComposer multisampling={4} autoClear={false}>
      {hasOutline ? (
        <Outline
          edgeStrength={7}
          visibleEdgeColor={ACCENT}
          hiddenEdgeColor={HIDDEN_INK}
          blur={false}
          xRay={false}
        />
      ) : (
        // EffectComposer requires at least one effect; render a no-op
        // outline that won't have any selection to draw.
        <Outline edgeStrength={0} visibleEdgeColor={ACCENT} hiddenEdgeColor={HIDDEN_INK} />
      )}
    </EffectComposer>
  );
}
