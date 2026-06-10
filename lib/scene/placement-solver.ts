// Generative placement solver v2 (overhaul de raciocínio espacial).
//
// O v1 era first-fit: tentava a âncora pedida e caía numa lista fixa de
// fallbacks, distribuindo itens em slots iguais SEM olhar portas/janelas.
// Resultado: guarda-roupa em cima do vão, mesa no centro morto do cômodo.
//
// O v2 GERA candidatos (paredes × sub-vãos livres × posições + cantos +
// centro), FILTRA com restrições duras (cabe na área útil, sem overlap,
// validatePlacement) e PONTUA com critérios de arquiteto:
//   - fidelidade à âncora pedida pelo modelo (dominante: intenção explícita)
//   - afinidade com janela (escrivaninha puxa pro vão; cabeceira foge dele)
//   - parede sólida para peças de "costas" (cama, armário)
//   - distância da porta (armário longe; nada colado no vão)
//   - relações ergonômicas no range (criado↔cama, sofá↔TV, cadeira↔mesa)
//   - keep-out do centro: item sólido sem âncora `center` não para no meio
//   - centragem estética no sub-vão
// Rotação automática: peças com `wallFace: "back"` giram para a parede
// ancorada quando o modelo não passou rotação explícita.
//
// API pública compatível com o v1: solvePlacement / formatSolverResult;
// `PlacementIntent.anchor` agora é OPCIONAL (omitido = o scorer escolhe;
// o schema da tool continua exigindo anchor — só os templates omitem).

import type { Door, FloorPlan, Furniture, FurnitureType, Room, Window } from "../types";
import { FURN_DEFS } from "../furniture-svgs";
import { getPlacement } from "../furniture-placement";
import { validatePlacement, summarizeRoomLayout, touchedWalls } from "./placement-validators";
import {
  openingInterval,
  openingsOverlap1D,
  relationDistance,
  usableRect,
  worldAABB,
  type OpeningInterval,
  type PlanRect,
} from "../plan-geometry";
import { TOL_CONTACT_M } from "./tolerances";

export type Anchor =
  | "wall:north"
  | "wall:south"
  | "wall:east"
  | "wall:west"
  | "corner:NW"
  | "corner:NE"
  | "corner:SW"
  | "corner:SE"
  | "center"
  | "free";

export interface PlacementIntent {
  type: FurnitureType;
  label?: string;
  /** Âncora semântica. Omitida = automática (o scorer escolhe a melhor
   *  parede/canto). A tool place_furniture_intent continua exigindo. */
  anchor?: Anchor;
  /** Position along the anchored wall when anchor is `wall:*`. */
  position?: "start" | "mid" | "end";
  /** Optional rotation override (degrees, multiples of 90). */
  rotation?: number;
  /** Variantes tentadas NA MESMA VAGA quando o tipo principal não couber
   *  (ex.: wardrobe_hinged → wardrobe_sliding, que exige menos folga
   *  frontal). Resolvidas in-loop — antes dos itens seguintes ocuparem as
   *  paredes. */
  fallbackTypes?: FurnitureType[];
  /** Backtrack: itens com boost são resolvidos ANTES de tudo. Usado pela
   *  segunda rodada do template quando um item obrigatório não coube na
   *  ordem gulosa (ex.: armário de 2,5m precisa escolher a parede antes da
   *  cama fechar as opções). */
  priorityBoost?: boolean;
}

export interface SolverInput {
  room: Room;
  items: PlacementIntent[];
  plan: FloorPlan;
}

export interface SolvedItem {
  intent: PlacementIntent;
  /** Absolute position in plan coords (top-left do bbox VISUAL). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotação efetiva (explícita ou automática), graus. */
  rotation?: number;
}

export interface SolverOutput {
  ok: boolean;
  solved: SolvedItem[];
  failed: Array<{ intent: PlacementIntent; reason: string }>;
}

type WallKey = "north" | "south" | "east" | "west";
const WALLS: WallKey[] = ["north", "east", "south", "west"];

interface Candidate {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Parede ancorada (undefined para center/free/corner sem parede dominante). */
  wall?: WallKey;
  kind: "wall" | "corner" | "center" | "free";
  corner?: "NW" | "NE" | "SW" | "SE";
  position?: "start" | "mid" | "end";
  /** Centro do sub-vão usado (para o bônus de centragem). */
  spanCenterDist?: number;
  spanLen?: number;
}

