// Convert a legacy FloorPlan (rectangle-based rooms) into the new flat
// node-graph SceneState (wall-segment primary, rooms derived).
//
// Strategy:
// 1. Sweep-line over room edges to produce non-overlapping wall segments.
// 2. Drop segments fully covered by `room.openWalls` (open-plan integrations).
// 3. Each segment becomes a WallNode with deterministic id (so re-migrating
//    yields identical ids; preserves selection across reloads).
// 4. Doors and windows are attached to the matching segment by axis + offset.
//    If the exact segment is missing (gap), we attach to the nearest segment
//    on the same line with a warning instead of dropping silently.
// 5. Furniture is copied 1:1.
//
// Rooms + slabs are NOT created here — see space-detection.ts (Phase 2).

import type {
  AnyNode,
  BuildingNode,
  DiagnosticIssue,
  DoorNode,
  FloorMaterial,
  FurnitureNode,
  HingeSide,
  LevelNode,
  NodeId,
  RoomNode,
  SceneState,
  SlabNode,
  SwingDirection,
  Vec2,
  WallNode,
  WindowNode,
} from "./types";
import type { Door, FloorPlan, Furniture, Room, Wall as WallSide, Window as PlanWindow } from "../types";
import { outsetPolygon, polygonAbsArea } from "./types";
import { polygonSignature } from "./signature";
import { categoryFromName, defaultFloorForCategory } from "./slab-sync";
import { SNAP_ROOM_GRID_M, TOL_LINE_M, TOL_VERTEX_M } from "./tolerances";
import { estimatedHeightM } from "./furniture-heights";
import {
  EXTERNAL_WALL_THICKNESS_M,
  INTERNAL_WALL_THICKNESS_M,
  RAILING_THICKNESS_M,
} from "./wall-constants";

const EXTERNAL_THICKNESS = EXTERNAL_WALL_THICKNESS_M;
const INTERNAL_THICKNESS = INTERNAL_WALL_THICKNESS_M;
const DEFAULT_WALL_HEIGHT = 2.8;
const DEFAULT_DOOR_HEIGHT = 2.10;
const DEFAULT_WINDOW_HEIGHT = 1.20;
const DEFAULT_SILL_HEIGHT = 0.90;
const SLAB_THICKNESS = 0.12;

const ROOT_ID = "building:root";
const LEVEL_ID = "level:0";

interface Interval { start: number; end: number; }
interface SweepResult { start: number; end: number; aHas: boolean; bHas: boolean }

const EPS = TOL_LINE_M;

function classify(setA: Interval[], setB: Interval[]): SweepResult[] {
  const events: { x: number; delta: number; which: 0 | 1 }[] = [];
  for (const i of setA) {
    events.push({ x: i.start, delta: 1, which: 0 });
    events.push({ x: i.end, delta: -1, which: 0 });
  }
  for (const i of setB) {
    events.push({ x: i.start, delta: 1, which: 1 });
    events.push({ x: i.end, delta: -1, which: 1 });
  }
  if (events.length === 0) return [];
  events.sort((p, q) => p.x - q.x || p.delta - q.delta);
  const out: SweepResult[] = [];
  let aCount = 0, bCount = 0;
  let prev = events[0].x;
  for (const ev of events) {
    if (ev.x - prev > EPS && (aCount > 0 || bCount > 0)) {
      out.push({ start: prev, end: ev.x, aHas: aCount > 0, bHas: bCount > 0 });
    }
    if (ev.which === 0) aCount += ev.delta;
    else bCount += ev.delta;
    prev = ev.x;
  }
  return out;
}

interface SegmentSpec {
  axis: "h" | "v";
  /** y for horizontal, x for vertical (in meters). */
  fixed: number;
  start: number;
  end: number;
  isExterior: boolean;
  /** True when the segment belongs to a balcony's exterior side (open to
   *  outside) — sweep-line marks this so the wall renders as a low parapet
   *  instead of a full-height partition. */
  isRailing?: boolean;
  /** Default "concrete"; preserved from the owning balcony room. */
  railingMaterial?: "concrete" | "glass" | "metal";
}

/** Quantization step for room edges (Fase N). Snapping every coordinate to a
 *  5 cm grid before the sweep guarantees that walls coming from different
 *  agent calls land at IDENTICAL endpoints — no sub-mm epsilon left between
 *  neighbours, which translates to crisp junctions in 3D. */
