// Pure drag engine — no React, no SVG. The 2D path (SVG viewBox inverse,
// components/canvas/floorplan/use-svg-tools.ts) feeds it world-space pointer
// coords and receives scene mutations via the SceneStore.
//
// Three drag types:
//  1. furniture  — translate a FurnitureNode, clamped to its parent room.
//  2. opening    — slide a Door/WindowNode along its wall, clamped + grid-snapped.
//  3. wall-draw  — anchor → click chain, creates WallNodes with snapping.
//
// The SVG hook wraps these primitives and supplies the correct screen→world
// conversion. Lifecycle: `begin*` returns a session with `update(world)` and
// `commit()` / `cancel()` methods. Pointer event listeners go through these.

import type {
  DimensionNode,
  DoorNode,
  FurnitureNode,
  NodeId,
  RoomNode,
  Vec2,
  WallNode,
  WindowNode,
} from "./types";
import { pointInPolygon, v2Norm, v2Sub } from "./types";
import { useSceneStore } from "./store";
import { clampToPolygon, snapAngle, snapToEndpoints, snapToGrid, snapVec2 } from "./snap";
import { runDerivation } from "./derive";
import { applyAutoDimensions } from "./auto-dimensions";
import { logEditOpening, logMove } from "./user-action-log";
import { resolveCorner } from "./collision";
import { findJunction, JUNCTION_TOLERANCE } from "./junctions";
import { pushUndoSnapshot } from "./use-undo-redo";
import { INTERNAL_WALL_THICKNESS_M } from "./wall-constants";

// ---- Furniture drag --------------------------------------------------------

export interface FurnitureDragSession {
  update: (world: Vec2) => void;
  commit: () => void;
  cancel: () => void;
}

/** Begin dragging a furniture item. The pointer's world coords at grab time
 *  is recorded so the offset between pointer and furniture corner stays
 *  fixed for the duration of the drag. */
export function beginFurnitureDrag(
  id: NodeId,
  pointerWorld: Vec2
): FurnitureDragSession | null {
  const f = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
  if (!f) return null;
  const offsetX = pointerWorld.x - f.position.x;
  const offsetZ = pointerWorld.z - f.position.z;
  // Capture the pre-drag position so commit() can compute a Δ for the log.
  const startX = f.position.x;
  const startZ = f.position.z;
  const label = f.label || f.catalogId || "móvel";

  // Track the last position we let the move land on, so collision resolution
  // can bisect back toward it instead of teleporting through walls.
  let lastValidCorner: Vec2 = { x: startX, z: startZ };

  const update = (world: Vec2) => {
    const fNow = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
    if (!fNow) return;
    const raw = { x: world.x - offsetX, z: world.z - offsetZ };
    const corner = useSceneStore.getState().snapEnabled ? snapVec2(raw) : raw;

    // Wall collision (Fase 3A) — resolve the proposed corner against every
    // wall quad. Furniture is allowed to slide along a wall but cannot
    // overlap one. Bisection keeps the response smooth.
    const walls = Object.values(useSceneStore.getState().nodes).filter(
      (n) => n.type === "wall"
    ) as WallNode[];
    const resolved = resolveCorner(
      { x: corner.x, z: corner.z },
      lastValidCorner,
      fNow.dimensions,
      fNow.rotation || 0,
      walls
    );
    lastValidCorner = resolved;
    let cornerX = resolved.x;
    let cornerZ = resolved.z;

    if (fNow.roomId) {
      const room = useSceneStore.getState().nodes[fNow.roomId] as RoomNode | undefined;
      if (room) {
        const center = {
          x: cornerX + fNow.dimensions.x / 2,
          z: cornerZ + fNow.dimensions.z / 2,
        };
        if (!pointInPolygon(center, room.polygon)) {
          const c = clampToPolygon(center, room.polygon);
          cornerX = c.x - fNow.dimensions.x / 2;
          cornerZ = c.z - fNow.dimensions.z / 2;
          lastValidCorner = { x: cornerX, z: cornerZ };
        }
      }
    }
    useSceneStore
      .getState()
      .setLive(id, { position: { x: cornerX, y: fNow.position.y, z: cornerZ } });
  };

  const commit = () => {
    pushUndoSnapshot();
    const fAfter = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
    const live = useSceneStore.getState().liveTransforms.get(id);
    const finalX = live?.position?.x ?? fAfter?.position.x ?? startX;
    const finalZ = live?.position?.z ?? fAfter?.position.z ?? startZ;
    useSceneStore.getState().commitLive(id);
    const dx = finalX - startX;
    const dz = finalZ - startZ;
    if (Math.hypot(dx, dz) > 0.05) {
      logMove(label, `Δ ${dx >= 0 ? "+" : ""}${dx.toFixed(2)} m, ${dz >= 0 ? "+" : ""}${dz.toFixed(2)} m`);
    }
  };
  const cancel = () => useSceneStore.getState().clearLive(id);
  return { update, commit, cancel };
}

