// Architectural validators (NBR 15575 / NBR 9050 / Neufert).
// Runs over a SceneState and returns DiagnosticIssue[] for the agent and UI.
//
// Each validator is intentionally small and focused. The agent receives the
// list as a `tool_result` and is instructed to either auto-correct or surface
// the warning to the user.
//
// Severidades: "error" só para impossibilidade geométrica (cômodo sobreposto,
// cômodo sem porta, abertura mais alta que a parede); o resto é "warning"
// (dispara a rodada de autocorreção do agente) ou "info" (só consultivo).

import {
  type AnyNode,
  type DiagnosticIssue,
  type DoorNode,
  type FurnitureNode,
  type RoomNode,
  type WindowNode,
  type WallNode,
  type Vec2,
  pointInPolygon,
  v2Dist,
  v2Norm,
  v2Perp,
  v2Sub,
  wallLocalToWorld,
} from "./types";
import { sceneSwingGeometry, quarterDiscIntersectsRect } from "./door-swing";
import { estimatedHeightM } from "./furniture-heights";
import { TOL_WALL_TOUCH_M } from "./tolerances";
import { rectIntersectsWalls } from "./collision";

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

  validateRoomOverlap(rooms, issues);
  validateRoomMinAreas(rooms, issues);
  validateRoomMinWidths(rooms, issues);
  validateDoorWidths(doors, rooms, walls, issues);
  validateOpeningHeights(doors, windows, walls, issues);
  validateWindowRatio(rooms, windows, walls, issues);
  validateCirculation(rooms, walls, doors, issues);
  validateDoorSwingBlocked(doors, walls, furniture, rooms, issues);
  validateFurnitureWithinRoom(furniture, rooms, issues);
  validateFurnitureOnWall(furniture, walls, rooms, issues);
  validateFurnitureOverlap(furniture, issues);
  validateFurnitureRoomCompat(furniture, rooms, issues);
  validateWindowObstruction(windows, walls, rooms, furniture, issues);
  validateDanglingWalls(walls, issues);
  validateKitchenTriangle(rooms, furniture, issues);

  return issues;
}

// ---- Geometry helpers ----

interface RectXZ { x: number; z: number; w: number; d: number }

/** AABB visual de um FurnitureNode considerando rotação (radianos): para
 *  rotações ~90/270° o footprint é o transposto preservando o centro —
 *  igual ao que o Floorplan2D desenha. */
function furnitureAABB(f: FurnitureNode): RectXZ {
  // Mesmo limiar do worldAABB legado (~±1°): rotações vêm de múltiplos de
  // 90° convertidos para radianos, qualquer outra coisa é tratada como 0.
  const transposed = Math.abs(Math.abs(Math.sin(f.rotation)) - 1) < 0.0002;
  if (!transposed) {
    return { x: f.position.x, z: f.position.z, w: f.dimensions.x, d: f.dimensions.z };
  }
  const cx = f.position.x + f.dimensions.x / 2;
  const cz = f.position.z + f.dimensions.z / 2;
  return { x: cx - f.dimensions.z / 2, z: cz - f.dimensions.x / 2, w: f.dimensions.z, d: f.dimensions.x };
}

function rectsOverlapArea(a: RectXZ, b: RectXZ): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const d = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
  return w > 0 && d > 0 ? w * d : 0;
}

