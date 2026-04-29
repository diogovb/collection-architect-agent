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
  | "switch"
  // =========================================================
  // MARCENARIA MODULAR (Fase A — building blocks for runs)
  // Each ModuleKind below also exists as a FurnitureType so the engine
  // can render module instances as Furniture entries with metadata
  // (runId + cutouts). See lib/millwork-modules.ts for defaults.
  // =========================================================
  // ---- Storage genérico (qualquer cômodo) ----
  | "module_cabinet_door"        // armário 1 porta (40-60cm)
  | "module_cabinet_door_double" // armário 2 portas (80-120cm)
  | "module_cabinet_drawer_3"    // 3 gavetas
  | "module_cabinet_drawer_4"    // 4 gavetas
  | "module_cabinet_open"        // nicho aberto / prateleiras
  | "module_cabinet_glass"       // porta de vidro / vitrine
  | "module_corner_carrousel"    // canto giratório
  | "module_gap_filler"          // preenchimento
  // ---- Cozinha ----
  | "module_cooktop_4"           // cooktop 4 bocas (60cm)
  | "module_cooktop_5"           // cooktop 5 bocas (75cm)
  | "module_cooktop_induction"   // cooktop indução (60cm)
  | "module_oven_built_in"       // forno embutido base (60cm)
  | "module_oven_tower"          // torre forno+microondas (60cm full-height)
  | "module_microwave_niche"     // nicho microondas (60cm em altura)
  | "module_fridge_niche"        // geladeira inverter single (70cm)
  | "module_fridge_niche_double" // geladeira side-by-side (90cm)
  | "module_fridge_french_door"  // french door (90cm)
  | "module_sink_single"         // pia simples embutida (60cm)
  | "module_sink_double"         // pia dupla embutida (120cm)
  | "module_dishwasher_niche"    // lava-louças (60cm)
  | "module_wine_cellar"         // adega (60cm)
  | "module_pantry_tall"         // despensa full-height (60cm)
  // ---- Banheiro ----
  | "module_vanity_sink_single"
  | "module_vanity_sink_double"
  | "module_vanity_drawer_3"
  | "module_wall_hung_toilet"    // vaso suspenso com caixa embutida
  // ---- Closet ----
  | "module_closet_hanging_full"
  | "module_closet_hanging_double"
  | "module_closet_drawer_4"
  | "module_closet_drawer_6"
  | "module_closet_shoe"
  | "module_closet_shelves"
  | "module_closet_jewelry"
  // ---- Lavanderia ----
  | "module_washer_niche"
  | "module_dryer_niche"
  | "module_washer_dryer_stack"
  | "module_laundry_tank"
  | "module_drying_rack_built_in"
  // ---- Churrasqueira / gourmet ----
  | "module_bbq_built_in"
  | "module_pizza_oven"
  | "module_outdoor_cooktop"
  | "module_outdoor_sink"
  | "module_wine_fridge_outdoor"
  // ---- Sala / TV wall ----
  | "module_tv_console"
  | "module_tv_panel_built_in"
  // ---- Composição (criados pelo engine, não pelo agente) ----
  | "bancada_continuous"         // countertop spanning the run
  | "module_upper_cabinet"       // armário superior tracejado
  | "module_upper_glass"         // armário superior vidro
  | "hood_built_in";             // exaustor sobre cooktop

/** Placement intent / constraints for a piece of furniture. Drives engine
 *  validators (rejects placements that violate the constraints) and the
 *  generative solver (computes a valid x/y from a high-level anchor like
 *  "wall:north@mid" or "corner:NE"). */
