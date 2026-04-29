// Architectural validators (NBR 15575 / NBR 9050 / Neufert).
// Runs over a SceneState and returns DiagnosticIssue[] for the agent and UI.
//
// Each validator is intentionally small and focused. The agent receives the
// list as a `tool_result` and is instructed to either auto-correct or surface
// the warning to the user.

import {
  type AnyNode,
  type DiagnosticIssue,
  type DoorNode,
  type FurnitureNode,
  type RoomNode,
  type WindowNode,
  type WallNode,
  pointInPolygon,
  polygonAbsArea,
  v2Dist,
} from "./types";

interface SceneInput {
  nodes: Record<string, AnyNode>;
}

export function validateScene(scene: SceneInput): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const rooms = Object.values(scene.nodes).filter((n): n is RoomNode => n.type === "room");
  const walls = Object.values(scene.nodes).filter((n): n is WallNode => n.type === "wall");
  const doors = Object.values(scene.nodes).filter((n): n is DoorNode => n.type === "door");
  const windows = Object.values(scene.nodes).filter((n): n is WindowNode => n.type === "window");
  const furniture = Object.values(scene.nodes).filter((n): n is FurnitureNode => n.type === "furniture");

  validateRoomMinAreas(rooms, issues);
  validateDoorWidths(doors, rooms, walls, issues);
  validateWindowRatio(rooms, windows, walls, issues);
  validateFurnitureWithinRoom(furniture, rooms, issues);
  validateFurnitureOverlap(furniture, issues);
  validateDanglingWalls(walls, issues);
  validateKitchenTriangle(rooms, furniture, issues);

  return issues;
}

// ---- Individual validators ----

const MIN_AREA_BY_CATEGORY: Record<string, number> = {
  living: 12,
  dining: 6,
  kitchen: 4,
  bedroom: 8,
  bedroom_master: 12,
  bedroom_kids: 8,
  bath: 2.5,
  bath_master: 3.0,
  lavatory: 1.8,
  laundry: 2.0,
  hall: 1.0,
};

function validateRoomMinAreas(rooms: RoomNode[], out: DiagnosticIssue[]) {
  for (const r of rooms) {
    const min = MIN_AREA_BY_CATEGORY[r.category];
    if (typeof min !== "number") continue;
    if (r.area + 0.05 < min) {
      out.push({
        code: "MIN_ROOM_AREA",
        severity: "warning",
        message: `${r.name}: ${r.area.toFixed(2).replace(".", ",")} m² é menor que o mínimo de ${min} m² para ${labelCategory(r.category)} (NBR 15575).`,
        nodeIds: [r.id],
        reference: "NBR 15575",
      });
    }
  }
}

function validateDoorWidths(
  doors: DoorNode[],
  rooms: RoomNode[],
  walls: WallNode[],
  out: DiagnosticIssue[]
) {
  for (const d of doors) {
    const wall = walls.find((w) => w.id === d.wallId);
    if (!wall) continue;
    // Find nearest room on either side of the wall to determine context.
    const nearestRoom = findNearestRoomCenter(rooms, wall);
    const cat = nearestRoom?.category ?? "other";
    const min = cat === "bath" || cat === "lavatory" || cat === "bath_master"
      ? 0.70
      : cat === "bedroom" || cat === "bedroom_kids" || cat === "bedroom_master"
      ? 0.80
      : 0.80;
    if (d.width + 1e-3 < min) {
      out.push({
        code: "MIN_DOOR_WIDTH",
        severity: "warning",
        message: `Porta com ${d.width.toFixed(2).replace(".", ",")} m abaixo do mínimo de ${min.toFixed(2).replace(".", ",")} m (NBR 9050).`,
        nodeIds: [d.id],
        reference: "NBR 9050",
      });
    }
  }
}

