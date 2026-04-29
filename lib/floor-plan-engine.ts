import type {
  Annotation,
  Column,
  Door,
  FloorMaterial,
  FloorPlan,
  Furniture,
  FurnitureGroup,
  FurnitureType,
  Room,
  SelectedElement,
  SelectionContext,
  Stairs,
  ToolInputs,
  ToolName,
  Wall,
  Window as PlanWindow,
} from "./types";
import { FURN_DEFS, defaultFurnitureLabel, defaultFurnitureSize } from "./furniture-svgs";
import { validatePlacement, summarizeRoomLayout } from "./scene/placement-validators";

// ---------- ID + helpers ----------

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyPlan(): FloorPlan {
  return {
    rooms: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    columns: [],
    annotations: [],
    northArrow: null,
  };
}

function ensureLists(plan: FloorPlan) {
  if (!plan.stairs) plan.stairs = [];
  if (!plan.columns) plan.columns = [];
  if (!plan.annotations) plan.annotations = [];
}

function findRoom(plan: FloorPlan, name: string): Room | undefined {
  const norm = name.trim().toLowerCase();
  return plan.rooms.find((r) => r.name.trim().toLowerCase() === norm);
}

function bestSpot(plan: FloorPlan, w: number, h: number): { x: number; y: number } {
  if (plan.rooms.length === 0) return { x: 0, y: 0 };
  const margin = 0;
  const step = 0.5;
  const minX = Math.min(...plan.rooms.map((r) => r.x));
  const maxX = Math.max(...plan.rooms.map((r) => r.x + r.width));
  const minY = Math.min(...plan.rooms.map((r) => r.y));
  const maxY = Math.max(...plan.rooms.map((r) => r.y + r.height));
  const candidates: { x: number; y: number }[] = [
    { x: maxX + margin, y: minY },
    { x: minX, y: maxY + margin },
    { x: maxX + margin, y: maxY + margin },
  ];
  for (let y = minY; y <= maxY + h; y += step) {
    for (let x = minX; x <= maxX + w; x += step) candidates.push({ x, y });
  }
  for (const c of candidates) if (!overlapsAny(plan, c.x, c.y, w, h)) return c;
  return { x: maxX + margin, y: minY };
}

function overlapsAny(plan: FloorPlan, x: number, y: number, w: number, h: number): boolean {
  for (const r of plan.rooms) {
    if (x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y) return true;
  }
  return false;
}

// ---------- Re-exports for back-compat ----------
export { defaultFurnitureSize, defaultFurnitureLabel };

// ---------- Apply a single tool ----------

export interface ApplyResult {
  ok: boolean;
  message: string;
}

