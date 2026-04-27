import type {
  Door,
  FloorMaterial,
  FloorPlan,
  Furniture,
  FurnitureType,
  Room,
  ToolInputs,
  ToolName,
  Wall,
  Window as PlanWindow,
} from "./types";

// ---------- ID + helpers ----------

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyPlan(): FloorPlan {
  return { rooms: [], doors: [], windows: [], furniture: [] };
}

function findRoom(plan: FloorPlan, name: string): Room | undefined {
  const norm = name.trim().toLowerCase();
  return plan.rooms.find((r) => r.name.trim().toLowerCase() === norm);
}

function clamp(n: number, mn: number, mx: number): number {
  return Math.max(mn, Math.min(mx, n));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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
    for (let x = minX; x <= maxX + w; x += step) {
      candidates.push({ x, y });
    }
  }
  for (const c of candidates) {
    if (!overlapsAny(plan, c.x, c.y, w, h)) return c;
  }
  return { x: maxX + margin, y: minY };
}

function overlapsAny(plan: FloorPlan, x: number, y: number, w: number, h: number): boolean {
  for (const r of plan.rooms) {
    if (x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y) return true;
  }
  return false;
}

// ---------- Default furniture sizes (meters) ----------
// Brazilian / Neufert standard plan dimensions.

const FURN_SIZE: Record<FurnitureType, { w: number; h: number }> = {
  sofa: { w: 2.1, h: 0.9 },
  bed: { w: 1.6, h: 2.0 }, // queen / casal
  table: { w: 1.4, h: 0.9 }, // dining table 4-6 people
  tv: { w: 1.6, h: 0.45 }, // TV rack
  sink: { w: 0.6, h: 0.45 },
  toilet: { w: 0.4, h: 0.65 },
  shower: { w: 0.9, h: 0.9 },
  stove: { w: 0.6, h: 0.6 },
  fridge: { w: 0.7, h: 0.7 },
  counter: { w: 1.5, h: 0.6 },
  island: { w: 1.6, h: 0.9 },
  wardrobe: { w: 2.0, h: 0.6 },
  desk: { w: 1.2, h: 0.6 },
  chair: { w: 0.5, h: 0.5 },
  bookshelf: { w: 1.0, h: 0.4 },
  washing_machine: { w: 0.6, h: 0.6 },
};

const FURN_LABEL_PT: Record<FurnitureType, string> = {
  sofa: "Sofá",
  bed: "Cama",
  table: "Mesa",
  tv: "TV",
  sink: "Pia",
  toilet: "Vaso",
  shower: "Box",
  stove: "Fogão",
  fridge: "Geladeira",
  counter: "Bancada",
  island: "Ilha",
  wardrobe: "Guarda-roupa",
  desk: "Escrivaninha",
  chair: "Cadeira",
  bookshelf: "Estante",
  washing_machine: "Máq. Lavar",
};

export function defaultFurnitureSize(t: FurnitureType): { w: number; h: number } {
  return FURN_SIZE[t];
}

