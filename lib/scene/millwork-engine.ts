// Engine for `add_millwork_run` / `remove_millwork_run` / `update_millwork_module`.
//
// Composes a continuous millwork installation along a wall (or freestanding)
// from an ordered sequence of modules. Generates Furniture entries per
// module + a single `bancada_continuous` entry spanning the run + auto
// upper cabinets above non-tall modules + a hood over cooktop when asked.
//
// Why a separate file: the run handler is the most complex piece of the
// engine and easily eclipses doAddFurniture in lines. Keeping it here
// keeps `floor-plan-engine.ts` readable.

import type {
  CountertopMaterial,
  FloorPlan,
  Furniture,
  MillworkModule,
  MillworkRun,
  ModuleKind,
  RunType,
  Wall,
  ToolInputs,
} from "../types";
import type { ApplyResult } from "../floor-plan-engine";
import { MODULE_DEFS, isFullHeightKind, allowsUpperAbove, cutoutKind, moduleFurnitureType } from "../millwork-modules";
import {
  doorApproachRects,
  doorCoverageFraction,
  openingInterval,
  openingsOverlap1D,
  spanInterval,
  usableRect,
  wallSideLabel,
} from "../plan-geometry";

const RUN_DEFAULTS: {
  lowerHeight: Record<RunType, number>;
  upperOffset: number;
  upperHeight: number;
  countertopThickness: number;
  countertopDepth: number;
  upperDepth: number;
  hoodHeight: number;
} = {
  lowerHeight: {
    kitchen_counter: 0.9,
    bathroom_vanity: 0.85,
    closet: 2.4,
    laundry_counter: 0.9,
    bbq_counter: 0.9,
    tv_wall: 0.45,
    library: 2.4,
    custom: 0.9,
  },
  upperOffset: 0.55,
  upperHeight: 0.7,
  countertopThickness: 0.04,
  countertopDepth: 0.62,
  upperDepth: 0.35,
  hoodHeight: 0.5,
};