// ---- Opening slide ---------------------------------------------------------

export interface OpeningSlideSession {
  update: (world: Vec2) => void;
  commit: () => void;
  cancel: () => void;
}

/** Begin sliding a door/window along its wall. */
export function beginOpeningSlide(
  id: NodeId,
  pointerWorld: Vec2
): OpeningSlideSession | null {
  const opening = useSceneStore.getState().nodes[id] as DoorNode | WindowNode | undefined;
  if (!opening) return null;
  const wall = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
  if (!wall) return null;
  const dir = v2Norm(v2Sub(wall.end, wall.start));
  const startAlong =
    (pointerWorld.x - wall.start.x) * dir.x + (pointerWorld.z - wall.start.z) * dir.z;
  const startOffset = opening.offset;
  const kindLabel = opening.type === "door" ? "porta" : "janela";

  const update = (world: Vec2) => {
    const wNow = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
    if (!wNow) return;
    const oNow = useSceneStore.getState().nodes[id] as DoorNode | WindowNode | undefined;
    if (!oNow) return;
    const dirNow = v2Norm(v2Sub(wNow.end, wNow.start));
    const along =
      (world.x - wNow.start.x) * dirNow.x + (world.z - wNow.start.z) * dirNow.z;
    const delta = along - startAlong;
    const wallLen = Math.hypot(wNow.end.x - wNow.start.x, wNow.end.z - wNow.start.z);
    const half = oNow.width / 2;
    const rawOffset = startOffset + delta;
    const proposed = useSceneStore.getState().snapEnabled
      ? snapToGrid(rawOffset)
      : rawOffset;
    const clamped = Math.max(half, Math.min(wallLen - half, proposed));
    useSceneStore.getState().setLive(id, { offset: clamped });
  };

  const commit = () => {
    pushUndoSnapshot();
    const live = useSceneStore.getState().liveTransforms.get(id);
    const finalOffset = live?.offset ?? startOffset;
    useSceneStore.getState().commitLive(id);
    const delta = finalOffset - startOffset;
    if (Math.abs(delta) > 0.03) {
      logEditOpening(
        kindLabel,
        `posição ${startOffset.toFixed(2)} → ${finalOffset.toFixed(2)} m`
      );
    }
  };
  const cancel = () => useSceneStore.getState().clearLive(id);
  return { update, commit, cancel };
}

// ---- Wall draw -------------------------------------------------------------

const INTERNAL_THICKNESS = INTERNAL_WALL_THICKNESS_M;
const DEFAULT_HEIGHT = 2.8;

let _wallSeq = 0;
function newWallId(): string {
  _wallSeq += 1;
  return `wall:user-${Date.now().toString(36)}-${_wallSeq}`;
}

/** Snap a candidate point to existing wall endpoints, then to a 10 cm grid.
 *  Returns the input unchanged when snap is globally disabled. */
export function snapDrawPoint(p: Vec2): Vec2 {
  const state = useSceneStore.getState();
  if (!state.snapEnabled) return p;
  const walls = Object.values(state.nodes).filter(
    (n) => n.type === "wall"
  ) as WallNode[];
  return snapToEndpoints(snapVec2(p), walls, 0.20).snapped;
}

// ---- Wall endpoint + translate ---------------------------------------------

export interface WallEditSession {
  update: (world: Vec2) => void;
  commit: () => void;
  cancel: () => void;
}

/** Drag a single endpoint (start or end) of a wall.
 *
 *  Connected walls move together (Fase B): we snapshot every wall endpoint
 *  that shares this corner (within JUNCTION_TOLERANCE) and translate the
 *  whole group as one. Holding Alt isolates the drag to just the picked
 *  wall — useful when the user wants to detach a corner. The original
 *  remitering happens automatically because computeWallCorners reads
 *  from the live state. */