const COORD_SNAP_M = SNAP_ROOM_GRID_M;
const snapCoord = (n: number): number => Math.round(n / COORD_SNAP_M) * COORD_SNAP_M;

function buildSegments(plan: FloorPlan): SegmentSpec[] {
  const horiz = new Map<number, { above: Interval[]; below: Interval[] }>();
  const vert = new Map<number, { left: Interval[]; right: Interval[] }>();
  const k = (n: number) => Math.round(n * 1000);
  const getH = (y: number) => {
    const yk = k(y);
    let g = horiz.get(yk);
    if (!g) { g = { above: [], below: [] }; horiz.set(yk, g); }
    return g;
  };
  const getV = (x: number) => {
    const xk = k(x);
    let g = vert.get(xk);
    if (!g) { g = { left: [], right: [] }; vert.set(xk, g); }
    return g;
  };

  for (const r of plan.rooms) {
    if (r.isExterior) continue; // exterior rooms (gardens) don't generate walls
    // Snap every edge coordinate to the 5 cm grid (Fase N). Without this,
    // floating-point arithmetic in doCreateApartment ("cursorX += r.w")
    // can leave neighbouring rooms with edges that differ by sub-mm —
    // enough to skip the vk() snap in computeWallCorners and produce
    // unmitered, gap-y junctions in 3D.
    const x = snapCoord(r.x);
    const y = snapCoord(r.y);
    const x2 = snapCoord(r.x + r.width);
    const y2 = snapCoord(r.y + r.height);
    getH(y).below.push({ start: x, end: x2 });
    getH(y2).above.push({ start: x, end: x2 });
    getV(x).right.push({ start: y, end: y2 });
    getV(x2).left.push({ start: y, end: y2 });
  }

  const out: SegmentSpec[] = [];
  horiz.forEach(({ above, below }, yk) => {
    const y = yk / 1000;
    for (const s of classify(above, below)) {
      const isExternal = !(s.aHas && s.bHas);
      out.push({ axis: "h", fixed: y, start: s.start, end: s.end, isExterior: isExternal });
    }
  });
  vert.forEach(({ left, right }, xk) => {
    const x = xk / 1000;
    for (const s of classify(left, right)) {
      const isExternal = !(s.aHas && s.bHas);
      out.push({ axis: "v", fixed: x, start: s.start, end: s.end, isExterior: isExternal });
    }
  });

  // Apply openWalls: drop segments fully covered by a removed wall.
  const removed = new Set<string>();
  function key(seg: SegmentSpec): string {
    return `${seg.axis}|${k(seg.fixed)}|${k(seg.start)}|${k(seg.end)}`;
  }
  for (const r of plan.rooms) {
    if (!r.openWalls?.length) continue;
    for (const w of r.openWalls) {
      const seg = snappedRoomEdge(r, w);
      for (const s of out) {
        if (removed.has(key(s))) continue;
        if (s.axis === "h" && seg.axis === "h" && Math.abs(s.fixed - seg.fixed) < EPS) {
          if (s.start >= seg.start - EPS && s.end <= seg.end + EPS) removed.add(key(s));
        } else if (s.axis === "v" && seg.axis === "v" && Math.abs(s.fixed - seg.fixed) < EPS) {
          if (s.start >= seg.start - EPS && s.end <= seg.end + EPS) removed.add(key(s));
        }
      }
    }
  }
  // Mark railing segments: any external segment that lies along a balcony
  // room's edge becomes a low parapet. Internal (shared) segments stay as
  // full-height walls — that's the wall between the balcony and the parent
  // room, which should remain solid (and typically contains a sliding door).
  for (const seg of out) {
    if (!seg.isExterior) continue;
    for (const r of plan.rooms) {
      if (!r.isBalcony) continue;
      const edges = [
        snappedRoomEdge(r, "north"),
        snappedRoomEdge(r, "south"),
        snappedRoomEdge(r, "west"),
        snappedRoomEdge(r, "east"),
      ];
      let matched = false;
      for (const e of edges) {
        if (e.axis !== seg.axis) continue;
        if (Math.abs(e.fixed - seg.fixed) > EPS) continue;
        if (seg.start >= e.start - EPS && seg.end <= e.end + EPS) {
          matched = true;
          break;
        }
      }
      if (matched) {
        seg.isRailing = true;
        seg.railingMaterial = r.balconyRailingMaterial ?? "concrete";
        break;
      }
    }
  }
  return out.filter((s) => !removed.has(key(s)));
}

