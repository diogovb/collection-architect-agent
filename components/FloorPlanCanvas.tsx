"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Door,
  FloorPlan,
  Furniture,
  Room,
  SelectedElement,
  Wall,
  Window as PlanWindow,
} from "@/lib/types";

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onSelect: (sel: SelectedElement | null) => void;
  onUpdateFurniture: (id: string, patch: Partial<Furniture>) => void;
  onUpdateRoom: (id: string, patch: Partial<Room>) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

const PX_PER_M = 40;
const GRID_M = 0.5;
const SNAP_M = 0.1;
const WALL_PX = 4;
const WALL_HIT_TOLERANCE_PX = 6;
const MIN_ROOM_M = 1.5;

const FLOOR_COLORS = {
  madeira: { base: "#3d2a1f", accent: "#5a3d2b" },
  porcelanato: { base: "#e6e6e6", accent: "#cfcfcf" },
  ceramica: { base: "#d2cfc6", accent: "#bab6ab" },
  marmore: { base: "#f5f3ee", accent: "#d8d4ca" },
} as const;

const CORRIDOR_RX = /(corredor|hall|circula)/i;
function isCorridorRoom(name: string): boolean {
  return CORRIDOR_RX.test(name);
}

// Internal interaction state
type Interaction =
  | { kind: "idle" }
  | {
      kind: "pan";
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      kind: "drag-furniture";
      id: string;
      startMouseM: { x: number; y: number };
      startPos: { x: number; y: number };
      ghost: { x: number; y: number };
    }
  | {
      kind: "resize-wall";
      roomId: string;
      wall: Wall;
      startMouseM: { x: number; y: number };
      startRoom: { x: number; y: number; width: number; height: number };
      live: { x: number; y: number; width: number; height: number };
    };

type CursorHover =
  | { kind: "none" }
  | { kind: "furniture"; id: string }
  | { kind: "wall"; roomId: string; wall: Wall };

interface ContextMenuState {
  x: number;
  y: number;
  target: SelectedElement;
}

