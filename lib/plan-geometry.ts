// Geometria compartilhada do plano legado (coordenadas x/y em metros).
// Usada pelo engine, pelo motor de marcenaria e pelos validadores de
// placement — mantida num módulo próprio para evitar imports circulares
// (floor-plan-engine importa millwork-engine, que precisa destes helpers).

import type { FloorPlan, Room, Wall } from "./types";
import { DOOR_APPROACH_DEPTH_M, SNAP_ROOM_GRID_M, TOL_LINE_M } from "./scene/tolerances";
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

// ---------------------------------------------------------------------------
// Corredor de aproximação de porta
//
// Uma porta usável precisa de dois espaços: o quarto-de-disco do GIRO (já
// coberto por door-swing.ts, no lado para onde a folha abre) e o corredor de
// CHEGADA na frente do vão, nos DOIS lados da parede. Era o buraco que
// permitia um guarda-roupa exatamente na boca da porta do banheiro quando o
// giro abria para o outro lado.
// ---------------------------------------------------------------------------

/** Corredor de aproximação de UMA porta, do lado de um cômodo específico. */
export interface DoorApproach {
  /** Retângulo do corredor DENTRO do cômodo consultado (coords de mundo). */
  rect: PlanRect;
  /** Eixo do vão (h = corre em x). */
  axis: "h" | "v";
  /** Lado do cômodo consultado onde a porta está. */
  side: Wall;
  doorId: string;
  /** Intervalo do vão ao longo do eixo, clampado ao span da edge. */
  start: number;
  end: number;
}

/** Corredor de aproximação de UM vão (existente ou hipotético) do lado de
 *  um cômodo. Null quando o vão não cai numa parede deste cômodo. A
 *  profundidade default (DOOR_APPROACH_DEPTH_M) é clampada à metade do
 *  fundo útil — cômodos minúsculos não viram 100% corredor — e medida a
 *  partir da face interna da parede (borda do rect útil). */
export function openingApproach(
  plan: Pick<FloorPlan, "rooms">,
  room: Room,
  iv: OpeningInterval,
  opts?: { depth?: number; doorId?: string }
): DoorApproach | null {
  const usable = usableRect(plan, room);

  // Em qual lado DESTE cômodo essa linha de parede cai?
  let side: Wall | null = null;
  if (iv.axis === "h") {
    if (Math.abs(iv.fixed - room.y) <= SAME_LINE_TOL) side = "north";
    else if (Math.abs(iv.fixed - (room.y + room.height)) <= SAME_LINE_TOL) side = "south";
  } else {
    if (Math.abs(iv.fixed - room.x) <= SAME_LINE_TOL) side = "west";
    else if (Math.abs(iv.fixed - (room.x + room.width)) <= SAME_LINE_TOL) side = "east";
  }
  if (!side) return null;

  // O vão precisa sobrepor o span da edge deste cômodo.
  const lo = iv.axis === "h" ? room.x : room.y;
  const hi = iv.axis === "h" ? room.x + room.width : room.y + room.height;
  const start = Math.max(iv.start, lo);
  const end = Math.min(iv.end, hi);
  if (end - start <= TOL_LINE_M) return null;

  const usableDepth = iv.axis === "h" ? usable.h : usable.w;
  const depth = Math.min(opts?.depth ?? DOOR_APPROACH_DEPTH_M, usableDepth * 0.5);
  if (depth <= TOL_LINE_M) return null;

  const rect: PlanRect =
    side === "north"
      ? { x: start, y: usable.y, w: end - start, h: depth }
      : side === "south"
        ? { x: start, y: usable.y + usable.h - depth, w: end - start, h: depth }
        : side === "west"
          ? { x: usable.x, y: start, w: depth, h: end - start }
          : { x: usable.x + usable.w - depth, y: start, w: depth, h: end - start };

  return { rect, axis: iv.axis, side, doorId: opts?.doorId ?? "(nova)", start, end };
}

/** Corredores de aproximação de todas as portas que tocam as paredes do
 *  cômodo — próprias OU de vizinhos na mesma linha (porta do vizinho com
 *  giro para lá ainda precisa de chegada livre AQUI). */
export function doorApproachRects(
  plan: Pick<FloorPlan, "rooms" | "doors">,
  room: Room
): DoorApproach[] {
  const out: DoorApproach[] = [];
  for (const d of plan.doors ?? []) {
    if (d.silent) continue; // duplicata lógica — o vão real é de outra porta
    const owner = plan.rooms.find((r) => r.id === d.roomId);
    if (!owner) continue;
    const iv = openingInterval(owner, d.wall, d.position ?? 0.5, d.size ?? 0.8);
    const a = openingApproach(plan, room, iv, { doorId: d.id });
    if (a) out.push(a);
  }
  return out;
}

/** Fração da LARGURA do vão coberta pela projeção do móvel — só conta quando
 *  o móvel realmente invade o corredor (interseção de área > 0). É a régua
 *  da regra graduada: ≥50% = porta inutilizada (erro/rejeição); abaixo,
 *  intrusão lateral tolerável (aviso). */
export function doorCoverageFraction(bb: PlanRect, approach: DoorApproach): number {
  if (rectOverlapArea(bb, approach.rect) <= 1e-6) return 0;
  const lo = approach.axis === "h" ? bb.x : bb.y;
  const hi = approach.axis === "h" ? bb.x + bb.w : bb.y + bb.h;
  const covered = Math.min(hi, approach.end) - Math.max(lo, approach.start);
  const span = approach.end - approach.start;
  return span > 1e-6 ? Math.max(0, covered) / span : 0;
}

/** Maior fração de cobertura de vão entre todos os corredores do cômodo —
 *  helper para guardas de tools (move/swap/solver) com a porta culpada. */
export function worstDoorCoverage(
  approaches: DoorApproach[],
  bb: PlanRect
): { fraction: number; approach: DoorApproach | null } {
  let worst: { fraction: number; approach: DoorApproach | null } = {
    fraction: 0,
    approach: null,
  };
  for (const a of approaches) {
    const f = doorCoverageFraction(bb, a);
    if (f > worst.fraction) worst = { fraction: f, approach: a };
  }
  return worst;
}
