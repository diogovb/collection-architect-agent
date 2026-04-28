// Pascal-style flat node graph for the floor-plan scene.
// Walls are primary entities (endpoints + thickness). Rooms and slabs are
// derived by space-detection. Doors and windows attach to walls by offset.
//
// Coordinates: meters, plane XZ (Y is up). Angles in radians.

export type NodeId = string;

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export type RoomCategory =
  | "living"
  | "dining"
  | "kitchen"
  | "bedroom"
  | "bedroom_master"
  | "bedroom_kids"
  | "bath"
  | "bath_master"
  | "lavatory"
  | "laundry"
  | "office"
  | "hall"
  | "balcony"
  | "service"
  | "closet"
  | "circulation"
  | "exterior"
  | "other";

export type FloorMaterial =
  | "madeira"
  | "porcelanato"
  | "ceramica"
  | "marmore"
  | "grama"
  | "deck"
  | "pedra"
  | "cimento"
  | "carpete";

export interface BaseNode {
  id: NodeId;
  type: string;
  parentId: NodeId | null;
}

export interface BuildingNode extends BaseNode {
  type: "building";
  name: string;
  /** Rotation of the building in radians around Y. North is +Z when 0. */
  northRotation: number;
}

export interface LevelNode extends BaseNode {
  type: "level";
  /** Floor elevation in meters above ground. */
  elevation: number;
  /** Default ceiling height for walls in this level. */
  defaultWallHeight: number;
}

export interface WallNode extends BaseNode {
  type: "wall";
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
  isExterior: boolean;
  /** Children: door + window node ids attached to this wall. */
  doors: NodeId[];
  windows: NodeId[];
}

export type HingeSide = "start" | "end";
export type SwingDirection = "in" | "out";

export interface DoorNode extends BaseNode {
  type: "door";
  wallId: NodeId;
  /** Distance from wall.start along the wall in meters (centerline of opening). */
  offset: number;
  width: number;
  height: number;
  hingeSide: HingeSide;
  swingDirection: SwingDirection;
  /** Optional label override. */
  label?: string;
}

export interface WindowNode extends BaseNode {
  type: "window";
  wallId: NodeId;
  offset: number;
  width: number;
  height: number;
  /** Distance from floor to bottom of window. */
  sillHeight: number;
  label?: string;
}

export interface FloorZone {
  id: string;
  /** Polygon defining the zone, in absolute meters (XZ). */
  polygon: Vec2[];
  material: FloorMaterial;
}

export interface RoomNode extends BaseNode {
  type: "room";
  name: string;
  category: RoomCategory;
  /** Polygon of the room, CCW, in meters (XZ). Derived from walls. */
  polygon: Vec2[];
  /** Computed floor area in m². */
  area: number;
  floorMaterial: FloorMaterial;
  floorZones?: FloorZone[];
  /** Reference to the auto-generated SlabNode. */
  slabId: NodeId;
  /** Stable hash of polygon used to preserve identity across edits. */
  signature: string;
}

export interface SlabNode extends BaseNode {
  type: "slab";
  polygon: Vec2[];
  holes?: Vec2[][];
  thickness: number;
  /** Top face Y coordinate. The slab sits BELOW elevation (extrudes downward),
   *  so the floor surface aligns with elevation. Default: 0. */
  elevation: number;
  material: FloorMaterial;
  roomId: NodeId;
  autoFromWalls: true;
}

export interface FurnitureNode extends BaseNode {
  type: "furniture";
  roomId: NodeId | null;
  catalogId: string;
  label: string;
  /** Bottom-left corner (XZ). Y is the floor elevation. */
  position: Vec3;
  /** Rotation around Y in radians. */
  rotation: number;
  /** Bounding box in meters. */
  dimensions: Vec3;
  /** Optional wall attachment. */
  wallId?: NodeId;
  wallOffset?: number;
  wallSide?: "front" | "back";
}

export type DimensionScope = "auto-envelope" | "manual";

export interface DimensionNode extends BaseNode {
  type: "dimension";
  start: Vec2;
  end: Vec2;
  /** Perpendicular offset from the dimension line for the label, in meters. */
  offset: number;
  /** Optional override for the auto-computed text. */
  text?: string;
  scope: DimensionScope;
}