interface RoomEdge { axis: "h" | "v"; fixed: number; start: number; end: number; }

function roomEdge(r: Room, w: WallSide): RoomEdge {
  switch (w) {
    case "north": return { axis: "h", fixed: r.y, start: r.x, end: r.x + r.width };
    case "south": return { axis: "h", fixed: r.y + r.height, start: r.x, end: r.x + r.width };
    case "west":  return { axis: "v", fixed: r.x, start: r.y, end: r.y + r.height };
    case "east":  return { axis: "v", fixed: r.x + r.width, start: r.y, end: r.y + r.height };
  }
}

/** Edge quantizada na MESMA grade de 5 cm usada por buildSegments. Sem isso,
 *  um cômodo fora da grade (create_apartment_layout gera coords derivadas de
 *  raiz quadrada, ex.: x=4.554) compara a edge CRUA contra segmentos snapados
 *  com tolerância de 1 mm — nunca casa e TODA porta/janela daquela parede era
 *  descartada silenciosamente. */
function snappedRoomEdge(r: Room, w: WallSide): RoomEdge {
  const e = roomEdge(r, w);
  return {
    axis: e.axis,
    fixed: snapCoord(e.fixed),
    start: snapCoord(e.start),
    end: snapCoord(e.end),
  };
}

function segmentId(s: SegmentSpec): NodeId {
  const k = (n: number) => Math.round(n * 1000);
  return `wall:${s.axis}-${k(s.fixed)}-${k(s.start)}-${k(s.end)}`;
}

function segmentToWallNode(s: SegmentSpec): WallNode {
  const start: Vec2 = s.axis === "h"
    ? { x: s.start, z: s.fixed }
    : { x: s.fixed, z: s.start };
  const end: Vec2 = s.axis === "h"
    ? { x: s.end, z: s.fixed }
    : { x: s.fixed, z: s.end };
  // Railings are thinner than walls (parapet, not load-bearing) so the
  // 2D drag handles + outline use a tighter footprint.
  const RAILING_THICKNESS = RAILING_THICKNESS_M;
  const RAILING_HEIGHT = 1.10;
  const isRailing = s.isRailing === true;
  return {
    id: segmentId(s),
    type: "wall",
    parentId: LEVEL_ID,
    start,
    end,
    thickness: isRailing ? RAILING_THICKNESS : (s.isExterior ? EXTERNAL_THICKNESS : INTERNAL_THICKNESS),
    height: DEFAULT_WALL_HEIGHT,
    isExterior: s.isExterior,
    doors: [],
    windows: [],
    ...(isRailing
      ? { kind: "railing" as const, railingMaterial: s.railingMaterial ?? "concrete", railingHeight: RAILING_HEIGHT }
      : {}),
  };
}

function findOwnerSegment(
  segments: SegmentSpec[],
  edge: RoomEdge,
  positionAlong: number,
  size: number,
): { seg: SegmentSpec; localOffset: number; snapped: boolean } | null {
  const halfSize = size / 2;
  // Absolute position of opening center along the edge.
  const centerAbs = edge.start + positionAlong * (edge.end - edge.start);
  const startAbs = centerAbs - halfSize;
  const endAbs = centerAbs + halfSize;

  // First pass: exact cover.
  for (const s of segments) {
    if (s.axis !== edge.axis) continue;
    if (Math.abs(s.fixed - edge.fixed) > EPS) continue;
    if (startAbs >= s.start - EPS && endAbs <= s.end + EPS) {
      return { seg: s, localOffset: centerAbs - s.start, snapped: false };
    }
  }
  // Fallback: closest segment on the same line that contains the center.
  // The opening is SNAPPED into the segment: the local offset is clamped so
  // the opening never overflows past a junction (it used to render across
  // two walls). Segments shorter than the opening are not eligible.
  let best: { seg: SegmentSpec; dist: number } | null = null;
  for (const s of segments) {
    if (s.axis !== edge.axis) continue;
    if (Math.abs(s.fixed - edge.fixed) > EPS) continue;
    const segLen = s.end - s.start;
    if (segLen < size + 0.1) continue; // doesn't fit — not a valid owner
    if (centerAbs >= s.start - EPS && centerAbs <= s.end + EPS) {
      const dist = Math.min(centerAbs - s.start, s.end - centerAbs);
      if (!best || dist < best.dist) best = { seg: s, dist };
    }
  }
  if (best) {
    const segLen = best.seg.end - best.seg.start;
    const raw = centerAbs - best.seg.start;
    const clamped = Math.max(halfSize, Math.min(segLen - halfSize, raw));
    return { seg: best.seg, localOffset: clamped, snapped: Math.abs(clamped - raw) > EPS };
  }
  return null;
}