function validateWindowRatio(
  rooms: RoomNode[],
  windows: WindowNode[],
  walls: WallNode[],
  out: DiagnosticIssue[]
) {
  // Group windows by room (proxy: nearest room polygon containing the wall midpoint).
  const windowsByRoom = new Map<string, WindowNode[]>();
  for (const w of windows) {
    const wall = walls.find((wl) => wl.id === w.wallId);
    if (!wall) continue;
    const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
    const room = rooms.find((r) => pointInPolygon(mid, r.polygon))
      ?? findNearestRoomCenter(rooms, wall);
    if (!room) continue;
    if (!windowsByRoom.has(room.id)) windowsByRoom.set(room.id, []);
    windowsByRoom.get(room.id)!.push(w);
  }
  // For habitable rooms: vão ≥ A/6.
  const requireRatio = new Set(["living", "dining", "bedroom", "bedroom_master", "bedroom_kids", "office"]);
  for (const r of rooms) {
    if (!requireRatio.has(r.category)) continue;
    const ws = windowsByRoom.get(r.id) ?? [];
    const totalArea = ws.reduce((s, w) => s + w.width * w.height, 0);
    const required = r.area / 6;
    if (totalArea + 1e-3 < required) {
      out.push({
        code: "WINDOW_RATIO",
        severity: ws.length === 0 ? "error" : "warning",
        message: `${r.name}: área de janela ${totalArea.toFixed(2).replace(".", ",")} m² < ${required.toFixed(2).replace(".", ",")} m² (1/6 do piso). NBR 15575.`,
        nodeIds: [r.id, ...ws.map((w) => w.id)],
        reference: "NBR 15575",
      });
    }
  }
}

function validateFurnitureWithinRoom(furniture: FurnitureNode[], rooms: RoomNode[], out: DiagnosticIssue[]) {
  for (const f of furniture) {
    if (!f.roomId) continue;
    const room = rooms.find((r) => r.id === f.roomId);
    if (!room) continue;
    const center = { x: f.position.x + f.dimensions.x / 2, z: f.position.z + f.dimensions.z / 2 };
    if (!pointInPolygon(center, room.polygon)) {
      out.push({
        code: "FURNITURE_OUT_OF_ROOM",
        severity: "warning",
        message: `${f.label} está fora dos limites de ${room.name}.`,
        nodeIds: [f.id, room.id],
      });
    }
  }
}

function validateFurnitureOverlap(furniture: FurnitureNode[], out: DiagnosticIssue[]) {
  // Pairwise AABB overlap (axis-aligned bounding box on XZ plane, ignoring rotation for now).
  // Marcenaria embutida (Iteração 7) viola overlap por design: bancada cobre
  // os módulos lower, uppers ficam acima dos lowers, exaustor sobre cooktop.
  // Pares com mesmo runId ou ambos sendo módulos são pulados (não-bug).
  const isMillwork = (f: FurnitureNode): boolean =>
    /^module_|^bancada_continuous$|^hood_built_in$/.test(f.catalogId);
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i];
      const b = furniture[j];
      // Skip lights, outlets, switches — those are point devices.
      if (/light|outlet|switch/.test(a.catalogId) || /light|outlet|switch/.test(b.catalogId)) continue;
      // Skip pairs from the same millwork run — overlaps são esperados.
      if (a.runId && b.runId && a.runId === b.runId) continue;
      // Skip when BOTH are millwork modules (sink/cooktop em cima da
      // bancada de outro run também é OK na prática, ex: cozinha em L).
      if (isMillwork(a) && isMillwork(b)) continue;
      const overlap =
        a.position.x < b.position.x + b.dimensions.x - 0.05 &&
        a.position.x + a.dimensions.x > b.position.x + 0.05 &&
        a.position.z < b.position.z + b.dimensions.z - 0.05 &&
        a.position.z + a.dimensions.z > b.position.z + 0.05;
      if (overlap) {
        out.push({
          code: "FURNITURE_OVERLAP",
          severity: "warning",
          message: `${a.label} sobrepõe ${b.label} (>5 cm).`,
          nodeIds: [a.id, b.id],
        });
      }
    }
  }
}

