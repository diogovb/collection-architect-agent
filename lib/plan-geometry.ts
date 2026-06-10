// Geometria compartilhada do plano legado (coordenadas x/y em metros).
// Usada pelo engine, pelo motor de marcenaria e pelos validadores de
// placement — mantida num módulo próprio para evitar imports circulares
// (floor-plan-engine importa millwork-engine, que precisa destes helpers).

import type { FloorPlan, Room, Wall } from "./types";
import { SNAP_ROOM_GRID_M, TOL_LINE_M } from "./scene/tolerances";
import {
  EXTERNAL_WALL_THICKNESS_M,
  INTERNAL_WALL_THICKNESS_M,
  RAILING_THICKNESS_M,
} from "./scene/wall-constants";

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

/** Distância de relação ergonômica entre dois retângulos: borda-a-borda
 *  para relações de ADJACÊNCIA (maxDist ≤ 1 m — criado↔cama, cadeira↔mesa;
 *  centro-a-centro é insatisfazível com peças grandes), centro-a-centro
 *  para distâncias de USO (sofá↔TV, triângulo de cozinha). */
export function relationDistance(
  rel: { maxDist: number },
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  if (rel.maxDist <= 1.0) {
    const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    return Math.hypot(dx, dy);
  }
  return Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
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

// ---------------------------------------------------------------------------
// Área útil (Fase 1 do overhaul espacial)
//
// As paredes são desenhadas CENTRADAS nas bordas do retângulo do cômodo, então
// a face interna avança espessura/2 para dentro. "Encostado na parede" tem que
// significar encostado na FACE INTERNA — sem este desconto, todo móvel flush
// invadia a faixa da parede no desenho.
// ---------------------------------------------------------------------------

const snapC = (n: number): number => Math.round(n / SNAP_ROOM_GRID_M) * SNAP_ROOM_GRID_M;

/** Inset (m) que a parede de um lado come para dentro do retângulo do cômodo.
 *  0 quando o lado está aberto (openWalls, próprio ou do vizinho) ou o cômodo
 *  é exterior; INTERNAL/2 quando um vizinho não-exterior cobre o lado inteiro;
 *  EXTERNAL/2 caso contrário (lado misto recebe o inset conservador maior).
 *  Varandas usam guarda-corpo fino (RAILING/2) nos lados externos. */
export function wallInset(plan: Pick<FloorPlan, "rooms">, room: Room, side: Wall): number {
  if (room.isExterior) return 0;
  if (room.openWalls?.includes(side)) return 0;

  // Edge deste lado, snapada na MESMA grade de 5 cm da migração (senão a
  // detecção de vizinho diverge do sweep que gera as paredes).
  const horizontal = side === "north" || side === "south";
  const fixed = snapC(
    side === "north" ? room.y :
    side === "south" ? room.y + room.height :
    side === "west" ? room.x :
    room.x + room.width
  );
  const lo = snapC(horizontal ? room.x : room.y);
  const hi = snapC(horizontal ? room.x + room.width : room.y + room.height);
  const sideLen = hi - lo;

  const OPP: Record<Wall, Wall> = { north: "south", south: "north", east: "west", west: "east" };
  let covered = 0;
  let openCovered = 0;
  for (const r of plan.rooms) {
    if (r.id === room.id || r.isExterior) continue;
    const nFixed = snapC(
      side === "north" ? r.y + r.height :
      side === "south" ? r.y :
      side === "west" ? r.x + r.width :
      r.x
    );
    if (Math.abs(nFixed - fixed) > TOL_LINE_M) continue;
    const nLo = snapC(horizontal ? r.x : r.y);
    const nHi = snapC(horizontal ? r.x + r.width : r.y + r.height);
    const overlap = Math.min(hi, nHi) - Math.max(lo, nLo);
    if (overlap <= TOL_LINE_M) continue;
    covered += overlap;
    if (r.openWalls?.includes(OPP[side])) openCovered += overlap;
  }

  if (covered >= sideLen - TOL_LINE_M) {
    // Lado inteiramente compartilhado com vizinho(s).
    if (openCovered >= sideLen - TOL_LINE_M) return 0; // vizinho abriu a parede
    return INTERNAL_WALL_THICKNESS_M / 2;
  }
  // Algum trecho externo neste lado → inset externo (conservador p/ misto).
  if (room.isBalcony) return RAILING_THICKNESS_M / 2;
  return EXTERNAL_WALL_THICKNESS_M / 2;
}

/** Retângulo útil do cômodo: o retângulo legado descontando a meia-espessura
 *  de parede de cada lado. Todo placement/clamp/anchoring deve operar nele. */
export function usableRect(plan: Pick<FloorPlan, "rooms">, room: Room): PlanRect {
  const n = wallInset(plan, room, "north");
  const s = wallInset(plan, room, "south");
  const w = wallInset(plan, room, "west");
  const e = wallInset(plan, room, "east");
  return {
    x: room.x + w,
    y: room.y + n,
    w: Math.max(0, room.width - w - e),
    h: Math.max(0, room.height - n - s),
  };
}
