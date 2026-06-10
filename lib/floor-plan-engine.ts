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
import {
  freeWallSpans,
  summarizeRoomLayout,
  touchedWalls,
  validateDoorClearance,
  validatePlacement,
} from "./scene/placement-validators";
import { solvePlacement, formatSolverResult } from "./scene/placement-solver";
import { ROOM_TEMPLATES, solveRoomTemplate } from "./room-templates";
import { doAddMillworkRun, doRemoveMillworkRun, doUpdateMillworkModule } from "./scene/millwork-engine";
import {
  doorApproachRects,
  doorCoverageFraction,
  openingApproach,
  openingInterval,
  openingsOverlap1D,
  rectOverlapArea,
  spanInterval,
  usableRect,
  wallSideLabel,
  worldAABB,
  worstDoorCoverage,
} from "./plan-geometry";
import { chooseDoorSwing } from "./scene/door-swing";
import { getPlacement, isSatellitePair, SATELLITES } from "./furniture-placement";
import {
  backWallOf,
  rotationForBackWall,
  satellitePoseCandidates,
  visualSizeFor,
} from "./scene/satellites";
import { estimatedHeightM } from "./scene/furniture-heights";
import { DOOR_DEDUP_RADIUS_M, TOL_CONTACT_M } from "./scene/tolerances";

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
      case "update_door":
        return doUpdateDoor(plan, input as ToolInputs["update_door"]);
      case "remove_door":
        return doRemoveDoor(plan, input as ToolInputs["remove_door"]);
      case "add_window":
        return doAddWindow(plan, input as ToolInputs["add_window"]);
      case "update_window":
        return doUpdateWindow(plan, input as ToolInputs["update_window"]);
      case "remove_window":
        return doRemoveWindow(plan, input as ToolInputs["remove_window"]);
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
      case "place_furniture_intent":
        return doPlaceFurnitureIntent(plan, input as ToolInputs["place_furniture_intent"]);
      case "place_items":
        return doPlaceItems(plan, input as ToolInputs["place_items"]);
      case "add_millwork_run":
        return doAddMillworkRun(plan, input as ToolInputs["add_millwork_run"]);
      case "remove_millwork_run":
        return doRemoveMillworkRun(plan, input as ToolInputs["remove_millwork_run"]);
      case "update_millwork_module":
        return doUpdateMillworkModule(plan, input as ToolInputs["update_millwork_module"]);
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
      case "preview_plan":
        // Tool de VISÃO: o render acontece no route (servidor); no engine —
        // e no espelhamento client-side — é um no-op deliberado.
        return { ok: true, message: "Planta renderizada para revisão do agente." };
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
  } else {
    // Explicit coords: reject overlaps with existing (non-exterior) rooms.
    // Edge-to-edge contact is fine — only real area overlap (> 1 cm²-ish)
    // counts, so apartment layouts with shared walls keep working.
    const candidate = { x, y, w: width, h: height };
    const conflict = plan.rooms.find(
      (r) =>
        !r.isExterior &&
        rectOverlapArea(candidate, { x: r.x, y: r.y, w: r.width, h: r.height }) > 0.01
    );
    if (conflict) {
      const spot = bestSpot(plan, width, height);
      return {
        ok: false,
        message:
          `Posição (${x},${y}) de '${name}' sobrepõe '${conflict.name}' ` +
          `(${conflict.x},${conflict.y},${conflict.width}×${conflict.height}m). ` +
          `Posição livre sugerida: (${spot.x.toFixed(1)},${spot.y.toFixed(1)}).`,
      };
    }
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
  // Crescer não pode invadir vizinhos — mesma regra do create_room. Sem
  // isso, "aumenta o quarto" virava ROOM_OVERLAP (erro) no validador.
  const candidate = { x: room.x, y: room.y, w: input.width, h: input.height };
  const conflict = plan.rooms.find(
    (r) =>
      r.id !== room.id &&
      !r.isExterior &&
      rectOverlapArea(candidate, { x: r.x, y: r.y, w: r.width, h: r.height }) > 0.01
  );
  if (conflict) {
    return {
      ok: false,
      message:
        `Redimensionar '${room.name}' para ${input.width}x${input.height}m invadiria '${conflict.name}' ` +
        `(${conflict.x},${conflict.y},${conflict.width}×${conflict.height}m). ` +
        `Não há área livre nessa direção — reduza o vizinho antes ou aceite a dimensão atual.`,
    };
  }
  room.width = input.width;
  room.height = input.height;
  // Clamp furniture inside the USABLE area (inner wall faces).
  const resized = usableRect(plan, room);
  for (const f of plan.furniture.filter((ff) => ff.roomId === room.id)) {
    f.x = Math.max(resized.x, Math.min(resized.x + resized.w - f.width, f.x));
    f.y = Math.max(resized.y, Math.min(resized.y + resized.h - f.height, f.y));
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
  const dupRect = { x: room.x + ox, y: room.y + oy, w: room.width, h: room.height };
  const dupConflict = plan.rooms.find(
    (r) => !r.isExterior && rectOverlapArea(dupRect, { x: r.x, y: r.y, w: r.width, h: r.height }) > 0.01
  );
  if (dupConflict) {
    const spot = bestSpot(plan, room.width, room.height);
    return {
      ok: false,
      message:
        `Duplicar '${room.name}' com offset (${ox},${oy}) sobreporia '${dupConflict.name}'. ` +
        `Posição livre sugerida: offset_x=${(spot.x - room.x).toFixed(1)}, offset_y=${(spot.y - room.y).toFixed(1)}.`,
    };
  }
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

/** Margem mínima entre a borda de uma abertura e o canto da parede. */
const OPENING_CORNER_MARGIN = 0.05;

/** Valida o encaixe de uma abertura na parede: rejeita quando maior que a
 *  parede e clampa a posição para o vão caber inteiro. */
function fitOpening(
  room: Room,
  wall: Wall,
  position: number,
  size: number,
  kindLabel: string,
): { ok: true; position: number; adjusted: boolean } | { ok: false; message: string } {
  const wallLen = wall === "north" || wall === "south" ? room.width : room.height;
  if (size > wallLen - 2 * OPENING_CORNER_MARGIN) {
    return {
      ok: false,
      message: `${kindLabel} de ${size.toFixed(2)}m não cabe na parede ${wallSideLabel(wall)} de '${room.name}' (${wallLen.toFixed(2)}m). Use um vão menor ou outra parede.`,
    };
  }
  const posMin = (size / 2 + OPENING_CORNER_MARGIN) / wallLen;
  const posMax = 1 - posMin;
  const clamped = Math.max(posMin, Math.min(posMax, position));
  return { ok: true, position: clamped, adjusted: Math.abs(clamped - position) > 0.005 };
}

/** Abertura existente (porta/janela) colidindo no MESMO trecho de parede.
 *  Compara intervalos 1D no espaço do mundo, então pega tanto aberturas do
 *  próprio cômodo quanto do vizinho que compartilha a parede. */
function findOpeningConflict(
  plan: FloorPlan,
  room: Room,
  wall: Wall,
  position: number,
  size: number,
  opts?: { ignoreDoorId?: string; ignoreWindowId?: string },
): { kind: "porta" | "janela"; roomName: string; wall: Wall; position: number; size: number } | null {
  const target = openingInterval(room, wall, position, size);
  for (const d of plan.doors) {
    if (opts?.ignoreDoorId && d.id === opts.ignoreDoorId) continue;
    const dRoom = plan.rooms.find((r) => r.id === d.roomId);
    if (!dRoom) continue;
    if (openingsOverlap1D(target, openingInterval(dRoom, d.wall, d.position, d.size)) > 0) {
      return { kind: "porta", roomName: dRoom.name, wall: d.wall, position: d.position, size: d.size };
    }
  }
  for (const w of plan.windows) {
    if (opts?.ignoreWindowId && w.id === opts.ignoreWindowId) continue;
    const wRoom = plan.rooms.find((r) => r.id === w.roomId);
    if (!wRoom) continue;
    if (openingsOverlap1D(target, openingInterval(wRoom, w.wall, w.position, w.size)) > 0) {
      return { kind: "janela", roomName: wRoom.name, wall: w.wall, position: w.position, size: w.size };
    }
  }
  return null;
}

/** Cômodo do outro lado da parede `wall` de `room` (para swing "out"). */
function neighborAcrossWall(plan: FloorPlan, room: Room, wall: Wall, position: number): Room | null {
  const c = doorWorldCenter(room, wall, position);
  const probe = 0.15;
  const p =
    wall === "north" ? { x: c.x, y: c.y - probe } :
    wall === "south" ? { x: c.x, y: c.y + probe } :
    wall === "west" ? { x: c.x - probe, y: c.y } :
    { x: c.x + probe, y: c.y };
  return (
    plan.rooms.find(
      (r) =>
        r.id !== room.id &&
        !r.isExterior &&
        p.x >= r.x && p.x <= r.x + r.width &&
        p.y >= r.y && p.y <= r.y + r.height
    ) ?? null
  );
}

const OPPOSITE_WALL: Record<Wall, Wall> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** A parede recebe abertura? Rejeita paredes abertas (delete_wall) — a
 *  abertura ficaria órfã na migração (OPENING_LOST). Checa o próprio cômodo
 *  e o vizinho que compartilha a parede. */
function wallIsOpen(plan: FloorPlan, room: Room, wall: Wall, position: number): string | null {
  if (room.openWalls?.includes(wall)) {
    return `A parede ${wallSideLabel(wall)} de '${room.name}' está aberta (sem parede) — não há onde fixar a abertura.`;
  }
  const neighbor = neighborAcrossWall(plan, room, wall, position);
  if (neighbor?.openWalls?.includes(OPPOSITE_WALL[wall])) {
    return `A parede entre '${room.name}' e '${neighbor.name}' foi aberta (integração) — não há onde fixar a abertura.`;
  }
  return null;
}

/** Móvel já posicionado que bloquearia o corredor de chegada de uma abertura
 *  HIPOTÉTICA (pré-commit), nos DOIS lados da parede. Era o buraco temporal:
 *  porta criada DEPOIS da mobília não reclamava do guarda-roupa na boca do
 *  vão. Para janelas (`window: true`), só móveis ALTOS (acima do peitoril)
 *  contam e a faixa é de 30cm. Tapetes/decoração/dispositivos passam. */
function openingFurnitureConflict(
  plan: FloorPlan,
  room: Room,
  wall: Wall,
  position: number,
  size: number,
  opts?: { window?: boolean }
): { blocker: Furniture; sideRoom: Room; fraction: number } | null {
  const iv = openingInterval(room, wall, position, size);
  const sides: Room[] = [room];
  const neighbor = neighborAcrossWall(plan, room, wall, position);
  if (neighbor) sides.push(neighbor);
  for (const sideRoom of sides) {
    const a = openingApproach(plan, sideRoom, iv, opts?.window ? { depth: 0.3 } : undefined);
    if (!a) continue;
    for (const f of plan.furniture) {
      if (f.roomId !== sideRoom.id) continue;
      const p = getPlacement(f.type);
      if (p.category === "rug" || p.category === "decor") continue;
      if (/light|outlet|switch/.test(f.type)) continue;
      if (opts?.window && estimatedHeightM(f.type) <= 0.95) continue;
      const frac = doorCoverageFraction(worldAABB(f), a);
      if (frac >= 0.5) return { blocker: f, sideRoom, fraction: frac };
    }
  }
  return null;
}

/** Até 2 positions livres para uma abertura nesta parede, considerando vãos
 *  existentes E mobília (corredor de chegada). Null quando nada serve. */
function suggestOpeningPositions(
  plan: FloorPlan,
  room: Room,
  wall: Wall,
  size: number,
  opts?: { window?: boolean }
): string | null {
  const sugs: string[] = [];
  for (let p = 0.15; p <= 0.86; p += 0.05) {
    const fit = fitOpening(room, wall, p, size, opts?.window ? "Janela" : "Porta");
    if (!fit.ok || fit.adjusted) continue;
    if (wallIsOpen(plan, room, wall, fit.position)) continue;
    if (findOpeningConflict(plan, room, wall, fit.position, size)) continue;
    if (openingFurnitureConflict(plan, room, wall, fit.position, size, opts)) continue;
    const fmt = fit.position.toFixed(2);
    if (!sugs.includes(fmt)) sugs.push(fmt);
    if (sugs.length >= 2) break;
  }
  return sugs.length > 0 ? sugs.join(" ou ") : null;
}

function doAddDoor(plan: FloorPlan, input: ToolInputs["add_door"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const size = input.size ?? 0.9;
  const fit = fitOpening(room, input.wall, clamp01(input.position ?? 0.5), size, "Porta");
  if (!fit.ok) return { ok: false, message: fit.message };
  const position = fit.position;

  const openMsg = wallIsOpen(plan, room, input.wall, position);
  if (openMsg) return { ok: false, message: openMsg };

  // Dedup: a door whose world centre is within ~50 cm ON THE SAME WALL LINE
  // is the same physical opening (repeated calls, or two adjacent rooms each
  // registering the shared door). Same-line check matters: two perpendicular
  // doors meeting at a corner are DIFFERENT doors. When the new size differs,
  // treat the call as a replacement (é assim que o agente alarga uma porta
  // estreita para NBR 9050) instead of silently skipping.
  const newCenter = doorWorldCenter(room, input.wall, position);
  const newInterval = openingInterval(room, input.wall, position, size);
  for (const d of plan.doors) {
    const dRoom = plan.rooms.find((r) => r.id === d.roomId);
    if (!dRoom) continue;
    const di = openingInterval(dRoom, d.wall, d.position, d.size);
    if (di.axis !== newInterval.axis || Math.abs(di.fixed - newInterval.fixed) > 0.075) continue;
    const c = doorWorldCenter(dRoom, d.wall, d.position);
    if (Math.hypot(c.x - newCenter.x, c.y - newCenter.y) >= DOOR_DEDUP_RADIUS_M) continue;
    if (Math.abs(d.size - size) > 0.01) {
      d.size = size;
      return {
        ok: true,
        message: `Porta existente de '${dRoom.name}' (${d.wall}) substituída — novo vão de ${size.toFixed(2)}m.`,
      };
    }
    return {
      ok: true,
      message: `Porta já existe próximo a '${room.name}' (${input.wall}); pulando duplicata.`,
    };
  }

  // Aberturas parcialmente sobrepostas (centros a mais de 50 cm, mas vãos
  // colidindo) e colisões porta×janela são erro de projeto — rejeitar.
  const conflict = findOpeningConflict(plan, room, input.wall, position, size);
  if (conflict) {
    return {
      ok: false,
      message:
        `Porta na parede ${wallSideLabel(input.wall)} de '${room.name}' sobrepõe a ${conflict.kind} existente de '${conflict.roomName}' ` +
        `(parede ${wallSideLabel(conflict.wall)}, position ${conflict.position.toFixed(2)}, ${conflict.size.toFixed(2)}m). ` +
        `Escolha uma position fora desse trecho, outra parede, ou ajuste a abertura existente com update_door/update_window.`,
    };
  }

  // Corredor de chegada vs mobília existente (nos DOIS lados): porta criada
  // depois da mobília era o buraco que deixava um guarda-roupa na boca do
  // vão sem nenhuma reclamação.
  const blockedApproach = openingFurnitureConflict(plan, room, input.wall, position, size);
  if (blockedApproach) {
    const sug = suggestOpeningPositions(plan, room, input.wall, size);
    return {
      ok: false,
      message:
        `Porta na parede ${wallSideLabel(input.wall)} de '${room.name}' ficaria bloqueada por '${blockedApproach.blocker.label}' em '${blockedApproach.sideRoom.name}' ` +
        `(cobre ${Math.round(blockedApproach.fraction * 100)}% do vão). ` +
        (sug
          ? `Positions livres nesta parede: ${sug}. `
          : `Nenhuma position livre nesta parede com a mobília atual. `) +
        `Alternativas: mova o móvel (move_furniture), escolha outra parede, ou remova o móvel.`,
    };
  }

  // Swing automático: dobradiça no lado mais próximo do canto (folha aberta
  // descansa na parede perpendicular), abrindo para dentro; alternativas são
  // testadas contra os móveis existentes (Capacidade B).
  const ownFurniture = plan.furniture.filter((f) => f.roomId === room.id);
  const neighbor = neighborAcrossWall(plan, room, input.wall, position);
  // null = sem vizinho (parede externa) → chooseDoorSwing nunca abre "out".
  const neighborFurniture = neighbor
    ? plan.furniture.filter((f) => f.roomId === neighbor.id)
    : null;
  const swingChoice = chooseDoorSwing(room, input.wall, position, size, ownFurniture, neighborFurniture);

  const door: Door = {
    id: nextId("door"),
    roomId: room.id,
    wall: input.wall,
    position,
    size,
    hinge: swingChoice.hinge,
    swing: swingChoice.swing,
  };
  plan.doors.push(door);
  const notes: string[] = [];
  if (fit.adjusted) notes.push(`posição ajustada para ${position.toFixed(2)} para o vão caber na parede`);
  if (swingChoice.blockedBy) notes.push(`atenção: o arco de abertura colide com ${swingChoice.blockedBy} — mova o móvel ou inverta a porta`);
  const suffix = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  return { ok: true, message: `Porta adicionada em '${room.name}' (${input.wall})${suffix}.` };
}

/** Porta do cômodo/parede mais próxima de `position` (0..1). Null quando a
 *  parede não tem portas. */
function findDoorNear(plan: FloorPlan, room: Room, wall: Wall, position?: number): Door | null {
  const cands = plan.doors.filter((d) => d.roomId === room.id && d.wall === wall);
  if (cands.length === 0) return null;
  const target = position ?? 0.5;
  return cands.slice().sort((a, b) => Math.abs(a.position - target) - Math.abs(b.position - target))[0];
}

function findWindowNear(plan: FloorPlan, room: Room, wall: Wall, position?: number): PlanWindow | null {
  const cands = plan.windows.filter((w) => w.roomId === room.id && w.wall === wall);
  if (cands.length === 0) return null;
  const target = position ?? 0.5;
  return cands.slice().sort((a, b) => Math.abs(a.position - target) - Math.abs(b.position - target))[0];
}

function doUpdateDoor(plan: FloorPlan, input: ToolInputs["update_door"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const door = findDoorNear(plan, room, input.wall, input.position);
  if (!door) {
    return { ok: false, message: `Nenhuma porta na parede ${wallSideLabel(input.wall)} de '${room.name}'.` };
  }
  const size = input.new_size ?? door.size;
  const rawPos = input.new_position ?? door.position;
  const fit = fitOpening(room, input.wall, clamp01(rawPos), size, "Porta");
  if (!fit.ok) return { ok: false, message: fit.message };
  const conflict = findOpeningConflict(plan, room, input.wall, fit.position, size, { ignoreDoorId: door.id });
  if (conflict) {
    return {
      ok: false,
      message: `Atualização sobreporia a ${conflict.kind} de '${conflict.roomName}' (position ${conflict.position.toFixed(2)}, ${conflict.size.toFixed(2)}m). Escolha outra position.`,
    };
  }
  // new_position pode empurrar a porta para trás de um móvel — mesma guarda
  // do add_door, senão o bug do guarda-roupa renasce por esta rota.
  const updBlocked = openingFurnitureConflict(plan, room, input.wall, fit.position, size);
  if (updBlocked) {
    const sug = suggestOpeningPositions(plan, room, input.wall, size);
    return {
      ok: false,
      message:
        `Mover a porta para position ${fit.position.toFixed(2)} a deixaria bloqueada por '${updBlocked.blocker.label}' em '${updBlocked.sideRoom.name}' ` +
        `(cobre ${Math.round(updBlocked.fraction * 100)}% do vão).` +
        (sug ? ` Positions livres: ${sug}.` : " Nenhuma position livre nesta parede com a mobília atual."),
    };
  }
  door.size = size;
  door.position = fit.position;
  if (input.hinge) door.hinge = input.hinge;
  if (input.swing) door.swing = input.swing;
  const bits: string[] = [];
  if (input.new_size) bits.push(`vão ${size.toFixed(2)}m`);
  if (input.new_position !== undefined) bits.push(`position ${fit.position.toFixed(2)}`);
  if (input.hinge) bits.push(`dobradiça ${input.hinge === "near" ? "início" : "fim"}`);
  if (input.swing) bits.push(`abre para ${input.swing === "in" ? "dentro" : "fora"}`);
  return {
    ok: true,
    message: `Porta de '${room.name}' (${input.wall}) atualizada${bits.length ? `: ${bits.join(", ")}` : ""}.`,
  };
}

function doRemoveDoor(plan: FloorPlan, input: ToolInputs["remove_door"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const door = findDoorNear(plan, room, input.wall, input.position);
  if (!door) {
    return { ok: false, message: `Nenhuma porta na parede ${wallSideLabel(input.wall)} de '${room.name}'.` };
  }
  plan.doors = plan.doors.filter((d) => d.id !== door.id);
  return { ok: true, message: `Porta da parede ${wallSideLabel(input.wall)} de '${room.name}' removida.` };
}

function doUpdateWindow(plan: FloorPlan, input: ToolInputs["update_window"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const win = findWindowNear(plan, room, input.wall, input.position);
  if (!win) {
    return { ok: false, message: `Nenhuma janela na parede ${wallSideLabel(input.wall)} de '${room.name}'.` };
  }
  const size = input.new_size ?? win.size;
  const rawPos = input.new_position ?? win.position;
  const fit = fitOpening(room, input.wall, clamp01(rawPos), size, "Janela");
  if (!fit.ok) return { ok: false, message: fit.message };
  const conflict = findOpeningConflict(plan, room, input.wall, fit.position, size, { ignoreWindowId: win.id });
  if (conflict) {
    return {
      ok: false,
      message: `Atualização sobreporia a ${conflict.kind} de '${conflict.roomName}' (position ${conflict.position.toFixed(2)}, ${conflict.size.toFixed(2)}m). Escolha outra position.`,
    };
  }
  const winUpdBlocked = openingFurnitureConflict(plan, room, input.wall, fit.position, size, { window: true });
  if (winUpdBlocked) {
    return {
      ok: false,
      message: `Mover a janela para position ${fit.position.toFixed(2)} a deixaria tapada por '${winUpdBlocked.blocker.label}' (móvel alto na frente). Mova o móvel antes ou escolha outra position.`,
    };
  }
  win.size = size;
  win.position = fit.position;
  return { ok: true, message: `Janela de '${room.name}' (${input.wall}) atualizada para ${size.toFixed(2)}m em position ${fit.position.toFixed(2)}.` };
}

function doRemoveWindow(plan: FloorPlan, input: ToolInputs["remove_window"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const win = findWindowNear(plan, room, input.wall, input.position);
  if (!win) {
    return { ok: false, message: `Nenhuma janela na parede ${wallSideLabel(input.wall)} de '${room.name}'.` };
  }
  plan.windows = plan.windows.filter((w) => w.id !== win.id);
  return { ok: true, message: `Janela da parede ${wallSideLabel(input.wall)} de '${room.name}' removida.` };
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
  const size = input.size ?? 1.5;
  const fit = fitOpening(room, input.wall, clamp01(input.position ?? 0.5), size, "Janela");
  if (!fit.ok) return { ok: false, message: fit.message };
  const position = fit.position;

  const openMsg = wallIsOpen(plan, room, input.wall, position);
  if (openMsg) return { ok: false, message: openMsg };

  // Dedup amigável NA MESMA LINHA de parede: janela praticamente no mesmo
  // lugar (cômodos vizinhos registrando a mesma janela, ou chamada repetida)
  // — pula sem erro; tamanho diferente vira substituição (é assim que o
  // agente aumenta uma janela para cumprir o 1/6 da NBR 15575).
  const newCenter = doorWorldCenter(room, input.wall, position);
  const newInterval = openingInterval(room, input.wall, position, size);
  for (const w of plan.windows) {
    const wRoom = plan.rooms.find((r) => r.id === w.roomId);
    if (!wRoom) continue;
    const wi = openingInterval(wRoom, w.wall, w.position, w.size);
    if (wi.axis !== newInterval.axis || Math.abs(wi.fixed - newInterval.fixed) > 0.075) continue;
    const c = doorWorldCenter(wRoom, w.wall, w.position);
    if (Math.hypot(c.x - newCenter.x, c.y - newCenter.y) >= DOOR_DEDUP_RADIUS_M) continue;
    if (Math.abs(w.size - size) > 0.01) {
      w.size = size;
      return {
        ok: true,
        message: `Janela existente de '${wRoom.name}' (${w.wall}) substituída — novo vão de ${size.toFixed(2)}m.`,
      };
    }
    return {
      ok: true,
      message: `Janela já existe próximo a '${room.name}' (${input.wall}); pulando duplicata.`,
    };
  }

  const conflict = findOpeningConflict(plan, room, input.wall, position, size);
  if (conflict) {
    return {
      ok: false,
      message:
        `Janela na parede ${wallSideLabel(input.wall)} de '${room.name}' sobrepõe a ${conflict.kind} existente de '${conflict.roomName}' ` +
        `(parede ${wallSideLabel(conflict.wall)}, position ${conflict.position.toFixed(2)}, ${conflict.size.toFixed(2)}m). ` +
        `Escolha uma position fora desse trecho ou outra parede.`,
    };
  }

  // Móvel ALTO (acima do peitoril) já encostado neste trecho tapa a janela
  // — mesma régua do validador WINDOW_OBSTRUCTED, agora na criação.
  const winBlocked = openingFurnitureConflict(plan, room, input.wall, position, size, { window: true });
  if (winBlocked) {
    const sug = suggestOpeningPositions(plan, room, input.wall, size, { window: true });
    return {
      ok: false,
      message:
        `Janela na parede ${wallSideLabel(input.wall)} de '${room.name}' ficaria tapada por '${winBlocked.blocker.label}' (móvel alto cobrindo ${Math.round(winBlocked.fraction * 100)}% do vão).` +
        (sug ? ` Positions livres: ${sug}.` : " Mova o móvel ou use outra parede."),
    };
  }

  const win: PlanWindow = {
    id: nextId("win"),
    roomId: room.id,
    wall: input.wall,
    position,
    size,
  };
  plan.windows.push(win);
  const suffix = fit.adjusted ? ` (posição ajustada para ${position.toFixed(2)} para o vão caber na parede)` : "";
  return { ok: true, message: `Janela adicionada em '${room.name}'${suffix}.` };
}

function doDeleteWall(plan: FloorPlan, input: ToolInputs["delete_wall"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (!room.openWalls) room.openWalls = [];
  if (!room.openWalls.includes(input.wall)) room.openWalls.push(input.wall);
  // Clear any door/window on that wall — INCLUDING openings registered by
  // the NEIGHBOR on the shared line. Filtering only the own room's openings
  // left "ghost" doors pointing at a wall that no longer exists (they
  // disappeared from the drawing but kept blocking add_door via dedup).
  const wallLen = input.wall === "north" || input.wall === "south" ? room.width : room.height;
  const removedSpan = spanInterval(room, input.wall, 0, wallLen);
  const removedDoors: string[] = [];
  plan.doors = plan.doors.filter((d) => {
    if (d.roomId === room.id && d.wall === input.wall) {
      removedDoors.push("porta");
      return false;
    }
    const dRoom = plan.rooms.find((r) => r.id === d.roomId);
    if (!dRoom || dRoom.id === room.id) return true;
    const di = openingInterval(dRoom, d.wall, d.position, d.size);
    if (openingsOverlap1D(removedSpan, di) > 0) {
      removedDoors.push(`porta de '${dRoom.name}'`);
      return false;
    }
    return true;
  });
  plan.windows = plan.windows.filter((w) => {
    if (w.roomId === room.id && w.wall === input.wall) return false;
    const wRoom = plan.rooms.find((r) => r.id === w.roomId);
    if (!wRoom || wRoom.id === room.id) return true;
    return openingsOverlap1D(removedSpan, openingInterval(wRoom, w.wall, w.position, w.size)) <= 0;
  });
  const note = removedDoors.length > 0 ? ` (${removedDoors.length} abertura(s) removida(s) junto)` : "";
  return { ok: true, message: `Parede ${input.wall} de '${room.name}' aberta${note}.` };
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
): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const t = input.furniture_type;
  const def = FURN_DEFS[t];
  if (!def) return { ok: false, message: `Tipo de móvel desconhecido: ${t}` };
  const size = def.sizeM;
  // Área útil: rx/ry mapeiam 0..1 sobre o retângulo DESCONTANDO as paredes
  // (rx=0 = encostado na FACE INTERNA, não em cima da faixa da parede).
  const usable = usableRect(plan, room);
  // Reject items that don't fit the usable area outright — gives the agent
  // a chance to pick a smaller variant or a different room.
  if (size.w > usable.w + 0.01 || size.h > usable.h + 0.01) {
    return {
      ok: false,
      message:
        `${def.label} (${size.w.toFixed(2)}×${size.h.toFixed(2)}m) não cabe em ` +
        `'${room.name}' (área útil ${usable.w.toFixed(2)}×${usable.h.toFixed(2)}m, descontando paredes). ` +
        `Escolha um modelo menor ou outro cômodo.`,
    };
  }
  const rx = clamp01(input.relative_x ?? 0.5);
  const ry = clamp01(input.relative_y ?? 0.5);
  const fx = usable.x + rx * Math.max(0, usable.w - size.w);
  const fy = usable.y + ry * Math.max(0, usable.h - size.h);

  // Rich placement validators (Phase C). Every furniture type carries
  // metadata in lib/furniture-placement.ts: anchor (wall/corner/free),
  // clearance per side, ergonomic relations (kitchen triangle, sofa-TV).
  // These run BEFORE the legacy AABB overlap so we surface the most
  // diagnostic error first — "geladeira precisa canto" beats "geladeira
  // sobrepõe ar". (O antigo bypass skipOverlapCheck dos grupos foi
  // eliminado — grupos agora passam pelo solver com validação ligada.)
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
  const advisories: string[] = placementCheck.advisories ?? [];

  // Overlap check (Bug "agente cria coisas em cima da outra"). Rejects
  // the placement if it intersects an existing furniture in the same
  // room. The error message lists the conflicting item AND describes
  // every occupied AABB so the agent can pick a free spot on the next
  // try without having to call list_furniture first.
  const conflict = findFurnitureOverlap(plan, room.id, fx, fy, size.w, size.h, undefined, input.furniture_type);
  if (conflict) {
    const occupied = plan.furniture
      .filter((f) => f.roomId === room.id && !isRugLike(f.type))
      .map((f) => {
        const orx = (f.x - usable.x) / Math.max(0.01, usable.w - f.width);
        const ory = (f.y - usable.y) / Math.max(0.01, usable.h - f.height);
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
  const suffix = advisories.length > 0 ? ` ${advisories.join(" ")}` : "";
  return { ok: true, message: `${item.label} adicionado em '${room.name}'.${suffix}` };
}

/** True if `type` is the kind of low/flat object (rug, mat) that
 *  legitimately overlaps with other furniture — we skip overlap checks
 *  for these so the agent can put a sofa over a rug. */
function isRugLike(type: string): boolean {
  return /^rug|carpet|mat/i.test(type);
}

/** Find an existing furniture (same room, non-rug) whose VISUAL AABB
 *  (rotation-aware) intersects the candidate rectangle. Returns the first
 *  conflict or null. Uses an inset of 1 cm so flush edges (sofa touching a
 *  wall-mounted shelf) don't trip the check. */
function findFurnitureOverlap(
  plan: FloorPlan,
  roomId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  excludeId?: string,
  movingType?: FurnitureType,
): Furniture | null {
  const inset = TOL_CONTACT_M;
  for (const f of plan.furniture) {
    if (f.roomId !== roomId) continue;
    if (excludeId && f.id === excludeId) continue;
    if (isRugLike(f.type)) continue;
    // Cadeira encaixada sob o tampo da mesa é pose CORRETA, não colisão —
    // sem esta isenção, o move_furniture de correção desfazia o par.
    if (movingType && isSatellitePair(f.type, movingType)) continue;
    const fb = worldAABB(f);
    const overlap =
      fb.x + fb.w - inset > x &&
      fb.x + inset < x + w &&
      fb.y + fb.h - inset > y &&
      fb.y + inset < y + h;
    if (overlap) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// place_items — composição direta pelo modelo; o motor é FÍSICA, não decisor.
//
// O modelo dá CENTRO em metros (mundo) + frente (norte/sul/leste/oeste), ou
// usa snap como régua-T (parede → flush na face interna, só falta o `along`;
// "junto_de:" → tuck no parceiro). O motor checa fatos (área útil, colisão,
// chegada/giro de porta) e rejeita com NÚMEROS + sugestões — nunca escolhe
// posição sozinho.
// ---------------------------------------------------------------------------

const CARDINAL_TO_WALL: Record<string, Wall> = {
  norte: "north", north: "north",
  sul: "south", south: "south",
  leste: "east", east: "east",
  oeste: "west", west: "west",
};

/** frente → rotação do glifo (frente default do glifo = sul). */
const FACING_TO_ROTATION: Record<string, number> = {
  sul: 0, south: 0,
  oeste: 90, west: 90,
  norte: 180, north: 180,
  leste: 270, east: 270,
};

function doPlaceItems(plan: FloorPlan, input: ToolInputs["place_items"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, message: "place_items: lista 'items' vazia." };
  }
  const usable = usableRect(plan, room);
  const lines: string[] = [];
  let applied = 0;
  const movedPartners: Furniture[] = [];

  for (const item of input.items) {
    const def = FURN_DEFS[item.type];
    if (!def) {
      lines.push(`✗ ${item.type}: tipo desconhecido.`);
      continue;
    }
    const placement = getPlacement(item.type);
    const label = item.label ?? def.label;

    // Mover peça existente?
    let existing: Furniture | undefined;
    if (item.furniture_id) {
      existing = plan.furniture.find((f) => f.id === item.furniture_id);
      if (!existing) {
        lines.push(`✗ ${label}: furniture_id '${item.furniture_id}' não encontrado.`);
        continue;
      }
      if (existing.runId) {
        lines.push(`✗ ${existing.label}: é módulo de marcenaria (${existing.runId}) — use update_millwork_module/remove_millwork_run.`);
        continue;
      }
    }

    // ---- resolve a pose (bbox VISUAL + rotação) ----
    let vx: number, vy: number, vw: number, vh: number, rotation: number;
    const snap = item.snap?.trim().toLowerCase();

    if (snap && snap.startsWith("junto_de:")) {
      // Tuck satélite: pose derivada do parceiro.
      const key = snap.slice("junto_de:".length).trim();
      const partner = plan.furniture.find(
        (f) =>
          f.roomId === room.id &&
          f.id !== existing?.id &&
          (f.id === key || f.label.trim().toLowerCase() === key)
      );
      if (!partner) {
        lines.push(`✗ ${label}: parceiro '${key}' não encontrado em '${room.name}'.`);
        continue;
      }
      const pBB = worldAABB(partner);
      const back = backWallOf(pBB, usable);
      const pose = satellitePoseCandidates(pBB, back, def.sizeM).find((p) => {
        if (
          p.x < usable.x - TOL_CONTACT_M || p.y < usable.y - TOL_CONTACT_M ||
          p.x + p.width > usable.x + usable.w + TOL_CONTACT_M ||
          p.y + p.height > usable.y + usable.h + TOL_CONTACT_M
        ) return false;
        if (findFurnitureOverlap(plan, room.id, p.x, p.y, p.width, p.height, existing?.id ?? partner.id, item.type)) return false;
        return validateDoorClearance({ x: p.x, y: p.y, w: p.width, h: p.height }, room, plan.doors, plan.rooms, placement).ok;
      });
      if (!pose) {
        lines.push(`✗ ${label}: sem vaga válida na frente de ${partner.label} (frente bloqueada ou encostada na parede).`);
        continue;
      }
      ({ x: vx, y: vy, width: vw, height: vh, rotation } = pose);
    } else if (snap && CARDINAL_TO_WALL[snap]) {
      // Régua-T: flush na face interna; o modelo dá só o `along`.
      const wall = CARDINAL_TO_WALL[snap];
      const horizontal = wall === "north" || wall === "south";
      rotation = item.facing !== undefined
        ? FACING_TO_ROTATION[item.facing] ?? 0
        : rotationForBackWall(wall); // default: costas na parede do snap
      const size = visualSizeFor(def.sizeM, rotation);
      vw = size.w; vh = size.h;
      const along = item.along ?? (horizontal ? item.center_x : item.center_y);
      if (along === undefined) {
        lines.push(`✗ ${label}: snap '${snap}' precisa de 'along' (centro AO LONGO da parede, em metros do mundo).`);
        continue;
      }
      const lo = horizontal ? usable.x : usable.y;
      const hi = horizontal ? usable.x + usable.w : usable.y + usable.h;
      const half = (horizontal ? vw : vh) / 2;
      let c = along;
      if (c - half < lo - TOL_CONTACT_M || c + half > hi + TOL_CONTACT_M) {
        const cMin = lo + half;
        const cMax = hi - half;
        if (cMax < cMin) {
          lines.push(`✗ ${label}: não cabe na parede ${wallSideLabel(wall)} (peça ${(2 * half).toFixed(2)}m > vão útil ${(hi - lo).toFixed(2)}m).`);
          continue;
        }
        if (Math.abs(c - Math.max(cMin, Math.min(cMax, c))) <= 0.05) {
          c = Math.max(cMin, Math.min(cMax, c)); // nudge ≤5cm, tolerado
        } else {
          lines.push(`✗ ${label}: along=${along.toFixed(2)} estoura a parede ${wallSideLabel(wall)} — com essa peça, centro válido ∈ [${cMin.toFixed(2)}..${cMax.toFixed(2)}].`);
          continue;
        }
      }
      if (horizontal) {
        vx = c - vw / 2;
        vy = wall === "north" ? usable.y : usable.y + usable.h - vh;
      } else {
        vy = c - vh / 2;
        vx = wall === "west" ? usable.x : usable.x + usable.w - vw;
      }
    } else if (snap) {
      lines.push(`✗ ${label}: snap '${item.snap}' inválido — use norte|sul|leste|oeste ou "junto_de:<id|label>".`);
      continue;
    } else {
      // Posição livre: centro explícito + frente.
      if (item.center_x === undefined || item.center_y === undefined) {
        lines.push(`✗ ${label}: sem snap, informe center_x E center_y (metros, mundo).`);
        continue;
      }
      rotation = FACING_TO_ROTATION[item.facing ?? "sul"] ?? 0;
      const size = visualSizeFor(def.sizeM, rotation);
      vw = size.w; vh = size.h;
      vx = item.center_x - vw / 2;
      vy = item.center_y - vh / 2;
    }

    // ---- física ----
    // 1) área útil (nudge ≤5cm; acima disso, rejeita com faixa válida)
    const overL = usable.x - vx;
    const overT = usable.y - vy;
    const overR = vx + vw - (usable.x + usable.w);
    const overB = vy + vh - (usable.y + usable.h);
    const worst = Math.max(overL, overT, overR, overB);
    if (worst > 0.05) {
      const cxMin = usable.x + vw / 2;
      const cxMax = usable.x + usable.w - vw / 2;
      const cyMin = usable.y + vh / 2;
      const cyMax = usable.y + usable.h - vh / 2;
      if (cxMax < cxMin || cyMax < cyMin) {
        lines.push(`✗ ${label}: ${vw.toFixed(2)}×${vh.toFixed(2)}m não cabe na área útil de '${room.name}' (${usable.w.toFixed(2)}×${usable.h.toFixed(2)}m).`);
      } else {
        lines.push(`✗ ${label}: estoura ${worst.toFixed(2)}m para fora da área útil — centro válido: x ∈ [${cxMin.toFixed(2)}..${cxMax.toFixed(2)}], y ∈ [${cyMin.toFixed(2)}..${cyMax.toFixed(2)}].`);
      }
      continue;
    }
    if (worst > 0) {
      vx = Math.max(usable.x, Math.min(usable.x + usable.w - vw, vx));
      vy = Math.max(usable.y, Math.min(usable.y + usable.h - vh, vy));
    }
    // 2) colisão (peça candidata rug/decor passa por baixo/cima)
    if (placement.category !== "rug" && placement.category !== "decor") {
      const conflict = findFurnitureOverlap(plan, room.id, vx, vy, vw, vh, existing?.id, item.type);
      if (conflict) {
        const cb = worldAABB(conflict);
        lines.push(
          `✗ ${label}: colide com ${conflict.label} [id=${conflict.id}] (ocupa x ${cb.x.toFixed(2)}..${(cb.x + cb.w).toFixed(2)}, y ${cb.y.toFixed(2)}..${(cb.y + cb.h).toFixed(2)}). Escolha centro fora desse retângulo ou mova o vizinho.`
        );
        continue;
      }
    }
    // 3) porta: giro + chegada (regra graduada de 50%)
    const doorCheck = validateDoorClearance({ x: vx, y: vy, w: vw, h: vh }, room, plan.doors, plan.rooms, placement);
    if (!doorCheck.ok) {
      lines.push(`✗ ${label}: ${doorCheck.reason}`);
      continue;
    }

    // ---- aplica (bbox armazenado = dims do glifo preservando o centro) ----
    const rotated = ((rotation % 180) + 180) % 180 === 90;
    const sw = rotated ? vh : vw;
    const sh = rotated ? vw : vh;
    const sx = vx + (vw - sw) / 2;
    const sy = vy + (vh - sh) / 2;
    if (existing) {
      existing.type = item.type;
      existing.x = sx;
      existing.y = sy;
      existing.width = sw;
      existing.height = sh;
      if (rotation !== 0) existing.rotation = rotation; else delete existing.rotation;
      if (item.label) existing.label = item.label;
      if (existing.roomId !== room.id) existing.roomId = room.id;
      movedPartners.push(existing);
      applied += 1;
      lines.push(`✓ ${existing.label} movido — centro (${(vx + vw / 2).toFixed(2)},${(vy + vh / 2).toFixed(2)}), frente=${facingLabel(rotation)}.`);
    } else {
      const f: Furniture = {
        id: nextId("furn"),
        roomId: room.id,
        type: item.type,
        label,
        x: sx,
        y: sy,
        width: sw,
        height: sh,
        ...(rotation !== 0 ? { rotation } : {}),
      };
      plan.furniture.push(f);
      movedPartners.push(f);
      applied += 1;
      lines.push(`✓ ${label} [id=${f.id}] — centro (${(vx + vw / 2).toFixed(2)},${(vy + vh / 2).toFixed(2)}), frente=${facingLabel(rotation)}${snap && CARDINAL_TO_WALL[snap] ? `, encostado ${snap}` : ""}.`);
    }
  }

  // Parceiro movido → satélites acompanham.
  const satNotes: string[] = [];
  for (const p of movedPartners) {
    if (Object.values(SATELLITES).some((list) => list?.includes(p.type))) {
      satNotes.push(...reposeSatellites(plan, p));
    }
  }
  if (satNotes.length > 0) lines.push(...satNotes.map((n) => `· ${n}`));

  const failedCount = input.items.length - applied;
  return {
    ok: applied > 0,
    message:
      `${applied}/${input.items.length} item(ns) aplicado(s) em '${room.name}':\n${lines.join("\n")}` +
      (failedCount > 0 ? `\n\n${summarizeRoomLayout(room, plan)}` : ""),
  };
}

/** Re-deriva a pose dos satélites (cadeira↔mesa) quando o PARCEIRO muda de
 *  lugar/tipo — sem isso o bug da cadeira órfã renascia no primeiro
 *  move_furniture da mesa. Devolve notas para a mensagem da tool. */
function reposeSatellites(plan: FloorPlan, partner: Furniture): string[] {
  const notes: string[] = [];
  const room = plan.rooms.find((r) => r.id === partner.roomId);
  if (!room) return notes;
  const sats = plan.furniture.filter(
    (f) =>
      f.roomId === partner.roomId &&
      f.id !== partner.id &&
      (SATELLITES[f.type]?.includes(partner.type) ?? false)
  );
  if (sats.length === 0) return notes;
  const usable = usableRect(plan, room);
  const pBB = worldAABB(partner);
  const back = backWallOf(pBB, usable);
  for (const chair of sats) {
    const glyph = FURN_DEFS[chair.type]?.sizeM ?? { w: chair.width, h: chair.height };
    let done = false;
    for (const pose of satellitePoseCandidates(pBB, back, glyph)) {
      if (
        pose.x < usable.x - TOL_CONTACT_M ||
        pose.y < usable.y - TOL_CONTACT_M ||
        pose.x + pose.width > usable.x + usable.w + TOL_CONTACT_M ||
        pose.y + pose.height > usable.y + usable.h + TOL_CONTACT_M
      ) continue;
      if (findFurnitureOverlap(plan, room.id, pose.x, pose.y, pose.width, pose.height, chair.id, chair.type)) continue;
      const apps = doorApproachRects(plan, room);
      if (worstDoorCoverage(apps, { x: pose.x, y: pose.y, w: pose.width, h: pose.height }).fraction >= 0.5) continue;
      // bbox armazenado = dims do glifo preservando o centro do visual.
      const rotated = (pose.rotation % 180 + 180) % 180 === 90;
      const w = rotated ? pose.height : pose.width;
      const h = rotated ? pose.width : pose.height;
      chair.x = pose.x + (pose.width - w) / 2;
      chair.y = pose.y + (pose.height - h) / 2;
      chair.width = w;
      chair.height = h;
      chair.rotation = pose.rotation;
      notes.push(`${chair.label} reposicionada junto a ${partner.label}`);
      done = true;
      break;
    }
    if (!done) notes.push(`atenção: ${chair.label} ficou sem vaga na frente de ${partner.label} — ajuste ou remova`);
  }
  return notes;
}

/** DSL handler for `place_furniture_intent` — multi-item generative
 *  placement. The solver computes coords from semantic anchors (wall:N,
 *  corner:NE, etc.), validates each piece, then commits the survivors
 *  via direct push (skipping doAddFurniture's per-item validators since
 *  the solver already ran them with full sibling awareness). */

/** Materializa os itens resolvidos pelo solver no plano. O solver devolve o
 *  bbox VISUAL (já transposto para rotações 90/270); o bbox armazenado
 *  guarda as dimensões do glifo SEM rotação com o mesmo centro — o renderer
 *  aplica a rotação em torno do centro. Compartilhado entre
 *  place_furniture_intent e os templates de furnish_room. */
export function commitSolvedItems(
  plan: FloorPlan,
  room: Room,
  result: { solved: Array<{ intent: { type: FurnitureType; label?: string; rotation?: number }; x: number; y: number; width: number; height: number }> },
): void {
  for (const s of result.solved) {
    const def = FURN_DEFS[s.intent.type];
    if (!def) continue;
    const rotated = ((s.intent.rotation ?? 0) % 180 + 180) % 180 === 90;
    const w = rotated ? s.height : s.width;
    const h = rotated ? s.width : s.height;
    const x = s.x + (s.width - w) / 2;
    const y = s.y + (s.height - h) / 2;
    const item: Furniture = {
      id: nextId("furn"),
      roomId: room.id,
      type: s.intent.type,
      label: s.intent.label ?? def.label,
      x,
      y,
      width: w,
      height: h,
      // !== undefined, não truthy: rotação 0 explícita é informação válida.
      ...(s.intent.rotation !== undefined ? { rotation: s.intent.rotation } : {}),
    };
    plan.furniture.push(item);
  }
}

function doPlaceFurnitureIntent(plan: FloorPlan, input: ToolInputs["place_furniture_intent"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, message: "place_furniture_intent: lista 'items' vazia." };
  }
  const result = solvePlacement({ room, items: input.items, plan });
  commitSolvedItems(plan, room, result);
  const message = formatSolverResult(room, plan, result);
  // Partial success is treated as ok = true with a descriptive message
  // so the agent sees what landed and what didn't, and can retry the
  // failed items with different anchors. Total failure (0 placed) is
  // treated as ok = false.
  return { ok: result.solved.length > 0, message };
}

function doSwapFurniture(plan: FloorPlan, input: ToolInputs["swap_furniture"]): ApplyResult {
  const f = plan.furniture.find((ff) => ff.id === input.furniture_id);
  if (!f) return { ok: false, message: "Móvel não encontrado." };
  if (f.runId) {
    return {
      ok: false,
      message: `${f.label} faz parte de um run de marcenaria (${f.runId}). Use update_millwork_module para trocar o módulo.`,
    };
  }
  const def = FURN_DEFS[input.new_type];
  if (!def) return { ok: false, message: `Tipo desconhecido: ${input.new_type}` };

  const room = plan.rooms.find((r) => r.id === f.roomId);
  const newW = def.sizeM.w;
  const newH = def.sizeM.h;
  // O footprint VISUAL é o transposto quando o móvel está rotacionado
  // 90/270° — encaixe e clamp precisam usar essas dimensões, senão um sofá
  // rotacionado "cabe" no registro mas vaza do cômodo no desenho.
  const rotated = (((f.rotation ?? 0) % 180) + 180) % 180 === 90;
  const vw = rotated ? newH : newW;
  const vh = rotated ? newW : newH;
  let nx = f.x;
  let ny = f.y;
  if (room) {
    const swapUsable = usableRect(plan, room);
    if (vw > swapUsable.w + TOL_CONTACT_M || vh > swapUsable.h + TOL_CONTACT_M) {
      return {
        ok: false,
        message: `${def.label} (${newW}×${newH}m${rotated ? ", rotacionado 90°" : ""}) não cabe em '${room.name}' (área útil ${swapUsable.w.toFixed(2)}×${swapUsable.h.toFixed(2)}m).`,
      };
    }
    // Clamp the VISUAL bbox inside the usable area, then derive the stored
    // top-left so the centers coincide.
    const oldBB = worldAABB(f);
    const vx = Math.max(swapUsable.x, Math.min(swapUsable.x + swapUsable.w - vw, oldBB.x));
    const vy = Math.max(swapUsable.y, Math.min(swapUsable.y + swapUsable.h - vh, oldBB.y));
    nx = vx + (vw - newW) / 2;
    ny = vy + (vh - newH) / 2;
    const conflict = findFurnitureOverlap(plan, room.id, vx, vy, vw, vh, f.id, input.new_type);
    if (conflict) {
      return {
        ok: false,
        message: `Trocar por ${def.label} (${newW}×${newH}m) sobreporia '${conflict.label}'. Mova ou remova o vizinho antes. ${summarizeRoomLayout(room, plan)}`,
      };
    }
    // Variante maior pode passar a tapar uma porta (criado→guarda-roupa).
    const swapPlacement = getPlacement(input.new_type);
    if (swapPlacement.category !== "rug" && swapPlacement.category !== "decor") {
      const worst = worstDoorCoverage(doorApproachRects(plan, room), { x: vx, y: vy, w: vw, h: vh });
      if (worst.fraction >= 0.5 && worst.approach) {
        return {
          ok: false,
          message: `Trocar por ${def.label} bloquearia a chegada da porta na parede ${wallSideLabel(worst.approach.side)} (cobriria ${Math.round(worst.fraction * 100)}% do vão). Mova o móvel para outra parede antes de trocar.`,
        };
      }
    }
  }
  f.type = input.new_type;
  f.label = def.label;
  f.width = newW;
  f.height = newH;
  f.x = nx;
  f.y = ny;
  // Mesa trocada de tamanho → cadeira satélite acompanha.
  const swapNotes = reposeSatellites(plan, f);
  const swapSuffix = swapNotes.length > 0 ? ` (${swapNotes.join("; ")})` : "";
  return { ok: true, message: `Móvel trocado por ${def.label}.${swapSuffix}` };
}

function doRemoveFurniture(plan: FloorPlan, input: ToolInputs["remove_furniture"]): ApplyResult {
  let target: Furniture | undefined;
  if (input.furniture_id) target = plan.furniture.find((f) => f.id === input.furniture_id);
  if (!target && input.label) {
    const ln = input.label.trim().toLowerCase();
    target = plan.furniture.find((f) => f.label.trim().toLowerCase() === ln);
  }
  if (!target) return { ok: false, message: "Móvel não encontrado." };
  if (target.runId) {
    // Remover um módulo isolado dessincroniza o run (update_millwork_module
    // re-materializa o run inteiro e "ressuscita" o módulo removido).
    return {
      ok: false,
      message: `${target.label} faz parte de um run de marcenaria (${target.runId}). Use update_millwork_module para trocar o módulo ou remove_millwork_run para remover o conjunto.`,
    };
  }
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

/** Atalho de place_items para UMA peça: novo CENTRO (mundo) + frente
 *  opcional. Mesma física — área útil, colisões, chegada/giro de porta. */
function doMoveFurniture(plan: FloorPlan, input: ToolInputs["move_furniture"]): ApplyResult {
  const f = plan.furniture.find((ff) => ff.id === input.furniture_id);
  if (!f) return { ok: false, message: "Móvel não encontrado." };
  if (f.runId) {
    return {
      ok: false,
      message: `${f.label} faz parte de um run de marcenaria (${f.runId}) — módulos não se movem individualmente. Use update_millwork_module ou remove_millwork_run + add_millwork_run.`,
    };
  }
  const destRoom = plan.rooms.find(
    (r) =>
      input.center_x >= r.x && input.center_x <= r.x + r.width &&
      input.center_y >= r.y && input.center_y <= r.y + r.height
  );
  if (!destRoom) {
    return {
      ok: false,
      message: `Centro (${input.center_x},${input.center_y}) fica fora de qualquer cômodo. Cômodos: ${plan.rooms.map((r) => `${r.name}(${r.x},${r.y},${r.width}×${r.height})`).join(", ")}.`,
    };
  }
  const facing = input.facing ?? facingLabel(f.rotation);
  return doPlaceItems(plan, {
    room_name: destRoom.name,
    items: [
      {
        type: f.type,
        furniture_id: f.id,
        center_x: input.center_x,
        center_y: input.center_y,
        ...(facing === "norte" || facing === "sul" || facing === "leste" || facing === "oeste"
          ? { facing }
          : {}),
      },
    ],
  });
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
  // `width` corre AO LONGO da parede de apoio; `depth` é o quanto a varanda
  // se projeta para fora. Em paredes leste/oeste (verticais) o footprint no
  // plano é, portanto, depth (x) × width (y) — sem essa transposição a
  // varanda oeste invadia o cômodo pai (ROOM_OVERLAP).
  let x = 0, y = 0;
  let w = input.width;
  let h = input.depth;
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
      w = input.depth;
      h = input.width;
      x = ref.x - input.depth;
      y = ref.y + (ref.height - input.width) / 2;
    } else {
      w = input.depth;
      h = input.width;
      x = ref.x + ref.width;
      y = ref.y + (ref.height - input.width) / 2;
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
    width: w,
    height: h,
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
  // Banheiro/lavabo testados ANTES dos padrões de suíte: "Banheiro Suíte"
  // casava com /suíte/ e ganhava cama de casal dentro do banheiro.
  if (/(banheiro|lavabo|wc)/.test(n)) group = room.width * room.height >= 5 ? "bathroom_full" : "bathroom_basic";
  else if (/sala/.test(n)) group = room.width * room.height >= 18 ? "living_full" : "living_basic";
  else if (/cozinha/.test(n)) group = room.width * room.height >= 10 ? "kitchen_full" : "kitchen_basic";
  // Infantil ANTES dos padrões genéricos de quarto: "Quarto Infantil"
  // casava com /quarto/ e ganhava cama de solteiro + escrivaninha — o ramo
  // infantil era inalcançável.
  else if (/(infantil|criança|crianca|bebê|bebe|kids)/.test(n)) group = "kids_room_basic";
  else if (/(suíte|suite|quarto.*casal|quarto principal|master)/.test(n))
    group = room.width * room.height >= 14 ? "bedroom_couple_full" : "bedroom_couple_basic";
  else if (/quarto/.test(n)) group = "bedroom_single_basic";
  else if (/(serviço|servico|lavanderia)/.test(n)) group = "laundry_basic";
  else if (/jantar/.test(n)) group = "dining_set_6";
  else if (/(escritório|escritorio|home office)/.test(n)) group = "office_basic";
  else if (/(jardim|quintal)/.test(n)) group = "garden_basic";
  else if (/piscina/.test(n)) group = "pool_set";

  if (!group) return { ok: false, message: `Não sei mobiliar '${room.name}' automaticamente.` };
  return doAddFurnitureGroup(plan, { room_name: room.name, group });
}

// ---------- Furniture groups (templates + solver pontuado) ----------

function doAddFurnitureGroup(plan: FloorPlan, input: ToolInputs["add_furniture_group"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const template = ROOM_TEMPLATES[input.group];
  if (!template) return { ok: false, message: `Grupo desconhecido: ${input.group}.` };

  // Cozinhas delegam para a marcenaria contínua (bancada arquitetônica).
  if (template.kind === "millwork") {
    return doAddMillworkRun(plan, template.build(room));
  }

  // Demais grupos: intents semânticos resolvidos pelo solver pontuado com
  // validação LIGADA (fim do skipOverlapCheck — era ele que deixava grupos
  // empilharem móveis sobre paredes/portas sem nenhum aviso).
  const { output, skipped } = solveRoomTemplate(plan, room, template.items);
  commitSolvedItems(plan, room, output);
  const base = formatSolverResult(room, plan, output);
  const skippedNote = skipped.length > 0 ? ` Omitidos: ${skipped.join("; ")}.` : "";
  return {
    ok: output.solved.length > 0,
    message: `${base}${skippedNote}`,
  };
}

// ---------- Plan summary for prompts ----------

/** Direção da FRENTE de um móvel a partir da rotação armazenada (glifo
 *  default tem frente para o sul). Mesma tabela do place_items. */
function facingLabel(rotation: number | undefined): string {
  const r = (((rotation ?? 0) % 360) + 360) % 360;
  return r === 0 ? "sul" : r === 90 ? "oeste" : r === 180 ? "norte" : r === 270 ? "leste" : `${r}°`;
}

const fm = (n: number): string => n.toFixed(2);

/** Estado da planta como NÚMEROS que o modelo consegue compor em cima:
 *  coords de mundo, faces internas, vãos livres por parede, móveis com
 *  CENTRO + frente + encostos. É a prancheta em texto. */
export function summarizePlan(plan: FloorPlan): string {
  if (plan.rooms.length === 0) return "Planta vazia (nenhum cômodo).";
  const parts: string[] = [];
  parts.push(
    `${plan.rooms.length} cômodo(s). Coords em METROS (mundo): x cresce p/ leste, y cresce p/ SUL. Móveis: posição = CENTRO; frente = p/ onde a peça olha.`
  );
  for (const r of plan.rooms) {
    const area = (r.width * r.height).toFixed(1);
    const u = usableRect(plan, r);
    parts.push(
      `\n## ${r.name} — rect (${fm(r.x)},${fm(r.y)})–(${fm(r.x + r.width)},${fm(r.y + r.height)}), ` +
        `útil (${fm(u.x)},${fm(u.y)})–(${fm(u.x + u.w)},${fm(u.y + u.h)}) [${fm(u.w)}×${fm(u.h)}m, ${area}m²], piso ${r.floor}` +
        `${r.openWalls?.length ? `, paredes abertas: ${r.openWalls.map((w) => WALL_PT[w]).join("/")}` : ""}`
    );
    // Paredes: aberturas com intervalos de mundo + vãos livres para móveis.
    for (const wall of ["north", "east", "south", "west"] as const) {
      if (r.openWalls?.includes(wall)) continue;
      const horizontal = wall === "north" || wall === "south";
      const face =
        wall === "north" ? u.y : wall === "south" ? u.y + u.h : wall === "west" ? u.x : u.x + u.w;
      const bits: string[] = [];
      for (const d of plan.doors) {
        const owner = plan.rooms.find((rr) => rr.id === d.roomId);
        if (!owner || d.silent) continue;
        const iv = openingInterval(owner, d.wall, d.position, d.size);
        const lineFixed =
          wall === "north" ? r.y : wall === "south" ? r.y + r.height : wall === "west" ? r.x : r.x + r.width;
        if ((iv.axis === "h") !== horizontal || Math.abs(iv.fixed - lineFixed) > 0.075) continue;
        const lo = Math.max(iv.start, horizontal ? r.x : r.y);
        const hi = Math.min(iv.end, horizontal ? r.x + r.width : r.y + r.height);
        if (hi - lo <= 0.01) continue;
        const neighbor = owner.id === r.id ? neighborAcrossWall(plan, r, wall, ((lo + hi) / 2 - (horizontal ? r.x : r.y)) / (horizontal ? r.width : r.height)) : owner;
        // "Abre p/ cá" é relativo a ESTE cômodo: swing "in" abre para o
        // cômodo DONO; visto do vizinho, é o lado de lá.
        const opensHere = (owner.id === r.id) === (d.swing !== "out");
        bits.push(
          `porta [${fm(lo)}..${fm(hi)}]${neighbor && neighbor.id !== r.id ? ` p/ ${neighbor.name}` : ""}${opensHere ? " (folha gira AQUI)" : " (folha gira do outro lado)"} — chegada livre nos 2 lados`
        );
      }
      for (const w of plan.windows.filter((w) => w.roomId === r.id && w.wall === wall)) {
        const iv = openingInterval(r, w.wall, w.position, w.size);
        bits.push(`janela [${fm(iv.start)}..${fm(iv.end)}]`);
      }
      const spans = freeWallSpans(plan, r, wall)
        .filter((s) => s.hi - s.lo > 0.3)
        .map((s) => `[${fm(s.lo)}..${fm(s.hi)}]`)
        .join(", ");
      const axisLabel = horizontal ? `y=${fm(face)}` : `x=${fm(face)}`;
      parts.push(
        `  ${WALL_PT[wall]} (face ${axisLabel}): ${bits.length ? bits.join("; ") : "sem vãos"}${spans ? `; livre p/ móveis: ${spans}` : "; sem trecho livre"}`
      );
    }
    const furn = plan.furniture.filter((f) => f.roomId === r.id);
    if (furn.length > 0) {
      parts.push(`  móveis:`);
      for (const f of furn) {
        const bb = worldAABB(f);
        const t = touchedWalls(bb, u);
        const touched = (["north", "south", "east", "west"] as const).filter((k) => t[k]).map((k) => WALL_PT[k]);
        parts.push(
          `    ${f.label} [id=${f.id}]${f.runId ? ` (marcenaria ${f.runId})` : ""} centro (${fm(bb.x + bb.w / 2)},${fm(bb.y + bb.h / 2)}) ${fm(bb.w)}×${fm(bb.h)} frente=${facingLabel(f.rotation)}${touched.length ? ` encostado=${touched.join("/")}` : " SOLTO"}`
        );
      }
    }
  }
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
  parts.push(`\nÁrea total: ${totalArea.toFixed(1)}m².`);
  if (plan.millworkRuns?.length) {
    parts.push(`Runs de marcenaria: ${plan.millworkRuns.map((m) => `${m.id} (${m.type})`).join(", ")}.`);
  }
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
