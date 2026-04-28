"use client";

// SVG-native tool layer. Thin React adapter over `lib/scene/drag-engine.ts`:
// converts pointer events to world coords via the supplied callback, drives
// the engine sessions, and exposes wall-draw preview state for the renderer.

import { useCallback, useEffect, useRef, useState } from "react";

import type { NodeId, Vec2 } from "@/lib/scene/types";
import { useSceneStore } from "@/lib/scene/store";
import {
  beginDimensionOffsetDrag,
  beginFurnitureDrag,
  beginOpeningSlide,
  beginWallEndpointDrag,
  beginWallTranslate,
  commitDrawWall,
  commitManualDimension,
  snapDrawPoint,
  type DimensionOffsetSession,
  type FurnitureDragSession,
  type OpeningSlideSession,
  type WallEditSession,
} from "@/lib/scene/drag-engine";
import { snapAngle } from "@/lib/scene/snap";

type ScreenToWorld = (clientX: number, clientY: number) => { x: number; z: number };

interface WallDrawState {
  phase: "idle" | "anchored";
  anchor?: Vec2;
}

interface DimensionDrawState {
  phase: "idle" | "anchored";
  anchor?: Vec2;
}

export interface SvgToolHandlers {
  beginFurnitureDrag: (id: NodeId, clientX: number, clientY: number) => void;
  beginOpeningSlide: (id: NodeId, clientX: number, clientY: number) => void;
  beginWallEndpointDrag: (id: NodeId, endpoint: "start" | "end", clientX: number, clientY: number) => void;
  beginWallTranslate: (id: NodeId, clientX: number, clientY: number) => void;
  beginDimensionOffsetDrag: (id: NodeId, clientX: number, clientY: number) => void;
  onSvgBackgroundClick: (clientX: number, clientY: number) => void;
  onSvgBackgroundMove: (clientX: number, clientY: number) => void;
  wallDraw: { state: WallDrawState; pointerWorld: Vec2 | null };
  dimensionDraw: { state: DimensionDrawState; pointerWorld: Vec2 | null };
}