const WALL_PT: Record<WallSide, string> = {
  north: "norte",
  south: "sul",
  east: "leste",
  west: "oeste",
};

/** Mapeia (hinge, swing) legados para as convenções do DoorNode/DoorSvg.
 *  Segmentos correm sempre em +eixo (h: +x, v: +z) e o DoorSvg interpreta
 *  swingDirection "in" como o lado +perp da parede (perp = (-dz, dx)):
 *  +perp aponta para o sul nas paredes horizontais e para o oeste nas
 *  verticais. Logo, "abrir para dentro do cômodo dono" vira:
 *    north → in   (cômodo ao sul da parede = lado +perp)
 *    south → out  (cômodo ao norte = lado -perp)
 *    east  → in   (cômodo a oeste = lado +perp)
 *    west  → out  (cômodo a leste = lado -perp)
 *  hinge "near" (borda com menor coordenada ao longo da parede) → "start". */
function inferHinge(d: Door): { side: HingeSide; dir: SwingDirection } {
  // Mesmo default posicional dos validadores de placement (placement-
  // validators/chooseDoorSwing) — divergir aqui fazia o validador de cena e o
  // de placement modelarem discos de giro DIFERENTES para portas sem hinge.
  const hinge = d.hinge ?? (d.position <= 0.5 ? "near" : "far");
  const swing = d.swing ?? "in";
  const side: HingeSide = hinge === "near" ? "start" : "end";
  const inMeansScenIn = d.wall === "north" || d.wall === "east";
  const dir: SwingDirection = (swing === "in") === inMeansScenIn ? "in" : "out";
  return { side, dir };
}

function createDoorNode(
  d: Door,
  wallId: NodeId,
  localOffset: number
): DoorNode {
  const hinge = inferHinge(d);
  return {
    id: `door:${d.id}`,
    type: "door",
    parentId: wallId,
    wallId,
    offset: localOffset,
    width: d.size,
    height: DEFAULT_DOOR_HEIGHT,
    hingeSide: hinge.side,
    swingDirection: hinge.dir,
  };
}

function createWindowNode(
  w: PlanWindow,
  wallId: NodeId,
  localOffset: number
): WindowNode {
  return {
    id: `window:${w.id}`,
    type: "window",
    parentId: wallId,
    wallId,
    offset: localOffset,
    width: w.size,
    height: DEFAULT_WINDOW_HEIGHT,
    sillHeight: DEFAULT_SILL_HEIGHT,
  };
}

function createFurnitureNode(f: Furniture): FurnitureNode {
  return {
    id: `furniture:${f.id}`,
    type: "furniture",
    parentId: null,
    roomId: f.roomId ? `room:${f.roomId}` : null,
    catalogId: f.type,
    label: f.label,
    position: { x: f.x, y: 0, z: f.y },
    rotation: ((f.rotation ?? 0) * Math.PI) / 180,
    dimensions: { x: f.width, y: estimatedHeightM(f.type), z: f.height },
    ...(f.runId ? { runId: f.runId } : {}),
    ...(f.cutouts ? { cutouts: f.cutouts } : {}),
  };
}

export interface MigrationResult {
  scene: Pick<SceneState, "nodes" | "rootId" | "activeLevelId">;
  warnings: string[];
  /** Problemas estruturais detectados na migração (porta/janela perdida ou
   *  reposicionada). Diferente de `warnings` (strings de debug), estes são
   *  DiagnosticIssue prontos para o agente e para o painel da UI. */
  issues: DiagnosticIssue[];
}