export interface FurniturePlacement {
  /** Where the piece must be anchored relative to the room polygon.
   *  - "wall": at least one face must touch a wall.
   *  - "corner": two adjacent faces must touch walls.
   *  - "wall-or-corner": prefers corner, falls back to wall.
   *  - "free": no anchoring required (e.g. dining table). */
  anchorTo: "wall" | "corner" | "wall-or-corner" | "free";
  /** Required free space on each side, in meters. The engine checks the
   *  rectangle (side × clearance) is empty of non-rug furniture and is
   *  inside the room polygon. */
  clearance: { front: number; back: number; left: number; right: number };
  /** When `anchorTo === "wall"`, which face goes against the wall. The
   *  rotation defaults so this face is on the wall side. */
  wallFace: "back" | "left" | "right" | "any";
  /** Ergonomic relations to other furniture types (kitchen triangle,
   *  sofa↔TV viewing distance, etc.). Engine validates min/max distance
   *  between geometric centers. `hint` shows up in error messages. */
  relations?: Array<{ withType: FurnitureType; minDist: number; maxDist: number; hint: string }>;
  /** Zoning category — feeds future combination validators (e.g. "bed
   *  must coexist with at least one nightstand in bedrooms"). */
  category: "anchor" | "filler" | "rug" | "decor" | "appliance" | "sanitary";
}

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
  /** Material of the balcony's railing/parapet on the exterior sides.
   *  Only meaningful when `isBalcony` is true. Default "concrete". */
  balconyRailingMaterial?: "concrete" | "glass" | "metal";
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
  /** Optional: when this furniture is a module that belongs to a
   *  millwork run (kitchen counter, vanity, closet wall, BBQ counter…),
   *  this points back to the parent run so we can group/remove together
   *  and keep semantic context. Set by `add_millwork_run`. */
  runId?: string;
  /** Optional: only meaningful for type === "bancada_continuous". Lists
   *  cutouts in the slab where sinks / cooktops break the surface. Each
   *  entry is in metres along the run's length. */
  cutouts?: Array<{ offset: number; width: number; kind: "sink" | "cooktop" | "other" }>;
  /** Optional: per-furniture material/finish overrides. Set by the run
   *  engine when materializing modules so the renderer picks the right
   *  hatch / colour / texture. */
  finish?: {
    bodyMaterial?: BodyMaterial;
    countertopMaterial?: CountertopMaterial;
    doorStyle?: DoorStyle;
    handleStyle?: HandleStyle;
  };
}

/** ------------ Marcenaria modular (Fase A) ------------ */

export type ModuleKind =
  // storage genérico
  | "cabinet_door" | "cabinet_door_double"
  | "cabinet_drawer_3" | "cabinet_drawer_4"
  | "cabinet_open" | "cabinet_glass"
  | "corner_carrousel" | "gap_filler"
  // cozinha
  | "cooktop_4" | "cooktop_5" | "cooktop_induction"
  | "oven_built_in" | "oven_tower" | "microwave_niche"
  | "fridge_niche" | "fridge_niche_double" | "fridge_french_door"
  | "sink_single" | "sink_double"
  | "dishwasher_niche" | "wine_cellar" | "pantry_tall"
  // banheiro
  | "vanity_sink_single" | "vanity_sink_double" | "vanity_drawer_3"
  | "wall_hung_toilet"
  // closet
  | "closet_hanging_full" | "closet_hanging_double"
  | "closet_drawer_4" | "closet_drawer_6"
  | "closet_shoe" | "closet_shelves" | "closet_jewelry"
  // lavanderia
  | "washer_niche" | "dryer_niche" | "washer_dryer_stack"
  | "laundry_tank" | "drying_rack_built_in"
  // churrasqueira / gourmet
  | "bbq_built_in" | "pizza_oven" | "outdoor_cooktop"
  | "outdoor_sink" | "wine_fridge_outdoor"
  // sala
  | "tv_console" | "tv_panel_built_in";

export type CountertopMaterial =
  | "granito_preto" | "granito_branco"
  | "marmore_carrara" | "marmore_travertino"
  | "quartzo_branco" | "quartzo_preto"
  | "porcelanato" | "madeira_macica" | "inox";

export type BodyMaterial =
  | "MDF_branco" | "MDF_amadeirado"
  | "laca_branca" | "laca_preta"
  | "freijo" | "carvalho" | "ipe";