/** Vão útil 1D de uma parede (coordenada ao longo da parede, em mundo). */
function wallRange(usable: PlanRect, wall: WallKey): { lo: number; hi: number } {
  return wall === "north" || wall === "south"
    ? { lo: usable.x, hi: usable.x + usable.w }
    : { lo: usable.y, hi: usable.y + usable.h };
}

/** Sub-vãos livres de uma parede: vão útil − portas − móveis já encostados. */
function freeSubSpans(
  usable: PlanRect,
  room: Room,
  wall: WallKey,
  doors: Door[],
  flushFurniture: Furniture[],
): Array<{ lo: number; hi: number }> {
  const { lo, hi } = wallRange(usable, wall);
  const blocked: Array<{ lo: number; hi: number }> = [];
  for (const d of doors) {
    if (d.roomId !== room.id || d.wall !== wall) continue;
    const di = openingInterval(room, d.wall, d.position, d.size);
    blocked.push({ lo: di.start - 0.05, hi: di.end + 0.05 });
  }
  for (const f of flushFurniture) {
    const bb = worldAABB(f);
    const t = touchedWalls({ x: bb.x, y: bb.y, w: bb.w, h: bb.h }, usable);
    if (!t[wall]) continue;
    blocked.push(
      wall === "north" || wall === "south"
        ? { lo: bb.x, hi: bb.x + bb.w }
        : { lo: bb.y, hi: bb.y + bb.h }
    );
  }
  blocked.sort((a, b) => a.lo - b.lo);
  const spans: Array<{ lo: number; hi: number }> = [];
  let cursor = lo;
  for (const b of blocked) {
    if (b.lo > cursor + TOL_CONTACT_M) spans.push({ lo: cursor, hi: Math.min(b.lo, hi) });
    cursor = Math.max(cursor, b.hi);
    if (cursor >= hi) break;
  }
  if (cursor < hi - TOL_CONTACT_M) spans.push({ lo: cursor, hi });
  return spans;
}

/** Bbox de um candidato encostado numa parede, com o centro ao longo dela. */
function wallCandidateBbox(
  usable: PlanRect,
  wall: WallKey,
  centerAlong: number,
  size: { w: number; h: number },
): { x: number; y: number; width: number; height: number } {
  if (wall === "north") {
    return { x: centerAlong - size.w / 2, y: usable.y, width: size.w, height: size.h };
  }
  if (wall === "south") {
    return { x: centerAlong - size.w / 2, y: usable.y + usable.h - size.h, width: size.w, height: size.h };
  }
  if (wall === "west") {
    return { x: usable.x, y: centerAlong - size.h / 2, width: size.w, height: size.h };
  }
  return { x: usable.x + usable.w - size.w, y: centerAlong - size.h / 2, width: size.w, height: size.h };
}

/** Tamanho do item AO LONGO da parede. */
function alongSize(wall: WallKey, size: { w: number; h: number }): number {
  return wall === "north" || wall === "south" ? size.w : size.h;
}

/** Rotação automática: costas do glifo (topo) contra a parede ancorada. */
function autoRotationFor(wall: WallKey | undefined): number | undefined {
  switch (wall) {
    case "north": return 0;
    case "south": return 180;
    case "east": return 90;
    case "west": return 270;
    default: return undefined;
  }
}

/** Footprint visual para uma rotação (transpõe em 90/270). */
function visualSize(base: { w: number; h: number }, rotation: number | undefined): { w: number; h: number } {
  const rotated = (((rotation ?? 0) % 180) + 180) % 180 === 90;
  return rotated ? { w: base.h, h: base.w } : base;
}

function intervalOnWall(
  bbox: { x: number; y: number; width: number; height: number },
  wall: WallKey,
  room: Room,
): OpeningInterval {
  const horizontal = wall === "north" || wall === "south";
  return {
    axis: horizontal ? "h" : "v",
    fixed: wall === "north" ? room.y : wall === "south" ? room.y + room.height : wall === "west" ? room.x : room.x + room.width,
    start: horizontal ? bbox.x : bbox.y,
    end: horizontal ? bbox.x + bbox.width : bbox.y + bbox.height,
  };
}

const CATEGORY_RANK: Record<string, number> = {
  anchor: 0,
  appliance: 1,
  sanitary: 1,
  filler: 2,
  decor: 3,
  rug: 4,
};

