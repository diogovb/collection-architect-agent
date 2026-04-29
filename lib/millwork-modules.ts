// Defaults + helpers for every millwork module kind. Drives the engine's
// `add_millwork_run` handler (Fase B): given a `kind`, we know the
// default width, whether it's full-height (skip uppers), what to render
// above (uppers vs hood vs nothing), and what cutouts to punch into the
// countertop.
//
// Adding a new ModuleKind here is enough to make it valid in the tool
// schema (we read from MODULE_DEFS) — no per-module switch in the
// engine. Visual rendering is defined separately in furniture-svgs.ts.

import type { FurnitureType, ModuleKind } from "./types";

export interface ModuleDef {
  /** Default width in metres if the agent doesn't specify. */
  defaultWidth: number;
  /** Allowed widths the agent should pick from (informative, not enforced). */
  widthOptions: number[];
  /** Default depth in plan view (perpendicular to the wall). */
  defaultDepth: number;
  /** Default height in elevation. Distinguishes lower (≤0.95m), upper-only
   *  (drives 35cm depth + suspended), full-height (≥1.8m) modules. */
  defaultHeight: number;
  /** When true, this module spans floor-to-ceiling and breaks the
   *  countertop. Examples: fridge_niche, oven_tower, pantry_tall,
   *  closet_hanging_full. */
  isFullHeight: boolean;
  /** When true, an upper cabinet may sit above this module (kitchen
   *  base cabinets, dishwashers). When false, no upper goes here
   *  (sink with window above, cooktop with hood above, full-height
   *  modules already at ceiling). */
  allowsUpperAbove: boolean;
  /** Cutout in the countertop above this module: "sink" / "cooktop" /
   *  none. Drives the `cutouts` array on `bancada_continuous`. */
  cutoutKind?: "sink" | "cooktop";
  /** Default Brazilian-Portuguese label. */
  label: string;
  /** Maps to a FurnitureType so the engine can materialise the module
   *  as a Furniture entry the canvas already knows how to render. */
  furnitureType: FurnitureType;
  /** Categoria do cômodo natural (informativa pra system prompt + RAG). */
  primaryRoomTypes: Array<"cozinha" | "banheiro" | "closet" | "lavanderia" | "gourmet" | "sala" | "qualquer">;
}

const KITCHEN: ModuleDef["primaryRoomTypes"] = ["cozinha"];
const BATH: ModuleDef["primaryRoomTypes"] = ["banheiro"];
const CLOSET: ModuleDef["primaryRoomTypes"] = ["closet"];
const LAUNDRY: ModuleDef["primaryRoomTypes"] = ["lavanderia"];
const GOURMET: ModuleDef["primaryRoomTypes"] = ["gourmet"];
const SALA: ModuleDef["primaryRoomTypes"] = ["sala"];
const ANY: ModuleDef["primaryRoomTypes"] = ["qualquer"];

