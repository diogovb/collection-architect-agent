import type {
  Door,
  FloorMaterial,
  FloorPlan,
  Furniture,
  FurnitureType,
  Room,
  SelectedElement,
  SelectionContext,
  ToolInputs,
  ToolName,
  Wall,
  Window as PlanWindow,
} from "./types";

// ---------- ID + helpers ----------

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  // include time so client/server collisions are unlikely on remount
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyPlan(): FloorPlan {
  return { rooms: [], doors: [], windows: [], furniture: [] };
}

function findRoom(plan: FloorPlan, name: string): Room | undefined {
  const norm = name.trim().toLowerCase();
  return plan.rooms.find((r) => r.name.trim().toLowerCase() === norm);
}

function bestSpot(plan: FloorPlan, w: number, h: number): { x: number; y: number } {
  // Place new room next to existing ones, scanning a coarse grid for non-overlap.
  if (plan.rooms.length === 0) return { x: 0, y: 0 };
  const margin = 0;
  const step = 0.5;
  // Try rightward, then downward
  const minX = Math.min(...plan.rooms.map((r) => r.x));
  const maxX = Math.max(...plan.rooms.map((r) => r.x + r.width));
  const minY = Math.min(...plan.rooms.map((r) => r.y));
  const maxY = Math.max(...plan.rooms.map((r) => r.y + r.height));

  const candidates: { x: number; y: number }[] = [
    { x: maxX + margin, y: minY },
    { x: minX, y: maxY + margin },
    { x: maxX + margin, y: maxY + margin },
  ];
  // Grid scan within bounding box if any of the above overlap
  for (let y = minY; y <= maxY + h; y += step) {
    for (let x = minX; x <= maxX + w; x += step) {
      candidates.push({ x, y });
    }
  }
  for (const c of candidates) {
    if (!overlapsAny(plan, c.x, c.y, w, h)) return c;
  }
  // fallback: extend right
  return { x: maxX + margin, y: minY };
}

function overlapsAny(plan: FloorPlan, x: number, y: number, w: number, h: number): boolean {
  for (const r of plan.rooms) {
    if (x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y) return true;
  }
  return false;
}

// ---------- Default furniture sizes (meters) ----------

