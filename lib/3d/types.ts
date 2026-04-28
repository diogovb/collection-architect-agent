// Building model — 3D-native data structures derived from FloorPlan.

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

export interface DoorNode {
  id: string;
  type: "door";
  /** 0..1 along wall length, measured from start to end */
  position: number;
  /** meters */
  width: number;
  /** meters */
  height: number;
  swingSide: "left" | "right";
}

export interface WindowNode {
  id: string;
  type: "window";
  position: number;
  width: number;
  height: number;
  /** meters from floor */
  sillHeight: number;
}

export type OpeningNode = DoorNode | WindowNode;

export interface WallNode {
  id: string;
  start: Vec2;
  end: Vec2;
  /** meters — 0.15 external, 0.10 internal */
  thickness: number;
  /** meters — default 2.80 */
  height: number;
  isExternal: boolean;
  children: OpeningNode[];
}

export interface SlabNode {
  id: string;
  /** Convex polygon (axis-aligned rectangle in v1) in XZ plane */
  polygon: Vec2[];
  /** meters */
  thickness: number;
  /** meters from world 0 */
  elevation: number;
  /** material key (used for color lookup) */
  material: string;
}

export interface FurnitureNode {
  id: string;
  type: string;
  label: string;
  /** Center position in world meters; y is the box's vertical center */
  position: Vec3;
  /** Y-axis rotation in radians */
  rotation: number;
  /** width × height(Y) × depth */
  dimensions: Vec3;
  color: string;
}

export interface ZoneNode {
  id: string;
  name: string;
  polygon: Vec2[];
  /** square meters */
  area: number;
  color: string;
}

export interface LevelNode {
  id: string;
  name: string;
  /** floor elevation, meters */
  elevation: number;
  /** ceiling height, meters */
  height: number;
  walls: WallNode[];
  slabs: SlabNode[];
  furniture: FurnitureNode[];
  zones: ZoneNode[];
}

export interface BuildingModel {
  levels: LevelNode[];
  /** id of the active level */
  activeLevel: string;
}

export const DEFAULT_WALL_HEIGHT = 2.8;
export const EXTERNAL_WALL_THICKNESS = 0.15;
export const INTERNAL_WALL_THICKNESS = 0.1;
export const DEFAULT_SLAB_THICKNESS = 0.12;
export const DEFAULT_DOOR_HEIGHT = 2.1;
export const DEFAULT_WINDOW_HEIGHT = 1.2;
export const DEFAULT_WINDOW_SILL = 1.0;
