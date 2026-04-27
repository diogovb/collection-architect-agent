// Core domain types for the floor plan.

export type FloorMaterial =
  | "madeira"
  | "porcelanato"
  | "ceramica"
  | "marmore"
  | "grama"
  | "deck"
  | "pedra";

export type Wall = "north" | "south" | "east" | "west";

export type FurnitureType =
  // ---- legacy / generic (kept for back-compat) ----
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
  | "washing_machine"
  // ---- residential — sala ----
  | "sofa_2seat"
  | "sofa_3seat"
  | "sofa_L"
  | "armchair"
  | "coffee_table"
  | "side_table"
  | "tv_console"
  | "floor_lamp"
  | "rug_rect"
  // ---- residential — quarto casal ----
  | "bed_double"
  | "bed_king"
  | "nightstand"
  | "dresser"
  | "wardrobe_sliding"
  | "wardrobe_hinged"
  | "vanity"
  // ---- residential — quarto solteiro / infantil ----
  | "bed_single"
  | "bed_bunk"
  | "desk_study"
  | "desk_chair"
  | "crib"
  | "bed_child"
  | "toy_shelf"
  | "play_table"
  // ---- residential — cozinha ----
  | "stove_4burner"
  | "stove_5burner"
  | "cooktop"
  | "fridge_single"
  | "fridge_double"
  | "microwave"
  | "dishwasher"
  | "kitchen_sink_single"
  | "kitchen_sink_double"
  | "kitchen_island"
  | "bar_stool"
  | "hood"
  | "pantry"
  // ---- residential — banheiro ----
  | "bidet"
  | "sink_pedestal"
  | "sink_vanity"
  | "sink_double_vanity"
  | "shower_square"
  | "shower_rect"
  | "bathtub_rect"
  | "bathtub_corner"
  | "towel_rack"
  // ---- residential — lavanderia ----
  | "dryer"
  | "laundry_sink"
  | "ironing_board"
  // ---- residential — jantar ----
  | "dining_table_4"
  | "dining_table_6"
  | "dining_table_8"
  | "dining_table_round_4"
  | "buffet"
  | "dining_chair"
  // ---- residential — escritório ----
  | "desk_L"
  | "desk_straight"
  | "office_chair"
  | "filing_cabinet"
  // ---- comercial ----
  | "meeting_table_large"
  | "reception_desk"
  | "waiting_chair"
  | "cubicle_desk"
  | "display_shelf"
  | "checkout_counter"
  | "restaurant_table_2"
  | "restaurant_table_4"
  | "bar_counter"
  | "commercial_stove"
  // ---- externo ----
  | "pool_rect"
  | "hot_tub"
  | "bbq_grill"
  | "outdoor_table"
  | "sun_lounger"
  | "umbrella"
  | "planter_round"
  | "tree_small"
  | "tree_large"
  | "pergola"
  | "fountain"
  // ---- decoração ----
  | "plant_pot"
  | "mirror_wall"
  | "ceiling_fan"
  // ---- elétrico ----
  | "light_ceiling"
  | "light_spot"
  | "power_outlet"
  | "switch";

/** Optional sub-zone of a room with a different floor material. */
export interface FloorZone {
  /** relative offset within the room, 0..1 */
  rx: number;
  ry: number;
  /** relative size within the room, 0..1 */
  rw: number;
  rh: number;
  material: FloorMaterial;
}

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
  /** Walls explicitly removed (renders as open / no wall). */
  openWalls?: Wall[];
  /** Sub-zones with different floor materials (open-plan splits). */
  floorZones?: FloorZone[];
  /** Marks the room as a balcony (rendered with guard rail on exterior walls). */
  isBalcony?: boolean;
  /** Marks the room as exterior (garden/yard). */
  isExterior?: boolean;
}

export interface Door {
  id: string;
  roomId: string;
  wall: Wall;
  /** 0..1 along the wall */
  position: number;
  /** meters */
  size: number;
  /** If true, the wall opening is rendered but the swing arc/leaf is suppressed.
   *  Used when two adjacent rooms share a doorway: both rooms get a Door so
   *  each room's wall is cut, but only the room the door swings INTO renders the arc. */
  silent?: boolean;
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

export type StairsShape = "straight" | "L" | "U" | "spiral";

export interface Stairs {
  id: string;
  /** optional roomId; null when free-standing */
  roomId?: string;
  shape: StairsShape;
  /** absolute world meters (top-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** "up" arrow direction */
  direction: "up" | "down";
  rotation?: number;
}

export interface Column {
  id: string;
  /** center, world meters */
  x: number;
  y: number;
  /** square side in meters (or diameter for circular) */
  size: number;
  shape?: "square" | "round";
}

export type AnnotationKind = "dimension" | "note";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  /** world meters */
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  /** for notes: the text. for dimensions: optional override. */
  text?: string;
}

