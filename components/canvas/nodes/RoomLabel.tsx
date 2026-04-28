"use client";

import { Text } from "@react-three/drei";
import type { RoomNode, ViewMode } from "@/lib/scene/types";
import { polygonCentroid } from "@/lib/scene/types";
import { PALETTE } from "../materials";

// Drei <Text> uses troika-three-text. We omit font prop here so it falls back
// to the default. Setting a custom font via .ttf can be added later — woff2 is
// not supported by troika.
const SERIF_FONT: string | undefined = undefined;
const MONO_FONT: string | undefined = undefined;

interface Props {
  room: RoomNode;
  viewMode: ViewMode;
}

export function RoomLabel({ room, viewMode }: Props) {
  if (viewMode !== "2d") return null;
  const c = polygonCentroid(room.polygon);
  const areaTxt = `${room.area.toFixed(2).replace(".", ",")} m²`.toUpperCase();
  return (
    <group position={[c.x, 0.05, c.z]}>
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        font={SERIF_FONT}
        fontSize={0.28}
        color={PALETTE.inkSoft}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, -0.16]}
        renderOrder={10}
      >
        {room.name}
      </Text>
      <Text
        rotation={[-Math.PI / 2, 0, 0]}
        font={MONO_FONT}
        fontSize={0.16}
        color={PALETTE.muted}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, 0.12]}
        letterSpacing={0.1}
        renderOrder={10}
      >
        {areaTxt}
      </Text>
    </group>
  );
}