function polygonBoundsOf(poly: Vec2[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function isPointDevice(catalogId: string): boolean {
  return /light|outlet|switch/.test(catalogId);
}

function isRugLike(catalogId: string): boolean {
  return /^rug|carpet|mat/i.test(catalogId);
}

const isMillwork = (f: FurnitureNode): boolean =>
  /^module_|^bancada_continuous$|^hood_built_in$/.test(f.catalogId);

// ---- Individual validators ----

function validateRoomOverlap(rooms: RoomNode[], out: DiagnosticIssue[]) {
  // Cômodos legados são retângulos (polígono de 4 vértices) — a interseção de
  // bounds é exata. Polígonos não retangulares são pulados para não gerar
  // falso positivo com formas em L.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.polygon.length !== 4 || b.polygon.length !== 4) continue;
      const ba = polygonBoundsOf(a.polygon);
      const bb = polygonBoundsOf(b.polygon);
      const area = rectsOverlapArea(
        { x: ba.minX, z: ba.minZ, w: ba.maxX - ba.minX, d: ba.maxZ - ba.minZ },
        { x: bb.minX, z: bb.minZ, w: bb.maxX - bb.minX, d: bb.maxZ - bb.minZ },
      );
      if (area > 0.01) {
        out.push({
          code: "ROOM_OVERLAP",
          severity: "error",
          message: `'${a.name}' sobrepõe '${b.name}' em ${area.toFixed(2).replace(".", ",")} m² — cômodos não podem ocupar o mesmo espaço. Mova ou redimensione um deles.`,
          nodeIds: [a.id, b.id],
        });
      }
    }
  }
}

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

/** Largura mínima útil por categoria (NBR 9050 / Neufert). Medida no menor
 *  lado do bounding box do polígono. */
const MIN_WIDTH_BY_CATEGORY: Record<string, number> = {
  bedroom: 2.4,
  bedroom_master: 2.4,
  bedroom_kids: 2.2,
  kitchen: 1.5,
  bath: 1.1,
  bath_master: 1.2,
  lavatory: 0.9,
  hall: 0.9,
  circulation: 0.9,
};