export function beginWallEndpointDrag(
  wallId: NodeId,
  endpoint: "start" | "end",
  pointerWorld: Vec2
): WallEditSession | null {
  const wall = useSceneStore.getState().nodes[wallId] as WallNode | undefined;
  if (!wall) return null;
  const originalEndpoint = endpoint === "start" ? { ...wall.start } : { ...wall.end };

  // Resolve every wall endpoint that lives at this corner. The picked
  // endpoint is always included; siblings get pulled along unless Alt is
  // held when the gesture starts. We capture the modifier each frame
  // (rather than at begin time) so the user can toggle mid-drag.
  const allWalls = Object.values(useSceneStore.getState().nodes).filter(
    (n) => n.type === "wall",
  ) as WallNode[];
  const junction = findJunction(allWalls, originalEndpoint, JUNCTION_TOLERANCE);
  // Members snapshot — the position each member started at, so we can
  // re-base each frame without accumulating numerical error.
  const memberStart = new Map<string, Vec2>(); // key = `${id}:${endpoint}`
  if (junction) {
    for (const m of junction.members) {
      const w = allWalls.find((x) => x.id === m.wallId);
      if (!w) continue;
      memberStart.set(
        `${m.wallId}:${m.endpoint}`,
        m.endpoint === "start" ? { ...w.start } : { ...w.end },
      );
    }
  }
  // Track Alt state — true while the modifier is held, false otherwise.
  let altHeld = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Alt") altHeld = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Alt") altHeld = false;
  };
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  const cleanupKeys = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };

  const update = (world: Vec2) => {
    const store = useSceneStore.getState();
    let snapped = store.snapEnabled
      ? { x: snapToGrid(world.x), z: snapToGrid(world.z) }
      : world;
    // Angular snap (0°/45°/90°) within 5° of an ortho/diagonal axis.
    // Anchor is the OTHER endpoint of the wall being dragged — we want
    // the segment (anchor → snapped) to lock onto a clean axis when we
    // are close enough. Junction siblings still move by the same Δ, so
    // their relative orientation is preserved.
    if (store.snapEnabled) {
      const anchor = endpoint === "start" ? wall.end : wall.start;
      snapped = snapAngle(anchor, snapped, 5);
    }
    // If junction exists and Alt is NOT pressed, move every member to the
    // new position — preserves connectivity. Otherwise only the picked
    // endpoint moves (detach).
    if (junction && !altHeld) {
      for (const m of junction.members) {
        store.setLive(m.wallId, { [m.endpoint]: snapped });
      }
    } else {
      store.setLive(wallId, { [endpoint]: snapped });
    }
  };

  const commit = () => {
    pushUndoSnapshot();
    cleanupKeys();
    const store = useSceneStore.getState();
    const live = store.liveTransforms.get(wallId);
    if (junction && !altHeld) {
      for (const m of junction.members) {
        store.commitLive(m.wallId);
      }
    } else {
      store.commitLive(wallId);
    }
    rederiveAfterWallChange();
    const next =
      endpoint === "start"
        ? (live?.start ?? originalEndpoint)
        : (live?.end ?? originalEndpoint);
    const dx = next.x - originalEndpoint.x;
    const dz = next.z - originalEndpoint.z;
    if (Math.hypot(dx, dz) > 0.05) {
      const groupSize = junction && !altHeld ? junction.members.length : 1;
      // Imported lazily so this module stays compatible with non-DOM uses.
      import("./user-action-log").then(({ logEditWall }) => {
        const suffix = groupSize > 1 ? ` (${groupSize} paredes em junção)` : "";
        logEditWall(`endpoint ${endpoint}: Δ ${dx.toFixed(2)} m, ${dz.toFixed(2)} m${suffix}`);
      });
    }
  };

  const cancel = () => {
    cleanupKeys();
    const store = useSceneStore.getState();
    if (junction && !altHeld) {
      for (const m of junction.members) {
        store.clearLive(m.wallId);
      }
    } else {
      store.clearLive(wallId);
    }
  };
  return { update, commit, cancel };
}

/** Translate the entire wall — both endpoints move in parallel. Useful for
 *  re-positioning a divider without disturbing the angle. */
