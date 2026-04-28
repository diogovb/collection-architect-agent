// Pure drag engine — no React, no R3F, no SVG. Both the 3D (R3F raycast)
// and 2D (SVG viewBox inverse) paths feed it world-space pointer coords and
// receive scene mutations via the SceneStore.
//
// Three drag types:
//  1. furniture  — translate a FurnitureNode, clamped to its parent room.
//  2. opening    — slide a Door/WindowNode along its wall, clamped + grid-snapped.
//  3. wall-draw  — anchor → click chain, creates WallNodes with snapping.
//
// Each platform-specific hook (R3F or SVG) wraps these primitives and supplies
// the correct screen→world conversion. Lifecycle: `begin*` returns a session
// with `update(world)` and `commit()` / `cancel()` methods. Pointer event
// listeners go through these.

import type {
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
import { clampToPolygon, snapToEndpoints, snapToGrid, snapVec2 } from "./snap";
import { runDerivation } from "./derive";
import { applyAutoDimensions } from "./auto-dimensions";
import { logEditOpening, logMove } from "./user-action-log";

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

  const update = (world: Vec2) => {
    const fNow = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
    if (!fNow) return;
    const raw = { x: world.x - offsetX, z: world.z - offsetZ };
    const corner = useSceneStore.getState().snapEnabled ? snapVec2(raw) : raw;
    let cornerX = corner.x;
    let cornerZ = corner.z;
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
        }
      }
    }
    useSceneStore
      .getState()
      .setLive(id, { position: { x: cornerX, y: fNow.position.y, z: cornerZ } });
  };

  const commit = () => {
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

const INTERNAL_THICKNESS = 0.10;
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
 *  rooms/slabs and refresh auto dimensions. Returns the new wall id. */
export function commitDrawWall(anchor: Vec2, end: Vec2): NodeId {
  const store = useSceneStore.getState();
  const newWall: WallNode = {
    id: newWallId(),
    type: "wall",
    parentId: store.activeLevelId,
    start: anchor,
    end,
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
