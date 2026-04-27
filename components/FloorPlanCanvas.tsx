"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Door, FloorPlan, Furniture, Room, Window as PlanWindow } from "@/lib/types";

interface Props {
  plan: FloorPlan;
}

const PX_PER_M = 40;
const GRID_M = 0.5;
const WALL_PX = 4;

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
    // center
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
      // remove keys for rooms that no longer exist
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

  // Mouse pan/zoom
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
      // zoom around cursor
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

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, size.w, size.h);

    // Subtle radial vignette
    const grad = ctx.createRadialGradient(size.w / 2, size.h / 2, 50, size.w / 2, size.h / 2, Math.max(size.w, size.h));
    grad.addColorStop(0, "rgba(255,255,255,0.02)");
    grad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.w, size.h);

    // Draw grid (in world space)
    drawGrid(ctx);

    // Apply world transform for rooms
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Rooms
    for (const room of plan.rooms) {
      const t = appearRef.current[room.id] ?? 1;
      drawRoom(ctx, room, plan, t);
    }

    ctx.restore();

    // Footer info
    drawFooter(ctx);
  }

  function drawGrid(ctx: CanvasRenderingContext2D) {
    const stepWorld = GRID_M * PX_PER_M;
    const step = stepWorld * zoom;
    if (step < 6) return; // too dense
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
    // major lines every 2m
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

    // Entrance animation: scale around center
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
      // subtle hatch to suggest movement
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

    // Walls (drawn with gaps for doors and windows)
    drawWalls(ctx, room, planRef);

    // Doors
    for (const d of planRef.doors.filter((d) => d.roomId === room.id)) {
      drawDoor(ctx, room, d);
    }
    // Windows
    for (const win of planRef.windows.filter((w) => w.roomId === room.id)) {
      drawWindow(ctx, room, win);
    }

    // Furniture
    for (const f of planRef.furniture.filter((f) => f.roomId === room.id)) {
      drawFurniture(ctx, f);
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
      // horizontal planks
      const plank = PX_PER_M * 0.25;
      for (let py = y; py < y + h; py += plank) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
        ctx.stroke();
      }
      // random offset plank ends
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
      // diagonal subtle veins
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
    // holes are in 0..1 along the segment
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

  function drawDoor(ctx: CanvasRenderingContext2D, room: Room, door: Door) {
    const ep = wallEndpoints(room, door.wall);
    const lengthM = door.wall === "north" || door.wall === "south" ? room.width : room.height;
    const sizePx = door.size * PX_PER_M;
    const t = door.position;
    const cx = ep.x1 + (ep.x2 - ep.x1) * t;
    const cy = ep.y1 + (ep.y2 - ep.y1) * t;
    // direction along wall
    const dx = (ep.x2 - ep.x1) / (lengthM * PX_PER_M);
    const dy = (ep.y2 - ep.y1) / (lengthM * PX_PER_M);
    const sx = cx - dx * (sizePx / 2);
    const sy = cy - dy * (sizePx / 2);
    const ex = cx + dx * (sizePx / 2);
    const ey = cy + dy * (sizePx / 2);

    // door swing (quarter arc) — inward
    const inward = inwardNormal(door.wall);
    ctx.save();
    ctx.strokeStyle = "#C6A962";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // door leaf
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + inward.x * sizePx, sy + inward.y * sizePx);
    ctx.stroke();
    // arc
    ctx.strokeStyle = "rgba(198,169,98,0.5)";
    ctx.beginPath();
    const startAngle = Math.atan2(ey - sy, ex - sx);
    const endAngle = Math.atan2(inward.y, inward.x);
    ctx.arc(sx, sy, sizePx, startAngle, endAngle, false);
    ctx.stroke();
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
    // perpendicular for double-line
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
    // end caps
    ctx.strokeStyle = "#3a5a8c";
    ctx.lineWidth = WALL_PX;
    ctx.beginPath();
    ctx.moveTo(sx + px * off, sy + py * off);
    ctx.lineTo(sx - px * off, sy - py * off);
    ctx.moveTo(ex + px * off, ey + py * off);
    ctx.lineTo(ex - px * off, ey - py * off);
    ctx.stroke();
    ctx.restore();
  }

  function inwardNormal(wall: Door["wall"]): { x: number; y: number } {
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

    // top width dimension
    ctx.beginPath();
    ctx.moveTo(x, y - off);
    ctx.lineTo(x + w, y - off);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${room.width.toFixed(2)} m`, x + w / 2, y - off - 6);

    // right height dimension
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

  function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture) {
    const x = f.x * PX_PER_M;
    const y = f.y * PX_PER_M;
    const w = f.width * PX_PER_M;
    const h = f.height * PX_PER_M;

    ctx.save();
    ctx.fillStyle = "rgba(28,38,66,0.82)";
    ctx.strokeStyle = "rgba(198,169,98,0.85)";
    ctx.lineWidth = 1.2;

    switch (f.type) {
      case "sofa":
        roundRect(ctx, x, y, w, h, 6);
        ctx.fill();
        ctx.stroke();
        // cushions
        ctx.strokeStyle = "rgba(198,169,98,0.55)";
        for (let i = 1; i < 3; i++) {
          const cx = x + (w / 3) * i;
          ctx.beginPath();
          ctx.moveTo(cx, y + 4);
          ctx.lineTo(cx, y + h - 4);
          ctx.stroke();
        }
        break;
      case "bed":
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.stroke();
        // pillow
        ctx.fillStyle = "rgba(198,169,98,0.4)";
        roundRect(ctx, x + 4, y + 4, w - 8, Math.min(h * 0.22, 16), 3);
        ctx.fill();
        break;
      case "table":
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();
        break;
      case "tv":
        ctx.fillStyle = "#0d0d0d";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(198,169,98,0.85)";
        ctx.strokeRect(x, y, w, h);
        break;
      case "sink":
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "toilet":
        // tank
        ctx.fillStyle = "rgba(220,220,220,0.85)";
        ctx.fillRect(x, y, w, h * 0.35);
        // bowl
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 0.7, w * 0.45, h * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(198,169,98,0.85)";
        ctx.stroke();
        ctx.strokeRect(x, y, w, h * 0.35);
        break;
      case "shower":
        roundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        ctx.stroke();
        // diagonal hatch
        ctx.strokeStyle = "rgba(198,169,98,0.4)";
        ctx.beginPath();
        for (let i = -h; i < w; i += 6) {
          ctx.moveTo(x + i, y);
          ctx.lineTo(x + i + h, y + h);
        }
        ctx.stroke();
        break;
      case "stove":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        // 4 burners
        ctx.fillStyle = "rgba(198,169,98,0.6)";
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            ctx.beginPath();
            ctx.arc(x + w * (0.3 + 0.4 * i), y + h * (0.3 + 0.4 * j), Math.min(w, h) * 0.12, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      case "fridge":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        // door split
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.4);
        ctx.lineTo(x + w, y + h * 0.4);
        ctx.stroke();
        // handle
        ctx.fillStyle = "rgba(198,169,98,0.85)";
        ctx.fillRect(x + w - 6, y + 4, 2, h * 0.3);
        break;
      case "counter":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        break;
      case "island":
        roundRect(ctx, x, y, w, h, 6);
        ctx.fill();
        ctx.stroke();
        break;
      case "wardrobe":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        // door splits
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (w / 3) * i, y);
          ctx.lineTo(x + (w / 3) * i, y + h);
          ctx.stroke();
        }
        break;
      case "desk":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        break;
      case "chair":
        roundRect(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.stroke();
        break;
      case "bookshelf":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x, y + (h / 4) * i);
          ctx.lineTo(x + w, y + (h / 4) * i);
          ctx.stroke();
        }
        break;
      case "washing_machine":
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }

    // label
    ctx.fillStyle = "rgba(230,233,240,0.9)";
    ctx.font = "500 9px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (w > 30 && h > 18) {
      ctx.fillText(f.label, x + w / 2, y + h / 2);
    }

    ctx.restore();
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
