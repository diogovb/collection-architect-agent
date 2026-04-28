// Bridge between the FloorPlan domain model (lib/types.ts) and the 3D building
// model. Provides:
//   - floorPlanToBuildingModel(plan): pure converter used by Scene3D
//   - handle* functions: route Claude tool calls into a BuildingStore (used in
//     agent-direct flows; the existing Vibe app routes through applyPlanTool
//     instead, but the 3D scene is rebuilt from FloorPlan on every change).

import type {
  Door,
  FloorMaterial,
  FloorPlan,
  Furniture,
  FurnitureType,
  Room,
  ToolInputs,
  Wall,
  Window as PlanWindow,
} from "@/lib/types";
import type { BuildingStore } from "./use-building-store";
import type {
  BuildingModel,
  DoorNode,
  FurnitureNode,
  LevelNode,
  SlabNode,
  Vec2,
  WallNode,
  WindowNode,
  ZoneNode,
} from "./types";
import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL,
  EXTERNAL_WALL_THICKNESS,
  INTERNAL_WALL_THICKNESS,
} from "./types";

const ACTIVE_LEVEL_ID = "level-0";

// ------------------ Coordinate convention ------------------
// FloorPlan uses 2D meters with (x, y) where y grows downward (south).
// 3D world uses (x, y=up, z) with z growing south.
// → Plan (x, y) maps to 3D (x, 0, y).
// We pass y values from the plan straight into Vec2.z below.

// ============================================================
//                FloorPlan → BuildingModel converter
// ============================================================

/** Material → color map for slabs. */
const FLOOR_COLORS: Record<FloorMaterial, string> = {
  madeira: "#C9B083",
  porcelanato: "#EFE8DB",
  ceramica: "#E6DCC8",
  marmore: "#EAE4D6",
  grama: "#9CB07F",
  deck: "#A98A65",
  pedra: "#B8AE9C",
};

const ZONE_COLOR = "#F2DDD0";

/** Furniture color palette — keyed by category. */
function furnitureColor(t: FurnitureType): string {
  if (t.startsWith("sofa") || t === "armchair") return "#D9CFB8";
  if (t.startsWith("bed")) return "#D6CCB6";
  if (t.includes("table") || t === "buffet" || t === "coffee_table" || t === "side_table") return "#A8967A";
  if (t.includes("chair")) return "#B8A88C";
  if (t.includes("counter") || t.includes("island")) return "#3A332A";
  if (t.startsWith("stove") || t === "cooktop" || t === "commercial_stove") return "#5A4F40";
  if (t.startsWith("fridge")) return "#C9C2B0";
  if (t === "tv" || t === "tv_console") return "#3F362A";
  if (t.startsWith("wardrobe") || t === "dresser" || t === "filing_cabinet" || t === "bookshelf") return "#8E7B5E";
  if (t === "rug_rect") return "#E8DDC8";
  if (t.includes("plant") || t.includes("tree") || t === "umbrella" || t === "pergola") return "#7A8C5C";
  if (t === "pool_rect" || t === "fountain" || t === "hot_tub") return "#7FA5B8";
  if (t.startsWith("light") || t === "floor_lamp" || t === "ceiling_fan") return "#E6D8A8";
  return "#BDB29C";
}

/** Furniture height (Y dimension) heuristic, meters. */
function furnitureHeight(t: FurnitureType): number {
  if (t.startsWith("sofa") || t === "armchair") return 0.85;
  if (t.startsWith("bed")) return 0.6;
  if (t === "coffee_table" || t === "side_table") return 0.45;
  if (t === "rug_rect") return 0.02;
  if (t.includes("dining_table") || t.includes("desk") || t === "buffet" || t === "table") return 0.78;
  if (t.includes("chair") || t === "bar_stool") return 0.95;
  if (t === "kitchen_island" || t.includes("counter")) return 0.92;
  if (t === "kitchen_sink_single" || t === "kitchen_sink_double" || t === "sink") return 0.92;
  if (t === "stove_4burner" || t === "stove_5burner" || t === "stove" || t === "cooktop") return 0.92;
  if (t === "fridge" || t === "fridge_single" || t === "fridge_double") return 1.85;
  if (t.startsWith("wardrobe") || t === "dresser" || t === "bookshelf") return 2.2;
  if (t === "tv" || t === "tv_console") return 0.55;
  if (t === "toilet" || t === "bidet") return 0.4;
  if (t === "shower_square" || t === "shower_rect" || t === "shower") return 2.0;
  if (t === "bathtub_rect" || t === "bathtub_corner") return 0.55;
  if (t === "tree_small") return 2.5;
  if (t === "tree_large") return 4.0;
  if (t === "plant_pot") return 0.6;
  if (t === "pool_rect" || t === "hot_tub" || t === "fountain") return 0.5;
  if (t.startsWith("light")) return 0.1;
  return 0.5;
}