export function FloorPlanCanvas({
  plan,
  selected,
  onSelect,
  onUpdateFurniture,
  onUpdateRoom,
  onDeleteSelected,
  onClearSelection,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const interactionRef = useRef<Interaction>({ kind: "idle" });
  // Force redraw when interactionRef live state changes
  const [interactionTick, setInteractionTick] = useState(0);
  const bumpInteraction = () => setInteractionTick((n) => n + 1);

  const [hover, setHover] = useState<CursorHover>({ kind: "none" });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // refs to keep the latest values in event listeners
  const planRef = useRef(plan);
  planRef.current = plan;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Track local "appear" progress per room id for the entrance animation.
  const appearRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(200, cr.width), h: Math.max(200, cr.height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Auto-fit when plan bounding box changes substantially
  const planBounds = useMemo(() => bounds(plan), [plan]);
  useEffect(() => {
    if (!planBounds) return;
    const padding = 40;
    const usableW = size.w - padding * 2;
    const usableH = size.h - padding * 2;
    const planWpx = planBounds.w * PX_PER_M;
    const planHpx = planBounds.h * PX_PER_M;
    if (planWpx <= 0 || planHpx <= 0) return;
    const z = Math.min(usableW / planWpx, usableH / planHpx, 1.6);
    setZoom(z);
    setPan({
      x: size.w / 2 - (planBounds.x + planBounds.w / 2) * PX_PER_M * z,
      y: size.h / 2 - (planBounds.y + planBounds.h / 2) * PX_PER_M * z,
    });
  }, [planBounds?.signature, size.w, size.h]);

  // Animate appear values toward 1
  useEffect(() => {
    let lastTs = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      let needsMore = false;
      for (const r of plan.rooms) {
        const cur = appearRef.current[r.id] ?? 0;
        if (cur < 1) {
          appearRef.current[r.id] = Math.min(1, cur + dt * 2.5);
          needsMore = true;
        }
      }
      for (const id of Object.keys(appearRef.current)) {
        if (!plan.rooms.find((r) => r.id === id)) delete appearRef.current[id];
      }
      draw();
      if (needsMore) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, size, zoom, pan, selected, hover, interactionTick]);

  // ----- Coordinate transforms -----
  function clientToWorldM(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const wxPx = (cx - panRef.current.x) / zoomRef.current;
    const wyPx = (cy - panRef.current.y) / zoomRef.current;
    return { x: wxPx / PX_PER_M, y: wyPx / PX_PER_M };
  }

  function snap(v: number): number {
    return Math.round(v / SNAP_M) * SNAP_M;
  }

  // ----- Hit testing (in world meters) -----
  function hitTest(mx: number, my: number): {
    target:
      | { kind: "furniture"; id: string }
      | { kind: "wall"; roomId: string; wall: Wall }
      | { kind: "door"; id: string }
      | { kind: "window"; id: string }
      | { kind: "room"; id: string }
      | null;
  } {
    const tolM = WALL_HIT_TOLERANCE_PX / (zoomRef.current * PX_PER_M);
    const p = planRef.current;

    // 1) furniture (top of stack)
    for (let i = p.furniture.length - 1; i >= 0; i--) {
      const f = p.furniture[i];
      if (mx >= f.x && mx <= f.x + f.width && my >= f.y && my <= f.y + f.height) {
        return { target: { kind: "furniture", id: f.id } };
      }
    }

    // 2) doors / windows (near a wall, within size span)
    for (const d of p.doors) {
      const r = p.rooms.find((rr) => rr.id === d.roomId);
      if (!r) continue;
      if (pointNearOpening(mx, my, r, d.wall, d.position, d.size, tolM)) {
        return { target: { kind: "door", id: d.id } };
      }
    }
    for (const w of p.windows) {
      const r = p.rooms.find((rr) => rr.id === w.roomId);
      if (!r) continue;
      if (pointNearOpening(mx, my, r, w.wall, w.position, w.size, tolM)) {
        return { target: { kind: "window", id: w.id } };
      }
    }

    // 3) walls (proximity to room edge)
    for (const r of p.rooms) {
      const wall = pointOnWall(mx, my, r, tolM);
      if (wall) return { target: { kind: "wall", roomId: r.id, wall } };
    }

    // 4) room interior
    for (const r of p.rooms) {
      if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
        return { target: { kind: "room", id: r.id } };
      }
    }

    return { target: null };
  }

  function pointNearOpening(
    mx: number,
    my: number,
    room: Room,
    wall: Wall,
    position: number,
    size: number,
    tol: number
  ): boolean {
    const lengthM = wall === "north" || wall === "south" ? room.width : room.height;
    const startT = position - size / lengthM / 2;
    const endT = position + size / lengthM / 2;
    if (wall === "north" || wall === "south") {
      const wy = wall === "north" ? room.y : room.y + room.height;
      if (Math.abs(my - wy) > tol) return false;
      const t = (mx - room.x) / room.width;
      return t >= startT && t <= endT;
    } else {
      const wx = wall === "west" ? room.x : room.x + room.width;
      if (Math.abs(mx - wx) > tol) return false;
      const t = (my - room.y) / room.height;
      return t >= startT && t <= endT;
    }
  }

  function pointOnWall(mx: number, my: number, room: Room, tol: number): Wall | null {
    const insideX = mx >= room.x - tol && mx <= room.x + room.width + tol;
    const insideY = my >= room.y - tol && my <= room.y + room.height + tol;
    if (!insideX || !insideY) return null;
    if (Math.abs(my - room.y) <= tol) return "north";
    if (Math.abs(my - (room.y + room.height)) <= tol) return "south";
    if (Math.abs(mx - room.x) <= tol) return "west";
    if (Math.abs(mx - (room.x + room.width)) <= tol) return "east";
    return null;
  }

  // ----- Mouse / wheel handlers -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.2, Math.min(4, zoomRef.current * factor));
      const wx = (cx - panRef.current.x) / zoomRef.current;
      const wy = (cy - panRef.current.y) / zoomRef.current;
      const newPanX = cx - wx * newZoom;
      const newPanY = cy - wy * newZoom;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    const onDown = (e: MouseEvent) => {
      // ignore right-click here — handled in contextmenu
      if (e.button === 2) return;
      setContextMenu(null);

      const m = clientToWorldM(e.clientX, e.clientY);
      const hit = hitTest(m.x, m.y);
      const target = hit.target;

      // Middle mouse, space pan, or empty hit -> pan
      const wantPan =
        e.button === 1 ||
        e.shiftKey ||
        (e.button === 0 && (!target || target.kind === "room"));

      if (e.button === 0 && target && target.kind === "furniture") {
        const f = planRef.current.furniture.find((ff) => ff.id === target.id);
        if (f) {
          onSelect({ type: "furniture", id: f.id });
          interactionRef.current = {
            kind: "drag-furniture",
            id: f.id,
            startMouseM: m,
            startPos: { x: f.x, y: f.y },
            ghost: { x: f.x, y: f.y },
          };
          bumpInteraction();
          return;
        }
      }

      if (e.button === 0 && target && target.kind === "wall") {
        const r = planRef.current.rooms.find((rr) => rr.id === target.roomId);
        if (r) {
          onSelect({ type: "wall", roomId: r.id, wall: target.wall });
          interactionRef.current = {
            kind: "resize-wall",
            roomId: r.id,
            wall: target.wall,
            startMouseM: m,
            startRoom: { x: r.x, y: r.y, width: r.width, height: r.height },
            live: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
          bumpInteraction();
          return;
        }
      }

      if (e.button === 0 && target && target.kind === "door") {
        onSelect({ type: "door", id: target.id });
        return;
      }
      if (e.button === 0 && target && target.kind === "window") {
        onSelect({ type: "window", id: target.id });
        return;
      }

      if (wantPan) {
        // If clicking a room interior (no nearer hit) without modifiers, also select it.
        if (e.button === 0 && target && target.kind === "room" && !e.shiftKey) {
          onSelect({ type: "room", id: target.id });
        } else if (e.button === 0 && !target) {
          onClearSelection();
        }
        interactionRef.current = {
          kind: "pan",
          startX: e.clientX,
          startY: e.clientY,
          startPanX: panRef.current.x,
          startPanY: panRef.current.y,
        };
        bumpInteraction();
      }
    };

    const onMove = (e: MouseEvent) => {
      const it = interactionRef.current;

      // Update tooltip & hover when idle
      if (it.kind === "idle") {
        const m = clientToWorldM(e.clientX, e.clientY);
        const hit = hitTest(m.x, m.y);
        const t = hit.target;
        if (t?.kind === "furniture") {
          setHover({ kind: "furniture", id: t.id });
        } else if (t?.kind === "wall") {
          setHover({ kind: "wall", roomId: t.roomId, wall: t.wall });
        } else {
          setHover({ kind: "none" });
        }
      }

      if (it.kind === "pan") {
        setPan({
          x: it.startPanX + (e.clientX - it.startX),
          y: it.startPanY + (e.clientY - it.startY),
        });
        return;
      }
      if (it.kind === "drag-furniture") {
        const m = clientToWorldM(e.clientX, e.clientY);
        const dx = m.x - it.startMouseM.x;
        const dy = m.y - it.startMouseM.y;
        const f = planRef.current.furniture.find((ff) => ff.id === it.id);
        if (!f) return;
        const room = planRef.current.rooms.find((rr) => rr.id === f.roomId);
        let nx = snap(it.startPos.x + dx);
        let ny = snap(it.startPos.y + dy);
        if (room) {
          nx = Math.max(room.x, Math.min(room.x + room.width - f.width, nx));
          ny = Math.max(room.y, Math.min(room.y + room.height - f.height, ny));
        }
        it.ghost = { x: nx, y: ny };
        bumpInteraction();
        return;
      }
      if (it.kind === "resize-wall") {
        const m = clientToWorldM(e.clientX, e.clientY);
        const dx = snap(m.x - it.startMouseM.x);
        const dy = snap(m.y - it.startMouseM.y);
        let { x, y, width, height } = it.startRoom;
        if (it.wall === "north") {
          const newY = y + dy;
          const newH = height - dy;
          if (newH >= MIN_ROOM_M) {
            y = newY;
            height = newH;
          }
        } else if (it.wall === "south") {
          const newH = height + dy;
          if (newH >= MIN_ROOM_M) height = newH;
        } else if (it.wall === "west") {
          const newX = x + dx;
          const newW = width - dx;
          if (newW >= MIN_ROOM_M) {
            x = newX;
            width = newW;
          }
        } else if (it.wall === "east") {
          const newW = width + dx;
          if (newW >= MIN_ROOM_M) width = newW;
        }
        it.live = { x, y, width, height };
        bumpInteraction();
        return;
      }
    };

    const onUp = () => {
      const it = interactionRef.current;
      if (it.kind === "drag-furniture") {
        onUpdateFurniture(it.id, { x: it.ghost.x, y: it.ghost.y });
      } else if (it.kind === "resize-wall") {
        const r = planRef.current.rooms.find((rr) => rr.id === it.roomId);
        if (r) {
          // Only commit if anything actually changed
          if (
            r.x !== it.live.x ||
            r.y !== it.live.y ||
            r.width !== it.live.width ||
            r.height !== it.live.height
          ) {
            onUpdateRoom(it.roomId, it.live);
          }
        }
      }
      interactionRef.current = { kind: "idle" };
      bumpInteraction();
    };

    const onCtxMenu = (e: MouseEvent) => {
      e.preventDefault();
      const m = clientToWorldM(e.clientX, e.clientY);
      const hit = hitTest(m.x, m.y);
      const t = hit.target;
      if (!t) {
        setContextMenu(null);
        return;
      }
      let sel: SelectedElement | null = null;
      if (t.kind === "furniture") sel = { type: "furniture", id: t.id };
      else if (t.kind === "room") sel = { type: "room", id: t.id };
      else if (t.kind === "door") sel = { type: "door", id: t.id };
      else if (t.kind === "window") sel = { type: "window", id: t.id };
      else if (t.kind === "wall") sel = { type: "wall", roomId: t.roomId, wall: t.wall };
      if (!sel) return;
      onSelect(sel);
      const rect = canvas.getBoundingClientRect();
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        target: sel,
      });
    };

    const onLeave = () => {
      setHover({ kind: "none" });
      setTooltip(null);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("contextmenu", onCtxMenu);
    canvas.addEventListener("mouseleave", onLeave);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("contextmenu", onCtxMenu);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, onUpdateFurniture, onUpdateRoom, onClearSelection]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const sel = selectedRef.current;
      if (e.key === "Escape") {
        onClearSelection();
        setContextMenu(null);
        return;
      }
      if (!sel) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteSelected();
        return;
      }
      if (sel.type === "furniture") {
        const f = planRef.current.furniture.find((ff) => ff.id === sel.id);
        if (!f) return;
        const room = planRef.current.rooms.find((rr) => rr.id === f.roomId);
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          // 90° rotate: swap dims, keep center
          const cx = f.x + f.width / 2;
          const cy = f.y + f.height / 2;
          let nw = f.height;
          let nh = f.width;
          let nx = cx - nw / 2;
          let ny = cy - nh / 2;
          if (room) {
            nx = Math.max(room.x, Math.min(room.x + room.width - nw, nx));
            ny = Math.max(room.y, Math.min(room.y + room.height - nh, ny));
          }
          onUpdateFurniture(f.id, {
            width: nw,
            height: nh,
            x: nx,
            y: ny,
            rotation: ((f.rotation ?? 0) + 90) % 360,
          });
          return;
        }
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -SNAP_M;
        else if (e.key === "ArrowRight") dx = SNAP_M;
        else if (e.key === "ArrowUp") dy = -SNAP_M;
        else if (e.key === "ArrowDown") dy = SNAP_M;
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          let nx = f.x + dx;
          let ny = f.y + dy;
          if (room) {
            nx = Math.max(room.x, Math.min(room.x + room.width - f.width, nx));
            ny = Math.max(room.y, Math.min(room.y + room.height - f.height, ny));
          }
          onUpdateFurniture(f.id, { x: nx, y: ny });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClearSelection, onDeleteSelected, onUpdateFurniture]);

  // Tooltip position when something is selected
  useEffect(() => {
    if (!selected) {
      setTooltip(null);
      return;
    }
    const lines = describeSelection(plan, selected);
    if (!lines) {
      setTooltip(null);
      return;
    }
    // Try to anchor near the element
    const anchor = anchorPoint(plan, selected);
    if (!anchor) {
      setTooltip({ x: 16, y: 16, lines });
      return;
    }
    const sx = anchor.x * PX_PER_M * zoom + pan.x;
    const sy = anchor.y * PX_PER_M * zoom + pan.y;
    setTooltip({ x: sx + 12, y: sy + 12, lines });
  }, [selected, plan, zoom, pan]);

  // ----- Drawing -----
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size.w * dpr || canvas.height !== size.h * dpr) {
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, size.w, size.h);

    const grad = ctx.createRadialGradient(size.w / 2, size.h / 2, 50, size.w / 2, size.h / 2, Math.max(size.w, size.h));
    grad.addColorStop(0, "rgba(255,255,255,0.02)");
    grad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.w, size.h);

    drawGrid(ctx);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Use live resize override if in resize interaction
    const it = interactionRef.current;
    const liveRoomById: Record<string, { x: number; y: number; width: number; height: number }> = {};
    if (it.kind === "resize-wall") liveRoomById[it.roomId] = it.live;

    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      const live = liveRoomById[room.id];
      const r2: Room = live
        ? { ...room, x: live.x, y: live.y, width: live.width, height: live.height }
        : room;
      drawRoom(ctx, r2, plan, t);
    }

    // Selection highlights
    drawSelectionHighlight(ctx);

    // Hover wall indicator (when not selected)
    drawHoverHints(ctx);

    // Drag ghost
    if (it.kind === "drag-furniture") {
      const f = plan.furniture.find((ff) => ff.id === it.id);
      if (f) drawGhostFurniture(ctx, { ...f, x: it.ghost.x, y: it.ghost.y });
    }

    ctx.restore();

    drawFooter(ctx);
  }

  function drawGrid(ctx: CanvasRenderingContext2D) {
    const stepWorld = GRID_M * PX_PER_M;
    const step = stepWorld * zoom;
    if (step < 6) return;
    ctx.save();
    ctx.strokeStyle = "rgba(80, 100, 150, 0.10)";
    ctx.lineWidth = 1;
    const startX = pan.x % step;
    const startY = pan.y % step;
    ctx.beginPath();
    for (let x = startX; x < size.w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.h);
    }
    for (let y = startY; y < size.h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(size.w, y);
    }
    ctx.stroke();
    const majorStep = step * 4;
    if (majorStep > 12) {
      ctx.strokeStyle = "rgba(120, 140, 200, 0.18)";
      ctx.beginPath();
      const sx = pan.x % majorStep;
      const sy = pan.y % majorStep;
      for (let x = sx; x < size.w; x += majorStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.h);
      }
      for (let y = sy; y < size.h; y += majorStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(size.w, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoom(ctx: CanvasRenderingContext2D, room: Room, planRef: FloorPlan, appear: number) {
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;

    ctx.save();
    if (appear < 1) {
      ctx.globalAlpha = appear;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const s = 0.85 + 0.15 * appear;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    }

    // Floor fill — corridors get a much lighter, more uniform tint so they
    // read as circulation, not "rooms".
    if (isCorridorRoom(room.name)) {
      ctx.save();
      ctx.fillStyle = "rgba(198,169,98,0.10)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(198,169,98,0.18)";
      ctx.lineWidth = 0.7;
      const step = PX_PER_M * 0.25;
      ctx.beginPath();
      for (let px = x - h; px < x + w; px += step) {
        ctx.moveTo(px, y);
        ctx.lineTo(px + h, y + h);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      drawFloorPattern(ctx, x, y, w, h, room.floor);
    }

    drawWalls(ctx, room, planRef);

    for (const d of planRef.doors.filter((d) => d.roomId === room.id)) {
      drawDoor(ctx, room, d);
    }
    for (const win of planRef.windows.filter((w) => w.roomId === room.id)) {
      drawWindow(ctx, room, win);
    }
    for (const f of planRef.furniture.filter((f) => f.roomId === room.id)) {
      // Skip the dragged furniture from solid render — ghost is drawn separately
      const it = interactionRef.current;
      const beingDragged = it.kind === "drag-furniture" && it.id === f.id;
      drawFurniture(ctx, f, room, { faded: beingDragged });
    }

    // Label & dimensions — corridors get a smaller italic label and no
    // dimension callouts (they'd clutter the plan).
    if (isCorridorRoom(room.name)) {
      drawCorridorLabel(ctx, room);
    } else {
      drawRoomLabel(ctx, room);
      drawRoomDimensions(ctx, room);
    }

    ctx.restore();
  }

  function drawFloorPattern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    floor: Room["floor"]
  ) {
    const c = FLOOR_COLORS[floor];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = c.base;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1;

    if (floor === "madeira") {
      const plank = PX_PER_M * 0.25;
      for (let py = y; py < y + h; py += plank) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
      ctx.lineWidth = 0.7;
      for (let py = y; py < y + h; py += plank) {
        const offset = ((py * 13) % (PX_PER_M * 1.2)) + PX_PER_M * 0.6;
        for (let px = x + offset; px < x + w; px += PX_PER_M * 1.2) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + plank);
          ctx.stroke();
        }
      }
    } else if (floor === "porcelanato") {
      const tile = PX_PER_M * 0.6;
      for (let px = x; px < x + w; px += tile) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
        ctx.stroke();
      }
      for (let py = y; py < y + h; py += tile) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
    } else if (floor === "ceramica") {
      const tile = PX_PER_M * 0.3;
      for (let px = x; px < x + w; px += tile) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
        ctx.stroke();
      }
      for (let py = y; py < y + h; py += tile) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
    } else if (floor === "marmore") {
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = "rgba(180,170,150,0.4)";
      for (let i = -h; i < w; i += PX_PER_M * 1.5) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawWalls(ctx: CanvasRenderingContext2D, room: Room, planRef: FloorPlan) {
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;

    ctx.save();
    ctx.strokeStyle = "#3a5a8c";
    ctx.lineWidth = WALL_PX;
    ctx.lineCap = "butt";

    type WallSeg = {
      wall: Door["wall"];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lengthMeters: number;
    };
    const walls: WallSeg[] = [
      { wall: "north", x1: x, y1: y, x2: x + w, y2: y, lengthMeters: room.width },
      { wall: "south", x1: x, y1: y + h, x2: x + w, y2: y + h, lengthMeters: room.width },
      { wall: "west", x1: x, y1: y, x2: x, y2: y + h, lengthMeters: room.height },
      { wall: "east", x1: x + w, y1: y, x2: x + w, y2: y + h, lengthMeters: room.height },
    ];

    for (const wseg of walls) {
      const openings = collectOpenings(room, wseg, planRef);
      drawSegmentedLine(ctx, wseg.x1, wseg.y1, wseg.x2, wseg.y2, openings);
    }

    ctx.restore();
  }

  // Collect door/window openings on this wall segment, including those that
  // belong to an adjacent room sharing the same wall line. Without this,
  // a door on Room A's south wall would appear as a gap, but Room B's north
  // wall (drawn at the same coordinates) would render solid on top.
  function collectOpenings(
    room: Room,
    wseg: { wall: Door["wall"]; lengthMeters: number },
    planRef: FloorPlan
  ): { start: number; end: number }[] {
    const own = [
      ...planRef.doors.filter((d) => d.roomId === room.id && d.wall === wseg.wall),
      ...planRef.windows.filter((wn) => wn.roomId === room.id && wn.wall === wseg.wall),
    ].map((o) => ({
      pos: o.position,
      size: o.size,
      lengthMeters: wseg.lengthMeters,
      offsetMeters: 0,
    }));

    // Find adjacent room(s) sharing this wall and project their openings.
    const eps = 0.01;
    const others = planRef.rooms.filter((r) => r.id !== room.id);
    for (const other of others) {
      const otherWall = oppositeWall(wseg.wall);
      let shares = false;
      let offsetMeters = 0;
      let otherStartM = 0;
      let otherLenM = 0;
      let ownStartM = 0;
      if (wseg.wall === "south" && Math.abs(other.y - (room.y + room.height)) < eps) {
        shares = true;
        ownStartM = room.x;
        otherStartM = other.x;
        otherLenM = other.width;
      } else if (wseg.wall === "north" && Math.abs(other.y + other.height - room.y) < eps) {
        shares = true;
        ownStartM = room.x;
        otherStartM = other.x;
        otherLenM = other.width;
      } else if (wseg.wall === "east" && Math.abs(other.x - (room.x + room.width)) < eps) {
        shares = true;
        ownStartM = room.y;
        otherStartM = other.y;
        otherLenM = other.height;
      } else if (wseg.wall === "west" && Math.abs(other.x + other.width - room.x) < eps) {
        shares = true;
        ownStartM = room.y;
        otherStartM = other.y;
        otherLenM = other.height;
      }
      if (!shares) continue;
      offsetMeters = otherStartM - ownStartM;

      const otherOpenings = [
        ...planRef.doors.filter((d) => d.roomId === other.id && d.wall === otherWall),
        ...planRef.windows.filter((wn) => wn.roomId === other.id && wn.wall === otherWall),
      ];
      for (const o of otherOpenings) {
        own.push({
          pos: o.position,
          size: o.size,
          lengthMeters: otherLenM,
          offsetMeters,
        });
      }
    }

    return own.map((o) => {
      // Convert opening to a 0..1 range along *this* wall segment.
      const centerOnOtherM = o.pos * o.lengthMeters;
      const centerOnOwnM = centerOnOtherM + o.offsetMeters;
      const halfM = o.size / 2;
      return {
        start: (centerOnOwnM - halfM) / wseg.lengthMeters,
        end: (centerOnOwnM + halfM) / wseg.lengthMeters,
      };
    });
  }

  function oppositeWall(w: Door["wall"]): Door["wall"] {
    if (w === "north") return "south";
    if (w === "south") return "north";
    if (w === "east") return "west";
    return "east";
  }

  function drawSegmentedLine(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    holes: { start: number; end: number }[]
  ) {
    const sorted = [...holes].sort((a, b) => a.start - b.start);
    let cursor = 0;
    const segs: [number, number][] = [];
    for (const h of sorted) {
      const s = Math.max(0, h.start);
      const e = Math.min(1, h.end);
      if (s > cursor) segs.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < 1) segs.push([cursor, 1]);
    for (const [a, b] of segs) {
      const sx = x1 + (x2 - x1) * a;
      const sy = y1 + (y2 - y1) * a;
      const ex = x1 + (x2 - x1) * b;
      const ey = y1 + (y2 - y1) * b;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  function wallEndpoints(room: Room, wall: Wall): { x1: number; y1: number; x2: number; y2: number } {
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;
    if (wall === "north") return { x1: x, y1: y, x2: x + w, y2: y };
    if (wall === "south") return { x1: x, y1: y + h, x2: x + w, y2: y + h };
    if (wall === "west") return { x1: x, y1: y, x2: x, y2: y + h };
    return { x1: x + w, y1: y, x2: x + w, y2: y + h };
  }

  function drawDoor(ctx: CanvasRenderingContext2D, room: Room, door: Door) {
    const ep = wallEndpoints(room, door.wall);
    const lengthM = door.wall === "north" || door.wall === "south" ? room.width : room.height;
    const sizePx = door.size * PX_PER_M;
    const t = door.position;
    const cx = ep.x1 + (ep.x2 - ep.x1) * t;
    const cy = ep.y1 + (ep.y2 - ep.y1) * t;
    const dx = (ep.x2 - ep.x1) / (lengthM * PX_PER_M);
    const dy = (ep.y2 - ep.y1) / (lengthM * PX_PER_M);
    // hinge (sx,sy) and free-end (ex,ey) along the wall
    const sx = cx - dx * (sizePx / 2);
    const sy = cy - dy * (sizePx / 2);
    const ex = cx + dx * (sizePx / 2);
    const ey = cy + dy * (sizePx / 2);

    const inward = inwardNormal(door.wall);
    const FRAME = "rgba(20,24,38,0.95)";
    const LEAF = "rgba(40,52,80,0.95)";
    const ARC = "rgba(120,140,180,0.55)";

    ctx.save();

    // Door frame jambs — small thick segments at both ends, perpendicular to wall
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    const jambDepth = 4;
    ctx.beginPath();
    ctx.moveTo(sx - inward.x * jambDepth * 0.4, sy - inward.y * jambDepth * 0.4);
    ctx.lineTo(sx + inward.x * jambDepth, sy + inward.y * jambDepth);
    ctx.moveTo(ex - inward.x * jambDepth * 0.4, ey - inward.y * jambDepth * 0.4);
    ctx.lineTo(ex + inward.x * jambDepth, ey + inward.y * jambDepth);
    ctx.stroke();

    // Door leaf — thick line, opens inward at 90°
    ctx.strokeStyle = LEAF;
    ctx.lineWidth = 2.8;
    ctx.lineCap = "butt";
    const leafEndX = sx + inward.x * sizePx;
    const leafEndY = sy + inward.y * sizePx;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(leafEndX, leafEndY);
    ctx.stroke();

    // Swing arc — dashed quarter circle from leaf-end back to wall position
    ctx.strokeStyle = ARC;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    const startAngle = Math.atan2(ey - sy, ex - sx);
    const endAngle = Math.atan2(inward.y, inward.x);
    ctx.arc(sx, sy, sizePx, startAngle, endAngle, false);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawWindow(ctx: CanvasRenderingContext2D, room: Room, win: PlanWindow) {
    const ep = wallEndpoints(room, win.wall);
    const lengthM = win.wall === "north" || win.wall === "south" ? room.width : room.height;
    const sizePx = win.size * PX_PER_M;
    const t = win.position;
    const cx = ep.x1 + (ep.x2 - ep.x1) * t;
    const cy = ep.y1 + (ep.y2 - ep.y1) * t;
    const dx = (ep.x2 - ep.x1) / (lengthM * PX_PER_M);
    const dy = (ep.y2 - ep.y1) / (lengthM * PX_PER_M);
    const sx = cx - dx * (sizePx / 2);
    const sy = cy - dy * (sizePx / 2);
    const ex = cx + dx * (sizePx / 2);
    const ey = cy + dy * (sizePx / 2);
    // perpendicular to wall (used to offset the parallel glass lines)
    const px = -dy;
    const py = dx;
    const off = WALL_PX / 2 + 0.5;

    const FRAME = "rgba(20,24,38,0.95)";
    const GLASS = "rgba(150,200,240,0.85)";

    ctx.save();
    // Sill frame caps (jamb endings — thick perpendicular ticks)
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = WALL_PX;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(sx + px * off, sy + py * off);
    ctx.lineTo(sx - px * off, sy - py * off);
    ctx.moveTo(ex + px * off, ey + py * off);
    ctx.lineTo(ex - px * off, ey - py * off);
    ctx.stroke();

    // Outer frame lines (top + bottom of glass)
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(sx + px * off, sy + py * off);
    ctx.lineTo(ex + px * off, ey + py * off);
    ctx.moveTo(sx - px * off, sy - py * off);
    ctx.lineTo(ex - px * off, ey - py * off);
    ctx.stroke();

    // Glass — parallel mid-line through the wall (the pane)
    ctx.strokeStyle = GLASS;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Sliding window indication: midpoint stop-bar (so it reads as 2 panes)
    if (win.size >= 1.0) {
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      ctx.strokeStyle = FRAME;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx + px * off, my + py * off);
      ctx.lineTo(mx - px * off, my - py * off);
      ctx.stroke();
    }

    ctx.restore();
  }

  function inwardNormal(wall: Wall): { x: number; y: number } {
    if (wall === "north") return { x: 0, y: 1 };
    if (wall === "south") return { x: 0, y: -1 };
    if (wall === "west") return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  function drawCorridorLabel(ctx: CanvasRenderingContext2D, room: Room) {
    const cx = (room.x + room.width / 2) * PX_PER_M;
    const cy = (room.y + room.height / 2) * PX_PER_M;
    ctx.save();
    ctx.fillStyle = "rgba(198,169,98,0.65)";
    ctx.font = "italic 500 11px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${room.name} · ${room.width.toFixed(2)} m`, cx, cy);
    ctx.restore();
  }

  function drawRoomLabel(ctx: CanvasRenderingContext2D, room: Room) {
    const cx = (room.x + room.width / 2) * PX_PER_M;
    const cy = (room.y + room.height / 2) * PX_PER_M;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "600 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, cx, cy - 8);
    ctx.fillStyle = "rgba(198,169,98,0.85)";
    ctx.font = "500 11px ui-sans-serif, system-ui";
    ctx.fillText(`${(room.width * room.height).toFixed(1)} m²`, cx, cy + 8);
    ctx.restore();
  }

  function drawRoomDimensions(ctx: CanvasRenderingContext2D, room: Room) {
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;
    const off = 12;

    ctx.save();
    ctx.strokeStyle = "rgba(198,169,98,0.45)";
    ctx.fillStyle = "rgba(198,169,98,0.9)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    ctx.font = "500 10px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.beginPath();
    ctx.moveTo(x, y - off);
    ctx.lineTo(x + w, y - off);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${room.width.toFixed(2)} m`, x + w / 2, y - off - 6);

    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + w + off, y);
    ctx.lineTo(x + w + off, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(x + w + off + 6, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${room.height.toFixed(2)} m`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  function drawFurniture(
    ctx: CanvasRenderingContext2D,
    f: Furniture,
    room: Room,
    opts?: { faded?: boolean }
  ) {
    const x = f.x * PX_PER_M;
    const y = f.y * PX_PER_M;
    const w = f.width * PX_PER_M;
    const h = f.height * PX_PER_M;

    // Architectural pen weights
    const PEN_HEAVY = 1.7;
    const PEN_MEDIUM = 1.0;
    const PEN_FINE = 0.55;

    const FILL_BODY = "rgba(245,243,236,0.92)";
    const FILL_BODY_DARK = "rgba(60,55,48,0.88)";
    const STROKE_HEAVY = "rgba(20,24,38,0.95)";
    const STROKE_FINE = "rgba(40,52,80,0.6)";

    const isKitchen = /cozinha/i.test(room.name);

    ctx.save();
    if (opts?.faded) ctx.globalAlpha = 0.35;

    switch (f.type) {
      case "sofa": {
        const armW = Math.min(w * 0.1, 8);
        const backH = Math.min(h * 0.32, 10);
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x, y, w, h, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(225,220,210,0.95)";
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        roundRect(ctx, x + armW * 0.5, y + 1.5, w - armW, backH, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(220,215,205,0.95)";
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        roundRect(ctx, x + 1, y + 1, armW, h - 2, 3);
        ctx.fill();
        ctx.stroke();
        roundRect(ctx, x + w - armW - 1, y + 1, armW, h - 2, 3);
        ctx.fill();
        ctx.stroke();
        const seatTop = y + backH + 2;
        const seatBot = y + h - 2;
        const seatL = x + armW + 1;
        const seatR = x + w - armW - 1;
        const seatW = seatR - seatL;
        const cushions = w > 80 ? 3 : 2;
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_MEDIUM;
        for (let i = 0; i < cushions; i++) {
          const cx = seatL + (seatW / cushions) * i;
          const cw = seatW / cushions - 1;
          roundRect(ctx, cx + 1, seatTop, cw, seatBot - seatTop - 1, 3);
          ctx.stroke();
        }
        break;
      }
      case "bed": {
        const isDouble = f.width >= 1.3;
        const headH = Math.min(h * 0.07, 5);
        ctx.fillStyle = "rgba(120,105,85,0.88)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, headH);
        ctx.strokeRect(x, y, w, headH);
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x + 1.5, y + headH, w - 3, h - headH - 1, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        const pillowH = Math.min((h - headH) * 0.18, 14);
        const pillowGap = 3;
        const pillowMarginX = w * 0.08;
        if (isDouble) {
          const pw = (w - 2 * pillowMarginX - pillowGap) / 2;
          roundRect(ctx, x + pillowMarginX, y + headH + 3, pw, pillowH, 3);
          ctx.fill();
          ctx.stroke();
          roundRect(ctx, x + pillowMarginX + pw + pillowGap, y + headH + 3, pw, pillowH, 3);
          ctx.fill();
          ctx.stroke();
        } else {
          roundRect(ctx, x + pillowMarginX, y + headH + 3, w - 2 * pillowMarginX, pillowH, 3);
          ctx.fill();
          ctx.stroke();
        }
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        const foldY = y + h * 0.62;
        ctx.beginPath();
        ctx.moveTo(x + 3, foldY);
        ctx.lineTo(x + w - 3, foldY);
        ctx.moveTo(x + 3, foldY + 2);
        ctx.lineTo(x + w - 3, foldY + 2);
        ctx.stroke();
        break;
      }
      case "table": {
        const dining = w >= 40 && h >= 28;
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();
        if (dining) {
          ctx.strokeStyle = STROKE_FINE;
          ctx.fillStyle = "rgba(245,243,236,0.85)";
          ctx.lineWidth = PEN_MEDIUM;
          const chairR = Math.min(w, h) * 0.14;
          const along = w > h ? "x" : "y";
          if (along === "x") {
            const seats = Math.max(2, Math.floor(w / (chairR * 3)));
            for (let i = 0; i < seats; i++) {
              const t = (i + 1) / (seats + 1);
              const cx = x + w * t;
              ctx.beginPath();
              ctx.arc(cx, y - chairR - 1, chairR, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(cx, y + h + chairR + 1, chairR, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(x - chairR - 1, y + h / 2, chairR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + w + chairR + 1, y + h / 2, chairR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            const seats = Math.max(2, Math.floor(h / (chairR * 3)));
            for (let i = 0; i < seats; i++) {
              const t = (i + 1) / (seats + 1);
              const cy = y + h * t;
              ctx.beginPath();
              ctx.arc(x - chairR - 1, cy, chairR, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(x + w + chairR + 1, cy, chairR, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(x + w / 2, y - chairR - 1, chairR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h + chairR + 1, chairR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        break;
      }
      case "tv": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        const tvW = w * 0.7;
        const tvH = Math.min(h * 0.45, 5);
        const tvX = x + (w - tvW) / 2;
        const tvY = y + (h - tvH) / 2;
        ctx.fillStyle = "rgba(15,18,25,0.95)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        ctx.fillRect(tvX, tvY, tvW, tvH);
        ctx.strokeRect(tvX, tvY, tvW, tvH);
        ctx.fillStyle = "rgba(126,182,255,0.18)";
        ctx.fillRect(tvX + 1, tvY + 1, tvW - 2, tvH - 2);
        break;
      }
      case "sink": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        ctx.stroke();
        if (isKitchen || w > 30) {
          const pad = Math.min(3, w * 0.06);
          const innerW = (w - pad * 3) / 2;
          const innerH = h - pad * 2;
          ctx.strokeStyle = STROKE_HEAVY;
          ctx.lineWidth = PEN_MEDIUM;
          roundRect(ctx, x + pad, y + pad, innerW, innerH, 2);
          ctx.stroke();
          roundRect(ctx, x + pad * 2 + innerW, y + pad, innerW, innerH, 2);
          ctx.stroke();
          ctx.fillStyle = STROKE_HEAVY;
          ctx.beginPath();
          ctx.arc(x + pad + innerW / 2, y + pad + innerH / 2, 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + pad * 2 + innerW * 1.5, y + pad + innerH / 2, 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(120,130,150,0.9)";
          ctx.strokeStyle = STROKE_HEAVY;
          ctx.lineWidth = PEN_FINE;
          ctx.beginPath();
          ctx.arc(x + w / 2, y + 2.5, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.strokeStyle = STROKE_HEAVY;
          ctx.lineWidth = PEN_MEDIUM;
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.35, h * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(120,130,150,0.9)";
          ctx.strokeStyle = STROKE_HEAVY;
          ctx.lineWidth = PEN_FINE;
          ctx.beginPath();
          ctx.arc(x + w / 2, y + 2.5, 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case "toilet": {
        const tankH = h * 0.32;
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, tankH);
        ctx.strokeRect(x, y, w, tankH);
        ctx.fillStyle = FILL_BODY;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + tankH + (h - tankH) * 0.55, w * 0.42, (h - tankH) * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + tankH + (h - tankH) * 0.58, w * 0.32, (h - tankH) * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = STROKE_FINE;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + tankH * 0.5, 0.9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "shower": {
        ctx.fillStyle = "rgba(220,228,238,0.55)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 2);
        ctx.lineTo(x + w - 2, y + h - 2);
        ctx.moveTo(x + w - 2, y + 2);
        ctx.lineTo(x + 2, y + h - 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(60,70,90,0.9)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const hd = Math.min(w, h) * 0.18;
        ctx.fillStyle = "rgba(120,130,150,0.95)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.arc(x + w - hd, y + hd, hd * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(126,182,255,0.85)";
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + h);
        ctx.lineTo(x + w - 1, y + h);
        ctx.stroke();
        break;
      }
      case "stove": {
        ctx.fillStyle = FILL_BODY_DARK;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        const burnerR = Math.min(w, h) * 0.16;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const cx = x + w * (0.28 + 0.44 * i);
            const cy = y + h * (0.28 + 0.44 * j);
            ctx.strokeStyle = "rgba(220,215,205,0.9)";
            ctx.lineWidth = PEN_MEDIUM;
            ctx.fillStyle = "rgba(40,40,40,0.9)";
            ctx.beginPath();
            ctx.arc(cx, cy, burnerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = "rgba(220,215,205,0.7)";
            ctx.lineWidth = PEN_FINE;
            ctx.beginPath();
            ctx.arc(cx, cy, burnerR * 0.55, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      }
      case "fridge": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.35);
        ctx.lineTo(x + w, y + h * 0.35);
        ctx.stroke();
        ctx.lineWidth = PEN_HEAVY;
        ctx.beginPath();
        ctx.moveTo(x + w - 3, y + h * 0.5);
        ctx.lineTo(x + w - 3, y + h * 0.92);
        ctx.stroke();
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.moveTo(x + w - 3, y + h * 0.08);
        ctx.lineTo(x + w - 3, y + h * 0.28);
        ctx.stroke();
        break;
      }
      case "counter": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        break;
      }
      case "island": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 3);
        ctx.stroke();
        const stoolR = Math.min(w, h) * 0.12;
        const numStools = Math.max(2, Math.floor(w / (stoolR * 3.5)));
        ctx.fillStyle = "rgba(140,125,100,0.9)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        for (let i = 0; i < numStools; i++) {
          const t = (i + 1) / (numStools + 1);
          const cx = x + w * t;
          const cy = y + h + stoolR + 1;
          ctx.beginPath();
          ctx.arc(cx, cy, stoolR, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case "wardrobe": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 2);
        ctx.lineTo(x + w - 1, y + 2);
        ctx.moveTo(x + 1, y + h - 2);
        ctx.lineTo(x + w - 1, y + h - 2);
        ctx.stroke();
        const segments = Math.max(2, Math.floor(w / 24));
        ctx.lineWidth = PEN_FINE;
        for (let i = 0; i < segments; i++) {
          const sx = x + (w / segments) * i + 2;
          const ex = x + (w / segments) * (i + 1) - 2;
          ctx.beginPath();
          ctx.moveTo(sx, y + h - 3);
          ctx.lineTo(ex, y + 3);
          ctx.stroke();
        }
        break;
      }
      case "desk": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        roundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        ctx.stroke();
        const chairR = Math.min(w, h) * 0.28;
        ctx.fillStyle = "rgba(220,215,205,0.92)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h + chairR + 1, chairR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h + chairR + 1, chairR * 0.7, Math.PI, 0, false);
        ctx.stroke();
        break;
      }
      case "chair": {
        ctx.fillStyle = "rgba(245,243,236,0.9)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h, w * 0.45, Math.PI, 0, false);
        ctx.stroke();
        break;
      }
      case "bookshelf": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        const shelves = 4;
        for (let i = 1; i < shelves; i++) {
          ctx.beginPath();
          ctx.moveTo(x + 1, y + (h / shelves) * i);
          ctx.lineTo(x + w - 1, y + (h / shelves) * i);
          ctx.stroke();
        }
        break;
      }
      case "washing_machine": {
        ctx.fillStyle = FILL_BODY;
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_HEAVY;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgba(220,215,205,0.95)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        const panelH = Math.min(h * 0.16, 6);
        ctx.fillRect(x, y, w, panelH);
        ctx.strokeRect(x, y, w, panelH);
        ctx.fillStyle = STROKE_HEAVY;
        ctx.beginPath();
        ctx.arc(x + w * 0.85, y + panelH / 2, panelH * 0.3, 0, Math.PI * 2);
        ctx.fill();
        const cx = x + w / 2;
        const cy = y + panelH + (h - panelH) / 2;
        const r = Math.min(w, h - panelH) * 0.42;
        ctx.fillStyle = "rgba(220,228,238,0.6)";
        ctx.strokeStyle = STROKE_HEAVY;
        ctx.lineWidth = PEN_MEDIUM;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = STROKE_FINE;
        ctx.lineWidth = PEN_FINE;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }

    // Subtle label inside or below
    ctx.font = "500 9px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (f.type === "stove" || f.type === "tv" || f.type === "washing_machine" || f.type === "fridge") {
      ctx.fillStyle = "rgba(245,243,236,0.85)";
      if (w > 30 && h > 18) ctx.fillText(f.label, x + w / 2, y + h / 2);
    } else if (w > 50 && h > 26 && f.type !== "shower" && f.type !== "toilet" && f.type !== "table") {
      ctx.fillStyle = "rgba(40,52,80,0.7)";
      ctx.fillText(f.label, x + w / 2, y + h - 7);
    }

    ctx.restore();
  }

  function drawGhostFurniture(ctx: CanvasRenderingContext2D, f: Furniture) {
    const x = f.x * PX_PER_M;
    const y = f.y * PX_PER_M;
    const w = f.width * PX_PER_M;
    const h = f.height * PX_PER_M;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "rgba(198,169,98,0.18)";
    ctx.strokeStyle = "rgba(255,215,128,1)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "500 9px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (w > 30 && h > 18) ctx.fillText(f.label, x + w / 2, y + h / 2);
    ctx.restore();
  }

  function drawSelectionHighlight(ctx: CanvasRenderingContext2D) {
    if (!selected) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,215,128,1)";
    ctx.shadowColor = "rgba(255,215,128,0.85)";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;

    if (selected.type === "furniture") {
      const f = plan.furniture.find((ff) => ff.id === selected.id);
      if (!f) {
        ctx.restore();
        return;
      }
      const x = f.x * PX_PER_M;
      const y = f.y * PX_PER_M;
      const w = f.width * PX_PER_M;
      const h = f.height * PX_PER_M;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.setLineDash([]);
    } else if (selected.type === "room") {
      const r = plan.rooms.find((rr) => rr.id === selected.id);
      if (!r) {
        ctx.restore();
        return;
      }
      const x = r.x * PX_PER_M;
      const y = r.y * PX_PER_M;
      const w = r.width * PX_PER_M;
      const h = r.height * PX_PER_M;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.setLineDash([]);
    } else if (selected.type === "wall") {
      const r = plan.rooms.find((rr) => rr.id === selected.roomId);
      if (!r) {
        ctx.restore();
        return;
      }
      const ep = wallEndpoints(r, selected.wall);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ep.x1, ep.y1);
      ctx.lineTo(ep.x2, ep.y2);
      ctx.stroke();
    } else if (selected.type === "door") {
      const d = plan.doors.find((dd) => dd.id === selected.id);
      if (!d) {
        ctx.restore();
        return;
      }
      const r = plan.rooms.find((rr) => rr.id === d.roomId);
      if (!r) {
        ctx.restore();
        return;
      }
      drawOpeningHighlight(ctx, r, d.wall, d.position, d.size);
    } else if (selected.type === "window") {
      const w = plan.windows.find((ww) => ww.id === selected.id);
      if (!w) {
        ctx.restore();
        return;
      }
      const r = plan.rooms.find((rr) => rr.id === w.roomId);
      if (!r) {
        ctx.restore();
        return;
      }
      drawOpeningHighlight(ctx, r, w.wall, w.position, w.size);
    }

    ctx.restore();
  }

  function drawOpeningHighlight(
    ctx: CanvasRenderingContext2D,
    r: Room,
    wall: Wall,
    position: number,
    size: number
  ) {
    const ep = wallEndpoints(r, wall);
    const lengthM = wall === "north" || wall === "south" ? r.width : r.height;
    const startT = position - size / lengthM / 2;
    const endT = position + size / lengthM / 2;
    const sx = ep.x1 + (ep.x2 - ep.x1) * startT;
    const sy = ep.y1 + (ep.y2 - ep.y1) * startT;
    const ex = ep.x1 + (ep.x2 - ep.x1) * endT;
    const ey = ep.y1 + (ep.y2 - ep.y1) * endT;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  function drawHoverHints(ctx: CanvasRenderingContext2D) {
    if (interactionRef.current.kind !== "idle") return;
    if (hover.kind === "wall") {
      const r = plan.rooms.find((rr) => rr.id === hover.roomId);
      if (!r) return;
      const ep = wallEndpoints(r, hover.wall);
      ctx.save();
      ctx.strokeStyle = "rgba(255,215,128,0.55)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ep.x1, ep.y1);
      ctx.lineTo(ep.x2, ep.y2);
      ctx.stroke();
      ctx.restore();
    } else if (hover.kind === "furniture") {
      const f = plan.furniture.find((ff) => ff.id === hover.id);
      if (!f) return;
      const x = f.x * PX_PER_M;
      const y = f.y * PX_PER_M;
      const w = f.width * PX_PER_M;
      const h = f.height * PX_PER_M;
      ctx.save();
      ctx.strokeStyle = "rgba(255,215,128,0.45)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      ctx.restore();
    }
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawFooter(ctx: CanvasRenderingContext2D) {
    const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.height, 0);
    const text = plan.rooms.length
      ? `${plan.rooms.length} cômodos · ${totalArea.toFixed(1)} m² · escala 1:${Math.round(100 / zoom) / 100}`
      : "Planta vazia — peça algo no chat para começar";
    ctx.save();
    ctx.fillStyle = "rgba(15,23,41,0.78)";
    ctx.fillRect(0, size.h - 28, size.w, 28);
    ctx.fillStyle = "rgba(198,169,98,0.95)";
    ctx.font = "500 12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 14, size.h - 14);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "500 11px ui-sans-serif, system-ui";
    const help = selected
      ? "Del p/ remover · R p/ girar · Esc p/ desselecionar"
      : `zoom ${(zoom * 100).toFixed(0)}%  ·  scroll p/ zoom · arraste p/ mover`;
    ctx.fillText(help, size.w - 14, size.h - 14);
    ctx.restore();
  }

  // Cursor based on hover / interaction
  const cursor = (() => {
    const it = interactionRef.current;
    if (it.kind === "drag-furniture") return "grabbing";
    if (it.kind === "resize-wall") {
      return it.wall === "north" || it.wall === "south" ? "ns-resize" : "ew-resize";
    }
    if (it.kind === "pan") return "grabbing";
    if (hover.kind === "wall") {
      return hover.wall === "north" || hover.wall === "south" ? "ns-resize" : "ew-resize";
    }
    if (hover.kind === "furniture") return "move";
    return "grab";
  })();

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#1a1a2e]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor }}
      />

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-gold/30 bg-bg-panel/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur"
          style={{ left: tooltip.x, top: tooltip.y, maxWidth: 240 }}
        >
          {tooltip.lines.map((l, i) => (
            <div key={i} className={i === 0 ? "font-semibold text-gold-light" : "text-white/75"}>
              {l}
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          plan={plan}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setContextMenu(null);
            onDeleteSelected();
          }}
          onRotate={() => {
            const t = contextMenu.target;
            if (t.type !== "furniture") return;
            const f = plan.furniture.find((ff) => ff.id === t.id);
            if (!f) return;
            const room = plan.rooms.find((rr) => rr.id === f.roomId);
            const cx = f.x + f.width / 2;
            const cy = f.y + f.height / 2;
            const nw = f.height;
            const nh = f.width;
            let nx = cx - nw / 2;
            let ny = cy - nh / 2;
            if (room) {
              nx = Math.max(room.x, Math.min(room.x + room.width - nw, nx));
              ny = Math.max(room.y, Math.min(room.y + room.height - nh, ny));
            }
            onUpdateFurniture(f.id, {
              width: nw,
              height: nh,
              x: nx,
              y: ny,
              rotation: ((f.rotation ?? 0) + 90) % 360,
            });
            setContextMenu(null);
          }}
        />
      )}

      {plan.rooms.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-gold/20 bg-bg-panel/60 px-6 py-4 text-center">
            <div className="text-2xl font-light gold-glow text-gold">Collection Architect</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-white/50">Agent-Powered Design</div>
            <div className="mt-3 text-sm text-white/70">Comece pedindo no chat ao lado →</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextMenu({
  state,
  plan,
  onClose,
  onDelete,
  onRotate,
}: {
  state: ContextMenuState;
  plan: FloorPlan;
  onClose: () => void;
  onDelete: () => void;
  onRotate: () => void;
}) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-ctxmenu]");
      if (!el) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const t = state.target;
  const items: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (t.type === "furniture") {
    const f = plan.furniture.find((ff) => ff.id === t.id);
    items.push({ label: "Girar 90°", onClick: onRotate });
    items.push({ label: `Remover ${f?.label ?? "móvel"}`, onClick: onDelete, danger: true });
  } else if (t.type === "room") {
    const r = plan.rooms.find((rr) => rr.id === t.id);
    items.push({ label: `Remover ${r?.name ?? "cômodo"}`, onClick: onDelete, danger: true });
  } else if (t.type === "door") {
    items.push({ label: "Remover porta", onClick: onDelete, danger: true });
  } else if (t.type === "window") {
    items.push({ label: "Remover janela", onClick: onDelete, danger: true });
  }

  return (
    <div
      data-ctxmenu
      className="absolute z-20 min-w-[170px] overflow-hidden rounded-md border border-white/10 bg-bg-panel/95 py-1 text-sm shadow-xl backdrop-blur"
      style={{ left: state.x, top: state.y }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={it.onClick}
          className={`block w-full px-3 py-1.5 text-left transition hover:bg-white/5 ${
            it.danger ? "text-red-300 hover:text-red-200" : "text-white/85"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function describeSelection(plan: FloorPlan, sel: SelectedElement): string[] | null {
  if (sel.type === "furniture") {
    const f = plan.furniture.find((ff) => ff.id === sel.id);
    if (!f) return null;
    const room = plan.rooms.find((rr) => rr.id === f.roomId);
    return [
      f.label,
      `${f.width.toFixed(2)} × ${f.height.toFixed(2)} m`,
      `em ${room?.name ?? "?"}`,
    ];
  }
  if (sel.type === "room") {
    const r = plan.rooms.find((rr) => rr.id === sel.id);
    if (!r) return null;
    return [r.name, `${r.width.toFixed(2)} × ${r.height.toFixed(2)} m`, `${(r.width * r.height).toFixed(1)} m² · ${r.floor}`];
  }
  if (sel.type === "wall") {
    const r = plan.rooms.find((rr) => rr.id === sel.roomId);
    if (!r) return null;
    const len = sel.wall === "north" || sel.wall === "south" ? r.width : r.height;
    return [`Parede ${pt(sel.wall)}`, `${r.name}`, `${len.toFixed(2)} m`];
  }
  if (sel.type === "door") {
    const d = plan.doors.find((dd) => dd.id === sel.id);
    if (!d) return null;
    const r = plan.rooms.find((rr) => rr.id === d.roomId);
    return ["Porta", `${r?.name ?? "?"} · ${pt(d.wall)}`, `${d.size.toFixed(2)} m`];
  }
  if (sel.type === "window") {
    const w = plan.windows.find((ww) => ww.id === sel.id);
    if (!w) return null;
    const r = plan.rooms.find((rr) => rr.id === w.roomId);
    return ["Janela", `${r?.name ?? "?"} · ${pt(w.wall)}`, `${w.size.toFixed(2)} m`];
  }
  return null;
}

function pt(wall: Wall): string {
  if (wall === "north") return "norte";
  if (wall === "south") return "sul";
  if (wall === "east") return "leste";
  return "oeste";
}

function anchorPoint(plan: FloorPlan, sel: SelectedElement): { x: number; y: number } | null {
  if (sel.type === "furniture") {
    const f = plan.furniture.find((ff) => ff.id === sel.id);
    if (!f) return null;
    return { x: f.x + f.width, y: f.y };
  }
  if (sel.type === "room") {
    const r = plan.rooms.find((rr) => rr.id === sel.id);
    if (!r) return null;
    return { x: r.x + r.width, y: r.y };
  }
  if (sel.type === "wall") {
    const r = plan.rooms.find((rr) => rr.id === sel.roomId);
    if (!r) return null;
    if (sel.wall === "north") return { x: r.x + r.width / 2, y: r.y };
    if (sel.wall === "south") return { x: r.x + r.width / 2, y: r.y + r.height };
    if (sel.wall === "west") return { x: r.x, y: r.y + r.height / 2 };
    return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
  if (sel.type === "door") {
    const d = plan.doors.find((dd) => dd.id === sel.id);
    if (!d) return null;
    const r = plan.rooms.find((rr) => rr.id === d.roomId);
    if (!r) return null;
    if (d.wall === "north") return { x: r.x + r.width * d.position, y: r.y };
    if (d.wall === "south") return { x: r.x + r.width * d.position, y: r.y + r.height };
    if (d.wall === "west") return { x: r.x, y: r.y + r.height * d.position };
    return { x: r.x + r.width, y: r.y + r.height * d.position };
  }
  if (sel.type === "window") {
    const w = plan.windows.find((ww) => ww.id === sel.id);
    if (!w) return null;
    const r = plan.rooms.find((rr) => rr.id === w.roomId);
    if (!r) return null;
    if (w.wall === "north") return { x: r.x + r.width * w.position, y: r.y };
    if (w.wall === "south") return { x: r.x + r.width * w.position, y: r.y + r.height };
    if (w.wall === "west") return { x: r.x, y: r.y + r.height * w.position };
    return { x: r.x + r.width, y: r.y + r.height * w.position };
  }
  return null;
}

function bounds(plan: FloorPlan): { x: number; y: number; w: number; h: number; signature: string } | null {
  if (plan.rooms.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of plan.rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    signature: `${plan.rooms.length}_${minX}_${minY}_${maxX}_${maxY}`,
  };
}