export function beginWallTranslate(
  wallId: NodeId,
  pointerWorld: Vec2
): WallEditSession | null {
  const wall = useSceneStore.getState().nodes[wallId] as WallNode | undefined;
  if (!wall) return null;
  const startStart = { ...wall.start };
  const startEnd = { ...wall.end };
  const startCx = (startStart.x + startEnd.x) / 2;
  const startCz = (startStart.z + startEnd.z) / 2;
  const offsetX = pointerWorld.x - startCx;
  const offsetZ = pointerWorld.z - startCz;

  // Junction-aware translate (Fase P). Snapshot every neighbouring wall
  // endpoint that shares this wall's start or end so they translate by
  // the same Δ — without that the dragged wall "detaches" from its
  // junctions. Holding Alt isolates the translate to just this wall.
  const allWalls = Object.values(useSceneStore.getState().nodes).filter(
    (n) => n.type === "wall",
  ) as WallNode[];
  type Member = { wallId: NodeId; endpoint: "start" | "end"; origin: Vec2 };
  const collect = (point: Vec2): Member[] => {
    const j = findJunction(allWalls, point, JUNCTION_TOLERANCE);
    if (!j) return [];
    const out: Member[] = [];
    for (const m of j.members) {
      if (m.wallId === wallId) continue; // dragged wall handled separately
      const w = allWalls.find((x) => x.id === m.wallId);
      if (!w) continue;
      const origin = m.endpoint === "start" ? { ...w.start } : { ...w.end };
      out.push({ wallId: m.wallId, endpoint: m.endpoint, origin });
    }
    return out;
  };
  const startMembers = collect(startStart);
  const endMembers = collect(startEnd);

  let altHeld = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Alt") altHeld = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Alt") altHeld = false;
  };
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  const cleanupKeys = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };

  const update = (world: Vec2) => {
    const targetCx = world.x - offsetX;
    const targetCz = world.z - offsetZ;
    const dx = targetCx - startCx;
    const dz = targetCz - startCz;
    const store = useSceneStore.getState();
    const snap = store.snapEnabled;
    const sdx = snap ? snapToGrid(dx) : dx;
    const sdz = snap ? snapToGrid(dz) : dz;
    store.setLive(wallId, {
      start: { x: startStart.x + sdx, z: startStart.z + sdz },
      end: { x: startEnd.x + sdx, z: startEnd.z + sdz },
    });
    // Move junction siblings by the same Δ so connected walls stay
    // connected. Alt held → skip and let the wall detach.
    if (!altHeld) {
      for (const m of [...startMembers, ...endMembers]) {
        store.setLive(m.wallId, {
          [m.endpoint]: { x: m.origin.x + sdx, z: m.origin.z + sdz },
        });
      }
    }
  };

  const commit = () => {
    pushUndoSnapshot();
    cleanupKeys();
    const store = useSceneStore.getState();
    store.commitLive(wallId);
    if (!altHeld) {
      for (const m of [...startMembers, ...endMembers]) {
        store.commitLive(m.wallId);
      }
    }
    rederiveAfterWallChange();
    import("./user-action-log").then(({ logEditWall }) => {
      const groupSize = altHeld
        ? 1
        : 1 + startMembers.length + endMembers.length;
      const suffix = groupSize > 1 ? ` (${groupSize} paredes em junção)` : "";
      logEditWall(`translade da parede${suffix}`);
    });
  };

  const cancel = () => {
    cleanupKeys();
    const store = useSceneStore.getState();
    store.clearLive(wallId);
    for (const m of [...startMembers, ...endMembers]) {
      store.clearLive(m.wallId);
    }
  };
  return { update, commit, cancel };
}

// ---- Dimension offset drag -------------------------------------------------

export interface DimensionOffsetSession {
  update: (world: Vec2) => void;
  commit: () => void;
  cancel: () => void;
}

/** Drag a DimensionNode's offset (the perpendicular distance between the
 *  measurement line and the segment it annotates). Lets the user park a
 *  cota anywhere they want by clicking on it and dragging perpendicularly.
 *
 *  Implementation: project the pointer onto the perpendicular axis of the
 *  dim's segment; the projected scalar IS the new offset. We mutate the
 *  node directly (not via liveTransforms — those are reserved for walls /
 *  furniture). */
