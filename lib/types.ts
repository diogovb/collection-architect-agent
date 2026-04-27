// Core domain types for the floor plan.

export type FloorMaterial = "madeira" | "porcelanato" | "ceramica" | "marmore";

export type Wall = "north" | "south" | "east" | "west";

export type FurnitureType =
  | "sofa"
  | "bed"
  | "table"
  | "tv"
  | "sink"
  | "toilet"
  | "shower"
  | "stove"
  | "fridge"
  | "counter"
  | "island"
  | "wardrobe"
  | "desk"
  | "chair"
  | "bookshelf"
  | "washing_machine";

export interface Room {
  id: string;
  name: string;
  /** meters, top-left corner */
  x: number;
  y: number;
  /** meters */
  width: number;
  height: number;
  floor: FloorMaterial;
  /** for entrance animation, 0..1 */
  appear?: number;
}

export interface Door {
  id: string;
  roomId: string;
  wall: Wall;
  /** 0..1 along the wall */
  position: number;
  /** meters */
  size: number;
}

export interface Window {
  id: string;
  roomId: string;
  wall: Wall;
  position: number;
  size: number;
}

export interface Furniture {
  id: string;
  roomId: string;
  type: FurnitureType;
  label: string;
  /** absolute meters (top-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface FloorPlan {
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  furniture: Furniture[];
}

// ----- Tool input shapes (mirror anthropic-tools.ts) -----

export type ToolName =
  | "create_room"
  | "remove_room"
  | "add_door"
  | "add_window"
  | "add_furniture"
  | "remove_furniture"
  | "set_floor_material"
  | "move_furniture"
  | "create_apartment_layout"
  | "furnish_room"
  | "clear_all";

export interface ToolInputs {
  create_room: {
    name: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
    floor_type?: FloorMaterial;
  };
  remove_room: { room_name: string };
  add_door: {
    room_name: string;
    wall: Wall;
    position?: number;
    size?: number;
  };
  add_window: {
    room_name: string;
    wall: Wall;
    position?: number;
    size?: number;
  };
  add_furniture: {
    room_name: string;
    furniture_type: FurnitureType;
    label?: string;
    relative_x?: number;
    relative_y?: number;
  };
  remove_furniture: { furniture_id?: string; label?: string };
  set_floor_material: { room_name: string; material: FloorMaterial };
  move_furniture: { furniture_id: string; new_x: number; new_y: number };
  create_apartment_layout: {
    total_area: number;
    num_bedrooms: number;
    num_bathrooms: number;
    style?: "modern" | "classic" | "compact";
  };
  furnish_room: {
    room_name: string;
    style?: "modern" | "minimal" | "classic";
  };
  clear_all: Record<string, never>;
}

// ----- Streaming events from API -----

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; id: string; name: ToolName }
  | { type: "tool_input"; id: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

// Chat message kept on the client (mirrors what we'll forward to the API).

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  /** plain user text or assistant final text */
  content: string;
  toolCalls?: { id: string; name: ToolName; input: unknown; ok?: boolean }[];
}
