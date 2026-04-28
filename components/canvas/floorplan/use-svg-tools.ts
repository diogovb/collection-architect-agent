"use client";

// SVG-native tool layer (Pascal-style separation: 2D doesn't go through R3F).
// Mirrors the behaviour of the R3F hooks (useFurnitureDrag, useOpeningSlide,
// useWallDrawTool) but consumes pointer events on a plain SVGSVGElement and
// converts coordinates via a `screenToWorld` callback supplied by the parent.
//
// The DOM hooks live on `window` (not the SVG) so a fast pointermove that
// leaves the SVG bounds doesn't drop the drag.

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DoorNode,
  FurnitureNode,
  NodeId,
  RoomNode,
  Vec2,
  WallNode,
  WindowNode,
} from "@/lib/scene/types";
import { pointInPolygon, v2Norm, v2Sub } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import { clampToPolygon, snapToEndpoints, snapToGrid, snapVec2 } from "@/lib/scene/snap";
import { runDerivation } from "@/lib/scene/derive";
import { applyAutoDimensions } from "@/lib/scene/auto-dimensions";

const INTERNAL_THICKNESS = 0.10;
const DEFAULT_HEIGHT = 2.8;

let _wallSeq = 0;
function newWallId(): string {
  _wallSeq += 1;
  return `wall:user-${Date.now().toString(36)}-${_wallSeq}`;
}

type ScreenToWorld = (clientX: number, clientY: number) => { x: number; z: number };

interface FurnitureDragState {
  id: NodeId;
  offsetX: number;
  offsetZ: number;
}

interface OpeningSlideState {
  id: NodeId;
  wallId: NodeId;
  startPointerAlong: number;
  startOffset: number;
}

interface WallDrawState {
  phase: "idle" | "anchored";
  anchor?: Vec2;
}

export interface SvgToolHandlers {
  /** Begin dragging a furniture item. Call from the furniture's onPointerDown. */
  beginFurnitureDrag: (id: NodeId, clientX: number, clientY: number) => void;
  /** Begin sliding a door/window along its wall. */
  beginOpeningSlide: (id: NodeId, clientX: number, clientY: number) => void;
  /** Click handler for the SVG background — feeds the wall-draw tool when active. */
  onSvgBackgroundClick: (clientX: number, clientY: number) => void;
  /** Move handler for the SVG background — drives wall-draw preview. */
  onSvgBackgroundMove: (clientX: number, clientY: number) => void;
  /** Current wall-draw preview (anchor + cursor world coord). */
  wallDraw: {
    state: WallDrawState;
    pointerWorld: Vec2 | null;
  };
}

