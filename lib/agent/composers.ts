// High-level composers used by the agent: compose_apartment, furnish_room.
// They expand into several scene-tool calls. Implemented as deterministic
// helpers (not LLM calls) so the agent can rely on predictable output.

import type { FurnitureNode, RoomNode, SceneState, Vec2 } from "../scene/types";
import { polygonCentroid } from "../scene/types";
import { handleAddWall, handleAttachDoor, handleAttachWindow, type ToolResult } from "./tool-handlers";

interface RoomSpec {
  name: string;
  /** rough min area in m² */
  min_area?: number;
  category?: string;
}

interface ComposeInput {
  area_total: number;
  orientation?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  rooms: RoomSpec[];
}

/** Naive layout engine: lays rooms on a 2-row grid sized to total area. */
export function composeApartment(scene: SceneState, input: ComposeInput): ToolResult {
  if (!Array.isArray(input.rooms) || input.rooms.length === 0) {
    return { ok: false, message: "compose_apartment: rooms array vazio." };
  }
  // Estimate envelope: square root of total area, rounded to 0.5m.
  const envSide = Math.max(6, Math.ceil(Math.sqrt(input.area_total) * 1.05 * 2) / 2);
  const cols = Math.ceil(Math.sqrt(input.rooms.length));
  const rows = Math.ceil(input.rooms.length / cols);
  const cellW = envSide / cols;
  const cellD = envSide / rows;
  let working = scene;

  // Compute envelope corners and add 4 outer walls.
  const oW = (out: ToolResult) => {
    if (out.sceneAfter) working = out.sceneAfter;
    return out;
  };

  oW(handleAddWall(working, { start_x: 0, start_z: 0, end_x: envSide, end_z: 0, is_exterior: true }));
  oW(handleAddWall(working, { start_x: envSide, start_z: 0, end_x: envSide, end_z: envSide, is_exterior: true }));
  oW(handleAddWall(working, { start_x: envSide, start_z: envSide, end_x: 0, end_z: envSide, is_exterior: true }));
  oW(handleAddWall(working, { start_x: 0, start_z: envSide, end_x: 0, end_z: 0, is_exterior: true }));

  // Internal walls between cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= input.rooms.length) continue;
      // Right wall
      if (c < cols - 1) {
        oW(handleAddWall(working, {
          start_x: (c + 1) * cellW, start_z: r * cellD,
          end_x: (c + 1) * cellW, end_z: (r + 1) * cellD,
          is_exterior: false,
        }));
      }
      // Bottom wall
      if (r < rows - 1) {
        oW(handleAddWall(working, {
          start_x: c * cellW, start_z: (r + 1) * cellD,
          end_x: (c + 1) * cellW, end_z: (r + 1) * cellD,
          is_exterior: false,
        }));
      }
    }
  }

  // After re-derivation rooms are detected automatically. Find them and rename
  // by best-match: assign each room to the cell-area whose center is closest.
  const rooms = Object.values(working.nodes).filter((n): n is RoomNode => n.type === "room");
  // Map cell index → room name.
  const cellNames: (string | null)[] = [];
  for (let i = 0; i < cols * rows; i++) cellNames[i] = input.rooms[i]?.name ?? null;
  for (const r of rooms) {
    const c = polygonCentroid(r.polygon);
    const ci = Math.floor(c.x / cellW);
    const ri = Math.floor(c.z / cellD);
    const idx = ri * cols + ci;
    const name = cellNames[idx];
    if (name) {
      working = {
        ...working,
        nodes: { ...working.nodes, [r.id]: { ...r, name } },
      };
    }
  }

  // Add a window on each exterior wall (one per wall, centered).
  const exteriorWalls = Object.values(working.nodes).filter((n) => n.type === "wall" && (n as { isExterior: boolean }).isExterior);
  for (const w of exteriorWalls) {
    const wn = w as { id: string; start: Vec2; end: Vec2; windows: string[] };
    const len = Math.hypot(wn.end.x - wn.start.x, wn.end.z - wn.start.z);
    if (len < 2.5) continue; // too small for a window
    oW(handleAttachWindow(working, { wall_id: wn.id, offset: len / 2, width: Math.min(1.50, len - 1.0) }));
  }

  return {
    ok: true,
    message: `Apartamento ~${input.area_total} m² gerado: envelope ${envSide.toFixed(1)}×${envSide.toFixed(1)}m, ${input.rooms.length} cômodos em grid ${cols}×${rows}, ${exteriorWalls.length} janelas externas.`,
    sceneAfter: working,
  };
}

