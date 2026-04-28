// Server-side handlers for the new scene-graph agent tools.
// They mutate a SceneState in-place and return { ok, message }.
//
// These handlers operate on a server-local SceneState that the chat route
// builds from the client-provided FloorPlan + any prior scene mutations
// in this turn.

import {
  type AnyNode,
  type DoorNode,
  type FloorMaterial,
  type NodeId,
  type RoomNode,
  type SceneState,
  type Vec2,
  type WallNode,
  type WindowNode,
  v2Norm,
  v2Sub,
  polygonAbsArea,
} from "../scene/types";
import { runDerivation } from "../scene/derive";
import { applyAutoDimensions } from "../scene/auto-dimensions";

const EXTERNAL_THICKNESS = 0.15;
const INTERNAL_THICKNESS = 0.10;
const DEFAULT_HEIGHT = 2.8;

let _seq = 0;
function genId(prefix: string): NodeId {
  _seq += 1;
  return `${prefix}:agent-${Date.now().toString(36)}-${_seq}`;
}

function reDerive(scene: SceneState): SceneState {
  const out = runDerivation(scene.nodes, scene.activeLevelId);
  const walls = Object.values(out.nodes).filter((n): n is WallNode => n.type === "wall");
  const withDims = applyAutoDimensions(out.nodes, walls);
  return { ...scene, nodes: withDims };
}

export interface ToolResult { ok: boolean; message: string; sceneAfter?: SceneState; }

interface AddWallInput {
  start_x: number; start_z: number; end_x: number; end_z: number;
  thickness?: number; height?: number; is_exterior?: boolean;
}

export function handleAddWall(scene: SceneState, input: AddWallInput): ToolResult {
  const wall: WallNode = {
    id: genId("wall"),
    type: "wall",
    parentId: scene.activeLevelId,
    start: { x: input.start_x, z: input.start_z },
    end: { x: input.end_x, z: input.end_z },
    thickness: input.thickness ?? (input.is_exterior ? EXTERNAL_THICKNESS : INTERNAL_THICKNESS),
    height: input.height ?? DEFAULT_HEIGHT,
    isExterior: input.is_exterior ?? false,
    doors: [],
    windows: [],
  };
  const next: SceneState = {
    ...scene,
    nodes: { ...scene.nodes, [wall.id]: wall },
  };
  const derived = reDerive(next);
  return {
    ok: true,
    message: `Parede ${wall.id} criada (${input.start_x.toFixed(2)},${input.start_z.toFixed(2)} → ${input.end_x.toFixed(2)},${input.end_z.toFixed(2)}).`,
    sceneAfter: derived,
  };
}

export function handleMoveWallEndpoint(
  scene: SceneState,
  input: { wall_id: string; endpoint: "start" | "end"; x: number; z: number }
): ToolResult {
  const wall = scene.nodes[input.wall_id];
  if (!wall || wall.type !== "wall") return { ok: false, message: `Parede ${input.wall_id} não encontrada.` };
  const next: WallNode = { ...(wall as WallNode) };
  if (input.endpoint === "start") next.start = { x: input.x, z: input.z };
  else next.end = { x: input.x, z: input.z };
  const sceneNext: SceneState = {
    ...scene,
    nodes: { ...scene.nodes, [wall.id]: next },
  };
  return { ok: true, message: `Endpoint ${input.endpoint} de ${wall.id} movido.`, sceneAfter: reDerive(sceneNext) };
}

export function handleDeleteWall(scene: SceneState, input: { wall_id: string }): ToolResult {
  const wall = scene.nodes[input.wall_id];
  if (!wall || wall.type !== "wall") return { ok: false, message: `Parede ${input.wall_id} não encontrada.` };
  const w = wall as WallNode;
  const nodes = { ...scene.nodes };
  delete nodes[w.id];
  for (const id of [...w.doors, ...w.windows]) delete nodes[id];
  return {
    ok: true,
    message: `Parede ${w.id} removida (${w.doors.length + w.windows.length} aberturas associadas).`,
    sceneAfter: reDerive({ ...scene, nodes }),
  };
}