const FURN_SIZE: Record<FurnitureType, { w: number; h: number }> = {
  sofa: { w: 2.0, h: 0.9 },
  bed: { w: 1.6, h: 2.0 },
  table: { w: 1.2, h: 0.8 },
  tv: { w: 1.6, h: 0.4 },
  sink: { w: 0.6, h: 0.45 },
  toilet: { w: 0.4, h: 0.6 },
  shower: { w: 0.9, h: 0.9 },
  stove: { w: 0.6, h: 0.6 },
  fridge: { w: 0.7, h: 0.7 },
  counter: { w: 1.5, h: 0.6 },
  island: { w: 1.5, h: 0.9 },
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
  washing_machine: "Máquina de Lavar",
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
  if (/(cozinha|área|servico|serviço|lavanderia)/.test(n)) return "porcelanato";
  if (/(corredor|hall|circula)/.test(n)) return "madeira";
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function doAddFurniture(plan: FloorPlan, input: ToolInputs["add_furniture"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  const t = input.furniture_type;
  const size = FURN_SIZE[t];
  if (!size) return { ok: false, message: `Tipo de móvel desconhecido: ${t}` };
  const rx = clamp01(input.relative_x ?? 0.5);
  const ry = clamp01(input.relative_y ?? 0.5);
  const fx = room.x + rx * (room.width - size.w);
  const fy = room.y + ry * (room.height - size.h);
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

function doCreateApartment(plan: FloorPlan, input: ToolInputs["create_apartment_layout"]): ApplyResult {
  const { total_area, num_bedrooms, num_bathrooms } = input;
  if (!total_area || total_area < 20) {
    return { ok: false, message: "Área total muito pequena." };
  }
  // Clear current plan first
  plan.rooms.length = 0;
  plan.doors.length = 0;
  plan.windows.length = 0;
  plan.furniture.length = 0;

  // Allocate areas (m²) heuristically.
  const bath = Math.min(num_bathrooms, 3);
  const bedr = Math.max(1, Math.min(num_bedrooms, 4));

  // Rough fractions of total area
  const livingDiningArea = Math.max(12, total_area * 0.28);
  const kitchenArea = Math.max(6, total_area * 0.12);
  const bathArea = bath > 0 ? Math.max(3, total_area * 0.05) : 0;
  const suiteBathArea = bedr >= 1 && bath >= 2 ? Math.max(4, total_area * 0.05) : 0;
  const laundryArea = Math.max(2.5, total_area * 0.04);
  const masterBedArea = Math.max(10, total_area * 0.14);
  const otherBedArea = bedr > 1 ? Math.max(8, total_area * 0.1) : 0;
  // hallway is implicit

  // Choose a target overall bounding box: aspect ~4:3
  const w = Math.max(7, Math.sqrt(total_area * 1.33));
  const h = total_area / w;

  // Layout strategy:
  // - Top row: Sala+Jantar (left, big), Cozinha (right), Lavanderia (far right small)
  // - Bottom row: Quarto principal (left), Banheiro suíte, Quarto 2..N, Banheiro social
  // We compute widths to fit the bounding box approximately.

  const topH = Math.max(4, Math.min(h * 0.5, Math.sqrt(livingDiningArea * 1.2)));
  const bottomH = Math.max(3.5, h - topH);

  // Top row widths
  const livingW = Math.max(4, livingDiningArea / topH);
  const kitchenW = Math.max(2.5, kitchenArea / topH);
  const laundryW = Math.max(1.6, laundryArea / topH);
  const topTotalW = livingW + kitchenW + laundryW;

  // Bottom row: master bed + suite bath + (other bedrooms) + social bath
  const masterW = Math.max(3, masterBedArea / bottomH);
  const suiteBathW = suiteBathArea > 0 ? Math.max(1.6, suiteBathArea / bottomH) : 0;
  const otherBedCount = Math.max(0, bedr - 1);
  const otherBedW = otherBedCount > 0 ? Math.max(2.8, otherBedArea / bottomH) : 0;
  const socialBathW = bath > (suiteBathArea > 0 ? 1 : 0) ? Math.max(1.6, bathArea / bottomH) : 0;
  const bottomTotalW = masterW + suiteBathW + otherBedW * otherBedCount + socialBathW;

  // Use the wider row as the canvas width and stretch the other to match.
  const canvasW = Math.max(topTotalW, bottomTotalW);

  // Stretch top
  const topScale = canvasW / topTotalW;
  const topRow: { name: string; w: number; floor: FloorMaterial }[] = [
    { name: "Sala", w: livingW * topScale, floor: "madeira" },
    { name: "Cozinha", w: kitchenW * topScale, floor: "porcelanato" },
    { name: "Área de Serviço", w: laundryW * topScale, floor: "porcelanato" },
  ];

  const bottomRow: { name: string; w: number; floor: FloorMaterial }[] = [];
  bottomRow.push({ name: "Suíte Master", w: masterW * (canvasW / bottomTotalW), floor: "madeira" });
  if (suiteBathW > 0)
    bottomRow.push({
      name: "Banheiro Suíte",
      w: suiteBathW * (canvasW / bottomTotalW),
      floor: "porcelanato",
    });
  for (let i = 0; i < otherBedCount; i++) {
    bottomRow.push({
      name: otherBedCount === 1 ? "Quarto" : `Quarto ${i + 2}`,
      w: otherBedW * (canvasW / bottomTotalW),
      floor: "madeira",
    });
  }
  if (socialBathW > 0)
    bottomRow.push({
      name: "Banheiro Social",
      w: socialBathW * (canvasW / bottomTotalW),
      floor: "porcelanato",
    });

  // Place rooms — top (social) row at y=0, then a corridor strip,
  // then the bottom (intimate) row. Bedrooms have to access the corridor,
  // not the social area directly — that's how a real apartment flows.
  const corridorH = 1.2;
  // Only insert corridor when there are private rooms that need it.
  const hasIntimateRow = bottomRow.length > 0;
  // Shrink the bottom row's height so total height stays ≈ h.
  const adjBottomH = hasIntimateRow ? Math.max(3, bottomH - corridorH * 0.5) : bottomH;
  const adjTopH = hasIntimateRow ? Math.max(3.5, topH - corridorH * 0.5) : topH;

  let cursorX = 0;
  for (const r of topRow) {
    const room: Room = {
      id: nextId("room"),
      name: r.name,
      x: cursorX,
      y: 0,
      width: r.w,
      height: adjTopH,
      floor: r.floor,
      appear: 0,
    };
    plan.rooms.push(room);
    cursorX += r.w;
  }

  let corridor: Room | undefined;
  if (hasIntimateRow) {
    // The corridor spans the full width of the intimate row, so every private
    // room can open onto it. It's narrow (1.2m — Neufert minimum).
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
    const room: Room = {
      id: nextId("room"),
      name: r.name,
      x: cursorX,
      y: bottomY,
      width: r.w,
      height: adjBottomH,
      floor: r.floor,
      appear: 0,
    };
    plan.rooms.push(room);
    cursorX += r.w;
  }

  // Doors: each room gets a door connecting to a sensible neighbor.
  // Sala has the entrance door (south wall). Cozinha is "americana" -> open to sala (we'll add a door between).
  // Each bedroom/bathroom has a door to the top row (its north wall).
  const sala = plan.rooms.find((r) => r.name === "Sala");
  const cozinha = plan.rooms.find((r) => r.name === "Cozinha");
  const areaServ = plan.rooms.find((r) => r.name === "Área de Serviço");

  if (sala) {
    // Entrance door — on the exterior west wall (south borders the corridor
    // when there are bedrooms, so we can't put it there).
    plan.doors.push({
      id: nextId("door"),
      roomId: sala.id,
      wall: hasIntimateRow ? "west" : "south",
      position: hasIntimateRow ? 0.6 : 0.15,
      size: 1.0,
    });
    // Big sala window — exterior north wall, facing the sun (hemisphere sul)
    plan.windows.push({
      id: nextId("win"),
      roomId: sala.id,
      wall: "north",
      position: 0.5,
      size: Math.min(2.4, sala.width * 0.5),
    });
  }
  if (cozinha && sala) {
    // door between sala and cozinha (cozinha west wall)
    plan.doors.push({
      id: nextId("door"),
      roomId: cozinha.id,
      wall: "west",
      position: 0.5,
      size: 1.2,
    });
  }
  if (areaServ && cozinha) {
    plan.doors.push({
      id: nextId("door"),
      roomId: areaServ.id,
      wall: "west",
      position: 0.5,
      size: 0.8,
    });
  }

  // Corridor — gets a door connecting it to the social area (sala/cozinha).
  // The door is on the north wall, near the sala, so the user walks from the
  // living area into the corridor and from there into the bedrooms.
  if (corridor) {
    plan.doors.push({
      id: nextId("door"),
      roomId: corridor.id,
      wall: "north",
      position: sala ? Math.min(0.9, (sala.x + sala.width * 0.85) / corridor.width) : 0.5,
      size: 1.0,
    });
  }

  // Bottom-row rooms: each opens onto the corridor (north wall door).
  for (const r of plan.rooms.filter((rr) => rr.y >= bottomY - 0.001 && !isCorridor(rr.name))) {
    plan.doors.push({
      id: nextId("door"),
      roomId: r.id,
      wall: "north",
      position: 0.5,
      size: r.name.toLowerCase().includes("banheiro") ? 0.7 : 0.9,
    });
    // Window on south wall for bedrooms (south = exterior wall)
    if (r.name.toLowerCase().includes("quarto") || r.name.toLowerCase().includes("suíte")) {
      plan.windows.push({
        id: nextId("win"),
        roomId: r.id,
        wall: "south",
        position: 0.5,
        size: Math.min(1.5, r.width * 0.4),
      });
    } else if (r.name.toLowerCase().includes("banheiro")) {
      plan.windows.push({
        id: nextId("win"),
        roomId: r.id,
        wall: "south",
        position: 0.7,
        size: 0.6,
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
      `- ${r.name}: ${r.width}x${r.height}m (${area}m²), piso ${r.floor}, portas: ${doors}, janelas: ${wins}${furn ? `, móveis: ${furn}` : ""}`
    );
  }
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
  parts.push(`Área total construída: ${totalArea.toFixed(1)}m².`);
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
      payload: {
        name: r.name,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        floor: r.floor,
      },
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

// re-export wall type so other files that need it are happy
export type { Wall };
