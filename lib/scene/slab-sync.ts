// Sync RoomNode + SlabNode collections to the current set of detected room
// polygons. Preserves identity across edits via polygon signature matching.
//
// Strategy:
// - Collect existing rooms keyed by polygon signature.
// - For each detected polygon, find a signature match → reuse id (and its
//   user-set name/category/material). Otherwise generate a new id.
// - Replace the room set; orphaned rooms (no longer detected) are removed.
// - Each room owns a slab whose polygon mirrors the room polygon. The slab
//   extrudes downward from elevation 0 (so the floor surface is at y=0 and
//   the slab does NOT poke above the floor — this fixes BUG A).

import { polygonAbsArea, polygonCentroid, type AnyNode, type BoundaryAnchor, type FloorMaterial, type NodeId, type RoomCategory, type RoomNode, type SlabNode, type Vec2, type WallNode } from "./types";
import { polygonSignature } from "./signature";
import { detectSpaces } from "./space-detection";

const SLAB_THICKNESS = 0.12;

/** Heuristic mapping from a room name to a category. */
export function categoryFromName(name: string): RoomCategory {
  const n = name.toLowerCase();
  if (/(sala\s+de\s+jantar|jantar)/.test(n)) return "dining";
  if (/(sala|estar|living)/.test(n)) return "living";
  if (/(cozinha|kitchen)/.test(n)) return "kitchen";
  if (/(suite|suíte|master|casal)/.test(n)) return "bedroom_master";
  if (/(quarto.*infantil|infantil|kids|criança)/.test(n)) return "bedroom_kids";
  if (/(quarto|dorm|bedroom|solteiro)/.test(n)) return "bedroom";
  if (/(lavabo)/.test(n)) return "lavatory";
  if (/(banheiro|wc|bath)/.test(n)) return "bath";
  if (/(lavanderia|laundry|área\s+de\s+serviço|servico)/.test(n)) return "laundry";
  if (/(escrit|office|home\s+office)/.test(n)) return "office";
  if (/(varanda|sacada|balcony)/.test(n)) return "balcony";
  if (/(closet)/.test(n)) return "closet";
  if (/(hall|circ|corredor)/.test(n)) return "hall";
  if (/(jardim|garden|exterior|quintal)/.test(n)) return "exterior";
  return "other";
}

/** Default floor material based on category. */
export function defaultFloorForCategory(category: RoomCategory): FloorMaterial {
  switch (category) {
    case "kitchen": case "bath": case "bath_master": case "lavatory":
    case "laundry": case "service":
      return "porcelanato";
    case "balcony": case "exterior":
      return "deck";
    default:
      return "madeira";
  }
}

/** Suggest a generic name for a newly-detected room. */
function defaultName(seq: number): string {
  return `Ambiente ${seq}`;
}

export interface SyncResult {
  roomsToAdd: RoomNode[];
  slabsToAdd: SlabNode[];
  roomsToUpdate: { id: NodeId; patch: Partial<RoomNode> }[];
  slabsToUpdate: { id: NodeId; patch: Partial<SlabNode> }[];
  roomsToRemove: NodeId[];
  slabsToRemove: NodeId[];
}

export interface SyncContext {
  walls: WallNode[];
  existingRooms: RoomNode[];
  existingSlabs: SlabNode[];
  /** Optional level id to attach generated rooms/slabs to. */
  levelId: NodeId;
  /** Optional id sequence start (used when creating multiple new rooms). */
  idSeq?: number;
}