export function handleSplitWall(
  scene: SceneState,
  input: { wall_id: string; at_offset: number }
): ToolResult {
  const wall = scene.nodes[input.wall_id];
  if (!wall || wall.type !== "wall") return { ok: false, message: `Parede ${input.wall_id} não encontrada.` };
  const w = wall as WallNode;
  const dir = v2Norm(v2Sub(w.end, w.start));
  const len = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
  const t = Math.max(0.05, Math.min(len - 0.05, input.at_offset));
  const mid: Vec2 = { x: w.start.x + dir.x * t, z: w.start.z + dir.z * t };
  const wallA: WallNode = { ...w, id: genId("wall"), end: mid, doors: [], windows: [] };
  const wallB: WallNode = { ...w, id: genId("wall"), start: mid, doors: [], windows: [] };
  // Reassign children based on offset.
  const nodes = { ...scene.nodes };
  delete nodes[w.id];
  nodes[wallA.id] = wallA;
  nodes[wallB.id] = wallB;
  for (const cid of [...w.doors, ...w.windows]) {
    const c = nodes[cid] as DoorNode | WindowNode | undefined;
    if (!c) continue;
    if (c.offset <= t) {
      const upd = { ...c, wallId: wallA.id };
      nodes[cid] = upd;
      if (c.type === "door") wallA.doors.push(cid); else wallA.windows.push(cid);
    } else {
      const upd = { ...c, wallId: wallB.id, offset: c.offset - t };
      nodes[cid] = upd;
      if (c.type === "door") wallB.doors.push(cid); else wallB.windows.push(cid);
    }
  }
  return {
    ok: true,
    message: `Parede ${w.id} dividida em ${wallA.id} + ${wallB.id} no offset ${t.toFixed(2)}m.`,
    sceneAfter: reDerive({ ...scene, nodes }),
  };
}

interface AttachDoorInput {
  wall_id: string; offset: number; width?: number; height?: number;
  hinge_side?: "start" | "end"; swing_direction?: "in" | "out";
}

export function handleAttachDoor(scene: SceneState, input: AttachDoorInput): ToolResult {
  const wall = scene.nodes[input.wall_id];
  if (!wall || wall.type !== "wall") return { ok: false, message: `Parede ${input.wall_id} não encontrada.` };
  const w = wall as WallNode;
  const door: DoorNode = {
    id: genId("door"),
    type: "door",
    parentId: w.id,
    wallId: w.id,
    offset: input.offset,
    width: input.width ?? 0.80,
    height: input.height ?? 2.10,
    hingeSide: input.hinge_side ?? "start",
    swingDirection: input.swing_direction ?? "in",
  };
  const nextWall: WallNode = { ...w, doors: [...w.doors, door.id] };
  const nodes = { ...scene.nodes, [door.id]: door, [w.id]: nextWall };
  return {
    ok: true,
    message: `Porta ${door.id} atachada a ${w.id} (offset=${input.offset.toFixed(2)}m, largura=${door.width.toFixed(2)}m).`,
    sceneAfter: { ...scene, nodes },
  };
}

interface AttachWindowInput {
  wall_id: string; offset: number; width?: number; height?: number; sill_height?: number;
}

export function handleAttachWindow(scene: SceneState, input: AttachWindowInput): ToolResult {
  const wall = scene.nodes[input.wall_id];
  if (!wall || wall.type !== "wall") return { ok: false, message: `Parede ${input.wall_id} não encontrada.` };
  const w = wall as WallNode;
  const win: WindowNode = {
    id: genId("window"),
    type: "window",
    parentId: w.id,
    wallId: w.id,
    offset: input.offset,
    width: input.width ?? 1.50,
    height: input.height ?? 1.20,
    sillHeight: input.sill_height ?? 0.90,
  };
  const nextWall: WallNode = { ...w, windows: [...w.windows, win.id] };
  const nodes = { ...scene.nodes, [win.id]: win, [w.id]: nextWall };
  return {
    ok: true,
    message: `Janela ${win.id} atachada a ${w.id} (offset=${input.offset.toFixed(2)}m, largura=${win.width.toFixed(2)}m).`,
    sceneAfter: { ...scene, nodes },
  };
}

