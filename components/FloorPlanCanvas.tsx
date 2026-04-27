"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Door, FloorPlan, Furniture, Room, Window as PlanWindow } from "@/lib/types";
import { FURNITURE_SVGS, type SvgPath } from "@/lib/furniture-svgs";

interface Props {
  plan: FloorPlan;
}

const PX_PER_M = 40;
const GRID_M = 0.5;
const WALL_PX = 4; // wall stroke thickness in screen px
const WALL_COLOR = "#3a5a8c";

const FLOOR_COLORS = {
  madeira: { base: "#3d2a1f", accent: "#5a3d2b" },
  porcelanato: { base: "#e6e6e6", accent: "#cfcfcf" },
  ceramica: { base: "#d2cfc6", accent: "#bab6ab" },
  marmore: { base: "#f5f3ee", accent: "#d8d4ca" },
} as const;

export function FloorPlanCanvas({ plan }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; startPanX: number; startPanY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  const appearRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);
  // Path2D cache so we don't reparse SVG path strings every frame.
  const path2DCache = useRef<Map<string, Path2D>>(new Map());

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
  }, [plan, size, zoom, pan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.max(0.2, Math.min(4, zoom * factor));
      const wx = (cx - pan.x) / zoom;
      const wy = (cy - pan.y) / zoom;
      const newPanX = cx - wx * newZoom;
      const newPanY = cy - wy * newZoom;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };
    const onDown = (e: MouseEvent) => {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
    };
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      setPan({
        x: dragRef.current.startPanX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startPanY + (e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current.active = false;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom, pan.x, pan.y]);

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

    // Pass 1: floors and contents per-room (with proper clipping).
    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      drawRoomContents(ctx, room, plan, t);
    }

    // Pass 2: walls drawn AFTER all room contents so wall lines never get
    // overdrawn by floor patterns or labels of neighbors.
    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      drawRoomWalls(ctx, room, plan, t);
    }

    // Pass 3: doors and windows on top of walls.
    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      drawRoomOpenings(ctx, room, plan, t);
    }

    // Pass 4: dimensions / labels on top of everything.
    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      drawRoomLabelAndDims(ctx, room, t);
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

  function applyAppearTransform(ctx: CanvasRenderingContext2D, room: Room, appear: number) {
    if (appear >= 1) return;
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = 0.9 + 0.1 * appear;
    ctx.globalAlpha = appear;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
  }

  // Draws the floor pattern AND furniture inside the room, with a strict clip
  // so neither bleeds outside the room rectangle.
  function drawRoomContents(ctx: CanvasRenderingContext2D, room: Room, planRef: FloorPlan, appear: number) {
    ctx.save();
    applyAppearTransform(ctx, room, appear);

    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;

    // Hard clip to room rectangle. Everything drawn until restore() is bounded.
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    drawFloorPattern(ctx, x, y, w, h, room.floor);

    // Furniture (also inside the clip).
    for (const f of planRef.furniture.filter((ff) => ff.roomId === room.id)) {
      drawFurniture(ctx, f);
    }

    ctx.restore();
  }

  function drawRoomWalls(ctx: CanvasRenderingContext2D, room: Room, planRef: FloorPlan, appear: number) {
    ctx.save();
    applyAppearTransform(ctx, room, appear);

    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;

    ctx.strokeStyle = WALL_COLOR;
    ctx.fillStyle = WALL_COLOR;
    ctx.lineWidth = WALL_PX;
    ctx.lineCap = "butt";

    const walls: { wall: Door["wall"]; x1: number; y1: number; x2: number; y2: number; lengthMeters: number }[] = [
      { wall: "north", x1: x, y1: y, x2: x + w, y2: y, lengthMeters: room.width },
      { wall: "south", x1: x, y1: y + h, x2: x + w, y2: y + h, lengthMeters: room.width },
      { wall: "west", x1: x, y1: y, x2: x, y2: y + h, lengthMeters: room.height },
      { wall: "east", x1: x + w, y1: y, x2: x + w, y2: y + h, lengthMeters: room.height },
    ];

    for (const wseg of walls) {
      const openings = [
        ...planRef.doors.filter((d) => d.roomId === room.id && d.wall === wseg.wall),
        ...planRef.windows.filter((wn) => wn.roomId === room.id && wn.wall === wseg.wall),
      ].map((o) => ({
        start: o.position - o.size / wseg.lengthMeters / 2,
        end: o.position + o.size / wseg.lengthMeters / 2,
      }));
      drawSegmentedLine(ctx, wseg.x1, wseg.y1, wseg.x2, wseg.y2, openings);
    }

    // Filled corner squares: ensure clean L-joints and T-joints regardless of
    // the surrounding rooms. A WALL_PX × WALL_PX square centered on each
    // rectangle corner closes any gap left by butt-capped wall strokes.
    const t = WALL_PX;
    ctx.fillRect(x - t / 2, y - t / 2, t, t);
    ctx.fillRect(x + w - t / 2, y - t / 2, t, t);
    ctx.fillRect(x - t / 2, y + h - t / 2, t, t);
    ctx.fillRect(x + w - t / 2, y + h - t / 2, t, t);

    ctx.restore();
  }

  function drawRoomOpenings(ctx: CanvasRenderingContext2D, room: Room, planRef: FloorPlan, appear: number) {
    ctx.save();
    applyAppearTransform(ctx, room, appear);

    for (const d of planRef.doors.filter((dd) => dd.roomId === room.id)) {
      drawDoor(ctx, room, d);
    }
    for (const win of planRef.windows.filter((ww) => ww.roomId === room.id)) {
      drawWindow(ctx, room, win);
    }

    ctx.restore();
  }

  function drawRoomLabelAndDims(ctx: CanvasRenderingContext2D, room: Room, appear: number) {
    ctx.save();
    applyAppearTransform(ctx, room, appear);
    drawRoomLabel(ctx, room);
    drawRoomDimensions(ctx, room);
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

    ctx.fillStyle = c.base;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1;

    if (floor === "madeira") {
      const plank = PX_PER_M * 0.25;
      // Inset by half a pixel so antialiasing on the boundary line never
      // shows past the room rectangle.
      for (let py = y + plank; py < y + h - 0.5; py += plank) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
      ctx.lineWidth = 0.7;
      for (let py = y; py < y + h - 0.5; py += plank) {
        const offset = ((py * 13) % (PX_PER_M * 1.2)) + PX_PER_M * 0.6;
        for (let px = x + offset; px < x + w - 0.5; px += PX_PER_M * 1.2) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, Math.min(py + plank, y + h));
          ctx.stroke();
        }
      }
    } else if (floor === "porcelanato") {
      const tile = PX_PER_M * 0.6;
      for (let px = x + tile; px < x + w - 0.5; px += tile) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
        ctx.stroke();
      }
      for (let py = y + tile; py < y + h - 0.5; py += tile) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
    } else if (floor === "ceramica") {
      const tile = PX_PER_M * 0.3;
      for (let px = x + tile; px < x + w - 0.5; px += tile) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
        ctx.stroke();
      }
      for (let py = y + tile; py < y + h - 0.5; py += tile) {
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

  function wallEndpoints(room: Room, wall: Door["wall"]): { x1: number; y1: number; x2: number; y2: number } {
    const x = room.x * PX_PER_M;
    const y = room.y * PX_PER_M;
    const w = room.width * PX_PER_M;
    const h = room.height * PX_PER_M;
    if (wall === "north") return { x1: x, y1: y, x2: x + w, y2: y };
    if (wall === "south") return { x1: x, y1: y + h, x2: x + w, y2: y + h };
    if (wall === "west") return { x1: x, y1: y, x2: x, y2: y + h };
    return { x1: x + w, y1: y, x2: x + w, y2: y + h };
  }

  function inwardNormal(wall: Door["wall"]): { x: number; y: number } {
    if (wall === "north") return { x: 0, y: 1 };
    if (wall === "south") return { x: 0, y: -1 };
    if (wall === "west") return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  function drawDoor(ctx: CanvasRenderingContext2D, room: Room, door: Door) {
    // Door swing/leaf is drawn ONLY for the room the door swings into.
    // Both rooms in a shared doorway get a Door record so each room's wall is
    // properly cut, but only the non-silent record renders the arc & leaf.
    if (door.silent) return;

    const ep = wallEndpoints(room, door.wall);
    const lengthM = door.wall === "north" || door.wall === "south" ? room.width : room.height;
    const sizePx = door.size * PX_PER_M;
    const t = door.position;
    const cx = ep.x1 + (ep.x2 - ep.x1) * t;
    const cy = ep.y1 + (ep.y2 - ep.y1) * t;

    // Unit vector along the wall.
    const wallLenPx = lengthM * PX_PER_M;
    const wdx = (ep.x2 - ep.x1) / wallLenPx;
    const wdy = (ep.y2 - ep.y1) / wallLenPx;

    // Hinge is at the "start" end of the opening; door opens TOWARDS the inside.
    const sx = cx - wdx * (sizePx / 2);
    const sy = cy - wdy * (sizePx / 2);
    const ex = cx + wdx * (sizePx / 2);
    const ey = cy + wdy * (sizePx / 2);

    const inward = inwardNormal(door.wall);

    // Leaf: from hinge to the perpendicular-into-room point.
    ctx.save();
    ctx.strokeStyle = "#C6A962";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + inward.x * sizePx, sy + inward.y * sizePx);
    ctx.stroke();

    // Arc: 90° sweep from "along wall toward other end" to "into room".
    // Pick the COUNTERCLOCKWISE flag based on which direction is the short way.
    // Cross of (wallDir × inwardDir) — sign decides whether to go ccw or cw to
    // span exactly 90°. Fixes inverted arcs for south & west walls.
    const startAngle = Math.atan2(ey - sy, ex - sx);
    const endAngle = Math.atan2(inward.y, inward.x);
    const cross = wdx * inward.y - wdy * inward.x;
    const counterclockwise = cross < 0;

    ctx.strokeStyle = "rgba(198,169,98,0.55)";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, sizePx, startAngle, endAngle, counterclockwise);
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
    const wallLenPx = lengthM * PX_PER_M;
    const dx = (ep.x2 - ep.x1) / wallLenPx;
    const dy = (ep.y2 - ep.y1) / wallLenPx;
    const sx = cx - dx * (sizePx / 2);
    const sy = cy - dy * (sizePx / 2);
    const ex = cx + dx * (sizePx / 2);
    const ey = cy + dy * (sizePx / 2);
    const px = -dy;
    const py = dx;
    const off = 2;

    ctx.save();
    ctx.strokeStyle = "#7eb6ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx + px * off, sy + py * off);
    ctx.lineTo(ex + px * off, ey + py * off);
    ctx.moveTo(sx - px * off, sy - py * off);
    ctx.lineTo(ex - px * off, ey - py * off);
    ctx.stroke();
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = WALL_PX;
    ctx.beginPath();
    ctx.moveTo(sx + px * off, sy + py * off);
    ctx.lineTo(sx - px * off, sy - py * off);
    ctx.moveTo(ex + px * off, ey + py * off);
    ctx.lineTo(ex - px * off, ey - py * off);
    ctx.stroke();
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

  // ---------- Furniture rendering via SVG path data ----------

  function getPath2D(d: string): Path2D | null {
    const cache = path2DCache.current;
    let p = cache.get(d);
    if (!p) {
      try {
        p = new Path2D(d);
      } catch {
        return null;
      }
      cache.set(d, p);
    }
    return p;
  }

  function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture) {
    const x = f.x * PX_PER_M;
    const y = f.y * PX_PER_M;
    const w = f.width * PX_PER_M;
    const h = f.height * PX_PER_M;

    const svg = FURNITURE_SVGS[f.type];
    if (svg) {
      const sx = w / svg.viewBox.w;
      const sy = h / svg.viewBox.h;
      // Average scale used to counter-scale stroke widths so pen weights stay
      // roughly constant in screen pixels regardless of furniture size.
      const sAvg = (sx + sy) / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const p of svg.paths) {
        const path = getPath2D(p.d);
        if (!path) continue;
        if (p.fill) {
          ctx.fillStyle = p.fill;
          ctx.fill(path);
        }
        if (p.noStroke) continue;
        ctx.strokeStyle = p.stroke ?? "rgba(198,169,98,0.95)";
        ctx.lineWidth = (p.weight ?? 1.0) / sAvg;
        if (p.dash && p.dash.length) {
          ctx.setLineDash(p.dash.map((v) => v / sAvg));
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke(path);
      }
      ctx.setLineDash([]);
      ctx.restore();
    } else {
      // Fallback: simple outlined rectangle for unknown types.
      ctx.save();
      ctx.fillStyle = "rgba(28,38,66,0.78)";
      ctx.strokeStyle = "rgba(198,169,98,0.85)";
      ctx.lineWidth = 1.2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // Label sits below the furniture symbol so it never overlaps SVG details.
    if (w > 28 && h > 14) {
      ctx.save();
      ctx.fillStyle = "rgba(230,233,240,0.92)";
      ctx.font = "500 9px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(f.label, x + w / 2, y + h - 3);
      ctx.restore();
    }
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
    ctx.fillText(`zoom ${(zoom * 100).toFixed(0)}%  ·  scroll p/ zoom · arraste p/ mover`, size.w - 14, size.h - 14);
    ctx.restore();
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#1a1a2e]">
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />
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

// Re-export so other modules can import the SvgPath type if they extend the catalog.
export type { SvgPath };
