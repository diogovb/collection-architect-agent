// Geometria compartilhada do plano legado (coordenadas x/y em metros).
// Usada pelo engine, pelo motor de marcenaria e pelos validadores de
// placement — mantida num módulo próprio para evitar imports circulares
// (floor-plan-engine importa millwork-engine, que precisa destes helpers).

import type { Room, Wall } from "./types";

export interface PlanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** AABB visual de um móvel considerando rotação (graus). O bbox armazenado
 *  guarda as dimensões do glifo SEM rotação; o renderer aplica a rotação em
 *  torno do centro do bbox. Para 90°/270° o footprint visível é o transposto
 *  preservando o centro — TODA colisão/validação deve usar este AABB, senão
 *  o footprint de colisão diverge do desenhado. */
export function worldAABB(f: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}): PlanRect {
  const rot = (((f.rotation ?? 0) % 180) + 180) % 180;
  if (Math.abs(rot - 90) < 1) {
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    return { x: cx - f.height / 2, y: cy - f.width / 2, w: f.height, h: f.width };
  }
  return { x: f.x, y: f.y, w: f.width, h: f.height };
}

/** Área de interseção entre dois retângulos alinhados aos eixos (m²). */
export function rectOverlapArea(a: PlanRect, b: PlanRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Intervalo 1D de uma abertura (porta/janela/bancada) na linha da parede.
 *  `axis: "h"` corre em x com `fixed = y`; `axis: "v"` corre em y. */
export interface OpeningInterval {
  axis: "h" | "v";
  fixed: number;
  start: number;
  end: number;
}

export function openingInterval(
  room: Pick<Room, "x" | "y" | "width" | "height">,
  wall: Wall,
  position: number,
  size: number
): OpeningInterval {
  const half = size / 2;
  if (wall === "north" || wall === "south") {
    const center = room.x + position * room.width;
    return {
      axis: "h",
      fixed: wall === "north" ? room.y : room.y + room.height,
      start: center - half,
      end: center + half,
    };
  }
  const center = room.y + position * room.height;
  return {
    axis: "v",
    fixed: wall === "west" ? room.x : room.x + room.width,
    start: center - half,
    end: center + half,
  };
}

/** Span de um run de marcenaria na linha da parede (mesma convenção). */
export function spanInterval(
  room: Pick<Room, "x" | "y" | "width" | "height">,
  wall: Wall,
  startOffset: number,
  length: number
): OpeningInterval {
  if (wall === "north" || wall === "south") {
    return {
      axis: "h",
      fixed: wall === "north" ? room.y : room.y + room.height,
      start: room.x + startOffset,
      end: room.x + startOffset + length,
    };
  }
  return {
    axis: "v",
    fixed: wall === "west" ? room.x : room.x + room.width,
    start: room.y + startOffset,
    end: room.y + startOffset + length,
  };
}

/** Tolerância de "mesma linha de parede": cômodos adjacentes compartilham a
 *  aresta exatamente, mas deixamos folga para paredes quase coincidentes. */
const SAME_LINE_TOL = 0.075;

/** Sobreposição 1D entre dois intervalos na MESMA linha de parede.
 *  Retorna o comprimento sobreposto (0 quando não colidem ou não estão
 *  na mesma linha). `inset` perdoa contatos de borda. */
export function openingsOverlap1D(
  a: OpeningInterval,
  b: OpeningInterval,
  inset = 0.01
): number {
  if (a.axis !== b.axis) return 0;
  if (Math.abs(a.fixed - b.fixed) > SAME_LINE_TOL) return 0;
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return overlap > inset ? overlap : 0;
}

/** Nome da parede em PT-BR para mensagens ao agente/usuário. */
export function wallSideLabel(wall: Wall): string {
  switch (wall) {
    case "north": return "norte";
    case "south": return "sul";
    case "east": return "leste";
    case "west": return "oeste";
  }
}