let runIdCounter = 0;
function nextRunId(): string {
  runIdCounter++;
  return `run:${runIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

let furnIdCounter = 0;
function nextFurnId(): string {
  furnIdCounter++;
  return `furn-mw-${furnIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function findRoom(plan: FloorPlan, name: string) {
  const ln = name.trim().toLowerCase();
  return plan.rooms.find((r) => r.name.trim().toLowerCase() === ln);
}

/** Length of a wall segment of the room, in metres. */
function wallLength(room: { width: number; height: number }, wall: Wall): number {
  return wall === "north" || wall === "south" ? room.width : room.height;
}

/** Compute the absolute `(x, y)` for the start corner of a module given
 *  its accumulated offset along the wall. The "start" of the run is the
 *  first wall-direction vertex (NW for north wall, NE for east wall, etc.). */
function computeModulePosition(
  room: { x: number; y: number; width: number; height: number },
  wall: Wall,
  offsetAlong: number, // metres from run start
  moduleWidth: number,
  moduleDepth: number,
): { x: number; y: number; width: number; height: number } {
  // Convention: along the wall, the run progresses in increasing world coord:
  //   north → x grows from room.x to room.x + room.width
  //   south → x grows
  //   west  → y grows
  //   east  → y grows
  // The bbox sticks against the wall on the side opposite from where the
  // user looks into the room. For floor plan rendering:
  //   north wall → bbox top edge at y = room.y, depth grows down (south)
  //   south wall → bbox bottom edge at y = room.y + room.height, depth grows up (north)
  //   west wall  → bbox left edge at x = room.x, depth grows right (east)
  //   east wall  → bbox right edge at x = room.x + room.width, depth grows left (west)
  if (wall === "north") {
    return {
      x: room.x + offsetAlong,
      y: room.y,
      width: moduleWidth,
      height: moduleDepth,
    };
  }
  if (wall === "south") {
    return {
      x: room.x + offsetAlong,
      y: room.y + room.height - moduleDepth,
      width: moduleWidth,
      height: moduleDepth,
    };
  }
  if (wall === "west") {
    return {
      x: room.x,
      y: room.y + offsetAlong,
      width: moduleDepth,
      height: moduleWidth,
    };
  }
  // east
  return {
    x: room.x + room.width - moduleDepth,
    y: room.y + offsetAlong,
    width: moduleDepth,
    height: moduleWidth,
  };
}

/** Compute bbox for the bancada/countertop spanning the entire run. The
 *  countertop sits ON TOP of the lower modules — in plan view, that's a
 *  thin strip at the FRONT edge of the modules (the side facing the
 *  room). Its length matches the sum of module widths along the wall;
 *  its depth is the countertop depth. */
function countertopBbox(
  room: { x: number; y: number; width: number; height: number },
  wall: Wall,
  startOffset: number,
  totalLength: number,
  countertopDepth: number,
): { x: number; y: number; width: number; height: number } {
  if (wall === "north") {
    return {
      x: room.x + startOffset,
      y: room.y,
      width: totalLength,
      height: countertopDepth,
    };
  }
  if (wall === "south") {
    return {
      x: room.x + startOffset,
      y: room.y + room.height - countertopDepth,
      width: totalLength,
      height: countertopDepth,
    };
  }
  if (wall === "west") {
    return {
      x: room.x,
      y: room.y + startOffset,
      width: countertopDepth,
      height: totalLength,
    };
  }
  return {
    x: room.x + room.width - countertopDepth,
    y: room.y + startOffset,
    width: countertopDepth,
    height: totalLength,
  };
}

interface NormalizedModule extends MillworkModule {
  defaultDepth: number;
  isFullHeight: boolean;
  allowsUpper: boolean;
  cutoutKind: "sink" | "cooktop" | null;
}

/** Fills in defaults for a user-supplied module list. Throws on unknown
 *  kinds or invalid widths. */
function normalizeModules(modules: MillworkModule[]): NormalizedModule[] {
  return modules.map((m) => {
    const def = MODULE_DEFS[m.kind];
    if (!def) throw new Error(`Módulo desconhecido: ${m.kind}`);
    const width = m.width && m.width > 0 ? m.width : def.defaultWidth;
    return {
      ...m,
      width,
      defaultDepth: def.defaultDepth,
      isFullHeight: def.isFullHeight,
      allowsUpper: def.allowsUpperAbove,
      cutoutKind: def.cutoutKind ?? null,
    };
  });
}

export function doAddMillworkRun(plan: FloorPlan, input: ToolInputs["add_millwork_run"]): ApplyResult {
  const room = findRoom(plan, input.room_name);
  if (!room) return { ok: false, message: `Cômodo '${input.room_name}' não encontrado.` };
  if (input.wall === "freestanding") {
    return { ok: false, message: "Runs freestanding não são suportados ainda — use uma parede (north/south/east/west)." };
  }
  const wall = input.wall as Wall;
  if (!Array.isArray(input.modules) || input.modules.length === 0) {
    return { ok: false, message: "Lista de módulos vazia." };
  }
  const normalized = (() => {
    try {
      return normalizeModules(input.modules);
    } catch (e) {
      throw new Error(`add_millwork_run: ${(e as Error).message}`);
    }
  })();
  const totalLength = normalized.reduce((s, m) => s + m.width, 0);
  const startOffset = input.start_offset ?? 0;
  // Área útil: módulos e bancada encostam na FACE INTERNA das paredes (o
  // retângulo "innerRoom" abaixo substitui o retângulo cheio em todos os
  // cálculos de posição). Os checks 1D de porta/janela continuam em coords
  // de mundo — por isso o shift `startInsetAlong`.
  const usable = usableRect(plan, room);
  const innerRoom = { x: usable.x, y: usable.y, width: usable.w, height: usable.h };
  const startInsetAlong = wall === "north" || wall === "south" ? usable.x - room.x : usable.y - room.y;
  const wallLen = wallLength(innerRoom, wall);
  if (startOffset + totalLength > wallLen + 0.001) {
    return {
      ok: false,
      message: `Run não cabe na parede ${wall} de '${room.name}': run = ${totalLength.toFixed(2)}m + offset ${startOffset.toFixed(2)}m, mas a parede tem ${wallLen.toFixed(2)}m úteis (descontando paredes laterais).`,
    };
  }

  // A bancada não pode cobrir uma porta — nem a do próprio cômodo nem a do
  // vizinho que compartilha a parede (comparação 1D no espaço do mundo).
  const runSpan = spanInterval(room, wall, startInsetAlong + startOffset, totalLength);
  for (const d of plan.doors) {
    const dRoom = plan.rooms.find((r) => r.id === d.roomId);
    if (!dRoom) continue;
    const di = openingInterval(dRoom, d.wall, d.position, d.size);
    if (openingsOverlap1D(runSpan, di) > 0) {
      const doorCenterAlong =
        (di.start + di.end) / 2 - (wall === "north" || wall === "south" ? room.x : room.y);
      return {
        ok: false,
        message:
          `A bancada cobriria a porta de '${dRoom.name}' na parede ${wallSideLabel(wall)} ` +
          `(centro a ${doorCenterAlong.toFixed(2)}m do início da parede). ` +
          `Reduza os módulos, use start_offset para começar depois da porta, ou use outra parede.`,
      };
    }
  }

  // Porta em parede PERPENDICULAR perto do canto: o run tem ~0,65m de fundo
  // e pode invadir o corredor de chegada dela (regra graduada de 50% — run
  // que apenas tangencia o corredor passa e vira no máximo aviso de cena).
  {
    const footprint = countertopBbox(innerRoom, wall, startOffset, totalLength, RUN_DEFAULTS.countertopDepth);
    const approaches = doorApproachRects(plan, room);
    for (const a of approaches) {
      const frac = doorCoverageFraction(
        { x: footprint.x, y: footprint.y, w: footprint.width, h: footprint.height },
        a
      );
      if (frac >= 0.5) {
        return {
          ok: false,
          message:
            `O run bloquearia a chegada da porta na parede ${wallSideLabel(a.side)} de '${room.name}' ` +
            `(cobre ${Math.round(frac * 100)}% do vão no canto). ` +
            `Use start_offset para afastar o run do canto da porta, reduza os módulos ou use outra parede.`,
        };
      }
    }
  }

  // Módulos altos (despensa, torre de forno) na frente de janela: aviso.
  const windowWarnings: string[] = [];
  {
    let probe = startOffset;
    for (const m of normalized) {
      if (m.isFullHeight) {
        const mSpan = spanInterval(room, wall, startInsetAlong + probe, m.width);
        for (const w of plan.windows) {
          const wRoom = plan.rooms.find((r) => r.id === w.roomId);
          if (!wRoom) continue;
          if (openingsOverlap1D(mSpan, openingInterval(wRoom, w.wall, w.position, w.size)) > 0) {
            windowWarnings.push(
              `${m.label ?? MODULE_DEFS[m.kind].label} (módulo alto) cobre a janela da parede ${wallSideLabel(wall)}`
            );
          }
        }
      }
      probe += m.width;
    }
  }

  const runType: RunType = input.type ?? "custom";
  const lowerHeight = input.lower_height ?? RUN_DEFAULTS.lowerHeight[runType] ?? 0.9;

  const finishBody = input.finish?.body_material ?? "MDF_branco";
  const finishDoor = input.finish?.door_style ?? "flat";
  const finishHandle = input.finish?.handle_style ?? "bar_horizontal";

  // The output array. We push in RENDER ORDER — earlier items go below,
  // later items paint on top. So:
  //   1) bancada (deepest visual layer, hatched stone)
  //   2) lower modules (cooktop/sink/fridge with their SVG paths)
  //   3) uppers (suspended, dashed)
  //   4) hood (suspended, on top)
  const newFurniture: Furniture[] = [];

  // Generate countertop spanning the run FIRST so modules paint on top.
  const hasNonFullHeight = normalized.some((m) => !m.isFullHeight);
  const wantCountertop = !!input.countertop || (runType !== "closet" && hasNonFullHeight);
  let countertopFurniture: Furniture | null = null;
  if (wantCountertop && hasNonFullHeight) {
    const ctMaterial: CountertopMaterial = input.countertop?.material ?? "granito_preto";
    const ctBbox = countertopBbox(innerRoom, wall, startOffset, totalLength, RUN_DEFAULTS.countertopDepth);
    const cutouts: NonNullable<Furniture["cutouts"]> = [];
    let runOffset = 0;
    for (const m of normalized) {
      if (m.cutoutKind && !m.isFullHeight) {
        cutouts.push({ offset: runOffset + 0.05, width: Math.max(0.1, m.width - 0.1), kind: m.cutoutKind });
      }
      runOffset += m.width;
    }
    countertopFurniture = {
      id: nextFurnId(),
      roomId: room.id,
      type: "bancada_continuous",
      label: `Bancada ${ctMaterial}`,
      x: Math.round(ctBbox.x * 100) / 100,
      y: Math.round(ctBbox.y * 100) / 100,
      width: ctBbox.width,
      height: ctBbox.height,
      finish: { countertopMaterial: ctMaterial },
      cutouts,
    };
    newFurniture.push(countertopFurniture);
  }

  // Now lower modules in order.
  let cursor = startOffset;
  for (const m of normalized) {
    const ftype = moduleFurnitureType(m.kind);
    const bbox = computeModulePosition(innerRoom, wall, cursor, m.width, m.defaultDepth);
    const item: Furniture = {
      id: nextFurnId(),
      roomId: room.id,
      type: ftype,
      label: m.label ?? MODULE_DEFS[m.kind].label,
      x: Math.round(bbox.x * 100) / 100,
      y: Math.round(bbox.y * 100) / 100,
      width: bbox.width,
      height: bbox.height,
      finish: {
        bodyMaterial: finishBody,
        doorStyle: finishDoor,
        handleStyle: finishHandle,
      },
    };
    newFurniture.push(item);
    cursor += m.width;
  }

  // Generate upper cabinets if "auto". Skip above full-height modules,
  // above sink/cooktop (where window or hood goes), above modules the
  // caller marked with `window_above`, and above any span that overlaps a
  // window on this wall line — um armário superior na frente da janela
  // disparava WINDOW_BLOCKED sem remediação possível.
  const upperPolicy = input.upper_cabinets ?? (runType === "kitchen_counter" ? "auto" : "none");
  const overlapsWindow = (offsetAlong: number, width: number): boolean => {
    const span = spanInterval(room, wall, startInsetAlong + offsetAlong, width);
    for (const w of plan.windows) {
      const wRoom = plan.rooms.find((r) => r.id === w.roomId);
      if (!wRoom) continue;
      if (openingsOverlap1D(span, openingInterval(wRoom, w.wall, w.position, w.size)) > 0) return true;
    }
    return false;
  };
  if (upperPolicy === "auto") {
    cursor = startOffset;
    for (let i = 0; i < normalized.length; i++) {
      const m = normalized[i];
      const skipUpper =
        !m.allowsUpper ||
        m.isFullHeight ||
        m.cutoutKind === "sink" ||
        m.cutoutKind === "cooktop" ||
        m.window_above === true ||
        overlapsWindow(cursor, m.width);
      if (!skipUpper) {
        const upperType = m.kind === "cabinet_glass" ? "module_upper_glass" : "module_upper_cabinet";
        const upperBbox = computeModulePosition(innerRoom, wall, cursor, m.width, RUN_DEFAULTS.upperDepth);
        newFurniture.push({
          id: nextFurnId(),
          roomId: room.id,
          type: upperType,
          label: "Sup",
          x: Math.round(upperBbox.x * 100) / 100,
          y: Math.round(upperBbox.y * 100) / 100,
          width: upperBbox.width,
          height: upperBbox.height,
          finish: { bodyMaterial: finishBody, doorStyle: finishDoor },
        });
      }
      cursor += m.width;
    }
  }

  // Hood over cooktop where requested.
  cursor = startOffset;
  for (const m of normalized) {
    if (m.hood_above && (m.kind === "cooktop_4" || m.kind === "cooktop_5" || m.kind === "cooktop_induction" || m.kind === "outdoor_cooktop")) {
      const hoodBbox = computeModulePosition(innerRoom, wall, cursor, m.width, RUN_DEFAULTS.hoodHeight);
      newFurniture.push({
        id: nextFurnId(),
        roomId: room.id,
        type: "hood_built_in",
        label: "Exaustor",
        x: Math.round(hoodBbox.x * 100) / 100,
        y: Math.round(hoodBbox.y * 100) / 100,
        width: hoodBbox.width,
        height: hoodBbox.height,
      });
    }
    cursor += m.width;
  }

  // Persist run record + tag every materialised furniture with runId.
  const run: MillworkRun = {
    id: nextRunId(),
    roomId: room.id,
    wall,
    startOffset,
    type: runType,
    modules: normalized.map((m) => ({ kind: m.kind, width: m.width, label: m.label, hood_above: m.hood_above, window_above: m.window_above })),
    countertop: input.countertop
      ? {
          material: input.countertop.material ?? "granito_preto",
          overhangFront: input.countertop.overhang_front ?? 0.02,
          hasBacksplash: input.countertop.has_backsplash ?? true,
        }
      : undefined,
    upperCabinets: input.upper_cabinets ?? "auto",
    lowerHeight,
    upperOffset: input.upper_offset ?? RUN_DEFAULTS.upperOffset,
    upperHeight: input.upper_height ?? RUN_DEFAULTS.upperHeight,
    finish: { bodyMaterial: finishBody, doorStyle: finishDoor, handleStyle: finishHandle },
  };
  for (const f of newFurniture) f.runId = run.id;
  if (!plan.millworkRuns) plan.millworkRuns = [];
  plan.millworkRuns.push(run);
  plan.furniture.push(...newFurniture);

  const moduleSummary = normalized.map((m) => `${MODULE_DEFS[m.kind].label}(${m.width.toFixed(2)}m)`).join(" + ");
  const ctTag = countertopFurniture ? ` + bancada ${countertopFurniture.label.replace("Bancada ", "")}` : "";
  const warnTag = windowWarnings.length > 0 ? ` Atenção: ${windowWarnings.join("; ")}.` : "";
  return {
    ok: true,
    message: `Run '${run.id}' criado em '${room.name}' (parede ${wall}, ${totalLength.toFixed(2)}m): ${moduleSummary}${ctTag}.${warnTag}`,
  };
}

export function doRemoveMillworkRun(plan: FloorPlan, input: ToolInputs["remove_millwork_run"]): ApplyResult {
  if (!plan.millworkRuns?.length) return { ok: false, message: "Nenhum run existente." };
  const idx = plan.millworkRuns.findIndex((r) => r.id === input.run_id);
  if (idx < 0) return { ok: false, message: `Run '${input.run_id}' não encontrado.` };
  const run = plan.millworkRuns[idx];
  const before = plan.furniture.length;
  plan.furniture = plan.furniture.filter((f) => f.runId !== run.id);
  plan.millworkRuns.splice(idx, 1);
  const removed = before - plan.furniture.length;
  return { ok: true, message: `Run '${run.id}' removido (${removed} módulos/itens deletados).` };
}

export function doUpdateMillworkModule(plan: FloorPlan, input: ToolInputs["update_millwork_module"]): ApplyResult {
  if (!plan.millworkRuns?.length) return { ok: false, message: "Nenhum run existente." };
  const run = plan.millworkRuns.find((r) => r.id === input.run_id);
  if (!run) return { ok: false, message: `Run '${input.run_id}' não encontrado.` };
  if (input.module_index < 0 || input.module_index >= run.modules.length) {
    return { ok: false, message: `Módulo index ${input.module_index} fora do range (0..${run.modules.length - 1}).` };
  }
  // Simplest approach: mutate run.modules, then re-materialize the entire
  // run. That keeps cutouts + uppers + hood consistent.
  if (input.kind) run.modules[input.module_index].kind = input.kind as ModuleKind;
  if (typeof input.width === "number" && input.width > 0) run.modules[input.module_index].width = input.width;

  // Wipe existing materialisation for this run, then re-add.
  plan.furniture = plan.furniture.filter((f) => f.runId !== run.id);
  return doAddMillworkRun(plan, {
    room_name: plan.rooms.find((r) => r.id === run.roomId)?.name ?? "",
    wall: run.wall === "freestanding" ? "freestanding" : run.wall,
    start_offset: run.startOffset,
    type: run.type,
    modules: run.modules,
    countertop: run.countertop ? { material: run.countertop.material, overhang_front: run.countertop.overhangFront, has_backsplash: run.countertop.hasBacksplash } : undefined,
    upper_cabinets: run.upperCabinets,
    lower_height: run.lowerHeight,
    upper_offset: run.upperOffset,
    upper_height: run.upperHeight,
    finish: {
      body_material: run.finish.bodyMaterial,
      door_style: run.finish.doorStyle,
      handle_style: run.finish.handleStyle,
    },
  });
}