/** Wall direction → segment of a room rectangle. */
function roomWallSegment(room: Room, wall: Wall): { start: Vec2; end: Vec2; length: number } {
  switch (wall) {
    case "north":
      return { start: { x: room.x, z: room.y }, end: { x: room.x + room.width, z: room.y }, length: room.width };
    case "south":
      return { start: { x: room.x, z: room.y + room.height }, end: { x: room.x + room.width, z: room.y + room.height }, length: room.width };
    case "east":
      return { start: { x: room.x + room.width, z: room.y }, end: { x: room.x + room.width, z: room.y + room.height }, length: room.height };
    case "west":
      return { start: { x: room.x, z: room.y }, end: { x: room.x, z: room.y + room.height }, length: room.height };
  }
}

/** Build all walls from rooms, deduping shared edges as internal walls. */
function buildWallsFromRooms(plan: FloorPlan): WallNode[] {
  // We use a sweep-line approach per axis: collect every horizontal/vertical
  // line that any room edge sits on, then segment it into intervals classified
  // as external (one side has a room) or internal (both sides do).
  interface Interval { start: number; end: number }
  const horiz = new Map<number, { above: Interval[]; below: Interval[] }>();
  const vert = new Map<number, { left: Interval[]; right: Interval[] }>();
  const k = (n: number) => Math.round(n * 1000);

  for (const r of plan.rooms) {
    if (!horiz.has(k(r.y))) horiz.set(k(r.y), { above: [], below: [] });
    if (!horiz.has(k(r.y + r.height))) horiz.set(k(r.y + r.height), { above: [], below: [] });
    if (!vert.has(k(r.x))) vert.set(k(r.x), { left: [], right: [] });
    if (!vert.has(k(r.x + r.width))) vert.set(k(r.x + r.width), { left: [], right: [] });
    horiz.get(k(r.y))!.below.push({ start: r.x, end: r.x + r.width });
    horiz.get(k(r.y + r.height))!.above.push({ start: r.x, end: r.x + r.width });
    vert.get(k(r.x))!.right.push({ start: r.y, end: r.y + r.height });
    vert.get(k(r.x + r.width))!.left.push({ start: r.y, end: r.y + r.height });
  }

  function classify(setA: Interval[], setB: Interval[]) {
    const events: { x: number; delta: number; which: 0 | 1 }[] = [];
    for (const i of setA) {
      events.push({ x: i.start, delta: 1, which: 0 });
      events.push({ x: i.end, delta: -1, which: 0 });
    }
    for (const i of setB) {
      events.push({ x: i.start, delta: 1, which: 1 });
      events.push({ x: i.end, delta: -1, which: 1 });
    }
    if (events.length === 0) return [] as { start: number; end: number; aHas: boolean; bHas: boolean }[];
    events.sort((p, q) => p.x - q.x || p.delta - q.delta);
    const out: { start: number; end: number; aHas: boolean; bHas: boolean }[] = [];
    let aCount = 0, bCount = 0, prev = events[0].x;
    for (const ev of events) {
      if (ev.x - prev > 1e-3 && (aCount > 0 || bCount > 0)) {
        out.push({ start: prev, end: ev.x, aHas: aCount > 0, bHas: bCount > 0 });
      }
      if (ev.which === 0) aCount += ev.delta; else bCount += ev.delta;
      prev = ev.x;
    }
    return out;
  }

  const walls: WallNode[] = [];
  let idx = 0;

  // Horizontal walls (constant z, varying x).
  horiz.forEach(({ above, below }, yk) => {
    const z = yk / 1000;
    for (const seg of classify(above, below)) {
      const isExternal = !(seg.aHas && seg.bHas);
      walls.push({
        id: `w-h-${idx++}-${yk}`,
        start: { x: seg.start, z },
        end: { x: seg.end, z },
        thickness: isExternal ? EXTERNAL_WALL_THICKNESS : INTERNAL_WALL_THICKNESS,
        height: DEFAULT_WALL_HEIGHT,
        isExternal,
        children: [],
      });
    }
  });

  // Vertical walls (constant x, varying z).
  vert.forEach(({ left, right }, xk) => {
    const x = xk / 1000;
    for (const seg of classify(left, right)) {
      const isExternal = !(seg.aHas && seg.bHas);
      walls.push({
        id: `w-v-${idx++}-${xk}`,
        start: { x, z: seg.start },
        end: { x, z: seg.end },
        thickness: isExternal ? EXTERNAL_WALL_THICKNESS : INTERNAL_WALL_THICKNESS,
        height: DEFAULT_WALL_HEIGHT,
        isExternal,
        children: [],
      });
    }
  });

  // Apply removed walls: drop wall segments fully covered by a room.openWalls
  // edge. (Approximation: removes the matching room's external wall segment.)
  const removed = new Set<string>();
  for (const r of plan.rooms) {
    for (const w of r.openWalls ?? []) {
      const seg = roomWallSegment(r, w);
      // mark all walls that lie on this segment AND share its axis.
      for (const wall of walls) {
        if (removed.has(wall.id)) continue;
        if (Math.abs(wall.start.z - wall.end.z) < 1e-3 && Math.abs(seg.start.z - seg.end.z) < 1e-3 && Math.abs(wall.start.z - seg.start.z) < 1e-3) {
          if (wall.start.x >= seg.start.x - 1e-3 && wall.end.x <= seg.end.x + 1e-3) {
            removed.add(wall.id);
          }
        } else if (Math.abs(wall.start.x - wall.end.x) < 1e-3 && Math.abs(seg.start.x - seg.end.x) < 1e-3 && Math.abs(wall.start.x - seg.start.x) < 1e-3) {
          if (wall.start.z >= seg.start.z - 1e-3 && wall.end.z <= seg.end.z + 1e-3) {
            removed.add(wall.id);
          }
        }
      }
    }
  }
  return walls.filter((w) => !removed.has(w.id));
}

