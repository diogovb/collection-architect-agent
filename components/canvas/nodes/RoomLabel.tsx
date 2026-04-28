"use client";

import { Text } from "@react-three/drei";
import type { RoomNode, ViewMode } from "@/lib/scene/types";
import { polygonBounds, polygonCentroid } from "@/lib/scene/types";
import { PALETTE } from "../materials";

// Drei <Text> uses troika-three-text. We omit font prop here so it falls back
// to the default. Setting a custom font via .ttf can be added later — woff2 is
// not supported by troika.
const SERIF_FONT: string | undefined = undefined;
const MONO_FONT: string | undefined = undefined;

/** Rooms below this size show name only (no area), to avoid overlapping
 *  the swing arc / name in tight quarters. */
const SUPPRESS_AREA_BELOW = 4; // m²
/** Long, narrow rooms (corridors) — also show name only to avoid stacking
 *  two lines of text in a band that's only 1-1.5 m wide. */
const NARROW_DIM_THRESHOLD = 2; // m on the short side

interface Props {
  room: RoomNode;
  viewMode: ViewMode;
}

export function RoomLabel({ room, viewMode }: Props) {
  if (viewMode !== "2d") return null;
  const c = polygonCentroid(room.polygon);
  const b = polygonBounds(room.polygon);
  const shortSide = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
  const showArea = room.area >= SUPPRESS_AREA_BELOW && shortSide >= NARROW_DIM_THRESHOLD;
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
        position={[0, 0, showArea ? -0.2 : 0]}
        renderOrder={10}
      >
        {room.name}
      </Text>
      {showArea && (
        <Text
          rotation={[-Math.PI / 2, 0, 0]}
          font={MONO_FONT}
          fontSize={0.14}
          color={PALETTE.muted}
          anchorX="center"
          anchorY="middle"
          position={[0, 0, 0.2]}
          letterSpacing={0.1}
          renderOrder={10}
        >
          {areaTxt}
        </Text>
      )}
    </group>
  );
}
