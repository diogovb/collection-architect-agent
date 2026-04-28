"use client";

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import type { DimensionNode } from "@/lib/scene/types";
import { v2Norm, v2Perp, v2Sub } from "@/lib/scene/types";
import { PALETTE } from "../materials";

const MONO_FONT: string | undefined = undefined;

interface Props {
  dim: DimensionNode;
}

export function DimensionView({ dim }: Props) {
  const data = useMemo(() => {
    const dir = v2Norm(v2Sub(dim.end, dim.start));
    const perp = v2Perp(dir);
    const offsetVec = { x: perp.x * dim.offset, z: perp.z * dim.offset };
    const a = { x: dim.start.x + offsetVec.x, z: dim.start.z + offsetVec.z };
    const b = { x: dim.end.x + offsetVec.x, z: dim.end.z + offsetVec.z };
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const text = dim.text ?? `${length.toFixed(2).replace(".", ",")} m`;
    const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    // Tick marks (perpendicular).
    const tick = 0.12;
    const tickA1 = { x: a.x - perp.x * tick, z: a.z - perp.z * tick };
    const tickA2 = { x: a.x + perp.x * tick, z: a.z + perp.z * tick };
    const tickB1 = { x: b.x - perp.x * tick, z: b.z - perp.z * tick };
    const tickB2 = { x: b.x + perp.x * tick, z: b.z + perp.z * tick };
    // Extension lines from the wall to the offset line.
    const ext1Start = dim.start;
    const ext2Start = dim.end;
    return { a, b, center, dir, perp, length, text, tickA1, tickA2, tickB1, tickB2, ext1Start, ext2Start };
  }, [dim]);

  return (
    <group>
      {/* Extension lines */}
      <Line
        points={[
          [data.ext1Start.x, 0.04, data.ext1Start.z],
          [data.a.x, 0.04, data.a.z],
        ]}
        color={PALETTE.muted}
        lineWidth={0.6}
        dashed
        dashSize={0.05}
        gapSize={0.04}
      />
      <Line
        points={[
          [data.ext2Start.x, 0.04, data.ext2Start.z],
          [data.b.x, 0.04, data.b.z],
        ]}
        color={PALETTE.muted}
        lineWidth={0.6}
        dashed
        dashSize={0.05}
        gapSize={0.04}
      />
      {/* Main dimension line */}
      <Line
        points={[
          [data.a.x, 0.05, data.a.z],
          [data.b.x, 0.05, data.b.z],
        ]}
        color={PALETTE.inkSoft}
        lineWidth={0.9}
      />
      {/* Tick marks at ends */}
      <Line
        points={[
          [data.tickA1.x, 0.05, data.tickA1.z],
          [data.tickA2.x, 0.05, data.tickA2.z],
        ]}
        color={PALETTE.inkSoft}
        lineWidth={0.9}
      />
      <Line
        points={[
          [data.tickB1.x, 0.05, data.tickB1.z],
          [data.tickB2.x, 0.05, data.tickB2.z],
        ]}
        color={PALETTE.inkSoft}
        lineWidth={0.9}
      />
      {/* Label — push perpendicular by 0.45m so it doesn't sit on the dimension
          line itself (and keeps clear of room labels). */}
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        font={MONO_FONT}
        fontSize={0.18}
        color={PALETTE.inkSoft}
        anchorX="center"
        anchorY="middle"
        position={[
          data.center.x + data.perp.x * 0.45,
          0.06,
          data.center.z + data.perp.z * 0.45,
        ]}
        renderOrder={11}
      >
        {data.text}
      </Text>
    </group>
  );
}