function validateDanglingWalls(walls: WallNode[], out: DiagnosticIssue[]) {
  // A wall endpoint is "dangling" if no other wall shares it (within 2cm).
  const endpoints = new Map<string, number>();
  const k = (p: { x: number; z: number }) => `${Math.round(p.x * 50)},${Math.round(p.z * 50)}`;
  for (const w of walls) {
    endpoints.set(k(w.start), (endpoints.get(k(w.start)) ?? 0) + 1);
    endpoints.set(k(w.end), (endpoints.get(k(w.end)) ?? 0) + 1);
  }
  for (const w of walls) {
    if ((endpoints.get(k(w.start)) ?? 0) === 1 || (endpoints.get(k(w.end)) ?? 0) === 1) {
      out.push({
        code: "WALL_DANGLING_END",
        severity: "info",
        message: `Parede ${w.id} tem extremidade livre (não conectada).`,
        nodeIds: [w.id],
      });
    }
  }
}

function validateKitchenTriangle(rooms: RoomNode[], furniture: FurnitureNode[], out: DiagnosticIssue[]) {
  const kitchens = rooms.filter((r) => r.category === "kitchen");
  for (const k of kitchens) {
    const items = furniture.filter((f) => f.roomId === k.id);
    const fridge = items.find((f) => /fridge/.test(f.catalogId));
    const stove = items.find((f) => /stove|cooktop/.test(f.catalogId));
    const sink = items.find((f) => /sink/.test(f.catalogId));
    if (!fridge || !stove || !sink) continue;
    const c = (f: FurnitureNode) => ({ x: f.position.x + f.dimensions.x / 2, z: f.position.z + f.dimensions.z / 2 });
    const a = v2Dist(c(fridge), c(sink));
    const b = v2Dist(c(sink), c(stove));
    const cd = v2Dist(c(fridge), c(stove));
    const total = a + b + cd;
    const offending: string[] = [];
    for (const [name, len] of [["geladeira–pia", a], ["pia–fogão", b], ["geladeira–fogão", cd]] as const) {
      if (len < 1.20 || len > 2.70) offending.push(`${name} = ${len.toFixed(2)}m`);
    }
    if (total > 6.60) offending.push(`soma = ${total.toFixed(2)}m`);
    if (offending.length > 0) {
      out.push({
        code: "KITCHEN_TRIANGLE",
        severity: "info",
        message: `Triângulo de trabalho em ${k.name} fora da faixa Neufert (1,20–2,70m por perna, soma ≤ 6,60m): ${offending.join("; ")}.`,
        nodeIds: [k.id, fridge.id, sink.id, stove.id],
        reference: "Neufert",
      });
    }
  }
}

// ---- Helpers ----

function findNearestRoomCenter(rooms: RoomNode[], wall: WallNode): RoomNode | undefined {
  const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
  let best: { r: RoomNode; d: number } | null = null;
  for (const r of rooms) {
    const c = polygonCentroidQuick(r.polygon);
    const d = v2Dist(mid, c);
    if (!best || d < best.d) best = { r, d };
  }
  return best?.r;
}

function polygonCentroidQuick(poly: { x: number; z: number }[]): { x: number; z: number } {
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  return { x: cx / poly.length, z: cz / poly.length };
}

function labelCategory(c: string): string {
  switch (c) {
    case "living": return "sala de estar";
    case "dining": return "sala de jantar";
    case "kitchen": return "cozinha";
    case "bedroom": case "bedroom_kids": case "bedroom_master": return "dormitório";
    case "bath": case "bath_master": return "banheiro";
    case "lavatory": return "lavabo";
    case "laundry": return "lavanderia";
    case "hall": return "hall";
    default: return c;
  }
}