export function handleMoveOpening(
  scene: SceneState,
  input: { opening_id: string; new_offset: number }
): ToolResult {
  const op = scene.nodes[input.opening_id];
  if (!op || (op.type !== "door" && op.type !== "window"))
    return { ok: false, message: `Abertura ${input.opening_id} não encontrada.` };
  const next = { ...op, offset: input.new_offset };
  return {
    ok: true,
    message: `Abertura ${op.id} reposicionada (offset=${input.new_offset.toFixed(2)}m).`,
    sceneAfter: { ...scene, nodes: { ...scene.nodes, [op.id]: next as AnyNode } },
  };
}

export function handleDeleteOpening(scene: SceneState, input: { opening_id: string }): ToolResult {
  const op = scene.nodes[input.opening_id];
  if (!op || (op.type !== "door" && op.type !== "window"))
    return { ok: false, message: `Abertura ${input.opening_id} não encontrada.` };
  const wall = scene.nodes[(op as DoorNode | WindowNode).wallId] as WallNode | undefined;
  const nodes = { ...scene.nodes };
  delete nodes[op.id];
  if (wall) {
    nodes[wall.id] = {
      ...wall,
      doors: wall.doors.filter((d) => d !== op.id),
      windows: wall.windows.filter((w) => w !== op.id),
    };
  }
  return { ok: true, message: `Abertura ${op.id} removida.`, sceneAfter: { ...scene, nodes } };
}

interface PlaceRoomAdjacentInput {
  name: string;
  base_room_id: string;
  side: "north" | "south" | "east" | "west";
  width: number;
  depth: number;
  floor_material?: string;
}

export function handlePlaceRoomAdjacent(scene: SceneState, input: PlaceRoomAdjacentInput): ToolResult {
  const base = scene.nodes[input.base_room_id];
  if (!base || base.type !== "room") return { ok: false, message: `Base room ${input.base_room_id} não encontrada.` };
  const r = base as RoomNode;
  // Compute the AABB of the base room polygon to derive its rectangle.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of r.polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  let nx = 0, nz = 0, nw = 0, nd = 0;
  if (input.side === "east") { nx = maxX; nz = minZ; nw = input.width; nd = maxZ - minZ; }
  else if (input.side === "west") { nx = minX - input.width; nz = minZ; nw = input.width; nd = maxZ - minZ; }
  else if (input.side === "south") { nx = minX; nz = maxZ; nw = maxX - minX; nd = input.depth; }
  else { nx = minX; nz = minZ - input.depth; nw = maxX - minX; nd = input.depth; }
  // Resize new room to the requested dimensions on the variable axis.
  if (input.side === "east" || input.side === "west") nd = input.depth;
  if (input.side === "north" || input.side === "south") nw = input.width;

  // Generate 4 walls for the new room.
  const corners: Vec2[] = [
    { x: nx, z: nz },
    { x: nx + nw, z: nz },
    { x: nx + nw, z: nz + nd },
    { x: nx, z: nz + nd },
  ];
  const newWalls: WallNode[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    newWalls.push({
      id: genId("wall"),
      type: "wall",
      parentId: scene.activeLevelId,
      start: a,
      end: b,
      thickness: INTERNAL_THICKNESS,
      height: DEFAULT_HEIGHT,
      isExterior: false,
      doors: [],
      windows: [],
    });
  }
  const nodes = { ...scene.nodes };
  for (const w of newWalls) nodes[w.id] = w;
  return {
    ok: true,
    message: `Cômodo ${input.name} (${nw.toFixed(1)}×${nd.toFixed(1)}m) criado adjacente ao lado ${input.side} de ${r.name}.`,
    sceneAfter: reDerive({ ...scene, nodes }),
  };
}