export function beginDimensionOffsetDrag(
  dimId: NodeId,
  pointerWorld: Vec2,
): DimensionOffsetSession | null {
  const store = useSceneStore.getState();
  const dim = store.nodes[dimId];
  if (!dim || dim.type !== "dimension") return null;
  const dx = dim.end.x - dim.start.x;
  const dz = dim.end.z - dim.start.z;
  const len = Math.hypot(dx, dz) || 1;
  // Perp matches lib/scene/types.ts:v2Perp = (x,z) -> (-z, x).
  const perpX = -dz / len;
  const perpZ = dx / len;
  // Midpoint of the measured segment — the perpendicular axis passes
  // through this point and the cota's offset is measured along it.
  const midX = (dim.start.x + dim.end.x) / 2;
  const midZ = (dim.start.z + dim.end.z) / 2;
  const startOffset = dim.offset;
  // Capture the offset between the pointer's projection and the current
  // dim line so the cota stays under the cursor as the drag moves.
  const grabProj = (pointerWorld.x - midX) * perpX + (pointerWorld.z - midZ) * perpZ;
  const grabDelta = grabProj - startOffset;

  const update = (world: Vec2) => {
    const proj = (world.x - midX) * perpX + (world.z - midZ) * perpZ;
    const next = proj - grabDelta;
    useSceneStore.getState().updateNode<DimensionNode>(dimId, { offset: next });
  };

  const commit = () => {
    pushUndoSnapshot();
    const next = useSceneStore.getState().nodes[dimId];
    if (next && next.type === "dimension" && Math.abs(next.offset - startOffset) > 0.05) {
      import("./user-action-log").then(({ logEditOpening }) => {
        // Reuse logEditOpening for the chat trail; it just emits a generic
        // "edição de cota" entry for the agent to read.
        logEditOpening("cota", `offset ${startOffset.toFixed(2)} → ${next.offset.toFixed(2)} m`);
      });
    }
  };

  const cancel = () => {
    useSceneStore.getState().updateNode<DimensionNode>(dimId, { offset: startOffset });
  };

  return { update, commit, cancel };
}

/** Re-run space detection + auto dimensions after any wall structural change.
 *  Keeps slabs/rooms/cotas consistent with the new geometry. */
function rederiveAfterWallChange() {
  const store = useSceneStore.getState();
  const out = runDerivation(store.nodes, store.activeLevelId);
  const walls = Object.values(out.nodes).filter((n) => n.type === "wall") as WallNode[];
  const withDims = applyAutoDimensions(out.nodes, walls);
  useSceneStore.setState({ nodes: withDims });
}

// ---- Manual dimension creation ---------------------------------------------

let _dimSeq = 0;
function newDimId(): string {
  _dimSeq += 1;
  return `dim:manual-${Date.now().toString(36)}-${_dimSeq}`;
}

/** Create a manual DimensionNode between two world points.
 *  Default offset = 0.6 m perpendicular to the line (Style Guide §8.4: 14 px
 *  internal, ~ 0.6 m externally). */
export function commitManualDimension(start: Vec2, end: Vec2): NodeId {
  const store = useSceneStore.getState();
  const id = newDimId();
  const node = {
    id,
    type: "dimension" as const,
    parentId: store.activeLevelId,
    start,
    end,
    offset: 0.6,
    scope: "manual" as const,
  };
  // The DimensionNode shape is defined in lib/scene/types.ts. Cast through
  // unknown so we can add it without re-importing the type here (the store's
  // addNode is generic over AnyNode).
  store.addNode(node as unknown as Parameters<typeof store.addNode>[0]);
  return id;
}

/** Commit a new wall from the anchor to the snapped end point, then re-derive
 *  rooms/slabs and refresh auto dimensions. Returns the new wall id.
 *
 *  Applies angular snap (0°/45°/90°, ±5° tolerance) when snapEnabled so
 *  freshly-drawn walls click into ortho or diagonal axes naturally. */
export function commitDrawWall(anchor: Vec2, end: Vec2): NodeId {
  pushUndoSnapshot();
  const store = useSceneStore.getState();
  const finalEnd = store.snapEnabled ? snapAngle(anchor, end, 5) : end;
  const newWall: WallNode = {
    id: newWallId(),
    type: "wall",
    parentId: store.activeLevelId,
    start: anchor,
    end: finalEnd,
    thickness: INTERNAL_THICKNESS,
    height: DEFAULT_HEIGHT,
    isExterior: false,
    doors: [],
    windows: [],
  };
  store.addNode(newWall);
  const allWalls = Object.values(store.nodes).filter(
    (n) => n.type === "wall"
  ) as WallNode[];
  const nextWalls = [...allWalls, newWall];
  const out = runDerivation(
    { ...store.nodes, [newWall.id]: newWall },
    store.activeLevelId
  );
  const withDims = applyAutoDimensions(out.nodes, nextWalls);
  useSceneStore.setState({ nodes: withDims });
  return newWall.id;
}
