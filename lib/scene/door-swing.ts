// Geometria do arco de abertura de porta (Capacidades B + D).
//
// Uma porta aberta varre um quarto de disco: ápice na dobradiça H, raio =
// largura da folha, limitado pelos vetores unitários `u` (da dobradiça em
// direção à outra borda do vão, ao longo da parede) e `v` (perpendicular à
// parede, no lado para onde a folha abre). Este módulo fornece:
//   - a geometria do quarto de disco para portas legadas (coords x/y) e de
//     cena (coords x/z mapeadas para x/y pelo chamador);
//   - o teste exato quarto-de-disco × retângulo;
//   - a heurística de dobradiça/sentido usada pelo add_door.
//
// O mesmo quarto de disco alimenta 3 consumidores: a heurística do add_door,
// o validateDoorClearance do placement e o validador DOOR_SWING_BLOCKED.

import type { Door, Furniture, Room, Wall } from "../types";
import { worldAABB, type PlanRect } from "../plan-geometry";

export interface Pt {
  x: number;
  y: number;
}

export interface SwingGeometry {
  /** Ponto da dobradiça (na linha da parede). */
  hinge: Pt;
  /** Unitário da dobradiça em direção à outra borda do vão. */
  u: Pt;
  /** Unitário perpendicular à parede, no lado da abertura. */
  v: Pt;
  /** Raio = largura da folha (m). */
  radius: number;
}

export type LegacyHinge = "near" | "far";
export type LegacySwing = "in" | "out";

/** Geometria do quarto de disco para uma porta legada (cômodo retangular).
 *  Convenção de orientação da parede: north/south correm em +x; west/east
 *  correm em +y. "near" = borda do vão mais próxima do início da parede. */
export function legacySwingGeometry(
  room: Pick<Room, "x" | "y" | "width" | "height">,
  wall: Wall,
  position: number,
  size: number,
  hinge: LegacyHinge,
  swing: LegacySwing
): SwingGeometry {
  const horizontal = wall === "north" || wall === "south";
  const wallLen = horizontal ? room.width : room.height;
  const centerAlong = position * wallLen;
  const hingeAlong = hinge === "near" ? centerAlong - size / 2 : centerAlong + size / 2;
  const uSign = hinge === "near" ? 1 : -1;

  // Vetor "para dentro do cômodo" por parede.
  const inward: Pt =
    wall === "north" ? { x: 0, y: 1 } :
    wall === "south" ? { x: 0, y: -1 } :
    wall === "west" ? { x: 1, y: 0 } :
    { x: -1, y: 0 };
  const v: Pt = swing === "in" ? inward : { x: -inward.x, y: -inward.y };

  if (horizontal) {
    return {
      hinge: { x: room.x + hingeAlong, y: wall === "north" ? room.y : room.y + room.height },
      u: { x: uSign, y: 0 },
      v,
      radius: size,
    };
  }
  return {
    hinge: { x: wall === "west" ? room.x : room.x + room.width, y: room.y + hingeAlong },
    u: { x: 0, y: uSign },
    v,
    radius: size,
  };
}

function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

function segmentIntersectsRect(a: Pt, b: Pt, r: PlanRect): boolean {
  // Trivial accept: either endpoint inside.
  const inside = (p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (inside(a) || inside(b)) return true;
  // Liang-Barsky clip.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.x) &&
    clip(dx, r.x + r.w - a.x) &&
    clip(-dy, a.y - r.y) &&
    clip(dy, r.y + r.h - a.y)
  );
}

/** Teste exato (com amostragem do arco por segurança numérica) de interseção
 *  entre o quarto de disco e um retângulo alinhado aos eixos. */
export function quarterDiscIntersectsRect(g: SwingGeometry, rect: PlanRect): boolean {
  const { hinge: H, u, v, radius: r } = g;
  const EPS = 1e-9;
  // (a) Ápice dentro do retângulo — a região tem área positiva junto a H.
  if (H.x >= rect.x && H.x <= rect.x + rect.w && H.y >= rect.y && H.y <= rect.y + rect.h) {
    return true;
  }
  // (b) Ponto do retângulo mais próximo de H dentro do cone e do raio.
  const q: Pt = {
    x: Math.max(rect.x, Math.min(rect.x + rect.w, H.x)),
    y: Math.max(rect.y, Math.min(rect.y + rect.h, H.y)),
  };
  const dq: Pt = { x: q.x - H.x, y: q.y - H.y };
  const distQ = Math.hypot(dq.x, dq.y);
  if (distQ <= r + EPS && dot(dq, u) >= -EPS && dot(dq, v) >= -EPS) return true;
  // (c) Bordas retas do setor cruzando o retângulo.
  const uEnd: Pt = { x: H.x + u.x * r, y: H.y + u.y * r };
  const vEnd: Pt = { x: H.x + v.x * r, y: H.y + v.y * r };
  if (segmentIntersectsRect(H, uEnd, rect)) return true;
  if (segmentIntersectsRect(H, vEnd, rect)) return true;
  // (d) Amostragem do arco (cobre o caso do retângulo cruzando só a borda
  //     curva). 8 amostras em 90° = passo de ~12,8° — folga suficiente para
  //     móveis com lados >= 20 cm.
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    const p: Pt = {
      x: H.x + (u.x * Math.cos(t) + v.x * Math.sin(t)) * r,
      y: H.y + (u.y * Math.cos(t) + v.y * Math.sin(t)) * r,
    };
    if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
      return true;
    }
  }
  return false;
}