let _idCounter = 0;
function genId(prefix: string, seq?: number): NodeId {
  if (typeof seq === "number") return `${prefix}:${seq}-${Date.now().toString(36)}`;
  _idCounter++;
  return `${prefix}:auto-${_idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

/** For each polygon vertex, find a wall endpoint within 1 mm and return an
 *  anchor record. Returns `undefined` if any vertex couldn't be matched
 *  (so the renderer falls back to the stored polygon rather than collapsing
 *  it). Mirrors the legacy-migration helper in `migrate.ts`. */
function buildBoundaryAnchors(polygon: Vec2[], walls: WallNode[]): BoundaryAnchor[] | undefined {
  const TOL = 0.001;
  const anchors: BoundaryAnchor[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    let found: { wallId: NodeId; endpoint: "start" | "end" } | null = null;
    for (const w of walls) {
      if (Math.abs(w.start.x - v.x) <= TOL && Math.abs(w.start.z - v.z) <= TOL) {
        found = { wallId: w.id, endpoint: "start" };
        break;
      }
      if (Math.abs(w.end.x - v.x) <= TOL && Math.abs(w.end.z - v.z) <= TOL) {
        found = { wallId: w.id, endpoint: "end" };
        break;
      }
    }
    if (!found) return undefined;
    anchors.push({ vertexIndex: i, ...found });
  }
  return anchors;
}

export function syncSlabsAndRooms(ctx: SyncContext): SyncResult {
  const detected = detectSpaces(ctx.walls);
  const sigToDetected = new Map<string, { polygon: Vec2[]; signature: string }>();
  for (const d of detected) {
    const sig = polygonSignature(d.polygon);
    if (!sigToDetected.has(sig)) sigToDetected.set(sig, { polygon: d.polygon, signature: sig });
  }

  // Map existing rooms by signature.
  const sigToExistingRoom = new Map<string, RoomNode>();
  for (const r of ctx.existingRooms) {
    if (r.signature) sigToExistingRoom.set(r.signature, r);
  }

  const roomsToAdd: RoomNode[] = [];
  const slabsToAdd: SlabNode[] = [];
  const roomsToUpdate: { id: NodeId; patch: Partial<RoomNode> }[] = [];
  const slabsToUpdate: { id: NodeId; patch: Partial<SlabNode> }[] = [];
  const matchedRoomIds = new Set<NodeId>();
  const matchedSlabIds = new Set<NodeId>();

  let seq = ctx.idSeq ?? ctx.existingRooms.length;

  sigToDetected.forEach(({ polygon, signature }) => {
    const area = polygonAbsArea(polygon);
    const existing = sigToExistingRoom.get(signature);
    const boundaryAnchors = buildBoundaryAnchors(polygon, ctx.walls);
    if (existing) {
      matchedRoomIds.add(existing.id);
      matchedSlabIds.add(existing.slabId);
      // Polygon may differ slightly (e.g. wall thickness change without affecting signature);
      // only update if vertices changed beyond rounding. Re-anchoring the
      // boundary keeps the live-derivation pass in Floorplan2D in sync with
      // any new wall endpoints that sweep-line produced.
      roomsToUpdate.push({
        id: existing.id,
        patch: { polygon, area, boundaryAnchors },
      });
      slabsToUpdate.push({
        id: existing.slabId,
        patch: { polygon },
      });
      return;
    }
    // New room
    seq++;
    const name = defaultName(seq);
    const category = categoryFromName(name);
    const floor = defaultFloorForCategory(category);
    const slabId = genId("slab");
    const roomId = genId("room");
    const room: RoomNode = {
      id: roomId,
      type: "room",
      parentId: ctx.levelId,
      name,
      category,
      polygon,
      area,
      floorMaterial: floor,
      boundaryAnchors,
      slabId,
      signature,
    };
    const slab: SlabNode = {
      id: slabId,
      type: "slab",
      parentId: ctx.levelId,
      polygon,
      thickness: SLAB_THICKNESS,
      // FIX BUG A: slab elevation = 0 means top face at y=0; extrusion goes DOWN.
      elevation: 0,
      material: floor,
      roomId,
      autoFromWalls: true,
    };
    roomsToAdd.push(room);
    slabsToAdd.push(slab);
  });

  // Anything not matched is orphan.
  const roomsToRemove: NodeId[] = [];
  const slabsToRemove: NodeId[] = [];
  for (const r of ctx.existingRooms) {
    if (!matchedRoomIds.has(r.id)) roomsToRemove.push(r.id);
  }
  for (const s of ctx.existingSlabs) {
    if (!matchedSlabIds.has(s.id)) slabsToRemove.push(s.id);
  }

  return { roomsToAdd, slabsToAdd, roomsToUpdate, slabsToUpdate, roomsToRemove, slabsToRemove };
}

/** Apply SyncResult to a flat node dictionary. */
export function applySyncResult(
  nodes: Record<NodeId, AnyNode>,
  result: SyncResult
): Record<NodeId, AnyNode> {
  const next = { ...nodes };
  for (const r of result.roomsToAdd) next[r.id] = r;
  for (const s of result.slabsToAdd) next[s.id] = s;
  for (const u of result.roomsToUpdate) {
    const cur = next[u.id];
    if (cur) next[u.id] = { ...cur, ...u.patch } as AnyNode;
  }
  for (const u of result.slabsToUpdate) {
    const cur = next[u.id];
    if (cur) next[u.id] = { ...cur, ...u.patch } as AnyNode;
  }
  for (const id of result.roomsToRemove) delete next[id];
  for (const id of result.slabsToRemove) delete next[id];
  return next;
}

/** Get the centroid of a room (cached helper). */
export function roomCentroid(room: RoomNode): Vec2 {
  return polygonCentroid(room.polygon);
}
