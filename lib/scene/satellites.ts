// Física de satélites (cadeira↔mesa): poses derivadas do parceiro.
//
// Vive separado do solver porque é FÍSICA reutilizável — o place_items usa
// para o snap "junto_de", e o engine usa no re-pose quando a mesa move.

import { touchedWalls } from "./placement-validators";
import type { PlanRect } from "../plan-geometry";

export type WallKey = "north" | "south" | "east" | "west";
const WALLS: WallKey[] = ["north", "east", "south", "west"];

const OPP_WALL: Record<WallKey, WallKey> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** Rotação que deixa as COSTAS do glifo contra a parede dada. */
export function rotationForBackWall(wall: WallKey): number {
  switch (wall) {
    case "north": return 0;
    case "south": return 180;
    case "east": return 90;
    case "west": return 270;
  }
}

/** Footprint visual para uma rotação (transpõe em 90/270). */
export function visualSizeFor(
  base: { w: number; h: number },
  rotation: number | undefined
): { w: number; h: number } {
  const rotated = (((rotation ?? 0) % 180) + 180) % 180 === 90;
  return rotated ? { w: base.h, h: base.w } : base;
}

/** Parede de "costas" de um móvel pelo bbox VISUAL: o lado tocado com maior
 *  comprimento de contato; sem contato, o lado mais próximo. */
export function backWallOf(bb: PlanRect, usable: PlanRect): WallKey {
  const t = touchedWalls({ x: bb.x, y: bb.y, w: bb.w, h: bb.h }, usable, 0.1);
  const touched = WALLS.filter((w) => t[w]);
  const contactLen = (w: WallKey) => (w === "north" || w === "south" ? bb.w : bb.h);
  if (touched.length > 0) {
    let back = touched[0];
    for (const w of touched) if (contactLen(w) > contactLen(back)) back = w;
    return back;
  }
  const d: Record<WallKey, number> = {
    north: bb.y - usable.y,
    south: usable.y + usable.h - (bb.y + bb.h),
    west: bb.x - usable.x,
    east: usable.x + usable.w - (bb.x + bb.w),
  };
  return WALLS.reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** Encaixe da cadeira sob o tampo (m). Visível no desenho de propósito —
 *  é como planta de arquiteto representa cadeira em mesa. */
export const SATELLITE_TUCK_M = 0.15;

/** Poses candidatas de um satélite na frente do parceiro: centrado na face
 *  frontal, costas para fora, encaixado SATELLITE_TUCK_M sob o tampo;
 *  desliza ao longo da frente quando o centro está bloqueado. Recebe o
 *  tamanho do GLIFO e devolve bbox VISUAL + rotação. */
export function satellitePoseCandidates(
  partnerBB: PlanRect,
  backWall: WallKey,
  glyphSize: { w: number; h: number },
): Array<{ x: number; y: number; width: number; height: number; rotation: number }> {
  const rot = rotationForBackWall(OPP_WALL[backWall]);
  const size = visualSizeFor(glyphSize, rot);
  const slides = [0, -0.15, 0.15, -0.3, 0.3];
  const out: Array<{ x: number; y: number; width: number; height: number; rotation: number }> = [];
  for (const s of slides) {
    let x: number;
    let y: number;
    if (backWall === "north") {
      x = partnerBB.x + partnerBB.w / 2 - size.w / 2 + s;
      y = partnerBB.y + partnerBB.h - SATELLITE_TUCK_M;
    } else if (backWall === "south") {
      x = partnerBB.x + partnerBB.w / 2 - size.w / 2 + s;
      y = partnerBB.y - size.h + SATELLITE_TUCK_M;
    } else if (backWall === "west") {
      x = partnerBB.x + partnerBB.w - SATELLITE_TUCK_M;
      y = partnerBB.y + partnerBB.h / 2 - size.h / 2 + s;
    } else {
      x = partnerBB.x - size.w + SATELLITE_TUCK_M;
      y = partnerBB.y + partnerBB.h / 2 - size.h / 2 + s;
    }
    out.push({ x, y, width: size.w, height: size.h, rotation: rot });
  }
  return out;
}
