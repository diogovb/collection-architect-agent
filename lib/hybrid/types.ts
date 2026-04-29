import type { FloorPlan, FurnitureType, FloorMaterial, Wall } from "../types";

// ---- Parsed structure from Claude Vision ----

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
  /** 0..1 along the wall */
  position: number;
  /** meters */
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
  /** 0..1 overall confidence from Claude Vision */
  confidence: number;
  issues: string[];
}

export interface ParsedFurnitureItem {
  type: FurnitureType;
  roomName: string;
  /** Relative position within the room (0..1) */
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

// ---- Pipeline inputs/outputs ----

export interface HybridPipelineSpec {
  totalArea: number;
  numBedrooms: number;
  numBathrooms: number;
  style?: "modern" | "classic" | "compact" | "luxury";
  includeFurniture?: boolean;
  additionalNotes?: string;
}

export interface HybridPipelineResult {
  plan: FloorPlan;
  structuralImage: Buffer;
  structuralSvg?: string;
  furnitureImage?: Buffer;
  furnitureSvg?: string;
  confidence: number;
  issues: string[];
  timings: {
    imageGen: number;
    vectorize: number;
    visionExtract: number;
    reconstruct: number;
    furnitureGen?: number;
    total: number;
  };
}
