import type {
  FloorPlan,
  Room,
  Door,
  Window as PlanWindow,
  Furniture,
  FloorMaterial,
  FurnitureType,
  Wall,
} from "../types";
import { nextId } from "../floor-plan-engine";
import { defaultFurnitureSize, defaultFurnitureLabel } from "../furniture-svgs";
import type { ParsedStructure, ParsedFurniture } from "./types";

const DEFAULT_FLOOR: Record<string, FloorMaterial> = {
  sala: "madeira",
  living: "madeira",
  quarto: "madeira",
  suíte: "madeira",
  suite: "madeira",
  closet: "madeira",
  escritório: "madeira",
  escritorio: "madeira",
  jantar: "madeira",
  cozinha: "porcelanato",
  banheiro: "ceramica",
  lavabo: "ceramica",
  lavanderia: "porcelanato",
  "área de serviço": "porcelanato",
  "area de servico": "porcelanato",
  varanda: "porcelanato",
  hall: "porcelanato",
  corredor: "porcelanato",
  jardim: "grama",
  terraço: "deck",
  terraco: "deck",
};

function inferFloor(name: string): FloorMaterial {
  const norm = name.toLowerCase().trim();
  for (const [key, mat] of Object.entries(DEFAULT_FLOOR)) {
    if (norm.includes(key)) return mat;
  }
  return "porcelanato";
}

function clampWall(w: string): Wall {
  const norm = w.toLowerCase().trim();
  if (norm === "north" || norm === "norte") return "north";
  if (norm === "south" || norm === "sul") return "south";
  if (norm === "east" || norm === "leste") return "east";
  if (norm === "west" || norm === "oeste") return "west";
  return "south";
}

function clampPosition(p: unknown): number {
  const n = typeof p === "number" ? p : 0.5;
  return Math.max(0.05, Math.min(0.95, n));
}

export function reconstructFloorPlan(
  structure: ParsedStructure,
  furniture?: ParsedFurniture,
): FloorPlan {
  const plan: FloorPlan = {
    rooms: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    columns: [],
    annotations: [],
    northArrow: null,
  };

  const roomIdMap = new Map<string, string>();

  for (const pr of structure.rooms) {
    const id = nextId("room");
    const room: Room = {
      id,
      name: pr.name,
      x: pr.x ?? 0,
      y: pr.y ?? 0,
      width: Math.max(1.5, pr.width ?? 3),
      height: Math.max(1.5, pr.height ?? 3),
      floor: pr.material ?? inferFloor(pr.name),
      isBalcony: pr.isBalcony,
      isExterior: pr.isExterior,
    };
    plan.rooms.push(room);
    roomIdMap.set(pr.name.toLowerCase().trim(), id);
  }

  for (const pd of structure.doors) {
    const roomId = findRoomId(roomIdMap, pd.roomName);
    if (!roomId) continue;
    const door: Door = {
      id: nextId("door"),
      roomId,
      wall: clampWall(pd.wall),
      position: clampPosition(pd.position),
      size: Math.max(0.6, Math.min(1.5, pd.size ?? 0.9)),
    };
    plan.doors.push(door);
  }

  for (const pw of structure.windows) {
    const roomId = findRoomId(roomIdMap, pw.roomName);
    if (!roomId) continue;
    const win: PlanWindow = {
      id: nextId("win"),
      roomId,
      wall: clampWall(pw.wall),
      position: clampPosition(pw.position),
      size: Math.max(0.4, Math.min(3.0, pw.size ?? 1.2)),
    };
    plan.windows.push(win);
  }

  if (furniture) {
    for (const pf of furniture.items) {
      const roomId = findRoomId(roomIdMap, pf.roomName);
      if (!roomId) continue;

      const room = plan.rooms.find((r) => r.id === roomId);
      if (!room) continue;

      const size = safeSize(pf.type);
      const rx = Math.max(0, Math.min(1, pf.relativeX ?? 0.5));
      const ry = Math.max(0, Math.min(1, pf.relativeY ?? 0.5));

      const furn: Furniture = {
        id: nextId("furn"),
        roomId,
        type: pf.type,
        label: pf.label ?? defaultFurnitureLabel(pf.type),
        x: room.x + rx * (room.width - size.w),
        y: room.y + ry * (room.height - size.h),
        width: size.w,
        height: size.h,
        rotation: pf.rotation ?? 0,
      };
      plan.furniture.push(furn);
    }
  }

  return plan;
}

function findRoomId(
  map: Map<string, string>,
  name: string,
): string | undefined {
  const norm = name.toLowerCase().trim();
  if (map.has(norm)) return map.get(norm);
  for (const [key, id] of map.entries()) {
    if (key.includes(norm) || norm.includes(key)) return id;
  }
  return undefined;
}

function safeSize(type: FurnitureType): { w: number; h: number } {
  try {
    return defaultFurnitureSize(type);
  } catch {
    return { w: 0.6, h: 0.6 };
  }
}