export const MODULE_DEFS: Record<ModuleKind, ModuleDef> = {
  // ===== Storage genérico =====
  cabinet_door:        { defaultWidth: 0.5, widthOptions: [0.4, 0.45, 0.5, 0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Armário 1 porta", furnitureType: "module_cabinet_door", primaryRoomTypes: ANY },
  cabinet_door_double: { defaultWidth: 0.9, widthOptions: [0.8, 0.9, 1.0, 1.2], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Armário 2 portas", furnitureType: "module_cabinet_door_double", primaryRoomTypes: ANY },
  cabinet_drawer_3:    { defaultWidth: 0.6, widthOptions: [0.4, 0.5, 0.6, 0.8], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Gaveteiro 3 gavetas", furnitureType: "module_cabinet_drawer_3", primaryRoomTypes: ANY },
  cabinet_drawer_4:    { defaultWidth: 0.6, widthOptions: [0.4, 0.5, 0.6, 0.8], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Gaveteiro 4 gavetas", furnitureType: "module_cabinet_drawer_4", primaryRoomTypes: ANY },
  cabinet_open:        { defaultWidth: 0.6, widthOptions: [0.4, 0.6, 0.8, 1.0], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Nicho aberto", furnitureType: "module_cabinet_open", primaryRoomTypes: ANY },
  cabinet_glass:       { defaultWidth: 0.6, widthOptions: [0.4, 0.6, 0.8], defaultDepth: 0.4, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, label: "Vitrine vidro", furnitureType: "module_cabinet_glass", primaryRoomTypes: ANY },
  corner_carrousel:    { defaultWidth: 0.9, widthOptions: [0.85, 0.9, 1.0], defaultDepth: 0.9, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, label: "Canto giratório", furnitureType: "module_corner_carrousel", primaryRoomTypes: ANY },
  gap_filler:          { defaultWidth: 0.1, widthOptions: [0.05, 0.1, 0.15, 0.2], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, label: "Preenchimento", furnitureType: "module_gap_filler", primaryRoomTypes: ANY },

  // ===== Cozinha =====
  cooktop_4:           { defaultWidth: 0.6, widthOptions: [0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "cooktop", label: "Cooktop 4 bocas", furnitureType: "module_cooktop_4", primaryRoomTypes: KITCHEN },
  cooktop_5:           { defaultWidth: 0.75, widthOptions: [0.75], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "cooktop", label: "Cooktop 5 bocas", furnitureType: "module_cooktop_5", primaryRoomTypes: KITCHEN },
  cooktop_induction:   { defaultWidth: 0.6, widthOptions: [0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "cooktop", label: "Cooktop indução", furnitureType: "module_cooktop_induction", primaryRoomTypes: KITCHEN },
  oven_built_in:       { defaultWidth: 0.6, widthOptions: [0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Forno embutido", furnitureType: "module_oven_built_in", primaryRoomTypes: KITCHEN },
  oven_tower:          { defaultWidth: 0.6, widthOptions: [0.6], defaultDepth: 0.6, defaultHeight: 2.1, isFullHeight: true, allowsUpperAbove: false, label: "Torre de forno", furnitureType: "module_oven_tower", primaryRoomTypes: KITCHEN },
  microwave_niche:     { defaultWidth: 0.6, widthOptions: [0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Microondas em nicho", furnitureType: "module_microwave_niche", primaryRoomTypes: KITCHEN },
  fridge_niche:        { defaultWidth: 0.7, widthOptions: [0.65, 0.7, 0.75], defaultDepth: 0.7, defaultHeight: 1.9, isFullHeight: true, allowsUpperAbove: false, label: "Geladeira", furnitureType: "module_fridge_niche", primaryRoomTypes: KITCHEN },
  fridge_niche_double: { defaultWidth: 0.9, widthOptions: [0.9, 0.95], defaultDepth: 0.7, defaultHeight: 1.9, isFullHeight: true, allowsUpperAbove: false, label: "Geladeira duplex", furnitureType: "module_fridge_niche_double", primaryRoomTypes: KITCHEN },
  fridge_french_door:  { defaultWidth: 0.9, widthOptions: [0.9, 0.95], defaultDepth: 0.7, defaultHeight: 1.9, isFullHeight: true, allowsUpperAbove: false, label: "Geladeira french door", furnitureType: "module_fridge_french_door", primaryRoomTypes: KITCHEN },
  sink_single:         { defaultWidth: 0.6, widthOptions: [0.5, 0.6, 0.7], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "sink", label: "Pia simples", furnitureType: "module_sink_single", primaryRoomTypes: KITCHEN },
  sink_double:         { defaultWidth: 1.2, widthOptions: [1.0, 1.2, 1.4], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "sink", label: "Pia dupla", furnitureType: "module_sink_double", primaryRoomTypes: KITCHEN },
  dishwasher_niche:    { defaultWidth: 0.6, widthOptions: [0.45, 0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Lava-louças", furnitureType: "module_dishwasher_niche", primaryRoomTypes: KITCHEN },
  wine_cellar:         { defaultWidth: 0.6, widthOptions: [0.45, 0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: true, label: "Adega", furnitureType: "module_wine_cellar", primaryRoomTypes: KITCHEN },
  pantry_tall:         { defaultWidth: 0.6, widthOptions: [0.6, 0.8, 1.0], defaultDepth: 0.6, defaultHeight: 2.1, isFullHeight: true, allowsUpperAbove: false, label: "Despensa", furnitureType: "module_pantry_tall", primaryRoomTypes: KITCHEN },

  // ===== Banheiro =====
  vanity_sink_single:  { defaultWidth: 0.7, widthOptions: [0.6, 0.7, 0.8], defaultDepth: 0.5, defaultHeight: 0.8, isFullHeight: false, allowsUpperAbove: true, cutoutKind: "sink", label: "Vanity 1 cuba", furnitureType: "module_vanity_sink_single", primaryRoomTypes: BATH },
  vanity_sink_double:  { defaultWidth: 1.4, widthOptions: [1.2, 1.4, 1.6], defaultDepth: 0.5, defaultHeight: 0.8, isFullHeight: false, allowsUpperAbove: true, cutoutKind: "sink", label: "Vanity 2 cubas", furnitureType: "module_vanity_sink_double", primaryRoomTypes: BATH },
  vanity_drawer_3:     { defaultWidth: 0.5, widthOptions: [0.4, 0.5, 0.6], defaultDepth: 0.5, defaultHeight: 0.8, isFullHeight: false, allowsUpperAbove: true, label: "Gaveteiro banheiro", furnitureType: "module_vanity_drawer_3", primaryRoomTypes: BATH },
  wall_hung_toilet:    { defaultWidth: 0.4, widthOptions: [0.4], defaultDepth: 0.65, defaultHeight: 1.0, isFullHeight: false, allowsUpperAbove: false, label: "Vaso suspenso", furnitureType: "module_wall_hung_toilet", primaryRoomTypes: BATH },

  // ===== Closet =====
  closet_hanging_full:   { defaultWidth: 0.9, widthOptions: [0.6, 0.8, 0.9, 1.2], defaultDepth: 0.6, defaultHeight: 2.4, isFullHeight: true, allowsUpperAbove: false, label: "Cabide longo", furnitureType: "module_closet_hanging_full", primaryRoomTypes: CLOSET },
  closet_hanging_double: { defaultWidth: 0.9, widthOptions: [0.6, 0.8, 0.9, 1.2], defaultDepth: 0.6, defaultHeight: 2.4, isFullHeight: true, allowsUpperAbove: false, label: "Cabide duplo", furnitureType: "module_closet_hanging_double", primaryRoomTypes: CLOSET },
  closet_drawer_4:       { defaultWidth: 0.6, widthOptions: [0.5, 0.6, 0.8], defaultDepth: 0.6, defaultHeight: 1.2, isFullHeight: false, allowsUpperAbove: true, label: "Gaveteiro 4 (closet)", furnitureType: "module_closet_drawer_4", primaryRoomTypes: CLOSET },
  closet_drawer_6:       { defaultWidth: 0.6, widthOptions: [0.5, 0.6, 0.8], defaultDepth: 0.6, defaultHeight: 1.5, isFullHeight: false, allowsUpperAbove: true, label: "Gaveteiro 6 (closet)", furnitureType: "module_closet_drawer_6", primaryRoomTypes: CLOSET },
  closet_shoe:           { defaultWidth: 0.6, widthOptions: [0.4, 0.6, 0.8, 1.0], defaultDepth: 0.4, defaultHeight: 1.5, isFullHeight: false, allowsUpperAbove: true, label: "Sapateira", furnitureType: "module_closet_shoe", primaryRoomTypes: CLOSET },
  closet_shelves:        { defaultWidth: 0.6, widthOptions: [0.4, 0.6, 0.8], defaultDepth: 0.4, defaultHeight: 2.4, isFullHeight: true, allowsUpperAbove: false, label: "Prateleiras closet", furnitureType: "module_closet_shelves", primaryRoomTypes: CLOSET },
  closet_jewelry:        { defaultWidth: 0.45, widthOptions: [0.4, 0.45, 0.5], defaultDepth: 0.5, defaultHeight: 1.0, isFullHeight: false, allowsUpperAbove: true, label: "Gaveta de joias", furnitureType: "module_closet_jewelry", primaryRoomTypes: CLOSET },

  // ===== Lavanderia =====
  washer_niche:        { defaultWidth: 0.65, widthOptions: [0.6, 0.65, 0.7], defaultDepth: 0.65, defaultHeight: 0.95, isFullHeight: false, allowsUpperAbove: true, label: "Lavadora", furnitureType: "module_washer_niche", primaryRoomTypes: LAUNDRY },
  dryer_niche:         { defaultWidth: 0.65, widthOptions: [0.6, 0.65, 0.7], defaultDepth: 0.65, defaultHeight: 0.95, isFullHeight: false, allowsUpperAbove: true, label: "Secadora", furnitureType: "module_dryer_niche", primaryRoomTypes: LAUNDRY },
  washer_dryer_stack:  { defaultWidth: 0.65, widthOptions: [0.6, 0.65, 0.7], defaultDepth: 0.65, defaultHeight: 1.9, isFullHeight: true, allowsUpperAbove: false, label: "Lavadora+secadora vertical", furnitureType: "module_washer_dryer_stack", primaryRoomTypes: LAUNDRY },
  laundry_tank:        { defaultWidth: 0.6, widthOptions: [0.45, 0.5, 0.6], defaultDepth: 0.55, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "sink", label: "Tanque", furnitureType: "module_laundry_tank", primaryRoomTypes: LAUNDRY },
  drying_rack_built_in: { defaultWidth: 1.0, widthOptions: [0.8, 1.0, 1.2], defaultDepth: 0.5, defaultHeight: 0.05, isFullHeight: false, allowsUpperAbove: false, label: "Varal embutido", furnitureType: "module_drying_rack_built_in", primaryRoomTypes: LAUNDRY },

  // ===== Churrasqueira / gourmet =====
  bbq_built_in:        { defaultWidth: 0.8, widthOptions: [0.6, 0.8, 1.0], defaultDepth: 0.7, defaultHeight: 1.2, isFullHeight: false, allowsUpperAbove: false, label: "Churrasqueira", furnitureType: "module_bbq_built_in", primaryRoomTypes: GOURMET },
  pizza_oven:          { defaultWidth: 0.7, widthOptions: [0.6, 0.7, 0.8], defaultDepth: 0.7, defaultHeight: 1.2, isFullHeight: false, allowsUpperAbove: false, label: "Forno de pizza", furnitureType: "module_pizza_oven", primaryRoomTypes: GOURMET },
  outdoor_cooktop:     { defaultWidth: 0.75, widthOptions: [0.6, 0.75, 0.9], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "cooktop", label: "Cooktop externo", furnitureType: "module_outdoor_cooktop", primaryRoomTypes: GOURMET },
  outdoor_sink:        { defaultWidth: 0.6, widthOptions: [0.5, 0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, cutoutKind: "sink", label: "Cuba externa", furnitureType: "module_outdoor_sink", primaryRoomTypes: GOURMET },
  wine_fridge_outdoor: { defaultWidth: 0.6, widthOptions: [0.45, 0.6], defaultDepth: 0.6, defaultHeight: 0.85, isFullHeight: false, allowsUpperAbove: false, label: "Frigobar/adega externa", furnitureType: "module_wine_fridge_outdoor", primaryRoomTypes: GOURMET },

  // ===== Sala / TV =====
  tv_console:          { defaultWidth: 1.8, widthOptions: [1.5, 1.8, 2.1, 2.4], defaultDepth: 0.4, defaultHeight: 0.45, isFullHeight: false, allowsUpperAbove: false, label: "Console de TV", furnitureType: "module_tv_console", primaryRoomTypes: SALA },
  tv_panel_built_in:   { defaultWidth: 2.4, widthOptions: [1.8, 2.4, 3.0, 3.6], defaultDepth: 0.2, defaultHeight: 2.4, isFullHeight: true, allowsUpperAbove: false, label: "Painel de TV embutido", furnitureType: "module_tv_panel_built_in", primaryRoomTypes: SALA },
};

/** True when the module spans floor to ceiling and breaks the countertop. */
export function isFullHeightKind(kind: ModuleKind): boolean {
  return MODULE_DEFS[kind]?.isFullHeight ?? false;
}

/** True when an upper cabinet can sit above this module. */
export function allowsUpperAbove(kind: ModuleKind): boolean {
  return MODULE_DEFS[kind]?.allowsUpperAbove ?? false;
}

/** Returns the cutout kind ("sink" | "cooktop") if the module breaks the
 *  countertop surface; null otherwise. */
export function cutoutKind(kind: ModuleKind): "sink" | "cooktop" | null {
  return MODULE_DEFS[kind]?.cutoutKind ?? null;
}

/** Maps ModuleKind → FurnitureType for materialisation in the plan. */
export function moduleFurnitureType(kind: ModuleKind): FurnitureType {
  return MODULE_DEFS[kind].furnitureType;
}

/** All ModuleKinds suitable for a given room category — feeds RAG /
 *  prompt suggestions ("módulos de cozinha disponíveis"). */
export function modulesForRoom(roomType: "cozinha" | "banheiro" | "closet" | "lavanderia" | "gourmet" | "sala"): ModuleKind[] {
  return (Object.keys(MODULE_DEFS) as ModuleKind[]).filter((k) => {
    const def = MODULE_DEFS[k];
    return def.primaryRoomTypes.includes(roomType) || def.primaryRoomTypes.includes("qualquer");
  });
}

export const MODULE_KINDS: ModuleKind[] = Object.keys(MODULE_DEFS) as ModuleKind[];