export function useSvgTools(screenToWorld: ScreenToWorld): SvgToolHandlers {
  // ---- Furniture drag ----
  const furnitureRef = useRef<FurnitureDragState | null>(null);
  // ---- Opening slide ----
  const slideRef = useRef<OpeningSlideState | null>(null);
  // ---- Wall draw ----
  const [wallDrawState, setWallDrawState] = useState<WallDrawState>({ phase: "idle" });
  const [pointerWorld, setPointerWorld] = useState<Vec2 | null>(null);

  const tool = useSceneStore((s) => s.tool);

  // Reset wall-draw when leaving the tool.
  useEffect(() => {
    if (tool !== "wall") {
      setWallDrawState({ phase: "idle" });
      setPointerWorld(null);
    }
  }, [tool]);

  // ESC to cancel wall-draw.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tool === "wall") {
        setWallDrawState({ phase: "idle" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  // Global pointermove + pointerup for active drags.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // -- Furniture --
      if (furnitureRef.current) {
        const world = screenToWorld(e.clientX, e.clientY);
        const drag = furnitureRef.current;
        const f = useSceneStore.getState().nodes[drag.id] as FurnitureNode | undefined;
        if (!f) return;
        const newCorner = snapVec2({
          x: world.x - drag.offsetX,
          z: world.z - drag.offsetZ,
        });
        let cornerX = newCorner.x;
        let cornerZ = newCorner.z;
        if (f.roomId) {
          const room = useSceneStore.getState().nodes[f.roomId] as RoomNode | undefined;
          if (room) {
            const center = {
              x: cornerX + f.dimensions.x / 2,
              z: cornerZ + f.dimensions.z / 2,
            };
            if (!pointInPolygon(center, room.polygon)) {
              const c = clampToPolygon(center, room.polygon);
              cornerX = c.x - f.dimensions.x / 2;
              cornerZ = c.z - f.dimensions.z / 2;
            }
          }
        }
        useSceneStore
          .getState()
          .setLive(drag.id, { position: { x: cornerX, y: f.position.y, z: cornerZ } });
        return;
      }

      // -- Opening slide --
      if (slideRef.current) {
        const opening = useSceneStore.getState().nodes[slideRef.current.id] as
          | DoorNode
          | WindowNode
          | undefined;
        if (!opening) return;
        const wall = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
        if (!wall) return;
        const world = screenToWorld(e.clientX, e.clientY);
        const dir = v2Norm(v2Sub(wall.end, wall.start));
        const along =
          (world.x - wall.start.x) * dir.x + (world.z - wall.start.z) * dir.z;
        const delta = along - slideRef.current.startPointerAlong;
        const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
        const half = opening.width / 2;
        const proposed = snapToGrid(slideRef.current.startOffset + delta);
        const clamped = Math.max(half, Math.min(wallLen - half, proposed));
        useSceneStore.getState().setLive(slideRef.current.id, { offset: clamped });
        return;
      }
    };

    const onUp = () => {
      if (furnitureRef.current) {
        useSceneStore.getState().commitLive(furnitureRef.current.id);
        furnitureRef.current = null;
        document.body.style.cursor = "";
      }
      if (slideRef.current) {
        useSceneStore.getState().commitLive(slideRef.current.id);
        slideRef.current = null;
        document.body.style.cursor = "";
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [screenToWorld]);

  // ---- Public handlers ----

  const beginFurnitureDrag = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const f = useSceneStore.getState().nodes[id] as FurnitureNode | undefined;
      if (!f) return;
      const world = screenToWorld(clientX, clientY);
      furnitureRef.current = {
        id,
        offsetX: world.x - f.position.x,
        offsetZ: world.z - f.position.z,
      };
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const beginOpeningSlide = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const opening = useSceneStore.getState().nodes[id] as
        | DoorNode
        | WindowNode
        | undefined;
      if (!opening) return;
      const wall = useSceneStore.getState().nodes[opening.wallId] as WallNode | undefined;
      if (!wall) return;
      const world = screenToWorld(clientX, clientY);
      const dir = v2Norm(v2Sub(wall.end, wall.start));
      const along =
        (world.x - wall.start.x) * dir.x + (world.z - wall.start.z) * dir.z;
      slideRef.current = {
        id,
        wallId: wall.id,
        startPointerAlong: along,
        startOffset: opening.offset,
      };
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const onSvgBackgroundMove = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall") return;
      const world = screenToWorld(clientX, clientY);
      const walls = Object.values(useSceneStore.getState().nodes).filter(
        (n) => n.type === "wall"
      ) as WallNode[];
      const snapped = snapToEndpoints(snapVec2(world), walls, 0.20).snapped;
      setPointerWorld(snapped);
    },
    [tool, screenToWorld]
  );

  const onSvgBackgroundClick = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall") return;
      const world = screenToWorld(clientX, clientY);
      const walls = Object.values(useSceneStore.getState().nodes).filter(
        (n) => n.type === "wall"
      ) as WallNode[];
      const snapped = snapToEndpoints(snapVec2(world), walls, 0.20).snapped;

      if (wallDrawState.phase === "idle") {
        setWallDrawState({ phase: "anchored", anchor: snapped });
        return;
      }
      if (wallDrawState.phase === "anchored" && wallDrawState.anchor) {
        const newWall: WallNode = {
          id: newWallId(),
          type: "wall",
          parentId: useSceneStore.getState().activeLevelId,
          start: wallDrawState.anchor,
          end: snapped,
          thickness: INTERNAL_THICKNESS,
          height: DEFAULT_HEIGHT,
          isExterior: false,
          doors: [],
          windows: [],
        };
        const store = useSceneStore.getState();
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
        // Chain: anchor at endpoint so the next click extends the wall run.
        setWallDrawState({ phase: "anchored", anchor: snapped });
      }
    },
    [tool, screenToWorld, wallDrawState]
  );

  return {
    beginFurnitureDrag,
    beginOpeningSlide,
    onSvgBackgroundClick,
    onSvgBackgroundMove,
    wallDraw: { state: wallDrawState, pointerWorld },
  };
}
