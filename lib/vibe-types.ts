// Vibe Project specific types — UI state, mock entities, modes.

export type Mode = "plan" | "render" | "presentation" | "shopping";

export type RightTab = "chat" | "refs" | "collection" | "versions";

export type CameraStatus = "ready" | "outdated" | "empty" | "generating";

export interface Camera {
  id: string;
  name: string;
  /** position in meters on plan */
  x: number;
  y: number;
  /** facing angle in degrees, 0 = east, 90 = south */
  angle: number;
  /** field of view in degrees */
  fov: number;
  /** vision range in meters */
  range: number;
  status: CameraStatus;
  /** placeholder render seed, optional URL or null */
  renderUrl?: string | null;
  /** time of last render generation */
  lastGeneratedAt?: string;
  /** lighting/atmosphere knobs */
  atmosphere?: {
    lightHour: number; // 0-24
    warmth: number; // 0-100
    materialIntensity: number; // 0-100
  };
}

export interface ReferenceImage {
  id: string;
  label: string;
  /** gradient string for thumb */
  thumb: string;
  influence: number; // 0-100
  attachedTo?: string; // selected element id
}

export interface CollectionItem {
  id: string;
  name: string;
  designer?: string;
  brand?: string;
  category: string; // e.g., "sofa", "lighting", "rug"
  /** swatch color */
  swatch: string;
  /** price in BRL */
  price: number;
  /** is part of project? */
  inProject?: boolean;
}

export interface ShoppingRow {
  id: string;
  room: string;
  name: string;
  brand?: string;
  isCollection: boolean;
  qty: number;
  unitPrice: number;
  swatch: string;
}

export interface Version {
  id: string;
  label: string;
  author: string;
  createdAt: string; // ISO date
  note?: string;
  current?: boolean;
}

export type SlideKind =
  | "cover"
  | "concept"
  | "plan"
  | "render"
  | "materials"
  | "products"
  | "list"
  | "text"
  | "section";

export interface Slide {
  id: string;
  kind: SlideKind;
  title?: string;
  subtitle?: string;
  body?: string;
  /** Reference id (camera id for render slides, etc) */
  refId?: string;
}

export interface DiffProposal {
  /** id of the AI-proposed change */
  id: string;
  targetId: string; // furniture/wall/etc
  description: string;
  /** delta meters */
  deltaX?: number;
  deltaY?: number;
  /** badge text e.g. "+50cm" */
  badge?: string;
}
