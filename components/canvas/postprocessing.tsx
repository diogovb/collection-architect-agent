"use client";

// 3D post-processing pipeline. Uses @react-three/postprocessing (WebGL2,
// already a dependency) to give walls and furniture the depth and contour
// that Pascal achieves with SSGI/TSL on WebGPU. Runs only on the 3D path —
// the 2D SVG renderer doesn't go through this.
//
// Pipeline (in order):
//   1. SSAO   — ambient occlusion in screen space; settles into corners
//               where walls meet, gives slabs subtle shadowing.
//   2. Outline — orange edge on hovered/selected nodes (matches accent
//                color of the editorial palette).
//
// We deliberately skip Bloom/Tonemapping — keeps the editorial flat look.

import { useMemo } from "react";
import { EffectComposer, Outline, SSAO } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

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
      {/* Light SSAO — toon material is flat by design, so heavy occlusion
          competes with the cel-shaded look. We keep just enough to anchor
          edges where surfaces meet. */}
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={16}
        radius={0.12}
        intensity={5}
        luminanceInfluence={0.35}
        worldDistanceThreshold={0.8}
        worldDistanceFalloff={0.3}
        worldProximityThreshold={0.4}
        worldProximityFalloff={0.15}
      />
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