export function defaultFurnitureLabel(t: FurnitureType): string {
  return FURN_LABEL_PT[t];
}

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
  const input = (rawInput ?? {}) as ToolInputs[T];
  try {
    switch (toolName) {
      case "create_room":
        return doCreateRoom(plan, input as ToolInputs["create_room"]);
      case "remove_room":
        return doRemoveRoom(plan, input as ToolInputs["remove_room"]);
      case "add_door":
        return doAddDoor(plan, input as ToolInputs["add_door"]);
      case "add_window":
        return doAddWindow(plan, input as ToolInputs["add_window"]);
      case "add_furniture":
        return doAddFurniture(plan, input as ToolInputs["add_furniture"]);
      case "remove_furniture":
        return doRemoveFurniture(plan, input as ToolInputs["remove_furniture"]);
      case "set_floor_material":
        return doSetFloor(plan, input as ToolInputs["set_floor_material"]);
      case "move_furniture":
        return doMoveFurniture(plan, input as ToolInputs["move_furniture"]);
      case "create_apartment_layout":
        return doCreateApartment(plan, input as ToolInputs["create_apartment_layout"]);
      case "furnish_room":
        return doFurnishRoom(plan, input as ToolInputs["furnish_room"]);
      case "clear_all":
        plan.rooms.length = 0;
        plan.doors.length = 0;
        plan.windows.length = 0;
        plan.furniture.length = 0;
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
  if (/(cozinha|área|servico|serviço|lavanderia|hall)/.test(n)) return "porcelanato";
  return "madeira";
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
  const room: Room = {
    id: nextId("room"),
    name,
    x,
    y,
    width,
    height,
    floor: input.floor_type ?? defaultFloorFor(name),
    appear: 0,
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

function doAddDoor(plan: FloorPlan, input: ToolInputs["add_door"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const door: Door = {
    id: nextId("door"),
    roomId: room.id,
    wall: input.wall,
    position: clamp01(input.position ?? 0.5),
    size: input.size ?? 0.9,
  };
  plan.doors.push(door);
  return { ok: true, message: `Porta adicionada em '${room.name}' (${input.wall}).` };
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

function doAddFurniture(plan: FloorPlan, input: ToolInputs["add_furniture"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const t = input.furniture_type;
  const size = FURN_SIZE[t];
  if (!size) return { ok: false, message: `Tipo de móvel desconhecido: ${t}` };
  const rx = clamp01(input.relative_x ?? 0.5);
  const ry = clamp01(input.relative_y ?? 0.5);
  const fx = room.x + rx * Math.max(0, room.width - size.w);
  const fy = room.y + ry * Math.max(0, room.height - size.h);
  const item: Furniture = {
    id: nextId("furn"),
    roomId: room.id,
    type: t,
    label: input.label ?? FURN_LABEL_PT[t],
    x: fx,
    y: fy,
    width: size.w,
    height: size.h,
  };
  plan.furniture.push(item);
  return { ok: true, message: `${item.label} adicionado em '${room.name}'.` };
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
  return { ok: true, message: `Piso de '${room.name}' agora é ${input.material}.` };
}

function doMoveFurniture(plan: FloorPlan, input: ToolInputs["move_furniture"]): ApplyResult {
  const f = plan.furniture.find((f) => f.id === input.furniture_id);
  if (!f) return { ok: false, message: "Móvel não encontrado." };
  f.x = input.new_x;
  f.y = input.new_y;
  return { ok: true, message: `${f.label} movido.` };
}

// ---------- Apartment layout generator ----------
//
// Topology (Brazilian residential pattern):
//
//   +--leftW (Sala/Hall/Bedrooms)--+--colW (Cozinha+AS)--+
//   |   Sala             topH      |   Cozinha    cozH    |
//   +-----------------------------+                       |
//   |   Hall (only if useHall)    |                       |
//   |                   hallH      |                       |
//   +-----------------------------+----------------------+
//   |   Quarto / Suite / Banh.    |   AS         aserH    |
//   |                bottomH       |                       |
//   +------------------------------+-----------------------+
//
// - Sala/Hall/Bedrooms occupy the LEFT column (multiple rows).
// - Cozinha + Área de Serviço form a vertical SERVICE column on the right.
// - The Hall (when present) is a real labeled room — never an implicit corridor.
//   It is bounded EAST by the kitchen wall, so it is NOT wall-to-wall.
// - Bedroom doors face NORTH into the Hall (or directly into Sala for small apts).
// - Kitchen is "americana" (open) via a wide opening on Sala's east wall.

function pushRoom(
  plan: FloorPlan,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  floor: FloorMaterial
): Room {
  const r: Room = {
    id: nextId("room"),
    name,
    x,
    y,
    width: w,
    height: h,
    floor,
    appear: 0,
  };
  plan.rooms.push(r);
  return r;
}

// Push a doorway shared by two adjacent rooms. Both rooms get a Door so each
// room's wall is properly cut, but only the room the door swings INTO renders
// the arc/leaf (so the swing isn't drawn twice).
function pushSharedDoor(
  plan: FloorPlan,
  roomA: Room,
  wallA: Wall,
  roomB: Room,
  wallB: Wall,
  worldPos: number,
  size: number,
  swingsInto: "A" | "B"
): void {
  const compute = (room: Room, wall: Wall) => {
    const isHor = wall === "north" || wall === "south";
    const length = isHor ? room.width : room.height;
    const start = isHor ? room.x : room.y;
    return clamp01((worldPos - start) / length);
  };
  plan.doors.push({
    id: nextId("door"),
    roomId: roomA.id,
    wall: wallA,
    position: compute(roomA, wallA),
    size,
    silent: swingsInto !== "A",
  });
  plan.doors.push({
    id: nextId("door"),
    roomId: roomB.id,
    wall: wallB,
    position: compute(roomB, wallB),
    size,
    silent: swingsInto !== "B",
  });
}

function doCreateApartment(plan: FloorPlan, input: ToolInputs["create_apartment_layout"]): ApplyResult {
  const total_area = input.total_area;
  if (!total_area || total_area < 20) {
    return { ok: false, message: "Área total muito pequena (mín. 20m²)." };
  }
  plan.rooms.length = 0;
  plan.doors.length = 0;
  plan.windows.length = 0;
  plan.furniture.length = 0;

  const bedr = Math.max(1, Math.min(input.num_bedrooms ?? 1, 4));
  const bath = Math.max(1, Math.min(input.num_bathrooms ?? 1, 3));

  // Hall is added when:
  //  - There are 3+ bedrooms (always needs a hall), OR
  //  - 2 bedrooms with enough total area (≥80m²).
  // Smaller apartments (≤70m² 2BR, all 1BR) skip the hall — bedroom doors open
  // directly into the social area, matching Brazilian compact-apt layouts.
  const useHall = bedr >= 3 || (bedr >= 2 && total_area >= 80);

  // Target room areas (m²) — heuristics tuned to Brazilian residential standards.
  const sA = Math.max(14, total_area * 0.25); // sala+jantar
  const cA = Math.max(6, total_area * 0.10); // cozinha
  const asA = Math.max(2.5, total_area * 0.04); // área de serviço
  const mA = Math.max(11, total_area * 0.16); // master bedroom
  const oA = bedr > 1 ? Math.max(8, total_area * 0.09) : 0; // other bedrooms
  const sBA = bath >= 2 ? Math.max(3.2, total_area * 0.045) : 0; // suite bath
  const socBA = bath >= 1 ? Math.max(3, total_area * 0.04) : 0; // social bath

  // Row heights
  const bottomH = clamp(Math.sqrt(Math.max(mA, oA) * 0.85), 3.0, 4.2);
  const topH = clamp(Math.sqrt(sA * 0.55), 3.4, 4.5);
  const hallH = useHall ? 1.4 : 0;
  const totalH = topH + hallH + bottomH;

  // Bedroom block cells. Min widths reflect realistic minimums (Neufert).
  type Cell = { name: string; area: number; minW: number; floor: FloorMaterial };
  const cells: Cell[] = [];
  cells.push({
    name: bedr === 1 ? "Quarto" : "Suíte",
    area: mA,
    minW: 2.7,
    floor: "madeira",
  });
  if (sBA > 0) {
    cells.push({ name: "Banheiro Suíte", area: sBA, minW: 1.4, floor: "porcelanato" });
  }
  for (let i = 0; i < bedr - 1; i++) {
    cells.push({
      name: bedr === 2 ? "Quarto 2" : `Quarto ${i + 2}`,
      area: oA,
      minW: 2.5,
      floor: "madeira",
    });
  }
  // Add social bath if there's a bathroom not already covered by the suite.
  if (socBA > 0 && bath > (sBA > 0 ? 1 : 0)) {
    cells.push({ name: "Banheiro Social", area: socBA, minW: 1.4, floor: "porcelanato" });
  }

  const bWidths = cells.map((c) => Math.max(c.minW, c.area / bottomH));
  const leftW = bWidths.reduce((a, b) => a + b, 0);

  // Right column (Cozinha + Área de Serviço)
  const colW = clamp(Math.sqrt((cA + asA) * 0.85), 2.4, 3.6);
  // AS sits at the bottom of the right column at the same y as the bedroom row.
  // Cozinha fills the rest above it.
  let aserH = clamp(asA / colW, 1.2, Math.min(2.4, bottomH));
  let cozH = totalH - aserH;
  if (cozH < 3.0) {
    cozH = 3.0;
    aserH = totalH - cozH;
  }

  // Place top-left: Sala
  const sala = pushRoom(plan, "Sala", 0, 0, leftW, topH, "madeira");

  // Hall (when needed)
  let hall: Room | undefined;
  if (useHall) {
    hall = pushRoom(plan, "Hall", 0, topH, leftW, hallH, "porcelanato");
  }

  // Right column: Cozinha then Área de Serviço
  const cozinha = pushRoom(plan, "Cozinha", leftW, 0, colW, cozH, "porcelanato");
  const aserv = pushRoom(plan, "Área de Serviço", leftW, cozH, colW, aserH, "porcelanato");

  // Bottom row: bedrooms + bathrooms
  let cx = 0;
  const cy = topH + hallH;
  const bottomRoomRefs: Room[] = [];
  for (let i = 0; i < cells.length; i++) {
    const r = pushRoom(plan, cells[i].name, cx, cy, bWidths[i], bottomH, cells[i].floor);
    bottomRoomRefs.push(r);
    cx += bWidths[i];
  }

  // ---------- Doors and windows ----------

  // Sala: entrance door on north (apartment door); large social window on north;
  // optional secondary window on west (external wall).
  plan.doors.push({
    id: nextId("door"),
    roomId: sala.id,
    wall: "north",
    position: 0.18,
    size: 0.95,
  });
  plan.windows.push({
    id: nextId("win"),
    roomId: sala.id,
    wall: "north",
    position: 0.7,
    size: Math.min(2.2, sala.width * 0.4),
  });
  if (sala.height >= 3.5) {
    plan.windows.push({
      id: nextId("win"),
      roomId: sala.id,
      wall: "west",
      position: 0.5,
      size: Math.min(1.6, sala.height * 0.4),
    });
  }

  // Sala ↔ Cozinha (open kitchen): wide opening; "swings" into Sala.
  {
    const overlapStart = Math.max(sala.y, cozinha.y);
    const overlapEnd = Math.min(sala.y + sala.height, cozinha.y + cozinha.height);
    const midY = (overlapStart + overlapEnd) / 2;
    pushSharedDoor(plan, sala, "east", cozinha, "west", midY, 1.6, "A");
  }

  // Cozinha ↔ Área de Serviço (small service door)
  {
    const midX = aserv.x + aserv.width / 2;
    pushSharedDoor(plan, cozinha, "south", aserv, "north", midX, 0.8, "B");
  }
  // Service window on AS east wall (external)
  plan.windows.push({
    id: nextId("win"),
    roomId: aserv.id,
    wall: "east",
    position: 0.5,
    size: Math.min(0.8, aserv.height * 0.5),
  });

  // Sala ↔ Hall (only when hall exists). Door near the right edge of Sala so
  // entering the apartment leads naturally toward the intimate zone.
  if (hall) {
    const midX = sala.x + sala.width * 0.75;
    pushSharedDoor(plan, sala, "south", hall, "north", midX, 0.9, "B");
  }

  // Bedroom + bathroom doors face NORTH into Hall (or Sala if no hall).
  for (const r of bottomRoomRefs) {
    const isBath = /banheiro/i.test(r.name);
    const doorSize = isBath ? 0.7 : 0.85;
    const worldX = r.x + r.width / 2;

    if (hall) {
      pushSharedDoor(plan, hall, "south", r, "north", worldX, doorSize, "B");
    } else {
      // No hall: door connects to whichever top-row room is directly above.
      // For small apts the bedroom block fits within Sala, so doors land on Sala.
      let upRoom: Room | undefined;
      if (worldX <= sala.x + sala.width) upRoom = sala;
      else upRoom = cozinha; // fallback (rare)
      const upWall: Wall = "south";
      pushSharedDoor(plan, upRoom, upWall, r, "north", worldX, doorSize, "B");
    }

    // Window on south wall (external facade)
    if (/quarto|suíte|suite/i.test(r.name)) {
      plan.windows.push({
        id: nextId("win"),
        roomId: r.id,
        wall: "south",
        position: 0.5,
        size: Math.min(1.5, r.width * 0.5),
      });
    } else if (isBath) {
      plan.windows.push({
        id: nextId("win"),
        roomId: r.id,
        wall: "south",
        position: 0.7,
        size: 0.5,
      });
    }
  }

  return {
    ok: true,
    message: `Apartamento gerado: ${plan.rooms.length} cômodos, área aproximada ${total_area}m².`,
  };
}

// ---------- Auto-furnish ----------

function doFurnishRoom(plan: FloorPlan, input: ToolInputs["furnish_room"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const n = room.name.toLowerCase();
  const items: { type: FurnitureType; rx: number; ry: number; label?: string }[] = [];

  if (/sala/.test(n)) {
    items.push({ type: "sofa", rx: 0.5, ry: 0.15 });
    items.push({ type: "tv", rx: 0.5, ry: 0.85 });
    items.push({ type: "table", rx: 0.5, ry: 0.5, label: "Mesa de Centro" });
  } else if (/cozinha/.test(n)) {
    items.push({ type: "counter", rx: 0.0, ry: 0.0 });
    items.push({ type: "stove", rx: 0.6, ry: 0.0 });
    items.push({ type: "fridge", rx: 1.0, ry: 0.0 });
    items.push({ type: "sink", rx: 0.3, ry: 0.0 });
    if (room.width >= 4 && room.height >= 4) {
      items.push({ type: "island", rx: 0.5, ry: 0.6 });
    }
  } else if (/suíte|suite|quarto/.test(n)) {
    items.push({ type: "bed", rx: 0.5, ry: 0.0 });
    items.push({ type: "wardrobe", rx: 0.5, ry: 1.0 });
    if (room.width >= 3.5) {
      items.push({ type: "desk", rx: 0.05, ry: 0.6 });
    }
  } else if (/banheiro/.test(n)) {
    items.push({ type: "toilet", rx: 0.0, ry: 0.0 });
    items.push({ type: "sink", rx: 0.5, ry: 0.0 });
    items.push({ type: "shower", rx: 1.0, ry: 1.0 });
  } else if (/serviço|servico|lavanderia/.test(n)) {
    items.push({ type: "washing_machine", rx: 0.5, ry: 0.0 });
    items.push({ type: "sink", rx: 0.0, ry: 0.0, label: "Tanque" });
  } else if (/hall/.test(n)) {
    return { ok: false, message: `Hall não precisa de móveis.` };
  } else {
    return { ok: false, message: `Não sei mobiliar '${room.name}' automaticamente.` };
  }

  for (const it of items) {
    doAddFurniture(plan, {
      room_name: room.name,
      furniture_type: it.type,
      label: it.label,
      relative_x: it.rx,
      relative_y: it.ry,
    });
  }

  return { ok: true, message: `'${room.name}' mobiliado com ${items.length} itens.` };
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
      `- ${r.name}: ${r.width.toFixed(2)}x${r.height.toFixed(2)}m (${area}m²), piso ${r.floor}, portas: ${doors}, janelas: ${wins}${furn ? `, móveis: ${furn}` : ""}`
    );
  }
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
  parts.push(`Área total construída: ${totalArea.toFixed(1)}m².`);
  return parts.join("\n");
}

export type { Wall };