export interface NoteNode extends BaseNode {
  type: "note";
  position: Vec2;
  text: string;
}

export type AnyNode =
  | BuildingNode
  | LevelNode
  | WallNode
  | DoorNode
  | WindowNode
  | RoomNode
  | SlabNode
  | FurnitureNode
  | DimensionNode
  | NoteNode;

export interface Transform {
  position: Vec3;
  rotation: number;
}

/** Editor tool currently active in the toolbar. */
export type Tool = "select" | "move" | "wall" | "dimension" | "door" | "window";

/** View mode for the canvas. */
export type ViewMode = "2d" | "3d";

export interface DiagnosticIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Node ids related to the issue (highlighted in UI). */
  nodeIds: NodeId[];
  /** Optional NBR/Neufert reference. */
  reference?: string;
}

/** Mutable scene state, owned by Zustand store. */
export interface SceneState {
  /** Flat dictionary of all nodes. */
  nodes: Record<NodeId, AnyNode>;
  /** Root building id. */
  rootId: NodeId;
  /** Active level id (single-level for now). */
  activeLevelId: NodeId;
  /** Currently selected node ids. */
  selected: NodeId[];
  /** Hovered node id (single). */
  hovered: NodeId | null;
  /** Nodes whose geometry needs recomputation next frame. */
  dirty: Set<NodeId>;
  /** Ephemeral overrides during drag (not persisted to history). */
  liveTransforms: Map<NodeId, Partial<{ start: Vec2; end: Vec2; position: Vec3; rotation: number; offset: number }>>;
  /** Validator diagnostics from last run. */
  diagnostics: DiagnosticIssue[];
  /** Active tool. */
  tool: Tool;
  /** Current view mode. */
  viewMode: ViewMode;
}

// ---- Type guards ----

export function isWall(n: AnyNode | undefined): n is WallNode {
  return n?.type === "wall";
}
export function isDoor(n: AnyNode | undefined): n is DoorNode {
  return n?.type === "door";
}
export function isWindow(n: AnyNode | undefined): n is WindowNode {
  return n?.type === "window";
}
export function isRoom(n: AnyNode | undefined): n is RoomNode {
  return n?.type === "room";
}
export function isSlab(n: AnyNode | undefined): n is SlabNode {
  return n?.type === "slab";
}
export function isFurniture(n: AnyNode | undefined): n is FurnitureNode {
  return n?.type === "furniture";
}
export function isDimension(n: AnyNode | undefined): n is DimensionNode {
  return n?.type === "dimension";
}
export function isLevel(n: AnyNode | undefined): n is LevelNode {
  return n?.type === "level";
}
export function isBuilding(n: AnyNode | undefined): n is BuildingNode {
  return n?.type === "building";
}

// ---- Vec2 helpers ----

export function v2(x: number, z: number): Vec2 {
  return { x, z };
}
export function v2Eq(a: Vec2, b: Vec2, eps = 1e-3): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps;
}
export function v2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}
export function v2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}
export function v2Scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, z: a.z * s };
}
export function v2Len(a: Vec2): number {
  return Math.hypot(a.x, a.z);
}
export function v2Dist(a: Vec2, b: Vec2): number {
  return v2Len(v2Sub(a, b));
}
export function v2Norm(a: Vec2): Vec2 {
  const l = v2Len(a);
  return l < 1e-9 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
}
/** Perpendicular vector (90° CCW rotation in XZ plane). */
export function v2Perp(a: Vec2): Vec2 {
  return { x: -a.z, z: a.x };
}
export function v2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}
/** Cross product magnitude for 2D vectors (signed area of parallelogram). */
export function v2Cross(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}
/** Angle in radians, [-π, π]. */
export function v2Angle(a: Vec2): number {
  return Math.atan2(a.z, a.x);
}

// ---- Wall helpers ----

export function wallLength(w: WallNode, live?: { start?: Vec2; end?: Vec2 }): number {
  const s = live?.start ?? w.start;
  const e = live?.end ?? w.end;
  return v2Dist(s, e);
}