export type DoorStyle = "shaker" | "flat" | "panel" | "glass" | "ripado";
export type HandleStyle = "knob" | "bar_horizontal" | "bar_vertical" | "integrated" | "none";

export type RunType =
  | "kitchen_counter" | "bathroom_vanity" | "closet"
  | "laundry_counter" | "bbq_counter" | "tv_wall"
  | "library" | "custom";

export interface MillworkModule {
  kind: ModuleKind;
  width: number; // metres
  label?: string;
  hood_above?: boolean;     // só pra cooktop_*
  window_above?: boolean;   // info informativa
}

export interface MillworkRun {
  id: string;
  roomId: string;
  /** "freestanding" runs have position + orientation instead of wall. */
  wall: Wall | "freestanding";
  position?: { x: number; y: number };
  orientation?: Wall; // qual face fica "atrás" quando freestanding
  startOffset: number;
  type: RunType;
  modules: MillworkModule[];
  countertop?: {
    material: CountertopMaterial;
    overhangFront: number;
    hasBacksplash: boolean;
  };
  upperCabinets: "auto" | "none" | { skipModules?: number[] };
  lowerHeight: number;
  upperOffset: number;
  upperHeight: number;
  finish: {
    bodyMaterial: BodyMaterial;
    doorStyle: DoorStyle;
    handleStyle: HandleStyle;
  };
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
  /** Marcenaria runs (Fase A). Each run is a continuous millwork
   *  installation along a wall (kitchen counter, bathroom vanity, closet,
   *  laundry, BBQ, TV wall). The Furniture entries with `runId === r.id`
   *  are the materialized modules + countertop + uppers. */
  millworkRuns?: MillworkRun[];
}

// ----- Tool input shapes (mirror anthropic-tools.ts) -----

export type ToolName =
  | "create_room"
  | "remove_room"
  | "add_door"
  | "add_window"
  | "add_furniture"
  | "place_furniture_intent"
  | "add_millwork_run"
  | "remove_millwork_run"
  | "update_millwork_module"
  | "remove_furniture"
  | "set_floor_material"
  | "set_railing_material"
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
  | "search_knowledge_base"
  // ---- hybrid pipeline ----
  | "generate_plan_hybrid";

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
  place_furniture_intent: {
    room_name: string;
    items: Array<{
      type: FurnitureType;
      label?: string;
      anchor:
        | "wall:north" | "wall:south" | "wall:east" | "wall:west"
        | "corner:NW" | "corner:NE" | "corner:SW" | "corner:SE"
        | "center" | "free";
      position?: "start" | "mid" | "end";
      rotation?: number;
    }>;
  };
  add_millwork_run: {
    room_name: string;
    wall: Wall | "freestanding";
    position?: { x: number; y: number };
    orientation?: Wall;
    start_offset?: number;
    end_offset?: number;
    type: RunType;
    modules: MillworkModule[];
    countertop?: {
      material?: CountertopMaterial;
      overhang_front?: number;
      has_backsplash?: boolean;
    };
    upper_cabinets?: "auto" | "none" | { skipModules?: number[] };
    lower_height?: number;
    upper_offset?: number;
    upper_height?: number;
    finish?: {
      body_material?: BodyMaterial;
      door_style?: DoorStyle;
      handle_style?: HandleStyle;
    };
  };
  remove_millwork_run: { run_id: string };
  update_millwork_module: {
    run_id: string;
    module_index: number;
    kind?: ModuleKind;
    width?: number;
  };
  remove_furniture: { furniture_id?: string; label?: string };
  set_floor_material: { room_name: string; material: FloorMaterial };
  set_railing_material: { room_name: string; material: "concrete" | "glass" | "metal" };
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
    railing_material?: "concrete" | "glass" | "metal";
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
  generate_plan_hybrid: {
    total_area: number;
    num_bedrooms: number;
    num_bathrooms: number;
    style?: "modern" | "classic" | "compact" | "luxury";
    include_furniture?: boolean;
    additional_notes?: string;
  };
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
  | { type: "plan_replace"; plan: FloorPlan }
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