export function floorPlanToScene(plan: FloorPlan): MigrationResult {
  const warnings: string[] = [];
  const issues: DiagnosticIssue[] = [];
  const nodes: Record<NodeId, AnyNode> = {};

  const building: BuildingNode = {
    id: ROOT_ID,
    type: "building",
    parentId: null,
    name: "Projeto",
    northRotation: ((plan.northArrow?.angle ?? 0) * Math.PI) / 180,
    // The 2D north marker is opt-in: only shown when the user (or the
    // agent's add_north_arrow tool) explicitly placed one. Plan-level
    // x/y coords come straight through from the legacy NorthArrow.
    north: plan.northArrow
      ? {
          x: plan.northArrow.x,
          z: plan.northArrow.y,
          angle: plan.northArrow.angle ?? 0,
        }
      : null,
  };
  const level: LevelNode = {
    id: LEVEL_ID,
    type: "level",
    parentId: ROOT_ID,
    elevation: 0,
    defaultWallHeight: DEFAULT_WALL_HEIGHT,
  };
  nodes[ROOT_ID] = building;
  nodes[LEVEL_ID] = level;

  // Build wall segments from rooms.
  const segments = buildSegments(plan);
  const wallById = new Map<NodeId, WallNode>();
  for (const seg of segments) {
    const wn = segmentToWallNode(seg);
    nodes[wn.id] = wn;
    wallById.set(wn.id, wn);
  }

  // Attach doors.
  for (const d of plan.doors) {
    if (d.silent) continue; // silent doors only mark slab opening, not 3D door
    const room = plan.rooms.find((r) => r.id === d.roomId);
    if (!room) {
      warnings.push(`door ${d.id}: room ${d.roomId} not found`);
      continue;
    }
    const edge = snappedRoomEdge(room, d.wall);
    const found = findOwnerSegment(segments, edge, d.position, d.size);
    if (!found) {
      warnings.push(
        `door ${d.id}: no wall segment found on ${d.wall} of room ${room.name} at position ${d.position}`
      );
      issues.push({
        code: "OPENING_LOST",
        severity: "error",
        message: `Porta de '${room.name}' (parede ${WALL_PT[d.wall]}) não pôde ser anexada a nenhuma parede — ela NÃO aparece na planta. Reposicione com add_door (a parede pode ter sido aberta, dividida ou ser curta demais).`,
        nodeIds: [`room:legacy-${room.id}`],
      });
      continue;
    }
    if (found.snapped) {
      issues.push({
        code: "OPENING_SNAPPED",
        severity: "warning",
        message: `Porta de '${room.name}' (parede ${WALL_PT[d.wall]}) foi reposicionada para caber no trecho de parede existente — confira se ficou onde você queria.`,
        nodeIds: [`door:${d.id}`],
      });
    }
    const wallId = segmentId(found.seg);
    const door = createDoorNode(d, wallId, found.localOffset);
    nodes[door.id] = door;
    const wall = wallById.get(wallId);
    if (wall) wall.doors.push(door.id);
  }

  // Attach windows.
  for (const w of plan.windows) {
    const room = plan.rooms.find((r) => r.id === w.roomId);
    if (!room) {
      warnings.push(`window ${w.id}: room ${w.roomId} not found`);
      continue;
    }
    const edge = snappedRoomEdge(room, w.wall);
    const found = findOwnerSegment(segments, edge, w.position, w.size);
    if (!found) {
      warnings.push(
        `window ${w.id}: no wall segment found on ${w.wall} of room ${room.name} at position ${w.position}`
      );
      issues.push({
        code: "OPENING_LOST",
        severity: "error",
        message: `Janela de '${room.name}' (parede ${WALL_PT[w.wall]}) não pôde ser anexada a nenhuma parede — ela NÃO aparece na planta. Reposicione com add_window.`,
        nodeIds: [`room:legacy-${room.id}`],
      });
      continue;
    }
    if (found.snapped) {
      issues.push({
        code: "OPENING_SNAPPED",
        severity: "warning",
        message: `Janela de '${room.name}' (parede ${WALL_PT[w.wall]}) foi reposicionada para caber no trecho de parede existente.`,
        nodeIds: [`window:${w.id}`],
      });
    }
    const wallId = segmentId(found.seg);
    const window = createWindowNode(w, wallId, found.localOffset);
    nodes[window.id] = window;
    const wall = wallById.get(wallId);
    if (wall) wall.windows.push(window.id);
  }

  // Furniture.
  for (const f of plan.furniture) {
    const fn = createFurnitureNode(f);
    nodes[fn.id] = fn;
  }

  // Direct room+slab derivation from legacy rectangles. This bypasses
  // half-edge space-detection, which struggles with multi-room shared walls.
  // The legacy FloorPlan stores rooms as axis-aligned rectangles, so the
  // canonical polygon is just the 4 corners.
  //
  // SLAB_OUTSET: the slab polygon is inflated by half the EXTERNAL wall
  // thickness so the floor encostada embaixo das paredes externas (no gap
  // visível). Pattern do Pascal (slab-system.tsx > outsetPolygon).
  const SLAB_OUTSET = EXTERNAL_THICKNESS / 2;
  for (const r of plan.rooms) {
    if (r.isExterior) continue;
    const roomPolygon: Vec2[] = [
      { x: r.x, z: r.y },
      { x: r.x + r.width, z: r.y },
      { x: r.x + r.width, z: r.y + r.height },
      { x: r.x, z: r.y + r.height },
    ];
    const slabPolygon = outsetPolygon(roomPolygon, SLAB_OUTSET);
    const area = polygonAbsArea(roomPolygon); // area shown to user is the inner room, not inflated
    const slabId = `slab:legacy-${r.id}`;
    const roomId = `room:legacy-${r.id}`;
    const category = categoryFromName(r.name);
    const floor = (r.floor as FloorMaterial) ?? defaultFloorForCategory(category);
    // Carry over floor zones (split_floor tool) so the canvas can render
    // the secondary material strip + a dashed divider line. Legacy
    // zones use relative {rx,ry,rw,rh} 0..1 within the room; scene
    // zones store absolute polygons + the original relative bounds so
    // the polygon can be re-derived live when walls move.
    const sceneZones = r.floorZones?.map((z, idx) => {
      const ax = r.x + z.rx * r.width;
      const ay = r.y + z.ry * r.height;
      const aw = z.rw * r.width;
      const ah = z.rh * r.height;
      return {
        id: `zone:${r.id}:${idx}`,
        polygon: [
          { x: ax, z: ay },
          { x: ax + aw, z: ay },
          { x: ax + aw, z: ay + ah },
          { x: ax, z: ay + ah },
        ],
        material: z.material,
        bounds: { rx: z.rx, ry: z.ry, rw: z.rw, rh: z.rh },
      };
    });
    // Anchor each polygon vertex to a wall endpoint so the polygon (and
    // therefore the slab, area and zones) follows wall drags live. We
    // use 1 mm precision — same quantization the wall mitering uses.
    const ANCHOR_TOL = TOL_VERTEX_M;
    const boundaryAnchors: { vertexIndex: number; wallId: NodeId; endpoint: "start" | "end" }[] = [];
    for (let i = 0; i < roomPolygon.length; i++) {
      const v = roomPolygon[i];
      let found: { wallId: NodeId; endpoint: "start" | "end" } | null = null;
      for (const wn of wallById.values()) {
        if (Math.abs(wn.start.x - v.x) <= ANCHOR_TOL && Math.abs(wn.start.z - v.z) <= ANCHOR_TOL) {
          found = { wallId: wn.id, endpoint: "start" };
          break;
        }
        if (Math.abs(wn.end.x - v.x) <= ANCHOR_TOL && Math.abs(wn.end.z - v.z) <= ANCHOR_TOL) {
          found = { wallId: wn.id, endpoint: "end" };
          break;
        }
      }
      if (found) boundaryAnchors.push({ vertexIndex: i, ...found });
    }
    const room: RoomNode = {
      id: roomId,
      type: "room",
      parentId: LEVEL_ID,
      name: r.name,
      category,
      polygon: roomPolygon,
      area,
      floorMaterial: floor,
      floorZones: sceneZones,
      boundaryAnchors: boundaryAnchors.length === roomPolygon.length ? boundaryAnchors : undefined,
      slabId,
      signature: polygonSignature(roomPolygon),
    };
    const slab: SlabNode = {
      id: slabId,
      type: "slab",
      parentId: LEVEL_ID,
      polygon: slabPolygon,
      thickness: SLAB_THICKNESS,
      elevation: 0,
      material: floor,
      roomId,
      autoFromWalls: true,
    };
    nodes[roomId] = room;
    nodes[slabId] = slab;
  }

  // Bind furniture to its room (legacy ids → new room ids).
  for (const id of Object.keys(nodes)) {
    const n = nodes[id];
    if (n.type === "furniture" && n.roomId) {
      const legacyId = n.roomId.replace(/^room:/, "");
      const newId = `room:legacy-${legacyId}`;
      if (nodes[newId]) {
        nodes[id] = { ...n, roomId: newId };
      }
    }
  }

  return {
    scene: { nodes, rootId: ROOT_ID, activeLevelId: LEVEL_ID },
    warnings,
    issues,
  };
}