export function applyTool<T extends ToolName>(
  plan: FloorPlan,
  toolName: T,
  rawInput: unknown
): ApplyResult {
  ensureLists(plan);
  const input = (rawInput ?? {}) as ToolInputs[T];
  try {
    switch (toolName) {
      case "create_room":
        return doCreateRoom(plan, input as ToolInputs["create_room"]);
      case "remove_room":
        return doRemoveRoom(plan, input as ToolInputs["remove_room"]);
      case "resize_room":
        return doResizeRoom(plan, input as ToolInputs["resize_room"]);
      case "duplicate_room":
        return doDuplicateRoom(plan, input as ToolInputs["duplicate_room"]);
      case "add_door":
        return doAddDoor(plan, input as ToolInputs["add_door"]);
      case "add_window":
        return doAddWindow(plan, input as ToolInputs["add_window"]);
      case "delete_wall":
        return doDeleteWall(plan, input as ToolInputs["delete_wall"]);
      case "merge_rooms":
        return doMergeRooms(plan, input as ToolInputs["merge_rooms"]);
      case "add_partition":
        return doAddPartition(plan, input as ToolInputs["add_partition"]);
      case "split_room":
        return doSplitRoom(plan, input as ToolInputs["split_room"]);
      case "move_wall":
        return doMoveWall(plan, input as ToolInputs["move_wall"]);
      case "add_column":
        return doAddColumn(plan, input as ToolInputs["add_column"]);
      case "set_floor_material":
        return doSetFloor(plan, input as ToolInputs["set_floor_material"]);
      case "set_railing_material":
        return doSetRailingMaterial(plan, input as ToolInputs["set_railing_material"]);
      case "split_floor":
        return doSplitFloor(plan, input as ToolInputs["split_floor"]);
      case "add_furniture":
        return doAddFurniture(plan, input as ToolInputs["add_furniture"]);
      case "add_furniture_group":
        return doAddFurnitureGroup(plan, input as ToolInputs["add_furniture_group"]);
      case "swap_furniture":
        return doSwapFurniture(plan, input as ToolInputs["swap_furniture"]);
      case "remove_furniture":
        return doRemoveFurniture(plan, input as ToolInputs["remove_furniture"]);
      case "move_furniture":
        return doMoveFurniture(plan, input as ToolInputs["move_furniture"]);
      case "mirror_layout":
        return doMirrorLayout(plan, input as ToolInputs["mirror_layout"]);
      case "rotate_layout":
        return doRotateLayout(plan, input as ToolInputs["rotate_layout"]);
      case "add_balcony":
        return doAddBalcony(plan, input as ToolInputs["add_balcony"]);
      case "add_stairs":
        return doAddStairs(plan, input as ToolInputs["add_stairs"]);
      case "add_dimension":
        return doAddDimension(plan, input as ToolInputs["add_dimension"]);
      case "add_text_note":
        return doAddTextNote(plan, input as ToolInputs["add_text_note"]);
      case "add_north_arrow":
        return doAddNorthArrow(plan, input as ToolInputs["add_north_arrow"]);
      case "create_apartment_layout":
        return doCreateApartment(plan, input as ToolInputs["create_apartment_layout"]);
      case "furnish_room":
        return doFurnishRoom(plan, input as ToolInputs["furnish_room"]);
      case "clear_all":
        plan.rooms.length = 0;
        plan.doors.length = 0;
        plan.windows.length = 0;
        plan.furniture.length = 0;
        plan.stairs!.length = 0;
        plan.columns!.length = 0;
        plan.annotations!.length = 0;
        plan.northArrow = null;
        return { ok: true, message: "Planta apagada." };
      default:
        return { ok: false, message: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (err) {
    return { ok: false, message: `Erro ao executar ${toolName}: ${(err as Error).message}` };
  }
}

function defaultFloorFor(name: string): FloorMaterial {
  const n = name.toLowerCase();
  if (/(banheiro|lavabo)/.test(n)) return "porcelanato";
  if (/(cozinha|área|servico|serviço|lavanderia)/.test(n)) return "porcelanato";
  if (/(corredor|hall|circula)/.test(n)) return "madeira";
  if (/(jardim|quintal|gramado)/.test(n)) return "grama";
  if (/(varanda|terraço|terraco)/.test(n)) return "ceramica";
  if (/(piscina|deck)/.test(n)) return "deck";
  return "madeira";
}

export function isCorridor(name: string): boolean {
  return /(corredor|hall|circula)/i.test(name);
}

function doCreateRoom(plan: FloorPlan, input: ToolInputs["create_room"]): ApplyResult {
  const { name, width, height } = input;
  if (!name || !width || !height) return { ok: false, message: "Nome, largura e altura são obrigatórios." };
  if (findRoom(plan, name)) return { ok: false, message: `Já existe um cômodo chamado '${name}'.` };
  let { x, y } = input;
  if (x === undefined || y === undefined) {
    const spot = bestSpot(plan, width, height);
    x = spot.x;
    y = spot.y;
  }
  const isExterior = /(jardim|quintal|gramado|varanda|terraço|terraco|piscina|deck)/i.test(name);
  const room: Room = {
    id: nextId("room"),
    name,
    x,
    y,
    width,
    height,
    floor: input.floor_type ?? defaultFloorFor(name),
    appear: 0,
    isExterior: isExterior || undefined,
  };
  plan.rooms.push(room);
  return { ok: true, message: `Cômodo '${name}' criado (${width}x${height}m).` };
}

function doRemoveRoom(plan: FloorPlan, input: ToolInputs["remove_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  plan.rooms = plan.rooms.filter((r) => r.id !== room.id);
  plan.doors = plan.doors.filter((d) => d.roomId !== room.id);
  plan.windows = plan.windows.filter((w) => w.roomId !== room.id);
  plan.furniture = plan.furniture.filter((f) => f.roomId !== room.id);
  return { ok: true, message: `Cômodo '${room.name}' removido.` };
}

function doResizeRoom(plan: FloorPlan, input: ToolInputs["resize_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (input.width < 1 || input.height < 1) return { ok: false, message: "Dimensões muito pequenas." };
  room.width = input.width;
  room.height = input.height;
  // Clamp furniture inside.
  for (const f of plan.furniture.filter((ff) => ff.roomId === room.id)) {
    f.x = Math.max(room.x, Math.min(room.x + room.width - f.width, f.x));
    f.y = Math.max(room.y, Math.min(room.y + room.height - f.height, f.y));
  }
  return { ok: true, message: `Cômodo '${room.name}' redimensionado para ${input.width}x${input.height}m.` };
}

function doDuplicateRoom(plan: FloorPlan, input: ToolInputs["duplicate_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const newName = input.new_name ?? `${room.name} (cópia)`;
  if (findRoom(plan, newName)) return { ok: false, message: `Já existe '${newName}'.` };
  const ox = input.offset_x ?? room.width + 0.2;
  const oy = input.offset_y ?? 0;
  const newRoom: Room = {
    ...room,
    id: nextId("room"),
    name: newName,
    x: room.x + ox,
    y: room.y + oy,
    appear: 0,
  };
  plan.rooms.push(newRoom);
  // Copy furniture
  for (const f of plan.furniture.filter((ff) => ff.roomId === room.id)) {
    plan.furniture.push({
      ...f,
      id: nextId("furn"),
      roomId: newRoom.id,
      x: f.x + ox,
      y: f.y + oy,
    });
  }
  return { ok: true, message: `Cômodo '${room.name}' duplicado como '${newName}'.` };
}

function doAddDoor(plan: FloorPlan, input: ToolInputs["add_door"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const position = clamp01(input.position ?? 0.5);
  const size = input.size ?? 0.9;

  // Dedup: skip if there's already a door whose world centre is within
  // ~50 cm of the new one. Catches both repeated calls on the same
  // (room, wall) pair AND the common pattern of two adjacent rooms
  // each adding a door on their shared wall (one physical door, two
  // logical entries).
  const newCenter = doorWorldCenter(room, input.wall, position);
  for (const d of plan.doors) {
    const dRoom = plan.rooms.find((r) => r.id === d.roomId);
    if (!dRoom) continue;
    const c = doorWorldCenter(dRoom, d.wall, d.position);
    if (Math.hypot(c.x - newCenter.x, c.y - newCenter.y) < 0.5) {
      return {
        ok: true,
        message: `Porta já existe próximo a '${room.name}' (${input.wall}); pulando duplicata.`,
      };
    }
  }

  const door: Door = {
    id: nextId("door"),
    roomId: room.id,
    wall: input.wall,
    position,
    size,
  };
  plan.doors.push(door);
  return { ok: true, message: `Porta adicionada em '${room.name}' (${input.wall}).` };
}

/** World-space centre of a door given its (room, wall, position) tuple.
 *  Used to detect duplicates across rooms that share a wall. */
function doorWorldCenter(
  room: { x: number; y: number; width: number; height: number },
  wall: "north" | "south" | "east" | "west",
  position: number,
): { x: number; y: number } {
  switch (wall) {
    case "north":
      return { x: room.x + position * room.width, y: room.y };
    case "south":
      return { x: room.x + position * room.width, y: room.y + room.height };
    case "west":
      return { x: room.x, y: room.y + position * room.height };
    case "east":
      return { x: room.x + room.width, y: room.y + position * room.height };
  }
}

function doAddWindow(plan: FloorPlan, input: ToolInputs["add_window"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const win: PlanWindow = {
    id: nextId("win"),
    roomId: room.id,
    wall: input.wall,
    position: clamp01(input.position ?? 0.5),
    size: input.size ?? 1.5,
  };
  plan.windows.push(win);
  return { ok: true, message: `Janela adicionada em '${room.name}'.` };
}

function doDeleteWall(plan: FloorPlan, input: ToolInputs["delete_wall"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (!room.openWalls) room.openWalls = [];
  if (!room.openWalls.includes(input.wall)) room.openWalls.push(input.wall);
  // Clear any door/window on that wall
  plan.doors = plan.doors.filter((d) => !(d.roomId === room.id && d.wall === input.wall));
  plan.windows = plan.windows.filter((w) => !(w.roomId === room.id && w.wall === input.wall));
  return { ok: true, message: `Parede ${input.wall} de '${room.name}' aberta.` };
}

function doMergeRooms(plan: FloorPlan, input: ToolInputs["merge_rooms"]): ApplyResult {
  const a = findRoom(plan, input.room_a);
  const b = findRoom(plan, input.room_b);
  if (!a || !b) return { ok: false, message: "Cômodo(s) não encontrado(s)." };
  // Compute axis-aligned bounding box (only valid if rooms touch and bbox is fully covered).
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  const totalArea = (maxX - minX) * (maxY - minY);
  const sumArea = a.width * a.height + b.width * b.height;
  if (Math.abs(totalArea - sumArea) > 0.05) {
    return {
      ok: false,
      message: "Os cômodos não formam um retângulo perfeito juntos. Não dá pra fundir.",
    };
  }
  const newRoom: Room = {
    id: nextId("room"),
    name: input.new_name ?? `${a.name} + ${b.name}`,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    floor: a.floor,
    appear: 0,
  };
  // Reassign furniture and doors/windows from both to the new room.
  for (const f of plan.furniture) if (f.roomId === a.id || f.roomId === b.id) f.roomId = newRoom.id;
  // Doors that opened *between* a and b (interior) should be removed.
  // Approximate: keep doors/windows on outer walls only.
  plan.doors = plan.doors.filter((d) => d.roomId !== a.id && d.roomId !== b.id);
  plan.windows = plan.windows.filter((w) => w.roomId !== a.id && w.roomId !== b.id);
  plan.rooms = plan.rooms.filter((r) => r.id !== a.id && r.id !== b.id);
  plan.rooms.push(newRoom);
  return { ok: true, message: `'${a.name}' + '${b.name}' fundidos em '${newRoom.name}'.` };
}

function doAddPartition(plan: FloorPlan, input: ToolInputs["add_partition"]): ApplyResult {
  // Same as split_room with a default new floor.
  return doSplitRoom(plan, {
    room_name: input.room_name,
    orientation: input.orientation,
    position: input.position,
    new_room_name: input.new_room_name,
  });
}

function doSplitRoom(plan: FloorPlan, input: ToolInputs["split_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const pos = clamp01(input.position ?? 0.5);
  const newName = input.new_room_name ?? `${room.name} 2`;
  if (findRoom(plan, newName)) return { ok: false, message: `Já existe '${newName}'.` };
  let newRoom: Room;
  if (input.orientation === "horizontal") {
    // split along width: original keeps top, new takes bottom
    const splitH = room.height * pos;
    newRoom = {
      id: nextId("room"),
      name: newName,
      x: room.x,
      y: room.y + splitH,
      width: room.width,
      height: room.height - splitH,
      floor: input.new_room_floor ?? room.floor,
      appear: 0,
    };
    room.height = splitH;
  } else {
    const splitW = room.width * pos;
    newRoom = {
      id: nextId("room"),
      name: newName,
      x: room.x + splitW,
      y: room.y,
      width: room.width - splitW,
      height: room.height,
      floor: input.new_room_floor ?? room.floor,
      appear: 0,
    };
    room.width = splitW;
  }
  plan.rooms.push(newRoom);
  // Reassign furniture to whichever sub-room contains them.
  for (const f of plan.furniture.filter((ff) => ff.roomId === room.id)) {
    if (f.x >= newRoom.x && f.y >= newRoom.y && f.x + f.width <= newRoom.x + newRoom.width && f.y + f.height <= newRoom.y + newRoom.height) {
      f.roomId = newRoom.id;
    }
  }
  return { ok: true, message: `'${room.name}' dividido — novo cômodo '${newName}' criado.` };
}

function doMoveWall(plan: FloorPlan, input: ToolInputs["move_wall"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const d = input.delta;
  const EPS = 0.01;

  // Validate first so we don't mutate part-way and leave the plan in a
  // bad state if the second pass fails.
  if (input.wall === "north" || input.wall === "south") {
    const newH = input.wall === "north" ? room.height + d : room.height + d;
    if (newH < 1) return { ok: false, message: "Cômodo ficaria pequeno demais." };
  } else {
    const newW = input.wall === "west" ? room.width + d : room.width + d;
    if (newW < 1) return { ok: false, message: "Cômodo ficaria pequeno demais." };
  }

  // Capture the world coordinate of the wall BEFORE mutating so we can
  // find neighbours that share it. e.g. moving Sala.east finds Varanda
  // whose west aligned with sala.x + sala.width.
  type WallEdge = "north" | "south" | "east" | "west";
  function wallCoord(r: Room, w: WallEdge): number {
    switch (w) {
      case "north": return r.y;
      case "south": return r.y + r.height;
      case "west": return r.x;
      case "east": return r.x + r.width;
    }
  }
  const opposite: Record<WallEdge, WallEdge> = {
    north: "south",
    south: "north",
    east: "west",
    west: "east",
  };
  function rangeOverlaps(
    aStart: number, aEnd: number, bStart: number, bEnd: number,
  ): boolean {
    return aEnd > bStart + EPS && aStart < bEnd - EPS;
  }

  const originalCoord = wallCoord(room, input.wall);

  // Find every neighbouring room whose OPPOSITE wall sits at this exact
  // coordinate AND whose along-wall span overlaps ours. Shift their wall
  // by the same Δ so the shared boundary stays a single line.
  const neighbours: { room: Room; wall: WallEdge }[] = [];
  for (const other of plan.rooms) {
    if (other === room) continue;
    const oppWall = opposite[input.wall];
    if (Math.abs(wallCoord(other, oppWall) - originalCoord) > EPS) continue;
    // Span overlap: both rooms must actually share the wall — not just
    // sit on the same coord at different X/Y ranges.
    let sameSpan = false;
    if (input.wall === "north" || input.wall === "south") {
      sameSpan = rangeOverlaps(room.x, room.x + room.width, other.x, other.x + other.width);
    } else {
      sameSpan = rangeOverlaps(room.y, room.y + room.height, other.y, other.y + other.height);
    }
    if (sameSpan) neighbours.push({ room: other, wall: oppWall });
  }

  // Apply the move to the primary room.
  if (input.wall === "north") {
    room.y -= d;
    room.height += d;
  } else if (input.wall === "south") {
    room.height += d;
  } else if (input.wall === "west") {
    room.x -= d;
    room.width += d;
  } else {
    room.width += d;
  }

  // Apply the inverse adjustment to neighbours so the shared wall stays
  // shared — they shrink by Δ on the opposite side.
  for (const n of neighbours) {
    const w = n.wall;
    const r = n.room;
    if (w === "north") {
      // The neighbour's NORTH wall is the same coord as our wall before
      // the move; shrink it by Δ (move south by Δ).
      const newH = r.height - d;
      if (newH < 1) continue;
      r.y += d;
      r.height = newH;
    } else if (w === "south") {
      const newH = r.height - d;
      if (newH < 1) continue;
      r.height = newH;
    } else if (w === "west") {
      const newW = r.width - d;
      if (newW < 1) continue;
      r.x += d;
      r.width = newW;
    } else {
      const newW = r.width - d;
      if (newW < 1) continue;
      r.width = newW;
    }
  }

  const suffix = neighbours.length > 0 ? ` (+ ${neighbours.length} vizinho${neighbours.length > 1 ? "s" : ""})` : "";
  return { ok: true, message: `Parede ${input.wall} de '${room.name}' movida ${d}m${suffix}.` };
}

function doAddColumn(plan: FloorPlan, input: ToolInputs["add_column"]): ApplyResult {
  ensureLists(plan);
  const col: Column = {
    id: nextId("col"),
    x: input.x,
    y: input.y,
    size: input.size ?? 0.3,
    shape: input.shape ?? "square",
  };
  plan.columns!.push(col);
  return { ok: true, message: `Coluna ${col.shape} adicionada em (${input.x}, ${input.y}).` };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function doAddFurniture(
  plan: FloorPlan,
  input: ToolInputs["add_furniture"],
  opts?: { skipOverlapCheck?: boolean },
): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const t = input.furniture_type;
  const def = FURN_DEFS[t];
  if (!def) return { ok: false, message: `Tipo de móvel desconhecido: ${t}` };
  const size = def.sizeM;
  // Reject items that don't fit the room outright — gives the agent a
  // chance to pick a smaller variant or a different room.
  if (size.w > room.width + 0.01 || size.h > room.height + 0.01) {
    return {
      ok: false,
      message:
        `${def.label} (${size.w.toFixed(2)}×${size.h.toFixed(2)}m) não cabe em ` +
        `'${room.name}' (${room.width.toFixed(2)}×${room.height.toFixed(2)}m). ` +
        `Escolha um modelo menor ou outro cômodo.`,
    };
  }
  const rx = clamp01(input.relative_x ?? 0.5);
  const ry = clamp01(input.relative_y ?? 0.5);
  const fx = room.x + rx * Math.max(0, room.width - size.w);
  const fy = room.y + ry * Math.max(0, room.height - size.h);

  // Rich placement validators (Phase C). Every furniture type carries
  // metadata in lib/furniture-placement.ts: anchor (wall/corner/free),
  // clearance per side, ergonomic relations (kitchen triangle, sofa-TV).
  // These run BEFORE the legacy AABB overlap so we surface the most
  // diagnostic error first — "geladeira precisa canto" beats "geladeira
  // sobrepõe ar". Skipped for `add_furniture_group` calls (which use
  // hand-curated layouts that already mostly respect the rules).
  if (!opts?.skipOverlapCheck) {
    const placementCheck = validatePlacement(
      { type: t, x: fx, y: fy, width: size.w, height: size.h, label: input.label ?? def.label },
      room,
      plan,
    );
    if (!placementCheck.ok) {
      return {
        ok: false,
        message:
          `${def.label} em (rx=${rx.toFixed(2)}, ry=${ry.toFixed(2)}) ${placementCheck.reason} ` +
          `${summarizeRoomLayout(room, plan)}`,
      };
    }
  }

  // Overlap check (Bug "agente cria coisas em cima da outra"). Rejects
  // the placement if it intersects an existing furniture in the same
  // room. The error message lists the conflicting item AND describes
  // every occupied AABB so the agent can pick a free spot on the next
  // try without having to call list_furniture first.
  const conflict = !opts?.skipOverlapCheck
    ? findFurnitureOverlap(plan, room.id, fx, fy, size.w, size.h)
    : null;
  if (conflict) {
    const occupied = plan.furniture
      .filter((f) => f.roomId === room.id && !isRugLike(f.type))
      .map((f) => {
        const orx = (f.x - room.x) / Math.max(0.01, room.width - f.width);
        const ory = (f.y - room.y) / Math.max(0.01, room.height - f.height);
        return `${f.label} (rx≈${orx.toFixed(2)}, ry≈${ory.toFixed(2)}, ${f.width.toFixed(2)}×${f.height.toFixed(2)}m)`;
      })
      .join("; ");
    return {
      ok: false,
      message:
        `Posição (rx=${rx.toFixed(2)}, ry=${ry.toFixed(2)}) de ${def.label} sobrepõe '${conflict.label}' ` +
        `em '${room.name}'. Móveis já posicionados: ${occupied}. ` +
        `Reposicione ${def.label} num espaço livre (rx/ry diferente) ou remova um móvel existente antes.`,
    };
  }

  const item: Furniture = {
    id: nextId("furn"),
    roomId: room.id,
    type: t,
    label: input.label ?? def.label,
    x: fx,
    y: fy,
    width: size.w,
    height: size.h,
  };
  plan.furniture.push(item);
  return { ok: true, message: `${item.label} adicionado em '${room.name}'.` };
}

/** True if `type` is the kind of low/flat object (rug, mat) that
 *  legitimately overlaps with other furniture — we skip overlap checks
 *  for these so the agent can put a sofa over a rug. */
function isRugLike(type: string): boolean {
  return /^rug|carpet|mat/i.test(type);
}

/** Find an existing furniture (same room, non-rug) whose AABB intersects
 *  the candidate rectangle. Returns the first conflict or null. Uses an
 *  inset of 1 cm so flush edges (sofa touching a wall-mounted shelf)
 *  don't trip the check. */
function findFurnitureOverlap(
  plan: FloorPlan,
  roomId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Furniture | null {
  const inset = 0.01;
  for (const f of plan.furniture) {
    if (f.roomId !== roomId) continue;
    if (isRugLike(f.type)) continue;
    const overlap =
      f.x + f.width - inset > x &&
      f.x + inset < x + w &&
      f.y + f.height - inset > y &&
      f.y + inset < y + h;
    if (overlap) return f;
  }
  return null;
}

function doSwapFurniture(plan: FloorPlan, input: ToolInputs["swap_furniture"]): ApplyResult {
  const f = plan.furniture.find((ff) => ff.id === input.furniture_id);
  if (!f) return { ok: false, message: "Móvel não encontrado." };
  const def = FURN_DEFS[input.new_type];
  if (!def) return { ok: false, message: `Tipo desconhecido: ${input.new_type}` };
  f.type = input.new_type;
  f.label = def.label;
  f.width = def.sizeM.w;
  f.height = def.sizeM.h;
  return { ok: true, message: `Móvel trocado por ${def.label}.` };
}

function doRemoveFurniture(plan: FloorPlan, input: ToolInputs["remove_furniture"]): ApplyResult {
  let target: Furniture | undefined;
  if (input.furniture_id) target = plan.furniture.find((f) => f.id === input.furniture_id);
  if (!target && input.label) {
    const ln = input.label.trim().toLowerCase();
    target = plan.furniture.find((f) => f.label.trim().toLowerCase() === ln);
  }
  if (!target) return { ok: false, message: "Móvel não encontrado." };
  plan.furniture = plan.furniture.filter((f) => f.id !== target!.id);
  return { ok: true, message: `${target.label} removido.` };
}

function doSetFloor(plan: FloorPlan, input: ToolInputs["set_floor_material"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  room.floor = input.material;
  room.floorZones = undefined;
  return { ok: true, message: `Piso de '${room.name}' agora é ${input.material}.` };
}

function doSetRailingMaterial(plan: FloorPlan, input: ToolInputs["set_railing_material"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (!room.isBalcony) {
    return { ok: false, message: `'${room.name}' não é uma varanda — guarda-corpo só existe em varandas.` };
  }
  room.balconyRailingMaterial = input.material;
  const label = input.material === "glass" ? "vidro" : input.material === "metal" ? "metal" : "concreto";
  return { ok: true, message: `Guarda-corpo de '${room.name}' agora é ${label}.` };
}

function doSplitFloor(plan: FloorPlan, input: ToolInputs["split_floor"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const pos = clamp01(input.position ?? 0.5);
  if (input.orientation === "horizontal") {
    room.floorZones = [
      { rx: 0, ry: pos, rw: 1, rh: 1 - pos, material: input.second_material },
    ];
  } else {
    room.floorZones = [
      { rx: pos, ry: 0, rw: 1 - pos, rh: 1, material: input.second_material },
    ];
  }
  return {
    ok: true,
    message: `Piso de '${room.name}' dividido — segunda zona em ${input.second_material}.`,
  };
}

function doMoveFurniture(plan: FloorPlan, input: ToolInputs["move_furniture"]): ApplyResult {
  const f = plan.furniture.find((f) => f.id === input.furniture_id);
  if (!f) return { ok: false, message: "Móvel não encontrado." };
  f.x = input.new_x;
  f.y = input.new_y;
  return { ok: true, message: `${f.label} movido.` };
}

// ---------- Layout transformations ----------

function planBoundingBox(plan: FloorPlan): { x: number; y: number; w: number; h: number } | null {
  if (plan.rooms.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function mirrorWall(w: Wall, axis: "x" | "y"): Wall {
  if (axis === "x") {
    if (w === "north") return "south";
    if (w === "south") return "north";
    return w;
  }
  if (w === "east") return "west";
  if (w === "west") return "east";
  return w;
}

function doMirrorLayout(plan: FloorPlan, input: ToolInputs["mirror_layout"]): ApplyResult {
  const bb = planBoundingBox(plan);
  if (!bb) return { ok: false, message: "Planta vazia." };
  if (input.axis === "x") {
    for (const r of plan.rooms) {
      r.y = bb.y + (bb.h - (r.y - bb.y) - r.height);
      if (r.openWalls) r.openWalls = r.openWalls.map((w) => mirrorWall(w, "x"));
    }
    for (const d of plan.doors) d.wall = mirrorWall(d.wall, "x");
    for (const w of plan.windows) w.wall = mirrorWall(w.wall, "x");
    for (const f of plan.furniture) {
      f.y = bb.y + (bb.h - (f.y - bb.y) - f.height);
    }
    for (const c of plan.columns ?? []) c.y = bb.y + (bb.h - (c.y - bb.y));
    for (const s of plan.stairs ?? []) s.y = bb.y + (bb.h - (s.y - bb.y) - s.height);
  } else {
    for (const r of plan.rooms) {
      r.x = bb.x + (bb.w - (r.x - bb.x) - r.width);
      if (r.openWalls) r.openWalls = r.openWalls.map((w) => mirrorWall(w, "y"));
    }
    for (const d of plan.doors) d.wall = mirrorWall(d.wall, "y");
    for (const w of plan.windows) w.wall = mirrorWall(w.wall, "y");
    for (const f of plan.furniture) {
      f.x = bb.x + (bb.w - (f.x - bb.x) - f.width);
    }
    for (const c of plan.columns ?? []) c.x = bb.x + (bb.w - (c.x - bb.x));
    for (const s of plan.stairs ?? []) s.x = bb.x + (bb.w - (s.x - bb.x) - s.width);
  }
  return { ok: true, message: `Planta espelhada no eixo ${input.axis}.` };
}

function rotateWallCW(w: Wall): Wall {
  if (w === "north") return "east";
  if (w === "east") return "south";
  if (w === "south") return "west";
  return "north";
}

function doRotateLayout(plan: FloorPlan, input: ToolInputs["rotate_layout"]): ApplyResult {
  const bb = planBoundingBox(plan);
  if (!bb) return { ok: false, message: "Planta vazia." };
  const turns = ((input.degrees / 90) % 4 + 4) % 4;
  for (let t = 0; t < turns; t++) {
    // Rotate 90 CW around bbox center.
    const cx = bb.x + bb.w / 2;
    const cy = bb.y + bb.h / 2;
    const rotPoint = (px: number, py: number) => {
      const dx = px - cx;
      const dy = py - cy;
      return { x: cx - dy, y: cy + dx };
    };
    for (const r of plan.rooms) {
      const tl = rotPoint(r.x, r.y);
      // After CW 90, what was the top-left is now top-right; new TL = (oldTL.x, oldBL.y) rotated...
      const br = rotPoint(r.x + r.width, r.y + r.height);
      const nx = Math.min(tl.x, br.x);
      const ny = Math.min(tl.y, br.y);
      const nw = Math.abs(br.x - tl.x);
      const nh = Math.abs(br.y - tl.y);
      // Width/height swap on 90.
      r.x = nx;
      r.y = ny;
      r.width = nh;
      r.height = nw;
      if (r.openWalls) r.openWalls = r.openWalls.map(rotateWallCW);
    }
    for (const d of plan.doors) d.wall = rotateWallCW(d.wall);
    for (const w of plan.windows) w.wall = rotateWallCW(w.wall);
    for (const f of plan.furniture) {
      const tl = rotPoint(f.x, f.y);
      const br = rotPoint(f.x + f.width, f.y + f.height);
      f.x = Math.min(tl.x, br.x);
      f.y = Math.min(tl.y, br.y);
      const nw = Math.abs(br.x - tl.x);
      const nh = Math.abs(br.y - tl.y);
      f.width = nh;
      f.height = nw;
      f.rotation = ((f.rotation ?? 0) + 90) % 360;
    }
    for (const c of plan.columns ?? []) {
      const p = rotPoint(c.x, c.y);
      c.x = p.x;
      c.y = p.y;
    }
    for (const s of plan.stairs ?? []) {
      const tl = rotPoint(s.x, s.y);
      const br = rotPoint(s.x + s.width, s.y + s.height);
      s.x = Math.min(tl.x, br.x);
      s.y = Math.min(tl.y, br.y);
      const nw = Math.abs(br.x - tl.x);
      const nh = Math.abs(br.y - tl.y);
      s.width = nh;
      s.height = nw;
      s.rotation = ((s.rotation ?? 0) + 90) % 360;
    }
  }
  return { ok: true, message: `Planta girada ${input.degrees}°.` };
}

function doAddBalcony(plan: FloorPlan, input: ToolInputs["add_balcony"]): ApplyResult {
  const name = input.name ?? "Varanda";
  if (findRoom(plan, name)) return { ok: false, message: `Já existe '${name}'.` };
  let x = 0, y = 0;
  if (input.attached_to && input.wall) {
    const ref = findRoom(plan, input.attached_to);
    if (!ref) return { ok: false, message: `Cômodo '${input.attached_to}' não encontrado.` };
    if (input.wall === "north") {
      x = ref.x + (ref.width - input.width) / 2;
      y = ref.y - input.depth;
    } else if (input.wall === "south") {
      x = ref.x + (ref.width - input.width) / 2;
      y = ref.y + ref.height;
    } else if (input.wall === "west") {
      x = ref.x - input.depth;
      y = ref.y + (ref.height - input.depth) / 2;
    } else {
      x = ref.x + ref.width;
      y = ref.y + (ref.height - input.depth) / 2;
    }
  } else {
    const spot = bestSpot(plan, input.width, input.depth);
    x = spot.x;
    y = spot.y;
  }
  const railingMaterial = input.railing_material ?? "concrete";
  const room: Room = {
    id: nextId("room"),
    name,
    x,
    y,
    width: input.width,
    height: input.depth,
    floor: "ceramica",
    appear: 0,
    isBalcony: true,
    balconyRailingMaterial: railingMaterial,
  };
  plan.rooms.push(room);
  const railLabel = railingMaterial === "glass" ? "vidro" : railingMaterial === "metal" ? "metal" : "concreto";
  return { ok: true, message: `Varanda '${name}' criada (${input.width}x${input.depth}m, guarda-corpo de ${railLabel}).` };
}

function doAddStairs(plan: FloorPlan, input: ToolInputs["add_stairs"]): ApplyResult {
  ensureLists(plan);
  const room = input.room_name ? findRoom(plan, input.room_name) : undefined;
  const stairs: Stairs = {
    id: nextId("stair"),
    roomId: room?.id,
    shape: input.shape,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    direction: input.direction ?? "up",
    rotation: input.rotation ?? 0,
  };
  plan.stairs!.push(stairs);
  return { ok: true, message: `Escada ${input.shape} adicionada.` };
}

function doAddDimension(plan: FloorPlan, input: ToolInputs["add_dimension"]): ApplyResult {
  ensureLists(plan);
  const ann: Annotation = {
    id: nextId("ann"),
    kind: "dimension",
    x1: input.x1,
    y1: input.y1,
    x2: input.x2,
    y2: input.y2,
    text: input.text,
  };
  plan.annotations!.push(ann);
  return { ok: true, message: `Cota adicionada.` };
}

function doAddTextNote(plan: FloorPlan, input: ToolInputs["add_text_note"]): ApplyResult {
  ensureLists(plan);
  const ann: Annotation = {
    id: nextId("ann"),
    kind: "note",
    x1: input.x,
    y1: input.y,
    text: input.text,
  };
  plan.annotations!.push(ann);
  return { ok: true, message: `Nota adicionada: "${input.text}".` };
}

function doAddNorthArrow(plan: FloorPlan, input: ToolInputs["add_north_arrow"]): ApplyResult {
  let x = input.x;
  let y = input.y;
  if (x === undefined || y === undefined) {
    const bb = planBoundingBox(plan);
    if (bb) {
      x = bb.x + bb.w + 1.0;
      y = bb.y;
    } else {
      x = 0;
      y = 0;
    }
  }
  plan.northArrow = { x, y, angle: input.angle ?? 0 };
  return { ok: true, message: `Rosa dos ventos adicionada.` };
}

// ---------- Apartment generator (unchanged, kept tight) ----------

function doCreateApartment(plan: FloorPlan, input: ToolInputs["create_apartment_layout"]): ApplyResult {
  const { total_area, num_bedrooms, num_bathrooms } = input;
  if (!total_area || total_area < 20) return { ok: false, message: "Área total muito pequena." };
  plan.rooms.length = 0;
  plan.doors.length = 0;
  plan.windows.length = 0;
  plan.furniture.length = 0;
  if (plan.stairs) plan.stairs.length = 0;
  if (plan.columns) plan.columns.length = 0;
  if (plan.annotations) plan.annotations.length = 0;
  plan.northArrow = null;

  const bath = Math.min(num_bathrooms, 3);
  const bedr = Math.max(1, Math.min(num_bedrooms, 4));

  const livingDiningArea = Math.max(12, total_area * 0.28);
  const kitchenArea = Math.max(6, total_area * 0.12);
  const bathArea = bath > 0 ? Math.max(3, total_area * 0.05) : 0;
  const suiteBathArea = bedr >= 1 && bath >= 2 ? Math.max(4, total_area * 0.05) : 0;
  const laundryArea = Math.max(2.5, total_area * 0.04);
  const masterBedArea = Math.max(10, total_area * 0.14);
  const otherBedArea = bedr > 1 ? Math.max(8, total_area * 0.1) : 0;

  const w = Math.max(7, Math.sqrt(total_area * 1.33));
  const h = total_area / w;

  const topH = Math.max(4, Math.min(h * 0.5, Math.sqrt(livingDiningArea * 1.2)));
  const bottomH = Math.max(3.5, h - topH);

  const livingW = Math.max(4, livingDiningArea / topH);
  const kitchenW = Math.max(2.5, kitchenArea / topH);
  const laundryW = Math.max(1.6, laundryArea / topH);
  const topTotalW = livingW + kitchenW + laundryW;

  const masterW = Math.max(3, masterBedArea / bottomH);
  const suiteBathW = suiteBathArea > 0 ? Math.max(1.6, suiteBathArea / bottomH) : 0;
  const otherBedCount = Math.max(0, bedr - 1);
  const otherBedW = otherBedCount > 0 ? Math.max(2.8, otherBedArea / bottomH) : 0;
  const socialBathW = bath > (suiteBathArea > 0 ? 1 : 0) ? Math.max(1.6, bathArea / bottomH) : 0;
  const bottomTotalW = masterW + suiteBathW + otherBedW * otherBedCount + socialBathW;

  const canvasW = Math.max(topTotalW, bottomTotalW);

  const topScale = canvasW / topTotalW;
  const topRow: { name: string; w: number; floor: FloorMaterial }[] = [
    { name: "Sala", w: livingW * topScale, floor: "madeira" },
    { name: "Cozinha", w: kitchenW * topScale, floor: "porcelanato" },
    { name: "Área de Serviço", w: laundryW * topScale, floor: "porcelanato" },
  ];

  const bottomRow: { name: string; w: number; floor: FloorMaterial }[] = [];
  bottomRow.push({ name: "Suíte Master", w: masterW * (canvasW / bottomTotalW), floor: "madeira" });
  if (suiteBathW > 0) bottomRow.push({ name: "Banheiro Suíte", w: suiteBathW * (canvasW / bottomTotalW), floor: "porcelanato" });
  for (let i = 0; i < otherBedCount; i++) {
    bottomRow.push({ name: otherBedCount === 1 ? "Quarto" : `Quarto ${i + 2}`, w: otherBedW * (canvasW / bottomTotalW), floor: "madeira" });
  }
  if (socialBathW > 0) bottomRow.push({ name: "Banheiro Social", w: socialBathW * (canvasW / bottomTotalW), floor: "porcelanato" });

  const corridorH = 1.2;
  const hasIntimateRow = bottomRow.length > 0;
  const adjBottomH = hasIntimateRow ? Math.max(3, bottomH - corridorH * 0.5) : bottomH;
  const adjTopH = hasIntimateRow ? Math.max(3.5, topH - corridorH * 0.5) : topH;

  let cursorX = 0;
  for (const r of topRow) {
    plan.rooms.push({
      id: nextId("room"),
      name: r.name,
      x: cursorX,
      y: 0,
      width: r.w,
      height: adjTopH,
      floor: r.floor,
      appear: 0,
    });
    cursorX += r.w;
  }

  let corridor: Room | undefined;
  if (hasIntimateRow) {
    corridor = {
      id: nextId("room"),
      name: "Corredor",
      x: 0,
      y: adjTopH,
      width: canvasW,
      height: corridorH,
      floor: "madeira",
      appear: 0,
    };
    plan.rooms.push(corridor);
  }

  cursorX = 0;
  const bottomY = adjTopH + (hasIntimateRow ? corridorH : 0);
  for (const r of bottomRow) {
    plan.rooms.push({
      id: nextId("room"),
      name: r.name,
      x: cursorX,
      y: bottomY,
      width: r.w,
      height: adjBottomH,
      floor: r.floor,
      appear: 0,
    });
    cursorX += r.w;
  }

  const sala = plan.rooms.find((r) => r.name === "Sala");
  const cozinha = plan.rooms.find((r) => r.name === "Cozinha");
  const areaServ = plan.rooms.find((r) => r.name === "Área de Serviço");
  if (sala) {
    plan.doors.push({ id: nextId("door"), roomId: sala.id, wall: hasIntimateRow ? "west" : "south", position: hasIntimateRow ? 0.6 : 0.15, size: 1.0 });
    plan.windows.push({ id: nextId("win"), roomId: sala.id, wall: "north", position: 0.5, size: Math.min(2.4, sala.width * 0.5) });
  }
  if (cozinha && sala) plan.doors.push({ id: nextId("door"), roomId: cozinha.id, wall: "west", position: 0.5, size: 1.2 });
  if (areaServ && cozinha) plan.doors.push({ id: nextId("door"), roomId: areaServ.id, wall: "west", position: 0.5, size: 0.8 });
  if (corridor) plan.doors.push({ id: nextId("door"), roomId: corridor.id, wall: "north", position: sala ? Math.min(0.9, (sala.x + sala.width * 0.85) / corridor.width) : 0.5, size: 1.0 });
  for (const r of plan.rooms.filter((rr) => rr.y >= bottomY - 0.001 && !isCorridor(rr.name))) {
    plan.doors.push({ id: nextId("door"), roomId: r.id, wall: "north", position: 0.5, size: r.name.toLowerCase().includes("banheiro") ? 0.7 : 0.9 });
    if (r.name.toLowerCase().includes("quarto") || r.name.toLowerCase().includes("suíte")) {
      plan.windows.push({ id: nextId("win"), roomId: r.id, wall: "south", position: 0.5, size: Math.min(1.5, r.width * 0.4) });
    } else if (r.name.toLowerCase().includes("banheiro")) {
      plan.windows.push({ id: nextId("win"), roomId: r.id, wall: "south", position: 0.7, size: 0.6 });
    }
  }

  return { ok: true, message: `Apartamento gerado: ${plan.rooms.length} cômodos, área aproximada ${total_area}m².` };
}

// ---------- Auto-furnish (smarter dispatch) ----------

function doFurnishRoom(plan: FloorPlan, input: ToolInputs["furnish_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const n = room.name.toLowerCase();

  let group: FurnitureGroup | null = null;
  if (/sala/.test(n)) group = room.width * room.height >= 18 ? "living_full" : "living_basic";
  else if (/cozinha/.test(n)) group = room.width * room.height >= 10 ? "kitchen_full" : "kitchen_basic";
  else if (/(suíte|suite|quarto.*casal|quarto principal|master)/.test(n))
    group = room.width * room.height >= 14 ? "bedroom_couple_full" : "bedroom_couple_basic";
  else if (/quarto/.test(n)) group = "bedroom_single_basic";
  else if (/(infantil|criança|bebê|bebe)/.test(n)) group = "kids_room_basic";
  else if (/banheiro/.test(n)) group = room.width * room.height >= 5 ? "bathroom_full" : "bathroom_basic";
  else if (/(serviço|servico|lavanderia)/.test(n)) group = "laundry_basic";
  else if (/jantar/.test(n)) group = "dining_set_6";
  else if (/(escritório|escritorio|home office)/.test(n)) group = "office_basic";
  else if (/(jardim|quintal)/.test(n)) group = "garden_basic";
  else if (/piscina/.test(n)) group = "pool_set";

  if (!group) return { ok: false, message: `Não sei mobiliar '${room.name}' automaticamente.` };
  return doAddFurnitureGroup(plan, { room_name: room.name, group });
}

// ---------- Furniture groups ----------

function placeFurniture(plan: FloorPlan, room: Room, type: FurnitureType, rx: number, ry: number, label?: string) {
  // Curated group layouts trust their relative positions; we still want
  // the size/room-fit guard but skip the per-item overlap check so the
  // sofa→rug→coffee_table stack can coexist.
  doAddFurniture(plan, {
    room_name: room.name,
    furniture_type: type,
    label,
    relative_x: rx,
    relative_y: ry,
  }, { skipOverlapCheck: true });
}

function doAddFurnitureGroup(plan: FloorPlan, input: ToolInputs["add_furniture_group"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };

  const placeMany = (items: { type: FurnitureType; rx: number; ry: number; label?: string }[]) => {
    for (const it of items) placeFurniture(plan, room, it.type, it.rx, it.ry, it.label);
  };

  switch (input.group) {
    case "living_basic":
      placeMany([
        { type: "sofa_3seat", rx: 0.5, ry: 0.15 },
        { type: "tv_console", rx: 0.5, ry: 0.85 },
        { type: "coffee_table", rx: 0.5, ry: 0.5 },
      ]);
      break;
    case "living_full":
      placeMany([
        { type: "sofa_L", rx: 0.05, ry: 0.1 },
        { type: "armchair", rx: 0.85, ry: 0.7 },
        { type: "tv_console", rx: 0.5, ry: 0.95 },
        { type: "coffee_table", rx: 0.45, ry: 0.55 },
        { type: "rug_rect", rx: 0.45, ry: 0.55 },
        { type: "side_table", rx: 0.95, ry: 0.5 },
        { type: "floor_lamp", rx: 0.0, ry: 0.0 },
        { type: "plant_pot", rx: 1.0, ry: 0.0 },
        { type: "bookshelf", rx: 0.0, ry: 0.95 },
      ]);
      break;
    case "bedroom_couple_basic":
      placeMany([
        { type: "bed_double", rx: 0.5, ry: 0.05 },
        { type: "nightstand", rx: 0.0, ry: 0.05 },
        { type: "nightstand", rx: 1.0, ry: 0.05 },
        { type: "wardrobe_hinged", rx: 0.5, ry: 1.0 },
      ]);
      break;
    case "bedroom_couple_full":
      placeMany([
        { type: "bed_king", rx: 0.5, ry: 0.05 },
        { type: "nightstand", rx: 0.0, ry: 0.05 },
        { type: "nightstand", rx: 1.0, ry: 0.05 },
        { type: "wardrobe_sliding", rx: 0.5, ry: 1.0 },
        { type: "dresser", rx: 0.0, ry: 0.6 },
        { type: "vanity", rx: 1.0, ry: 0.6 },
      ]);
      break;
    case "bedroom_single_basic":
      placeMany([
        { type: "bed_single", rx: 0.05, ry: 0.05 },
        { type: "wardrobe_hinged", rx: 0.5, ry: 1.0 },
        { type: "desk_study", rx: 1.0, ry: 0.0 },
        { type: "desk_chair", rx: 0.85, ry: 0.25 },
      ]);
      break;
    case "kids_room_basic":
      placeMany([
        { type: "bed_child", rx: 0.05, ry: 0.05 },
        { type: "toy_shelf", rx: 1.0, ry: 0.0 },
        { type: "play_table", rx: 0.5, ry: 0.7 },
        { type: "wardrobe_hinged", rx: 0.5, ry: 1.0 },
      ]);
      break;
    case "kitchen_basic":
      placeMany([
        { type: "stove_4burner", rx: 0.0, ry: 0.0 },
        { type: "kitchen_sink_single", rx: 0.5, ry: 0.0 },
        { type: "fridge_single", rx: 1.0, ry: 0.0 },
        { type: "microwave", rx: 0.3, ry: 0.0 },
      ]);
      break;
    case "kitchen_full":
      placeMany([
        { type: "stove_5burner", rx: 0.0, ry: 0.0 },
        { type: "hood", rx: 0.04, ry: 0.05 },
        { type: "kitchen_sink_double", rx: 0.45, ry: 0.0 },
        { type: "fridge_double", rx: 1.0, ry: 0.0 },
        { type: "dishwasher", rx: 0.7, ry: 0.0 },
        { type: "microwave", rx: 0.25, ry: 0.0 },
        { type: "kitchen_island", rx: 0.5, ry: 0.6 },
        { type: "pantry", rx: 1.0, ry: 1.0 },
      ]);
      break;
    case "bathroom_basic":
      placeMany([
        { type: "toilet", rx: 0.0, ry: 0.0 },
        { type: "sink_pedestal", rx: 0.5, ry: 0.0 },
        { type: "shower_square", rx: 1.0, ry: 1.0 },
      ]);
      break;
    case "bathroom_full":
      placeMany([
        { type: "toilet", rx: 0.0, ry: 0.0 },
        { type: "bidet", rx: 0.2, ry: 0.0 },
        { type: "sink_double_vanity", rx: 0.6, ry: 0.0 },
        { type: "shower_rect", rx: 1.0, ry: 1.0 },
        { type: "bathtub_rect", rx: 0.0, ry: 1.0 },
        { type: "towel_rack", rx: 0.5, ry: 0.5 },
      ]);
      break;
    case "office_basic":
      placeMany([
        { type: "desk_L", rx: 0.0, ry: 0.0 },
        { type: "office_chair", rx: 0.3, ry: 0.3 },
        { type: "filing_cabinet", rx: 1.0, ry: 0.0 },
        { type: "bookshelf", rx: 1.0, ry: 1.0 },
      ]);
      break;
    case "laundry_basic":
      placeMany([
        { type: "washing_machine", rx: 0.0, ry: 0.0 },
        { type: "dryer", rx: 0.5, ry: 0.0 },
        { type: "laundry_sink", rx: 1.0, ry: 0.0 },
        { type: "ironing_board", rx: 0.5, ry: 1.0 },
      ]);
      break;
    case "dining_set_4":
      placeMany([
        { type: "dining_table_4", rx: 0.5, ry: 0.5 },
      ]);
      break;
    case "dining_set_6":
      placeMany([{ type: "dining_table_6", rx: 0.5, ry: 0.5 }]);
      break;
    case "dining_set_8":
      placeMany([{ type: "dining_table_8", rx: 0.5, ry: 0.5 }]);
      break;
    case "garden_basic":
      placeMany([
        { type: "tree_large", rx: 0.0, ry: 0.0 },
        { type: "tree_small", rx: 1.0, ry: 0.0 },
        { type: "outdoor_table", rx: 0.5, ry: 0.5 },
        { type: "planter_round", rx: 0.0, ry: 1.0 },
        { type: "planter_round", rx: 1.0, ry: 1.0 },
        { type: "fountain", rx: 0.5, ry: 0.0 },
      ]);
      break;
    case "pool_set":
      placeMany([
        { type: "pool_rect", rx: 0.5, ry: 0.4 },
        { type: "sun_lounger", rx: 0.0, ry: 1.0 },
        { type: "sun_lounger", rx: 0.3, ry: 1.0 },
        { type: "umbrella", rx: 0.7, ry: 1.0 },
      ]);
      break;
    case "bbq_set":
      placeMany([
        { type: "bbq_grill", rx: 0.0, ry: 0.0 },
        { type: "outdoor_table", rx: 0.7, ry: 0.5 },
        { type: "pergola", rx: 0.5, ry: 0.5 },
      ]);
      break;
  }
  return { ok: true, message: `'${room.name}' mobiliado (grupo ${input.group}).` };
}

// ---------- Plan summary for prompts ----------

export function summarizePlan(plan: FloorPlan): string {
  if (plan.rooms.length === 0) return "Planta vazia (nenhum cômodo).";
  const parts: string[] = [];
  parts.push(`${plan.rooms.length} cômodo(s):`);
  for (const r of plan.rooms) {
    const area = (r.width * r.height).toFixed(1);
    const doors = plan.doors.filter((d) => d.roomId === r.id).length;
    const wins = plan.windows.filter((w) => w.roomId === r.id).length;
    const furn = plan.furniture
      .filter((f) => f.roomId === r.id)
      .map((f) => f.label)
      .join(", ");
    parts.push(
      `- ${r.name}: ${r.width}x${r.height}m (${area}m²), piso ${r.floor}, portas: ${doors}, janelas: ${wins}${furn ? `, móveis: ${furn}` : ""}`
    );
  }
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
  parts.push(`Área total: ${totalArea.toFixed(1)}m².`);
  if (plan.stairs && plan.stairs.length) parts.push(`Escadas: ${plan.stairs.length}.`);
  if (plan.columns && plan.columns.length) parts.push(`Colunas: ${plan.columns.length}.`);
  if (plan.annotations && plan.annotations.length) parts.push(`Anotações: ${plan.annotations.length}.`);
  if (plan.northArrow) parts.push(`Rosa-dos-ventos: presente.`);
  return parts.join("\n");
}

// ---------- Selection helpers ----------

const WALL_PT: Record<Wall, string> = {
  north: "norte",
  south: "sul",
  east: "leste",
  west: "oeste",
};

export function resolveSelection(
  plan: FloorPlan,
  sel: SelectedElement | null | undefined
): SelectionContext | null {
  if (!sel) return null;
  if (sel.type === "room") {
    const r = plan.rooms.find((rr) => rr.id === sel.id);
    if (!r) return null;
    return {
      kind: "room",
      id: r.id,
      description: `Cômodo "${r.name}" (${r.width.toFixed(2)}×${r.height.toFixed(2)}m, ${(r.width * r.height).toFixed(1)}m², piso ${r.floor})`,
      payload: { name: r.name, x: r.x, y: r.y, width: r.width, height: r.height, floor: r.floor },
    };
  }
  if (sel.type === "furniture") {
    const f = plan.furniture.find((ff) => ff.id === sel.id);
    if (!f) return null;
    const room = plan.rooms.find((rr) => rr.id === f.roomId);
    return {
      kind: "furniture",
      id: f.id,
      description: `Móvel "${f.label}" em "${room?.name ?? "?"}" (${f.width.toFixed(2)}×${f.height.toFixed(2)}m, posição ${f.x.toFixed(2)},${f.y.toFixed(2)})`,
      payload: {
        furniture_id: f.id,
        type: f.type,
        label: f.label,
        room_name: room?.name,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      },
    };
  }
  if (sel.type === "door") {
    const d = plan.doors.find((dd) => dd.id === sel.id);
    if (!d) return null;
    const room = plan.rooms.find((rr) => rr.id === d.roomId);
    return {
      kind: "door",
      id: d.id,
      description: `Porta na parede ${WALL_PT[d.wall]} de "${room?.name ?? "?"}" (${d.size.toFixed(2)}m)`,
      payload: { room_name: room?.name, wall: d.wall, position: d.position, size: d.size },
    };
  }
  if (sel.type === "window") {
    const w = plan.windows.find((ww) => ww.id === sel.id);
    if (!w) return null;
    const room = plan.rooms.find((rr) => rr.id === w.roomId);
    return {
      kind: "window",
      id: w.id,
      description: `Janela na parede ${WALL_PT[w.wall]} de "${room?.name ?? "?"}" (${w.size.toFixed(2)}m)`,
      payload: { room_name: room?.name, wall: w.wall, position: w.position, size: w.size },
    };
  }
  if (sel.type === "wall") {
    const room = plan.rooms.find((rr) => rr.id === sel.roomId);
    if (!room) return null;
    const length = sel.wall === "north" || sel.wall === "south" ? room.width : room.height;
    return {
      kind: "wall",
      id: `${room.id}:${sel.wall}`,
      description: `Parede ${WALL_PT[sel.wall]} de "${room.name}" (${length.toFixed(2)}m)`,
      payload: { room_name: room.name, wall: sel.wall, length },
    };
  }
  return null;
}

export type { Wall };