interface FurnishInput {
  room_id: string;
  style?: "minimal" | "padrão" | "completo";
}

const FURNITURE_PRESETS: Record<string, { catalog: string; w: number; d: number; label: string }[]> = {
  living: [
    { catalog: "sofa_3seat", w: 2.1, d: 0.9, label: "Sofá 3 lugares" },
    { catalog: "coffee_table", w: 1.2, d: 0.6, label: "Mesa de centro" },
    { catalog: "tv_console", w: 1.8, d: 0.45, label: "Rack de TV" },
    { catalog: "armchair", w: 0.8, d: 0.8, label: "Poltrona" },
  ],
  dining: [
    { catalog: "dining_table_6", w: 1.6, d: 0.9, label: "Mesa de jantar 6" },
    { catalog: "buffet", w: 1.6, d: 0.45, label: "Aparador" },
  ],
  kitchen: [
    { catalog: "fridge_double", w: 0.9, d: 0.7, label: "Geladeira" },
    { catalog: "stove_4burner", w: 0.6, d: 0.6, label: "Fogão" },
    { catalog: "kitchen_sink_double", w: 0.8, d: 0.5, label: "Pia" },
    { catalog: "kitchen_island", w: 1.8, d: 0.9, label: "Ilha" },
  ],
  bedroom: [
    { catalog: "bed_double", w: 1.58, d: 1.98, label: "Cama de casal" },
    { catalog: "nightstand", w: 0.5, d: 0.4, label: "Mesa de cabeceira" },
    { catalog: "wardrobe_sliding", w: 2.5, d: 0.6, label: "Guarda-roupa" },
  ],
  bedroom_master: [
    { catalog: "bed_king", w: 1.93, d: 2.03, label: "Cama king" },
    { catalog: "nightstand", w: 0.5, d: 0.4, label: "Cabeceira" },
    { catalog: "wardrobe_sliding", w: 2.5, d: 0.6, label: "Guarda-roupa" },
  ],
  bath: [
    { catalog: "toilet", w: 0.4, d: 0.7, label: "Vaso" },
    { catalog: "sink_vanity", w: 0.8, d: 0.5, label: "Bancada" },
    { catalog: "shower_square", w: 0.9, d: 0.9, label: "Box" },
  ],
  bath_master: [
    { catalog: "toilet", w: 0.4, d: 0.7, label: "Vaso" },
    { catalog: "sink_double_vanity", w: 1.2, d: 0.5, label: "Bancada dupla" },
    { catalog: "shower_rect", w: 1.2, d: 0.9, label: "Box" },
  ],
  laundry: [
    { catalog: "washing_machine", w: 0.6, d: 0.6, label: "Máquina de lavar" },
    { catalog: "laundry_sink", w: 0.5, d: 0.55, label: "Tanque" },
  ],
};

export function furnishRoom(scene: SceneState, input: FurnishInput): ToolResult {
  const room = scene.nodes[input.room_id];
  if (!room || room.type !== "room") return { ok: false, message: `Room ${input.room_id} não encontrada.` };
  const r = room as RoomNode;
  const cat = r.category;
  const items = FURNITURE_PRESETS[cat] ?? FURNITURE_PRESETS["living"];
  const minX = Math.min(...r.polygon.map((p) => p.x));
  const minZ = Math.min(...r.polygon.map((p) => p.z));
  const nodes = { ...scene.nodes };
  let cursorX = minX + 0.4;
  const cursorZ = minZ + 0.4;
  let count = 0;
  for (const it of items) {
    const fid = `furniture:auto-${Date.now().toString(36)}-${count++}`;
    const f: FurnitureNode = {
      id: fid,
      type: "furniture",
      parentId: null,
      roomId: r.id,
      catalogId: it.catalog,
      label: it.label,
      position: { x: cursorX, y: 0, z: cursorZ },
      rotation: 0,
      dimensions: { x: it.w, y: 0.5, z: it.d },
    };
    nodes[fid] = f;
    cursorX += it.w + 0.3;
  }
  return {
    ok: true,
    message: `Cômodo ${r.name} mobiliado com ${items.length} itens (${cat}).`,
    sceneAfter: { ...scene, nodes },
  };
}