function validateRoomMinWidths(rooms: RoomNode[], out: DiagnosticIssue[]) {
  for (const r of rooms) {
    const min = MIN_WIDTH_BY_CATEGORY[r.category];
    if (typeof min !== "number") continue;
    const b = polygonBoundsOf(r.polygon);
    const width = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
    if (width + 0.01 < min) {
      out.push({
        code: "MIN_ROOM_WIDTH",
        severity: "warning",
        message: `${r.name}: largura útil de ${width.toFixed(2).replace(".", ",")} m abaixo do mínimo de ${min.toFixed(2).replace(".", ",")} m recomendado para ${labelCategory(r.category)} (NBR 9050/Neufert).`,
        nodeIds: [r.id],
        reference: "NBR 9050",
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

/** Abertura mais alta que a parede que a contém (caso real: porta de 2,10 m
 *  num guarda-corpo de 1,10 m) — geometria impossível. */
function validateOpeningHeights(
  doors: DoorNode[],
  windows: WindowNode[],
  walls: WallNode[],
  out: DiagnosticIssue[]
) {
  const effHeight = (w: WallNode): number =>
    w.kind === "railing" ? (w.railingHeight ?? 1.1) : w.height;
  for (const d of doors) {
    const wall = walls.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const h = effHeight(wall);
    if (d.height > h + 0.01) {
      const tag = wall.kind === "railing" ? " (guarda-corpo)" : "";
      out.push({
        code: "OPENING_TALLER_THAN_WALL",
        severity: "error",
        message: `Porta de ${d.height.toFixed(2).replace(".", ",")} m em parede de ${h.toFixed(2).replace(".", ",")} m${tag} — abertura impossível. Use outra parede ou remova a porta.`,
        nodeIds: [d.id, wall.id],
      });
    }
  }
  for (const w of windows) {
    const wall = walls.find((wl) => wl.id === w.wallId);
    if (!wall) continue;
    const h = effHeight(wall);
    if (w.sillHeight + w.height > h + 0.01) {
      const tag = wall.kind === "railing" ? " (guarda-corpo)" : "";
      out.push({
        code: "OPENING_TALLER_THAN_WALL",
        severity: "error",
        message: `Janela (peitoril ${w.sillHeight.toFixed(2).replace(".", ",")} m + ${w.height.toFixed(2).replace(".", ",")} m) ultrapassa a parede de ${h.toFixed(2).replace(".", ",")} m${tag}.`,
        nodeIds: [w.id, wall.id],
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

/** Capacidade A — circulação / alcançabilidade. Constrói o grafo de
 *  adjacência cômodo↔cômodo via portas e via vãos abertos (open-plan) e
 *  verifica: cômodo sem nenhuma abertura (erro), planta sem porta de
 *  entrada (aviso) e cômodos inalcançáveis a partir da entrada (aviso). */
function validateCirculation(
  rooms: RoomNode[],
  walls: WallNode[],
  doors: DoorNode[],
  out: DiagnosticIssue[]
) {
  const interior = rooms.filter((r) => r.category !== "exterior");
  if (interior.length === 0) return;

  const adj = new Map<string, Set<string>>();
  const hasOpening = new Set<string>();
  const entryRooms = new Set<string>();
  const connect = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
    hasOpening.add(a);
    hasOpening.add(b);
  };

  // 1. Arestas via portas: sonda dos dois lados da parede.
  for (const d of doors) {
    const wall = walls.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const dir = v2Norm(v2Sub(wall.end, wall.start));
    const perp = v2Perp(dir);
    const c = wallLocalToWorld(wall, d.offset);
    const off = wall.thickness / 2 + 0.05;
    const pA = { x: c.x + perp.x * off, z: c.z + perp.z * off };
    const pB = { x: c.x - perp.x * off, z: c.z - perp.z * off };
    const rA = interior.find((r) => pointInPolygon(pA, r.polygon));
    const rB = interior.find((r) => pointInPolygon(pB, r.polygon));
    if (rA && rB && rA.id !== rB.id) {
      connect(rA.id, rB.id);
    } else if (rA || rB) {
      const r = (rA ?? rB)!;
      hasOpening.add(r.id);
      if (wall.isExterior) entryRooms.add(r.id);
    }
  }

  // 2. Arestas via vãos abertos (open-plan): fronteira retangular
  //    compartilhada SEM parede cobrindo, com vão livre ≥ 0,60 m.
  const rects = interior
    .filter((r) => r.polygon.length === 4)
    .map((r) => ({ r, b: polygonBoundsOf(r.polygon) }));
  const lineTol = TOL_WALL_TOUCH_M;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i];
      const B = rects[j];
      // Fronteira vertical (x constante) ou horizontal (z constante).
      const candidates: Array<{ axis: "v" | "h"; fixed: number; lo: number; hi: number }> = [];
      if (Math.abs(A.b.maxX - B.b.minX) <= lineTol || Math.abs(B.b.maxX - A.b.minX) <= lineTol) {
        const fixed = Math.abs(A.b.maxX - B.b.minX) <= lineTol ? (A.b.maxX + B.b.minX) / 2 : (B.b.maxX + A.b.minX) / 2;
        const lo = Math.max(A.b.minZ, B.b.minZ);
        const hi = Math.min(A.b.maxZ, B.b.maxZ);
        if (hi - lo >= 0.6) candidates.push({ axis: "v", fixed, lo, hi });
      }
      if (Math.abs(A.b.maxZ - B.b.minZ) <= lineTol || Math.abs(B.b.maxZ - A.b.minZ) <= lineTol) {
        const fixed = Math.abs(A.b.maxZ - B.b.minZ) <= lineTol ? (A.b.maxZ + B.b.minZ) / 2 : (B.b.maxZ + A.b.minZ) / 2;
        const lo = Math.max(A.b.minX, B.b.minX);
        const hi = Math.min(A.b.maxX, B.b.maxX);
        if (hi - lo >= 0.6) candidates.push({ axis: "h", fixed, lo, hi });
      }
      for (const cand of candidates) {
        // Soma o quanto da fronteira está coberto por paredes nessa linha.
        let covered = 0;
        for (const w of walls) {
          const isV = Math.abs(w.start.x - w.end.x) <= lineTol;
          const isH = Math.abs(w.start.z - w.end.z) <= lineTol;
          if (cand.axis === "v" && isV && Math.abs(w.start.x - cand.fixed) <= lineTol) {
            const lo = Math.min(w.start.z, w.end.z);
            const hi = Math.max(w.start.z, w.end.z);
            covered += Math.max(0, Math.min(hi, cand.hi) - Math.max(lo, cand.lo));
          } else if (cand.axis === "h" && isH && Math.abs(w.start.z - cand.fixed) <= lineTol) {
            const lo = Math.min(w.start.x, w.end.x);
            const hi = Math.max(w.start.x, w.end.x);
            covered += Math.max(0, Math.min(hi, cand.hi) - Math.max(lo, cand.lo));
          }
        }
        const open = cand.hi - cand.lo - covered;
        if (open >= 0.6) connect(A.r.id, B.r.id);
      }
    }
  }

  // 3a. Cômodo sem nenhuma abertura — inacessível.
  for (const r of interior) {
    if (!hasOpening.has(r.id)) {
      out.push({
        code: "ROOM_NO_DOOR",
        severity: "error",
        message: `'${r.name}' não tem nenhuma porta nem vão aberto — o cômodo é inacessível. Adicione uma porta (add_door) ou abra uma parede (delete_wall).`,
        nodeIds: [r.id],
      });
    }
  }

  // 3b. Entrada na planta.
  if (entryRooms.size === 0 && interior.length > 0) {
    out.push({
      code: "NO_ENTRY_DOOR",
      severity: "warning",
      message: `Nenhuma porta de entrada em parede externa foi encontrada — a unidade não tem acesso. Adicione uma porta de entrada (add_door numa parede externa, tipicamente na sala/hall).`,
      nodeIds: [],
    });
  }

  // 3c. Alcançabilidade por BFS a partir das entradas (ou do maior cômodo
  //     social quando não há entrada — aí o problema já foi apontado em 3b).
  const seeds = entryRooms.size > 0
    ? [...entryRooms]
    : [interior.slice().sort((a, b) => b.area - a.area)[0]?.id].filter(Boolean) as string[];
  const reached = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!reached.has(nxt)) {
        reached.add(nxt);
        queue.push(nxt);
      }
    }
  }
  for (const r of interior) {
    if (hasOpening.has(r.id) && !reached.has(r.id)) {
      out.push({
        code: "ROOM_UNREACHABLE",
        severity: "warning",
        message: `'${r.name}' tem abertura, mas não é alcançável a partir da entrada pela circulação existente. Confira se falta uma porta de ligação.`,
        nodeIds: [r.id],
      });
    }
  }
}

/** Capacidade B/D — arco de abertura da porta bloqueado por móvel. */
function validateDoorSwingBlocked(
  doors: DoorNode[],
  walls: WallNode[],
  furniture: FurnitureNode[],
  rooms: RoomNode[],
  out: DiagnosticIssue[]
) {
  for (const d of doors) {
    const wall = walls.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const g = sceneSwingGeometry(wall.start, wall.end, d.offset, d.width, d.hingeSide, d.swingDirection);
    for (const f of furniture) {
      if (isRugLike(f.catalogId) || isPointDevice(f.catalogId)) continue;
      const bb = furnitureAABB(f);
      // Encolhe 5 cm para perdoar contato de borda.
      const rect = {
        x: bb.x + 0.05,
        y: bb.z + 0.05,
        w: Math.max(0, bb.w - 0.1),
        h: Math.max(0, bb.d - 0.1),
      };
      if (rect.w <= 0 || rect.h <= 0) continue;
      if (quarterDiscIntersectsRect(g, rect)) {
        const room = rooms.find((r) => r.id === f.roomId);
        const where = room ? ` em '${room.name}'` : "";
        out.push({
          code: "DOOR_SWING_BLOCKED",
          severity: "warning",
          message: `Arco de abertura da porta${where} bloqueado por ${f.label}. Mova o móvel (move_furniture) ou inverta o lado da dobradiça.`,
          nodeIds: [d.id, f.id],
        });
        break; // um aviso por porta basta
      }
    }
  }
}

function validateFurnitureWithinRoom(furniture: FurnitureNode[], rooms: RoomNode[], out: DiagnosticIssue[]) {
  for (const f of furniture) {
    if (!f.roomId) continue;
    const room = rooms.find((r) => r.id === f.roomId);
    if (!room) continue;
    const bb = furnitureAABB(f);
    // Testa os 4 cantos do AABB visual (antes só o centro — meio móvel podia
    // vazar do cômodo sem aviso). Folga de 2 cm por canto.
    const corners: Vec2[] = [
      { x: bb.x + 0.02, z: bb.z + 0.02 },
      { x: bb.x + bb.w - 0.02, z: bb.z + 0.02 },
      { x: bb.x + bb.w - 0.02, z: bb.z + bb.d - 0.02 },
      { x: bb.x + 0.02, z: bb.z + bb.d - 0.02 },
    ];
    const outside = corners.filter((c) => !pointInPolygon(c, room.polygon));
    if (outside.length > 0) {
      // Protrusão aproximada via bounds do polígono.
      const rb = polygonBoundsOf(room.polygon);
      const dx = Math.max(0, rb.minX - bb.x, bb.x + bb.w - rb.maxX);
      const dz = Math.max(0, rb.minZ - bb.z, bb.z + bb.d - rb.maxZ);
      const dist = Math.max(dx, dz);
      out.push({
        code: "FURNITURE_OUT_OF_ROOM",
        severity: "warning",
        message: `${f.label} ultrapassa os limites de ${room.name}${dist > 0 ? ` em ${dist.toFixed(2).replace(".", ",")} m` : ""}.`,
        nodeIds: [f.id, room.id],
      });
    }
  }
}

/** Móvel invadindo a FAIXA da parede (entre as duas faces). Pega tanto
 *  planos antigos (móveis flush no retângulo cheio, antes do fix de área
 *  útil) quanto qualquer coordenada explícita ruim do agente/usuário.
 *  Tapetes passam por vãos de porta (os quads de parede não subtraem
 *  aberturas) e dispositivos pontuais ficam NA parede — ambos pulados. */
function validateFurnitureOnWall(
  furniture: FurnitureNode[],
  walls: WallNode[],
  rooms: RoomNode[],
  out: DiagnosticIssue[]
) {
  if (walls.length === 0) return;
  for (const f of furniture) {
    if (isPointDevice(f.catalogId) || isRugLike(f.catalogId)) continue;
    const bb = furnitureAABB(f);
    const rect = {
      cx: bb.x + bb.w / 2,
      cz: bb.z + bb.d / 2,
      width: bb.w,
      depth: bb.d,
      rotation: 0, // AABB já transposto — rotação embutida
    };
    if (rectIntersectsWalls(rect, walls)) {
      const room = rooms.find((r) => r.id === f.roomId);
      const where = room ? ` em '${room.name}'` : "";
      out.push({
        code: "FURNITURE_ON_WALL",
        severity: "warning",
        message: `${f.label}${where} invade a faixa da parede — alinhe o móvel à face interna (move_furniture).`,
        nodeIds: [f.id, ...(f.roomId ? [f.roomId] : [])],
      });
    }
  }
}

function validateFurnitureOverlap(furniture: FurnitureNode[], out: DiagnosticIssue[]) {
  // Pairwise AABB overlap no plano XZ, ciente de rotação (90/270 transpõe).
  // Marcenaria embutida (Iteração 7) viola overlap por design: bancada cobre
  // os módulos lower, uppers ficam acima dos lowers, exaustor sobre cooktop.
  // Pares do MESMO run são pulados; runs DIFERENTES sobrepostos além de um
  // canto de L (> 0,15 m²) são reportados.
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i];
      const b = furniture[j];
      // Skip lights, outlets, switches — those are point devices.
      if (isPointDevice(a.catalogId) || isPointDevice(b.catalogId)) continue;
      // Tapetes legitimamente ficam SOB sofás/mesas — não é overlap.
      if (isRugLike(a.catalogId) || isRugLike(b.catalogId)) continue;
      // Skip pairs from the same millwork run — overlaps são esperados.
      if (a.runId && b.runId && a.runId === b.runId) continue;
      const aabbA = furnitureAABB(a);
      const aabbB = furnitureAABB(b);
      if (isMillwork(a) && isMillwork(b)) {
        const area = rectsOverlapArea(aabbA, aabbB);
        if (area > 0.15) {
          out.push({
            code: "MILLWORK_RUNS_OVERLAP",
            severity: "warning",
            message: `Módulos de marcenaria de runs diferentes sobrepostos em ${area.toFixed(2).replace(".", ",")} m² (${a.label} × ${b.label}). Ajuste start_offset ou os módulos de um dos runs.`,
            nodeIds: [a.id, b.id],
          });
        }
        continue;
      }
      const overlap =
        aabbA.x < aabbB.x + aabbB.w - 0.05 &&
        aabbA.x + aabbA.w > aabbB.x + 0.05 &&
        aabbA.z < aabbB.z + aabbB.d - 0.05 &&
        aabbA.z + aabbA.d > aabbB.z + 0.05;
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

/** Capacidade C — compatibilidade móvel ↔ categoria do cômodo. Advisory:
 *  fogão no quarto é quase sempre engano do agente, mas pode ser intenção
 *  (kitnet, quarto com copa) — por isso warning, nunca bloqueio. */
const COMPAT_RULES: Array<{ re: RegExp; allowed: Set<string>; expectedLabel: string }> = [
  { re: /stove|cooktop|^oven|oven_tower/i, allowed: new Set(["kitchen", "service", "exterior", "other"]), expectedLabel: "cozinha/área gourmet" },
  { re: /fridge|geladeira/i, allowed: new Set(["kitchen", "service", "laundry", "dining", "other"]), expectedLabel: "cozinha/copa" },
  { re: /^toilet|bidet|wall_hung_toilet/i, allowed: new Set(["bath", "bath_master", "lavatory"]), expectedLabel: "banheiro/lavabo" },
  { re: /^shower|bathtub|banheira/i, allowed: new Set(["bath", "bath_master"]), expectedLabel: "banheiro" },
  { re: /^bed(_|$)|^crib/i, allowed: new Set(["bedroom", "bedroom_master", "bedroom_kids", "other"]), expectedLabel: "dormitório" },
  { re: /washing_machine|dryer|tanque/i, allowed: new Set(["laundry", "service", "bath", "exterior", "kitchen", "other"]), expectedLabel: "lavanderia/área de serviço" },
];

function validateFurnitureRoomCompat(furniture: FurnitureNode[], rooms: RoomNode[], out: DiagnosticIssue[]) {
  for (const f of furniture) {
    if (!f.roomId || f.runId) continue; // módulos de marcenaria: o run controla
    const room = rooms.find((r) => r.id === f.roomId);
    if (!room || room.category === "other") continue;
    for (const rule of COMPAT_RULES) {
      if (!rule.re.test(f.catalogId)) continue;
      if (!rule.allowed.has(room.category)) {
        out.push({
          code: "FURNITURE_ROOM_MISMATCH",
          severity: "warning",
          message: `${f.label} em '${room.name}' (${labelCategory(room.category)}): este item é típico de ${rule.expectedLabel}. Confirme se é intencional.`,
          nodeIds: [f.id, room.id],
        });
      }
      break; // primeira regra que casa decide
    }
  }
}

/** Capacidade E — móvel mais alto que o peitoril bloqueando janela. Faixa
 *  de 30 cm na frente da janela, do lado de dentro do cômodo. */
function validateWindowObstruction(
  windows: WindowNode[],
  walls: WallNode[],
  rooms: RoomNode[],
  furniture: FurnitureNode[],
  out: DiagnosticIssue[]
) {
  for (const win of windows) {
    const wall = walls.find((w) => w.id === win.wallId);
    if (!wall) continue;
    const dir = v2Norm(v2Sub(wall.end, wall.start));
    const perp = v2Perp(dir);
    const c = wallLocalToWorld(wall, win.offset);
    const probeOff = wall.thickness / 2 + 0.05;
    const inside = rooms.find((r) => pointInPolygon({ x: c.x + perp.x * probeOff, z: c.z + perp.z * probeOff }, r.polygon));
    const sign = inside ? 1 : -1;
    const room = inside ?? rooms.find((r) => pointInPolygon({ x: c.x - perp.x * probeOff, z: c.z - perp.z * probeOff }, r.polygon));
    if (!room) continue;
    // Faixa: largura da janela × 0,30 m a partir da face interna da parede.
    const t0 = wall.thickness / 2;
    const corner1 = {
      x: c.x - dir.x * (win.width / 2) + perp.x * (sign * t0),
      z: c.z - dir.z * (win.width / 2) + perp.z * (sign * t0),
    };
    const corner2 = {
      x: c.x + dir.x * (win.width / 2) + perp.x * (sign * (t0 + 0.3)),
      z: c.z + dir.z * (win.width / 2) + perp.z * (sign * (t0 + 0.3)),
    };
    const strip: RectXZ = {
      x: Math.min(corner1.x, corner2.x),
      z: Math.min(corner1.z, corner2.z),
      w: Math.abs(corner1.x - corner2.x),
      d: Math.abs(corner1.z - corner2.z),
    };
    for (const f of furniture) {
      if (f.roomId && f.roomId !== room.id) continue;
      if (isRugLike(f.catalogId) || isPointDevice(f.catalogId)) continue;
      const h = estimatedHeightM(f.catalogId);
      if (h <= win.sillHeight + 0.05) continue;
      const bb = furnitureAABB(f);
      if (rectsOverlapArea(strip, bb) > 0.01) {
        out.push({
          code: "WINDOW_BLOCKED",
          severity: "warning",
          message: `${f.label} (altura ~${h.toFixed(1).replace(".", ",")} m) bloqueia a janela de '${room.name}' (peitoril ${win.sillHeight.toFixed(2).replace(".", ",")} m). Mova o móvel ou troque por um mais baixo.`,
          nodeIds: [win.id, f.id],
        });
        break; // um aviso por janela basta
      }
    }
  }
}

function validateDanglingWalls(walls: WallNode[], out: DiagnosticIssue[]) {
  // A wall endpoint is "dangling" if no other wall shares it (within
  // TOL_WALL_TOUCH_M — paredes desenhadas à mão com gap de poucos cm são,
  // na intenção do usuário, conectadas).
  const endpoints = new Map<string, number>();
  const k = (p: { x: number; z: number }) =>
    `${Math.round(p.x / TOL_WALL_TOUCH_M)},${Math.round(p.z / TOL_WALL_TOUCH_M)}`;
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
      // Violações leves são "info" (a faixa Neufert é apertada em cozinhas
      // pequenas); casos flagrantes viram "warning" para disparar a rodada
      // de autocorreção do agente — "info" nunca chega lá.
      const egregious =
        [a, b, cd].some((len) => len < 0.9 || len > 3.5) || total > 8;
      out.push({
        code: "KITCHEN_TRIANGLE",
        severity: egregious ? "warning" : "info",
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
    case "circulation": return "circulação";
    case "service": return "área de serviço";
    case "balcony": return "varanda";
    default: return c;
  }
}