/** Find the wall segment matching a room+wall direction with its position+size. */
function attachOpening(
  walls: WallNode[],
  plan: FloorPlan,
  ownerRoom: Room,
  wall: Wall,
  position: number,
  size: number,
  opening: DoorNode | WindowNode
) {
  const seg = roomWallSegment(ownerRoom, wall);
  // Find the wall whose axis matches and whose interval covers (along, along+size).
  const along = position * seg.length;
  const start = along - size / 2;
  const end = along + size / 2;
  for (const w of walls) {
    const isHoriz = Math.abs(w.start.z - w.end.z) < 1e-3;
    const isVert = Math.abs(w.start.x - w.end.x) < 1e-3;
    if ((wall === "north" || wall === "south") && !isHoriz) continue;
    if ((wall === "east" || wall === "west") && !isVert) continue;
    if (isHoriz) {
      if (Math.abs(w.start.z - seg.start.z) > 1e-3) continue;
      const wStart = Math.min(w.start.x, w.end.x);
      const wEnd = Math.max(w.start.x, w.end.x);
      const segAbsStart = seg.start.x + start;
      const segAbsEnd = seg.start.x + end;
      if (segAbsStart >= wStart - 1e-3 && segAbsEnd <= wEnd + 1e-3) {
        const wallLen = wEnd - wStart;
        const localCenter = (segAbsStart + segAbsEnd) / 2 - wStart;
        const adjusted = { ...opening, position: clamp(localCenter / wallLen, 0, 1) };
        w.children.push(adjusted);
        return;
      }
    } else if (isVert) {
      if (Math.abs(w.start.x - seg.start.x) > 1e-3) continue;
      const wStart = Math.min(w.start.z, w.end.z);
      const wEnd = Math.max(w.start.z, w.end.z);
      const segAbsStart = seg.start.z + start;
      const segAbsEnd = seg.start.z + end;
      if (segAbsStart >= wStart - 1e-3 && segAbsEnd <= wEnd + 1e-3) {
        const wallLen = wEnd - wStart;
        const localCenter = (segAbsStart + segAbsEnd) / 2 - wStart;
        const adjusted = { ...opening, position: clamp(localCenter / wallLen, 0, 1) };
        w.children.push(adjusted);
        return;
      }
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function furnitureToNode(f: Furniture): FurnitureNode {
  const yh = furnitureHeight(f.type);
  const cx = f.x + f.width / 2;
  const cz = f.y + f.height / 2;
  return {
    id: f.id,
    type: f.type,
    label: f.label,
    position: { x: cx, y: yh / 2, z: cz },
    rotation: ((f.rotation ?? 0) * Math.PI) / 180,
    dimensions: { x: f.width, y: yh, z: f.height },
    color: furnitureColor(f.type),
  };
}

export function floorPlanToBuildingModel(plan: FloorPlan): BuildingModel {
  const walls = buildWallsFromRooms(plan);

  // Attach doors / windows to walls.
  for (const d of plan.doors) {
    const room = plan.rooms.find((r) => r.id === d.roomId);
    if (!room) continue;
    if (d.silent) continue;
    const door: DoorNode = {
      id: d.id,
      type: "door",
      position: 0, // overwritten by attachOpening
      width: d.size,
      height: DEFAULT_DOOR_HEIGHT,
      swingSide: "right",
    };
    attachOpening(walls, plan, room, d.wall, d.position, d.size, door);
  }
  for (const w of plan.windows) {
    const room = plan.rooms.find((r) => r.id === w.roomId);
    if (!room) continue;
    const win: WindowNode = {
      id: w.id,
      type: "window",
      position: 0,
      width: w.size,
      height: DEFAULT_WINDOW_HEIGHT,
      sillHeight: DEFAULT_WINDOW_SILL,
    };
    attachOpening(walls, plan, room, w.wall, w.position, w.size, win);
  }

  const slabs: SlabNode[] = plan.rooms.map((r): SlabNode => ({
    id: `slab-${r.id}`,
    polygon: [
      { x: r.x, z: r.y },
      { x: r.x + r.width, z: r.y },
      { x: r.x + r.width, z: r.y + r.height },
      { x: r.x, z: r.y + r.height },
    ],
    thickness: DEFAULT_SLAB_THICKNESS,
    elevation: 0,
    material: FLOOR_COLORS[r.floor],
  }));

  const zones: ZoneNode[] = plan.rooms.map((r): ZoneNode => ({
    id: `zone-${r.id}`,
    name: r.name,
    polygon: [
      { x: r.x, z: r.y },
      { x: r.x + r.width, z: r.y },
      { x: r.x + r.width, z: r.y + r.height },
      { x: r.x, z: r.y + r.height },
    ],
    area: r.width * r.height,
    color: ZONE_COLOR,
  }));

  const furniture: FurnitureNode[] = plan.furniture.map(furnitureToNode);

  const level: LevelNode = {
    id: ACTIVE_LEVEL_ID,
    name: "Térreo",
    elevation: 0,
    height: DEFAULT_WALL_HEIGHT,
    walls,
    slabs,
    furniture,
    zones,
  };
  return { levels: [level], activeLevel: ACTIVE_LEVEL_ID };
}

// ============================================================
//             Claude tool → BuildingStore handlers
// ============================================================
//
// These are provided for direct agent-driven 3D editing. The primary Vibe app
// continues to use applyTool on FloorPlan; Scene3D rebuilds via the converter
// above. These handlers are exported so a future agent that operates directly
// on the 3D model can wire them up.

export function handleCreateRoom(store: BuildingStore, params: ToolInputs["create_room"]) {
  const x = params.x ?? 0;
  const z = params.y ?? 0;
  store.createRoom(store.model.activeLevel, params.name, x, z, params.width, params.height, params.floor_type);
}

export function handleAddDoor(store: BuildingStore, params: ToolInputs["add_door"]) {
  const level = store.getActiveLevel();
  // Find a wall whose two endpoints match the requested room+wall side.
  const zone = level.zones.find((z) => z.name.toLowerCase() === params.room_name.toLowerCase());
  if (!zone || zone.polygon.length < 4) return;
  const seg = zoneWallSegment(zone, params.wall);
  if (!seg) return;
  const target = level.walls.find((w) => wallMatchesSegment(w, seg));
  if (!target) return;
  const door: DoorNode = {
    id: `door-${Date.now()}`,
    type: "door",
    position: params.position ?? 0.5,
    width: params.size ?? 0.9,
    height: DEFAULT_DOOR_HEIGHT,
    swingSide: "right",
  };
  store.addDoorToWall(level.id, target.id, door);
}

export function handleAddWindow(store: BuildingStore, params: ToolInputs["add_window"]) {
  const level = store.getActiveLevel();
  const zone = level.zones.find((z) => z.name.toLowerCase() === params.room_name.toLowerCase());
  if (!zone || zone.polygon.length < 4) return;
  const seg = zoneWallSegment(zone, params.wall);
  if (!seg) return;
  const target = level.walls.find((w) => wallMatchesSegment(w, seg));
  if (!target) return;
  const win: WindowNode = {
    id: `win-${Date.now()}`,
    type: "window",
    position: params.position ?? 0.5,
    width: params.size ?? 1.2,
    height: DEFAULT_WINDOW_HEIGHT,
    sillHeight: DEFAULT_WINDOW_SILL,
  };
  store.addWindowToWall(level.id, target.id, win);
}

export function handleAddFurniture(store: BuildingStore, params: ToolInputs["add_furniture"]) {
  const level = store.getActiveLevel();
  const zone = level.zones.find((z) => z.name.toLowerCase() === params.room_name.toLowerCase());
  if (!zone) return;
  const cx = (zone.polygon[0].x + zone.polygon[2].x) / 2;
  const cz = (zone.polygon[0].z + zone.polygon[2].z) / 2;
  const yh = furnitureHeight(params.furniture_type);
  const node: FurnitureNode = {
    id: `f-${Date.now()}`,
    type: params.furniture_type,
    label: params.label ?? params.furniture_type,
    position: { x: cx, y: yh / 2, z: cz },
    rotation: 0,
    dimensions: { x: 1, y: yh, z: 0.6 },
    color: furnitureColor(params.furniture_type),
  };
  store.addFurniture(level.id, node);
}

export function handleRemoveFurniture(store: BuildingStore, params: ToolInputs["remove_furniture"]) {
  const level = store.getActiveLevel();
  if (params.furniture_id) store.removeFurniture(level.id, params.furniture_id);
}

export function handleClearAll(store: BuildingStore) {
  store.clearAll();
}

// --- helpers shared by handle* ---

function zoneWallSegment(zone: ZoneNode, wall: Wall): { start: Vec2; end: Vec2 } | null {
  if (zone.polygon.length < 4) return null;
  const [nw, ne, se, sw] = zone.polygon;
  switch (wall) {
    case "north": return { start: nw, end: ne };
    case "east":  return { start: ne, end: se };
    case "south": return { start: sw, end: se };
    case "west":  return { start: nw, end: sw };
  }
}

function wallMatchesSegment(w: WallNode, seg: { start: Vec2; end: Vec2 }): boolean {
  const e = 1e-2;
  const sameStart = Math.abs(w.start.x - seg.start.x) < e && Math.abs(w.start.z - seg.start.z) < e;
  const sameEnd = Math.abs(w.end.x - seg.end.x) < e && Math.abs(w.end.z - seg.end.z) < e;
  if (sameStart && sameEnd) return true;
  const flippedStart = Math.abs(w.start.x - seg.end.x) < e && Math.abs(w.start.z - seg.end.z) < e;
  const flippedEnd = Math.abs(w.end.x - seg.start.x) < e && Math.abs(w.end.z - seg.start.z) < e;
  return flippedStart && flippedEnd;
}
