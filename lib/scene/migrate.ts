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

const EXTERNAL_THICKNESS = 0.15;
const INTERNAL_THICKNESS = 0.10;
const DEFAULT_WALL_HEIGHT = 2.8;
const DEFAULT_DOOR_HEIGHT = 2.10;
const DEFAULT_WINDOW_HEIGHT = 1.20;
const DEFAULT_SILL_HEIGHT = 0.90;
const SLAB_THICKNESS = 0.12;

const ROOT_ID = "building:root";
const LEVEL_ID = "level:0";

interface Interval { start: number; end: number; }
interface SweepResult { start: number; end: number; aHas: boolean; bHas: boolean }

const EPS = 1e-3;

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
}

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
    getH(r.y).below.push({ start: r.x, end: r.x + r.width });
    getH(r.y + r.height).above.push({ start: r.x, end: r.x + r.width });
    getV(r.x).right.push({ start: r.y, end: r.y + r.height });
    getV(r.x + r.width).left.push({ start: r.y, end: r.y + r.height });
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
      const seg = roomEdge(r, w);
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
  return {
    id: segmentId(s),
    type: "wall",
    parentId: LEVEL_ID,
    start,
    end,
    thickness: s.isExterior ? EXTERNAL_THICKNESS : INTERNAL_THICKNESS,
    height: DEFAULT_WALL_HEIGHT,
    isExterior: s.isExterior,
    doors: [],
    windows: [],
  };
}

function findOwnerSegment(
  segments: SegmentSpec[],
  edge: RoomEdge,
  positionAlong: number,
  size: number,
): { seg: SegmentSpec; localOffset: number } | null {
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
      return { seg: s, localOffset: centerAbs - s.start };
    }
  }
  // Fallback: closest segment on the same line that contains the center.
  let best: { seg: SegmentSpec; dist: number } | null = null;
  for (const s of segments) {
    if (s.axis !== edge.axis) continue;
    if (Math.abs(s.fixed - edge.fixed) > EPS) continue;
    if (centerAbs >= s.start - EPS && centerAbs <= s.end + EPS) {
      const dist = Math.min(centerAbs - s.start, s.end - centerAbs);
      if (!best || dist < best.dist) best = { seg: s, dist };
    }
  }
  if (best) return { seg: best.seg, localOffset: centerAbs - best.seg.start };
  return null;
}

function inferHinge(d: Door): { side: HingeSide; dir: SwingDirection } {
  // Default: hinge at start, swing into the room (heuristic).
  return { side: "start", dir: "in" };
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
    dimensions: { x: f.width, y: 0.5, z: f.height },
  };
}

export interface MigrationResult {
  scene: Pick<SceneState, "nodes" | "rootId" | "activeLevelId">;
  warnings: string[];
}

export function floorPlanToScene(plan: FloorPlan): MigrationResult {
  const warnings: string[] = [];
  const nodes: Record<NodeId, AnyNode> = {};

  const building: BuildingNode = {
    id: ROOT_ID,
    type: "building",
    parentId: null,
    name: "Projeto",
    northRotation: ((plan.northArrow?.angle ?? 0) * Math.PI) / 180,
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
    const edge = roomEdge(room, d.wall);
    const found = findOwnerSegment(segments, edge, d.position, d.size);
    if (!found) {
      warnings.push(
        `door ${d.id}: no wall segment found on ${d.wall} of room ${room.name} at position ${d.position}`
      );
      continue;
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
    const edge = roomEdge(room, w.wall);
    const found = findOwnerSegment(segments, edge, w.position, w.size);
    if (!found) {
      warnings.push(
        `window ${w.id}: no wall segment found on ${w.wall} of room ${room.name} at position ${w.position}`
      );
      continue;
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
    const room: RoomNode = {
      id: roomId,
      type: "room",
      parentId: LEVEL_ID,
      name: r.name,
      category,
      polygon: roomPolygon,
      area,
      floorMaterial: floor,
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
  };
}