/** Sub-ordem dentro do mesmo rank: camas primeiro (são A peça-âncora do
 *  cômodo), depois itens que dependem da janela (escrivaninha precisa do
 *  vão antes que o armário tome a parede), depois o resto por área. */
function subRank(type: FurnitureType, windowAffinity?: string): number {
  if (/^bed|^crib/.test(String(type))) return 0;
  if (windowAffinity === "prefer") return 1;
  return 2;
}

export function solvePlacement(input: SolverInput): SolverOutput {
  const { room, items, plan } = input;
  const solved: SolvedItem[] = [];
  const failed: SolverOutput["failed"] = [];

  const workingPlan: FloorPlan = JSON.parse(JSON.stringify(plan));
  const usable = usableRect(workingPlan, room);
  const roomDoors = workingPlan.doors.filter((d) => d.roomId === room.id);
  const roomWindows = workingPlan.windows.filter((w) => w.roomId === room.id);
  const wallHasOpening = (wall: WallKey): boolean =>
    roomDoors.some((d) => d.wall === wall) || roomWindows.some((w) => w.wall === wall);
  const doorCenters = roomDoors.map((d) => {
    const di = openingInterval(room, d.wall, d.position, d.size);
    const mid = (di.start + di.end) / 2;
    return d.wall === "north" ? { x: mid, y: room.y }
      : d.wall === "south" ? { x: mid, y: room.y + room.height }
      : d.wall === "west" ? { x: room.x, y: mid }
      : { x: room.x + room.width, y: mid };
  });
  const halfDiagonal = Math.hypot(room.width, room.height) / 2;

  // Ordena: camas primeiro, depois itens janela-dependentes, depois âncoras
  // grandes (as relações precisam do parceiro já posicionado).
  const ordered = items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      const ba = a.it.priorityBoost ? 0 : 1;
      const bbst = b.it.priorityBoost ? 0 : 1;
      if (ba !== bbst) return ba - bbst;
      const pa = getPlacement(a.it.type);
      const pb = getPlacement(b.it.type);
      const ra = CATEGORY_RANK[pa.category] ?? 2;
      const rb = CATEGORY_RANK[pb.category] ?? 2;
      if (ra !== rb) return ra - rb;
      const sa = subRank(a.it.type, pa.windowAffinity);
      const sb = subRank(b.it.type, pb.windowAffinity);
      if (sa !== sb) return sa - sb;
      const da = FURN_DEFS[a.it.type]?.sizeM ?? { w: 0, h: 0 };
      const db = FURN_DEFS[b.it.type]?.sizeM ?? { w: 0, h: 0 };
      return db.w * db.h - da.w * da.h || a.idx - b.idx;
    })
    .map((e) => e.it);

  for (const original of ordered) {
    // Fallback in-loop: tenta o tipo principal e depois as variantes NA
    // MESMA vaga — antes que os itens seguintes ocupem as paredes.
    const typeChain: FurnitureType[] = [original.type, ...(original.fallbackTypes ?? [])];
    let placedAny = false;
    let firstFailReason = "";
    for (const tryType of typeChain) {
      const it: PlacementIntent = { ...original, type: tryType };
      const def = FURN_DEFS[it.type];
      if (!def) {
        if (!firstFailReason) firstFailReason = `tipo desconhecido: ${it.type}`;
        continue;
      }
      const placement = getPlacement(it.type);
      const label = it.label ?? def.label;

    // ---------- geração de candidatos ----------
    const flush = workingPlan.furniture.filter((f) => f.roomId === room.id);
    const candidates: Array<Candidate & { rotation?: number }> = [];

    const pushWallCandidates = (wall: WallKey) => {
      const rot = it.rotation ?? (placement.wallFace === "back" ? autoRotationFor(wall) : undefined);
      const size = visualSize(def.sizeM, rot);
      const along = alongSize(wall, size);
      const spans = freeSubSpans(usable, room, wall, roomDoors, flush)
        .filter((s) => s.hi - s.lo >= along - TOL_CONTACT_M)
        .sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))
        .slice(0, 4);
      for (const span of spans) {
        const centers = new Set<number>();
        const posOf = new Map<number, "start" | "mid" | "end">();
        const add = (c: number, p: "start" | "mid" | "end") => {
          const clamped = Math.max(span.lo + along / 2, Math.min(span.hi - along / 2, c));
          const key = Math.round(clamped * 100) / 100;
          if (!centers.has(key)) {
            centers.add(key);
            posOf.set(key, p);
          }
        };
        add(span.lo + along / 2, "start");
        add((span.lo + span.hi) / 2, "mid");
        add(span.hi - along / 2, "end");
        // Candidato centrado na janela (escrivaninha sob o vão).
        if (placement.windowAffinity === "prefer") {
          for (const w of roomWindows) {
            if (w.wall !== wall) continue;
            const wi = openingInterval(room, w.wall, w.position, w.size);
            add((wi.start + wi.end) / 2, "mid");
          }
        }
        for (const key of centers) {
          const bb = wallCandidateBbox(usable, wall, key, size);
          candidates.push({
            ...bb,
            wall,
            kind: "wall",
            position: posOf.get(key),
            spanCenterDist: Math.abs(key - (span.lo + span.hi) / 2),
            spanLen: span.hi - span.lo,
            ...(rot !== undefined ? { rotation: rot } : {}),
          });
        }
      }
    };

    const pushCornerCandidates = () => {
      const corners: Array<{ name: "NW" | "NE" | "SW" | "SE"; walls: [WallKey, WallKey] }> = [
        { name: "NW", walls: ["north", "west"] },
        { name: "NE", walls: ["north", "east"] },
        { name: "SW", walls: ["south", "west"] },
        { name: "SE", walls: ["south", "east"] },
      ];
      for (const c of corners) {
        const backs: Array<WallKey | undefined> =
          placement.wallFace === "back" && it.rotation === undefined ? [c.walls[0], c.walls[1]] : [undefined];
        for (const back of backs) {
          const rot = it.rotation ?? (back ? autoRotationFor(back) : undefined);
          const size = visualSize(def.sizeM, rot);
          if (size.w > usable.w + TOL_CONTACT_M || size.h > usable.h + TOL_CONTACT_M) continue;
          const x = c.name === "NW" || c.name === "SW" ? usable.x : usable.x + usable.w - size.w;
          const y = c.name === "NW" || c.name === "NE" ? usable.y : usable.y + usable.h - size.h;
          candidates.push({
            x, y, width: size.w, height: size.h,
            kind: "corner",
            corner: c.name,
            wall: back,
            ...(rot !== undefined ? { rotation: rot } : {}),
          });
        }
      }
    };

    const pushCenterFree = () => {
      const size = visualSize(def.sizeM, it.rotation);
      if (size.w > usable.w + TOL_CONTACT_M || size.h > usable.h + TOL_CONTACT_M) return;
      candidates.push({
        x: usable.x + (usable.w - size.w) / 2,
        y: usable.y + (usable.h - size.h) / 2,
        width: size.w,
        height: size.h,
        kind: "center",
        ...(it.rotation !== undefined ? { rotation: it.rotation } : {}),
      });
    };

    if (it.anchor === "center" || it.anchor === "free") {
      pushCenterFree();
      // free também tenta paredes/cantos como alternativa
      if (it.anchor === "free") {
        for (const w of WALLS) pushWallCandidates(w);
        pushCornerCandidates();
      }
    } else if (it.anchor?.startsWith("wall:")) {
      const requested = it.anchor.slice(5) as WallKey;
      pushWallCandidates(requested);
      for (const w of WALLS) if (w !== requested) pushWallCandidates(w);
      pushCornerCandidates();
      pushCenterFree();
    } else if (it.anchor?.startsWith("corner:")) {
      pushCornerCandidates();
      for (const w of WALLS) pushWallCandidates(w);
      pushCenterFree();
    } else {
      // automático (templates): tudo, o scorer decide
      for (const w of WALLS) pushWallCandidates(w);
      pushCornerCandidates();
      pushCenterFree();
    }

    // ---------- filtros duros + pontuação ----------
    let best: { cand: Candidate & { rotation?: number }; score: number } | null = null;
    let lastReason = "nenhum candidato gerado (cômodo pequeno demais para o item?)";

    for (const cand of candidates) {
      // cabe na área útil
      if (
        cand.x < usable.x - TOL_CONTACT_M ||
        cand.y < usable.y - TOL_CONTACT_M ||
        cand.x + cand.width > usable.x + usable.w + TOL_CONTACT_M ||
        cand.y + cand.height > usable.y + usable.h + TOL_CONTACT_M
      ) {
        lastReason = `não cabe na área útil (${usable.w.toFixed(2)}×${usable.h.toFixed(2)}m)`;
        continue;
      }
      // overlap com móveis existentes (o v1 NÃO checava — itens empilhavam)
      if (placement.category !== "rug" && placement.category !== "decor") {
        const conflict = flush.find((f) => {
          const fp = getPlacement(f.type);
          if (fp.category === "rug" || fp.category === "decor") return false;
          const fb = worldAABB(f);
          return (
            fb.x + fb.w - TOL_CONTACT_M > cand.x &&
            fb.x + TOL_CONTACT_M < cand.x + cand.width &&
            fb.y + fb.h - TOL_CONTACT_M > cand.y &&
            fb.y + TOL_CONTACT_M < cand.y + cand.height
          );
        });
        if (conflict) {
          lastReason = `sobrepõe ${conflict.label}`;
          continue;
        }
      }
      // validadores ricos (arco de porta, âncora, clearance)
      const check = validatePlacement(
        { type: it.type, x: cand.x, y: cand.y, width: cand.width, height: cand.height, label },
        room,
        workingPlan,
      );
      if (!check.ok) {
        lastReason = check.reason ?? "rejeitado pelos validadores";
        continue;
      }

      // ---------- score ----------
      let score = 0;
      // fidelidade à âncora pedida
      if (it.anchor) {
        if (it.anchor.startsWith("wall:")) {
          const requested = it.anchor.slice(5) as WallKey;
          if (cand.kind === "wall" && cand.wall === requested) {
            score += it.position === undefined || cand.position === it.position ? 30 : 20;
          } else if (cand.kind === "wall") score += 8;
        } else if (it.anchor.startsWith("corner:")) {
          const requested = it.anchor.slice(7);
          if (cand.kind === "corner" && cand.corner === requested) score += 30;
          else if (cand.kind === "corner") score += 8;
        } else if (it.anchor === "center" && cand.kind === "center") score += 30;
        else if (it.anchor === "free") score += cand.kind === "free" || cand.kind === "center" ? 10 : 0;
      }
      // afinidade com janela
      if (cand.wall) {
        const candInterval = intervalOnWall(cand, cand.wall, room);
        for (const w of roomWindows) {
          if (w.wall !== cand.wall) continue;
          const wi = openingInterval(room, w.wall, w.position, w.size);
          if (placement.windowAffinity === "prefer") {
            const wCenter = (wi.start + wi.end) / 2;
            const cCenter = (candInterval.start + candInterval.end) / 2;
            const d = Math.abs(wCenter - cCenter);
            score += 18 * Math.max(0, 1 - Math.max(0, d - 0.3) / 1.7);
          } else if (placement.windowAffinity === "avoid") {
            const ov = openingsOverlap1D(candInterval, wi, 0);
            const frac = ov / Math.max(0.01, candInterval.end - candInterval.start);
            score -= 25 * frac;
          }
        }
        if (placement.windowAffinity === "avoid" && !wallHasOpening(cand.wall)) score += 8;
      }
      // distância da porta
      if (doorCenters.length > 0) {
        const cx = cand.x + cand.width / 2;
        const cy = cand.y + cand.height / 2;
        const dMin = Math.min(...doorCenters.map((p) => Math.hypot(p.x - cx, p.y - cy)));
        if (placement.doorAffinity === "far") score += 10 * Math.min(1, dMin / Math.max(0.1, halfDiagonal));
        if (placement.category !== "rug" && dMin < 0.9) score -= 12;
      }
      // relações ergonômicas (adjacência mede borda-a-borda; distância de
      // uso mede centro-a-centro — ver relationDistance)
      if (placement.relations) {
        const candRect = { x: cand.x, y: cand.y, w: cand.width, h: cand.height };
        for (const rel of placement.relations) {
          const partners = workingPlan.furniture.filter((f) => f.roomId === room.id && f.type === rel.withType);
          if (partners.length === 0) continue;
          let dBest = Infinity;
          for (const p of partners) {
            const pb = worldAABB(p);
            dBest = Math.min(dBest, relationDistance(rel, candRect, pb));
          }
          if (dBest >= rel.minDist && dBest <= rel.maxDist) {
            const mid = (rel.minDist + rel.maxDist) / 2;
            const half = Math.max(0.01, (rel.maxDist - rel.minDist) / 2);
            score += 12 * (1 - Math.abs(dBest - mid) / half) * 0.5 + 6;
          } else {
            score -= 8;
          }
        }
      }
      // keep-out do centro (item sólido sem pedido explícito de centro)
      if (placement.category !== "rug" && placement.category !== "decor" && it.anchor !== "center") {
        const cx = cand.x + cand.width / 2;
        const cy = cand.y + cand.height / 2;
        const inMidX = cx > room.x + room.width / 3 && cx < room.x + (2 * room.width) / 3;
        const inMidY = cy > room.y + room.height / 3 && cy < room.y + (2 * room.height) / 3;
        if (inMidX && inMidY) score -= 20;
      }
      // centragem estética no sub-vão
      if (cand.kind === "wall" && cand.spanLen && cand.spanLen > 0) {
        score += 4 * Math.max(0, 1 - (2 * (cand.spanCenterDist ?? 0)) / cand.spanLen);
      }
      // canto para quem pede canto
      if ((placement.anchorTo === "corner" || placement.anchorTo === "wall-or-corner") && cand.kind === "corner") {
        score += 3;
      }

      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 &&
          (cand.x < best.cand.x - 1e-9 || (Math.abs(cand.x - best.cand.x) < 1e-9 && cand.y < best.cand.y - 1e-9)))
      ) {
        best = { cand, score };
      }
    }

    if (!best) {
      if (!firstFailReason) {
        firstFailReason = `nenhuma posição válida (testei ${candidates.length} candidatos). Último motivo: ${lastReason}`;
      }
      continue; // tenta a próxima variante da cadeia
    }

    const chosen = best.cand;
    const effRotation = chosen.rotation ?? it.rotation;
    solved.push({
      intent: {
        ...it,
        ...(chosen.kind === "wall" && chosen.wall ? { anchor: `wall:${chosen.wall}` as Anchor } : {}),
        ...(chosen.kind === "corner" && chosen.corner ? { anchor: `corner:${chosen.corner}` as Anchor } : {}),
        ...(chosen.position ? { position: chosen.position } : {}),
        ...(effRotation !== undefined ? { rotation: effRotation } : {}),
      },
      x: chosen.x,
      y: chosen.y,
      width: chosen.width,
      height: chosen.height,
      ...(effRotation !== undefined ? { rotation: effRotation } : {}),
    });
    // Sibling no workingPlan: bbox VISUAL sem rotação (já transposto).
    workingPlan.furniture.push({
      id: `solver-${solved.length}`,
      roomId: room.id,
      type: it.type,
      label,
      x: chosen.x,
      y: chosen.y,
      width: chosen.width,
      height: chosen.height,
    });
    placedAny = true;
    break; // vaga resolvida — não tenta as outras variantes
    }
    if (!placedAny) {
      failed.push({ intent: original, reason: firstFailReason || "nenhuma posição válida" });
    }
  }

  return { ok: failed.length === 0, solved, failed };
}