/** True quando o arco da porta colide com algum móvel da lista (AABBs visuais,
 *  ignorando tapetes e dispositivos pontuais). */
export function swingBlockedBy(
  g: SwingGeometry,
  furniture: Furniture[],
): Furniture | null {
  for (const f of furniture) {
    if (/^rug|carpet|mat/i.test(f.type)) continue;
    if (/light|outlet|switch/.test(f.type)) continue;
    if (quarterDiscIntersectsRect(g, worldAABB(f))) return f;
  }
  return null;
}

export interface SwingChoice {
  hinge: LegacyHinge;
  swing: LegacySwing;
  /** Móvel que continua bloqueando quando nenhuma alternativa ficou livre. */
  blockedBy?: string;
}

/** Heurística do add_door: dobradiça no lado mais próximo do fim da parede
 *  (a folha aberta descansa contra a parede perpendicular vizinha), abrindo
 *  para dentro. Se o arco colidir com móveis, tenta inverter a dobradiça,
 *  depois abrir para fora (testando os móveis do cômodo vizinho); se nada
 *  liberar, mantém o padrão e deixa o validador avisar. */
export function chooseDoorSwing(
  room: Room,
  wall: Wall,
  position: number,
  size: number,
  ownRoomFurniture: Furniture[],
  neighborFurniture: Furniture[],
): SwingChoice {
  const hinge0: LegacyHinge = position <= 0.5 ? "near" : "far";
  const hinge1: LegacyHinge = hinge0 === "near" ? "far" : "near";
  const candidates: Array<{ hinge: LegacyHinge; swing: LegacySwing }> = [
    { hinge: hinge0, swing: "in" },
    { hinge: hinge1, swing: "in" },
    { hinge: hinge0, swing: "out" },
    { hinge: hinge1, swing: "out" },
  ];
  let firstBlocker: Furniture | null = null;
  for (const c of candidates) {
    const g = legacySwingGeometry(room, wall, position, size, c.hinge, c.swing);
    const pool = c.swing === "in" ? ownRoomFurniture : neighborFurniture;
    const blocker = swingBlockedBy(g, pool);
    if (!blocker) return c;
    if (!firstBlocker) firstBlocker = blocker;
  }
  return { hinge: hinge0, swing: "in", blockedBy: firstBlocker?.label };
}

/** Geometria do quarto de disco para um DoorNode da cena. As coordenadas da
 *  cena são (x, z); devolvemos Pt com y = z para reutilizar o mesmo teste.
 *  Convenções do DoorSvg: hingeSide "start" = borda do vão com menor offset;
 *  swingDirection "in" = lado +perp da parede (perp = (-dz, dx)). */
export function sceneSwingGeometry(
  wallStart: { x: number; z: number },
  wallEnd: { x: number; z: number },
  offset: number,
  width: number,
  hingeSide: "start" | "end",
  swingDirection: "in" | "out"
): SwingGeometry {
  const len = Math.hypot(wallEnd.x - wallStart.x, wallEnd.z - wallStart.z) || 1;
  const dir = { x: (wallEnd.x - wallStart.x) / len, y: (wallEnd.z - wallStart.z) / len };
  const perp = { x: -dir.y, y: dir.x };
  const hingeAlong = hingeSide === "start" ? offset - width / 2 : offset + width / 2;
  const uSign = hingeSide === "start" ? 1 : -1;
  const vSign = swingDirection === "in" ? 1 : -1;
  return {
    hinge: { x: wallStart.x + dir.x * hingeAlong, y: wallStart.z + dir.y * hingeAlong },
    u: { x: dir.x * uSign, y: dir.y * uSign },
    v: { x: perp.x * vSign, y: perp.y * vSign },
    radius: width,
  };
}