export interface NorthArrow {
  /** world meters */
  x: number;
  y: number;
  /** degrees, 0 = pointing up */
  angle: number;
}

export interface FloorPlan {
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  furniture: Furniture[];
  stairs?: Stairs[];
  columns?: Column[];
  annotations?: Annotation[];
  northArrow?: NorthArrow | null;
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
  | "clear_all"
  // ---- new structural ----
  | "delete_wall"
  | "merge_rooms"
  | "add_partition"
  | "split_room"
  | "move_wall"
  | "resize_room"
  // ---- new floor/zoning ----
  | "split_floor"
  // ---- new layout ----
  | "add_balcony"
  | "add_stairs"
  | "mirror_layout"
  | "rotate_layout"
  | "duplicate_room"
  | "add_column"
  // ---- furniture helpers ----
  | "add_furniture_group"
  | "swap_furniture"
  // ---- annotations ----
  | "add_dimension"
  | "add_text_note"
  | "add_north_arrow"
  // ---- knowledge base (RAG) ----
  | "search_knowledge_base";

export type FurnitureGroup =
  | "dining_set_4"
  | "dining_set_6"
  | "dining_set_8"
  | "living_basic"
  | "living_full"
  | "bedroom_couple_basic"
  | "bedroom_couple_full"
  | "bedroom_single_basic"
  | "kids_room_basic"
  | "kitchen_basic"
  | "kitchen_full"
  | "bathroom_basic"
  | "bathroom_full"
  | "office_basic"
  | "laundry_basic"
  | "garden_basic"
  | "pool_set"
  | "bbq_set";

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

  delete_wall: { room_name: string; wall: Wall };
  merge_rooms: { room_a: string; room_b: string; new_name?: string };
  add_partition: {
    room_name: string;
    /** "horizontal" splits along width, "vertical" splits along height */
    orientation: "horizontal" | "vertical";
    /** 0..1 position of the partition */
    position?: number;
    new_room_name?: string;
  };
  split_room: {
    room_name: string;
    orientation: "horizontal" | "vertical";
    position?: number;
    new_room_name?: string;
    new_room_floor?: FloorMaterial;
  };
  move_wall: {
    room_name: string;
    wall: Wall;
    /** delta in meters; positive moves wall outward (grows the room) */
    delta: number;
  };
  resize_room: {
    room_name: string;
    width: number;
    height: number;
  };
  split_floor: {
    room_name: string;
    orientation: "horizontal" | "vertical";
    position?: number;
    second_material: FloorMaterial;
  };
  add_balcony: {
    name?: string;
    attached_to?: string;
    wall?: Wall;
    width: number;
    depth: number;
  };
  add_stairs: {
    shape: StairsShape;
    x: number;
    y: number;
    width: number;
    height: number;
    direction?: "up" | "down";
    rotation?: number;
    room_name?: string;
  };
  mirror_layout: { axis: "x" | "y" };
  rotate_layout: { degrees: 90 | 180 | 270 };
  duplicate_room: { room_name: string; new_name?: string; offset_x?: number; offset_y?: number };
  add_column: {
    x: number;
    y: number;
    size?: number;
    shape?: "square" | "round";
  };
  add_furniture_group: {
    room_name: string;
    group: FurnitureGroup;
  };
  swap_furniture: {
    furniture_id: string;
    new_type: FurnitureType;
  };
  add_dimension: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    text?: string;
  };
  add_text_note: {
    x: number;
    y: number;
    text: string;
  };
  add_north_arrow: {
    x?: number;
    y?: number;
    angle?: number;
  };
  search_knowledge_base: { query: string; category?: string };
}

// ----- Selection -----

export type SelectedElement =
  | { type: "room"; id: string }
  | { type: "furniture"; id: string }
  | { type: "door"; id: string }
  | { type: "window"; id: string }
  | { type: "wall"; roomId: string; wall: Wall };

/** Resolved/expanded selection details to send to Claude or display in UI. */
export interface SelectionContext {
  kind: "room" | "furniture" | "door" | "window" | "wall";
  id: string;
  /** Human-readable description, e.g. "Sofá em Sala de Estar (2.0×0.9m)". */
  description: string;
  /** Selected entity payload (already trimmed). */
  payload: Record<string, unknown>;
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
