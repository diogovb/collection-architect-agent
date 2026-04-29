import type { HybridLayers } from "../types";

// ---- Pipeline inputs ----

export interface HybridPipelineSpec {
  totalArea: number;
  numBedrooms: number;
  numBathrooms: number;
  style?: "modern" | "classic" | "compact" | "luxury";
  includeFurniture?: boolean;
  additionalNotes?: string;
}

// ---- Progress events emitted during pipeline execution ----

export type PipelineProgressEvent =
  | { kind: "structural_image"; image: Buffer }
  | { kind: "structural_svg"; svg: string }
  | { kind: "furniture_image"; image: Buffer }
  | { kind: "furniture_svg"; svg: string }
  | { kind: "stage"; label: string };

// ---- Pipeline result ----

export interface HybridPipelineResult {
  hybridLayers: HybridLayers;
  issues: string[];
  timings: {
    structuralImage: number;
    structuralVectorize: number;
    furnitureImage?: number;
    furnitureVectorize?: number;
    total: number;
  };
}

// ============================================================================
// LEGACY (V1) — não usado pela pipeline atual.
// Mantido para referência caso V2 reintroduza extração estrutural.
// ============================================================================

import type { FloorMaterial, FurnitureType, Wall } from "../types";

export interface ParsedRoom {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  material?: FloorMaterial;
  isBalcony?: boolean;
  isExterior?: boolean;
}

export interface ParsedDoor {
  roomName: string;
  wall: Wall;
  position: number;
  size: number;
}

export interface ParsedWindow {
  roomName: string;
  wall: Wall;
  position: number;
  size: number;
}

export interface ParsedStructure {
  rooms: ParsedRoom[];
  doors: ParsedDoor[];
  windows: ParsedWindow[];
  confidence: number;
  issues: string[];
}

export interface ParsedFurnitureItem {
  type: FurnitureType;
  roomName: string;
  relativeX: number;
  relativeY: number;
  rotation?: number;
  label?: string;
  confidence: number;
}

export interface ParsedFurniture {
  items: ParsedFurnitureItem[];
  unrecognized: Array<{ roomName: string; description: string }>;
  confidence: number;
}