export function handleSceneTool(
  scene: SceneState,
  name: string,
  input: unknown
): ToolResult {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "add_wall":
      return handleAddWall(scene, i as unknown as AddWallInput);
    case "move_wall_endpoint":
      return handleMoveWallEndpoint(scene, i as { wall_id: string; endpoint: "start" | "end"; x: number; z: number });
    case "delete_wall_node":
      return handleDeleteWall(scene, i as { wall_id: string });
    case "split_wall":
      return handleSplitWall(scene, i as { wall_id: string; at_offset: number });
    case "attach_door":
      return handleAttachDoor(scene, i as unknown as AttachDoorInput);
    case "attach_window":
      return handleAttachWindow(scene, i as unknown as AttachWindowInput);
    case "move_opening":
      return handleMoveOpening(scene, i as { opening_id: string; new_offset: number });
    case "delete_opening":
      return handleDeleteOpening(scene, i as { opening_id: string });
    case "place_room_adjacent":
      return handlePlaceRoomAdjacent(scene, i as unknown as PlaceRoomAdjacentInput);
    case "compose_apartment_v2": {
      const composers = require("./composers") as typeof import("./composers");
      return composers.composeApartment(scene, i as unknown as Parameters<typeof composers.composeApartment>[1]);
    }
    case "furnish_room_v2": {
      const composers = require("./composers") as typeof import("./composers");
      return composers.furnishRoom(scene, i as unknown as Parameters<typeof composers.furnishRoom>[1]);
    }
    default:
      return { ok: false, message: `Tool desconhecida: ${name}` };
  }
}

export const SCENE_TOOL_NAMES = new Set([
  "add_wall",
  "move_wall_endpoint",
  "delete_wall_node",
  "split_wall",
  "attach_door",
  "attach_window",
  "move_opening",
  "delete_opening",
  "place_room_adjacent",
  "compose_apartment_v2",
  "furnish_room_v2",
]);

/** Summarise the current scene for the agent (rooms with ids, walls with ids, openings). */
export function summarizeScene(scene: SceneState): string {
  const rooms = Object.values(scene.nodes).filter((n): n is RoomNode => n.type === "room");
  const walls = Object.values(scene.nodes).filter((n): n is WallNode => n.type === "wall");
  const doors = Object.values(scene.nodes).filter((n): n is DoorNode => n.type === "door");
  const windows = Object.values(scene.nodes).filter((n): n is WindowNode => n.type === "window");
  const lines: string[] = [];
  lines.push(`Total: ${rooms.length} rooms, ${walls.length} walls, ${doors.length} doors, ${windows.length} windows.`);
  if (rooms.length > 0) {
    lines.push("Rooms (id, name, área):");
    for (const r of rooms) lines.push(`  - ${r.id} · ${r.name} · ${polygonAbsArea(r.polygon).toFixed(2)} m²`);
  }
  if (walls.length > 0 && walls.length <= 30) {
    lines.push("Walls (id, start, end, exterior, openings):");
    for (const w of walls) {
      const op = w.doors.length + w.windows.length;
      const ext = w.isExterior ? " EXT" : "";
      lines.push(`  - ${w.id} (${w.start.x.toFixed(2)},${w.start.z.toFixed(2)})→(${w.end.x.toFixed(2)},${w.end.z.toFixed(2)})${ext} ${op > 0 ? `+${op} ab.` : ""}`);
    }
  } else if (walls.length > 30) {
    lines.push(`(${walls.length} walls — too many to list; use ids returned from your last tool calls.)`);
  }
  return lines.join("\n");
}