export function wallAngle(w: WallNode, live?: { start?: Vec2; end?: Vec2 }): number {
  const s = live?.start ?? w.start;
  const e = live?.end ?? w.end;
  return v2Angle(v2Sub(e, s));
}

export function wallCenter(w: WallNode, live?: { start?: Vec2; end?: Vec2 }): Vec2 {
  const s = live?.start ?? w.start;
  const e = live?.end ?? w.end;
  return { x: (s.x + e.x) / 2, z: (s.z + e.z) / 2 };
}

/** Convert a (offset, perpendicular) wall-local position to world. Wall axis = start→end. */
export function wallLocalToWorld(w: WallNode, alongMeters: number, perpMeters = 0): Vec2 {
  const dir = v2Norm(v2Sub(w.end, w.start));
  const perp = v2Perp(dir);
  return {
    x: w.start.x + dir.x * alongMeters + perp.x * perpMeters,
    z: w.start.z + dir.z * alongMeters + perp.z * perpMeters,
  };
}

// ---- Polygon helpers ----

/** Signed area of a polygon (CCW = positive in XZ where +X right, +Z down — note the convention used here). */
export function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

/** Absolute area of a polygon in m². */
export function polygonAbsArea(poly: Vec2[]): number {
  return Math.abs(polygonArea(poly));
}

/** Centroid of a polygon (vertex-average is good enough for label placement). */
export function polygonCentroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, z: 0 };
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  return { x: cx / poly.length, z: cz / poly.length };
}

/** Point-in-polygon test (ray casting). */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j];
    const intersect =
      pi.z > p.z !== pj.z > p.z &&
      p.x < ((pj.x - pi.x) * (p.z - pi.z)) / (pj.z - pi.z + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Polygon bounding box. */
export function polygonBounds(poly: Vec2[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Offset (inflate or shrink) a closed polygon by `distance` along the outward
 * miter direction at each vertex. Positive = outward (inflate); negative = inward (shrink).
 *
 * Assumes the polygon is CCW (when looking down the +Y axis with +X right and
 * +Z away from viewer). For CCW polygons the outward normal at each edge is
 * obtained by rotating the edge direction by -90° (right-hand turn): (dx, dz) → (dz, -dx).
 *
 * Used to make slabs encostarem embaixo das paredes (Pascal-style SLAB_OUTSET) without
 * gaps or z-fighting.
 */
export function outsetPolygon(poly: Vec2[], distance: number): Vec2[] {
  if (Math.abs(distance) < 1e-9 || poly.length < 3) return poly.map((p) => ({ ...p }));
  const n = poly.length;
  const result: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];

    const e1x = cur.x - prev.x;
    const e1z = cur.z - prev.z;
    const e2x = next.x - cur.x;
    const e2z = next.z - cur.z;
    const l1 = Math.hypot(e1x, e1z);
    const l2 = Math.hypot(e2x, e2z);
    if (l1 < 1e-9 || l2 < 1e-9) {
      result.push({ x: cur.x, z: cur.z });
      continue;
    }

    // Outward normal for CCW polygon: rotate edge dir by -90° → (dz, -dx).
    const n1x = e1z / l1;
    const n1z = -e1x / l1;
    const n2x = e2z / l2;
    const n2z = -e2x / l2;

    // Bisector of the two outward normals.
    const bx = n1x + n2x;
    const bz = n1z + n2z;
    const bLen = Math.hypot(bx, bz);
    if (bLen < 1e-9) {
      // 180° turn — collinear neighbour edges; fallback to one normal.
      result.push({ x: cur.x + n1x * distance, z: cur.z + n1z * distance });
      continue;
    }
    const bnx = bx / bLen;
    const bnz = bz / bLen;
    // Distance along bisector to keep edge offset = `distance`:
    //   t = distance / cos(angle between bisector and edge normal)
    const cosHalf = bnx * n1x + bnz * n1z;
    const t = cosHalf > 1e-3 ? distance / cosHalf : distance;

    result.push({ x: cur.x + bnx * t, z: cur.z + bnz * t });
  }
  return result;
}