/** Format the solver result as a single result string for the agent. */
export function formatSolverResult(room: Room, plan: FloorPlan, output: SolverOutput): string {
  const placedCount = output.solved.length;
  const failedCount = output.failed.length;
  if (placedCount === 0 && failedCount > 0) {
    const reasons = output.failed
      .map((f) => `- ${f.intent.label ?? f.intent.type} (${f.intent.anchor ?? "auto"}): ${f.reason}`)
      .join("\n");
    return `Nenhum item posicionado. Problemas:\n${reasons}\n\n${summarizeRoomLayout(room, plan)}`;
  }
  if (failedCount === 0) {
    return `${placedCount} ${placedCount === 1 ? "item posicionado" : "itens posicionados"} em '${room.name}'.`;
  }
  const placedSummary = output.solved
    .map((s) => `${s.intent.label ?? s.intent.type}@${s.intent.anchor ?? "auto"}`)
    .join(", ");
  const failedSummary = output.failed
    .map((f) => `- ${f.intent.label ?? f.intent.type} (${f.intent.anchor ?? "auto"}): ${f.reason}`)
    .join("\n");
  return `${placedCount} item(ns) posicionado(s): ${placedSummary}.\n${failedCount} falharam:\n${failedSummary}\n\n${summarizeRoomLayout(room, plan)}`;
}