export function useSvgTools(screenToWorld: ScreenToWorld): SvgToolHandlers {
  const furnitureRef = useRef<FurnitureDragSession | null>(null);
  const slideRef = useRef<OpeningSlideSession | null>(null);
  const wallEditRef = useRef<WallEditSession | null>(null);
  const dimRef = useRef<DimensionOffsetSession | null>(null);
  const [wallDrawState, setWallDrawState] = useState<WallDrawState>({ phase: "idle" });
  const [dimDrawState, setDimDrawState] = useState<DimensionDrawState>({ phase: "idle" });
  const [pointerWorld, setPointerWorld] = useState<Vec2 | null>(null);

  const tool = useSceneStore((s) => s.tool);

  // Reset transient draw state whenever the active tool changes away.
  useEffect(() => {
    if (tool !== "wall") setWallDrawState({ phase: "idle" });
    if (tool !== "dimension") setDimDrawState({ phase: "idle" });
    if (tool !== "wall" && tool !== "dimension") setPointerWorld(null);
  }, [tool]);

  // ESC to cancel any draw mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tool === "wall") setWallDrawState({ phase: "idle" });
      if (tool === "dimension") setDimDrawState({ phase: "idle" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  // Track Shift state to disable angular snap during the wall draw
  // preview when the user wants a free angle (Fase V).
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeldRef.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Global pointermove + pointerup so a drag survives leaving the SVG.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (furnitureRef.current) {
        furnitureRef.current.update(screenToWorld(e.clientX, e.clientY));
        return;
      }
      if (slideRef.current) {
        slideRef.current.update(screenToWorld(e.clientX, e.clientY));
        return;
      }
      if (wallEditRef.current) {
        wallEditRef.current.update(screenToWorld(e.clientX, e.clientY));
        return;
      }
      if (dimRef.current) {
        dimRef.current.update(screenToWorld(e.clientX, e.clientY));
        return;
      }
    };
    const onUp = () => {
      if (furnitureRef.current) {
        furnitureRef.current.commit();
        furnitureRef.current = null;
        document.body.style.cursor = "";
      }
      if (slideRef.current) {
        slideRef.current.commit();
        slideRef.current = null;
        document.body.style.cursor = "";
      }
      if (wallEditRef.current) {
        wallEditRef.current.commit();
        wallEditRef.current = null;
        document.body.style.cursor = "";
      }
      if (dimRef.current) {
        dimRef.current.commit();
        dimRef.current = null;
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

  const handleBeginFurnitureDrag = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      const session = beginFurnitureDrag(id, world);
      if (!session) return;
      furnitureRef.current = session;
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const handleBeginOpeningSlide = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      const session = beginOpeningSlide(id, world);
      if (!session) return;
      slideRef.current = session;
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const handleBeginWallEndpointDrag = useCallback(
    (id: NodeId, endpoint: "start" | "end", clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      const session = beginWallEndpointDrag(id, endpoint, world);
      if (!session) return;
      wallEditRef.current = session;
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const handleBeginWallTranslate = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      const session = beginWallTranslate(id, world);
      if (!session) return;
      wallEditRef.current = session;
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const handleBeginDimensionOffsetDrag = useCallback(
    (id: NodeId, clientX: number, clientY: number) => {
      const world = screenToWorld(clientX, clientY);
      const session = beginDimensionOffsetDrag(id, world);
      if (!session) return;
      dimRef.current = session;
      document.body.style.cursor = "grabbing";
    },
    [screenToWorld]
  );

  const onSvgBackgroundMove = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== "wall" && tool !== "dimension") return;
      let snapped = snapDrawPoint(screenToWorld(clientX, clientY));
      // Angular snap during the draw preview (Fase V). When the user has
      // already anchored the first click, lock the live segment to the
      // nearest 0°/45°/90° axis within ±5° unless Shift is held — same
      // behaviour as the eventual commit (snapAngle in commitDrawWall).
      const snapEnabled = useSceneStore.getState().snapEnabled;
      if (
        tool === "wall" &&
        wallDrawState.phase === "anchored" &&
        wallDrawState.anchor &&
        snapEnabled &&
        !shiftHeldRef.current
      ) {
        snapped = snapAngle(wallDrawState.anchor, snapped, 5);
      }
      setPointerWorld(snapped);
    },
    [tool, screenToWorld, wallDrawState],
  );

  const onSvgBackgroundClick = useCallback(
    (clientX: number, clientY: number) => {
      let snapped = snapDrawPoint(screenToWorld(clientX, clientY));

      if (tool === "wall") {
        if (wallDrawState.phase === "idle") {
          setWallDrawState({ phase: "anchored", anchor: snapped });
          return;
        }
        if (wallDrawState.phase === "anchored" && wallDrawState.anchor) {
          // Mirror the preview's angular snap so the committed wall ends
          // exactly where the ghost line was showing (Fase V).
          const snapEnabled = useSceneStore.getState().snapEnabled;
          if (snapEnabled && !shiftHeldRef.current) {
            snapped = snapAngle(wallDrawState.anchor, snapped, 5);
          }
          commitDrawWall(wallDrawState.anchor, snapped);
          setWallDrawState({ phase: "anchored", anchor: snapped });
        }
        return;
      }

      if (tool === "dimension") {
        // Two-click manual dimension. First click anchors the start, second
        // click commits a DimensionNode between the two snapped points.
        if (dimDrawState.phase === "idle") {
          setDimDrawState({ phase: "anchored", anchor: snapped });
          return;
        }
        if (dimDrawState.phase === "anchored" && dimDrawState.anchor) {
          commitManualDimension(dimDrawState.anchor, snapped);
          setDimDrawState({ phase: "idle" });
        }
      }
    },
    [tool, screenToWorld, wallDrawState, dimDrawState]
  );

  return {
    beginFurnitureDrag: handleBeginFurnitureDrag,
    beginOpeningSlide: handleBeginOpeningSlide,
    beginWallEndpointDrag: handleBeginWallEndpointDrag,
    beginWallTranslate: handleBeginWallTranslate,
    beginDimensionOffsetDrag: handleBeginDimensionOffsetDrag,
    onSvgBackgroundClick,
    onSvgBackgroundMove,
    wallDraw: { state: wallDrawState, pointerWorld: tool === "wall" ? pointerWorld : null },
    dimensionDraw: {
      state: dimDrawState,
      pointerWorld: tool === "dimension" ? pointerWorld : null,
    },
  };
}
