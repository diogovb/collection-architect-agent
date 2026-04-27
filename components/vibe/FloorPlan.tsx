"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Door, FloorPlan, Furniture, Room, SelectedElement, Wall, Window as PlanWindow } from "@/lib/types";
import type { Camera } from "@/lib/vibe-types";

const M_TO_PX = 50; // 1 meter = 50px
const SNAP_M = 0.1; // 10cm grid for furniture/walls
const MIN_ROOM_M = 1.0; // minimum room dimension

interface Props {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onSelect: (s: SelectedElement | null) => void;
  cameras: Camera[];
  activeCameraId?: string;
  onSelectCamera?: (id: string) => void;
  showDiff?: boolean;
  diffTargetId?: string | null;
  /** light/clean style for presentation. */
  variant?: "editor" | "presentation";
  /** Mutations — provided in editor variant. */
  updateFurniture?: (id: string, patch: Partial<Furniture>) => void;
  updateRoom?: (id: string, patch: Partial<Room>) => void;
  removeSelected?: () => void;
  rotateSelected?: () => void;
  /** Optional callback shown on the empty-state CTA. */
  onLoadExample?: () => void;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

function computeBounds(plan: FloorPlan): Bounds {
  if (plan.rooms.length === 0) {
    return { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { minX, minY, maxX, maxY };
}

// ----- Wall classification -----
//
// Each room is an axis-aligned rectangle. A wall segment is "internal" when
// rooms exist on both sides of the line (shared wall between two rooms) and
// "external" when only one side has a room (envelope perimeter).
//
// We treat each axis (horizontal / vertical) independently. For each unique
// y-coordinate that any room has as a top or bottom edge, we collect intervals
// where rooms sit above (north of) and below (south of) that line, then sweep
// to find sub-intervals classified as internal or external. Same for vertical
// lines, with rooms to the left/right.

interface Interval { start: number; end: number; }
interface WallSeg { axis: "h" | "v"; fixed: number; start: number; end: number; }

const WALL_EPS = 1e-3; // 1mm tolerance — tighter than the 10cm furniture grid.

function classifyAlongLine(setA: Interval[], setB: Interval[]):
  { start: number; end: number; aHas: boolean; bHas: boolean; }[] {
  const events: { x: number; delta: number; which: 0 | 1 }[] = [];
  for (const i of setA) {
    events.push({ x: i.start, delta: 1, which: 0 });
    events.push({ x: i.end,   delta: -1, which: 0 });
  }
  for (const i of setB) {
    events.push({ x: i.start, delta: 1, which: 1 });
    events.push({ x: i.end,   delta: -1, which: 1 });
  }
  if (events.length === 0) return [];
  events.sort((p, q) => p.x - q.x || p.delta - q.delta);
  const out: { start: number; end: number; aHas: boolean; bHas: boolean }[] = [];
  let aCount = 0, bCount = 0;
  let prevX = events[0].x;
  for (const ev of events) {
    if (ev.x - prevX > WALL_EPS && (aCount > 0 || bCount > 0)) {
      out.push({ start: prevX, end: ev.x, aHas: aCount > 0, bHas: bCount > 0 });
    }
    if (ev.which === 0) aCount += ev.delta; else bCount += ev.delta;
    prevX = ev.x;
  }
  return out;
}

function computeWalls(rooms: Room[]): { external: WallSeg[]; internal: WallSeg[] } {
  const horiz = new Map<number, { above: Interval[]; below: Interval[] }>();
  const vert  = new Map<number, { left: Interval[]; right: Interval[] }>();
  const k = (n: number) => Math.round(n * 1000);
  const getH = (y: number) => {
    const yk = k(y);
    let g = horiz.get(yk);
    if (!g) { g = { above: [], below: [] }; horiz.set(yk, g); }
    return g;
  };
  const getV = (x: number) => {
    const xk = k(x);
    let g = vert.get(xk);
    if (!g) { g = { left: [], right: [] }; vert.set(xk, g); }
    return g;
  };

  for (const r of rooms) {
    // Top edge: room interior lies BELOW this y line.
    getH(r.y).below.push({ start: r.x, end: r.x + r.width });
    // Bottom edge: room interior lies ABOVE this y line.
    getH(r.y + r.height).above.push({ start: r.x, end: r.x + r.width });
    // Left edge: room interior lies to the RIGHT of this x line.
    getV(r.x).right.push({ start: r.y, end: r.y + r.height });
    // Right edge: room interior lies to the LEFT.
    getV(r.x + r.width).left.push({ start: r.y, end: r.y + r.height });
  }

  const external: WallSeg[] = [];
  const internal: WallSeg[] = [];

  horiz.forEach(({ above, below }, yk) => {
    const y = yk / 1000;
    for (const s of classifyAlongLine(above, below)) {
      const seg: WallSeg = { axis: "h", fixed: y, start: s.start, end: s.end };
      (s.aHas && s.bHas ? internal : external).push(seg);
    }
  });
  vert.forEach(({ left, right }, xk) => {
    const x = xk / 1000;
    for (const s of classifyAlongLine(left, right)) {
      const seg: WallSeg = { axis: "v", fixed: x, start: s.start, end: s.end };
      (s.aHas && s.bHas ? internal : external).push(seg);
    }
  });

  return { external, internal };
}

function fmtMm(m: number): string {
  return `${(m * 1000).toFixed(0)}`;
}

function snap(v: number, step = SNAP_M): number {
  return Math.round(v / step) * step;
}

type DragKind =
  | { kind: "furniture"; id: string; offsetX: number; offsetY: number }
  | { kind: "wall"; roomId: string; wall: Wall; orig: { x: number; y: number; width: number; height: number } };

type ContextMenuState = {
  x: number; // page coords
  y: number;
  target: SelectedElement;
} | null;

export function FloorPlan({
  plan,
  selected,
  onSelect,
  cameras,
  activeCameraId,
  onSelectCamera,
  showDiff,
  diffTargetId,
  variant = "editor",
  updateFurniture,
  updateRoom,
  removeSelected,
  rotateSelected,
  onLoadExample,
}: Props) {
  const bounds = useMemo(() => computeBounds(plan), [plan]);
  const walls = useMemo(() => computeWalls(plan.rooms), [plan.rooms]);
  const padding = 2;
  const widthM = bounds.maxX - bounds.minX + padding * 2;
  const heightM = bounds.maxY - bounds.minY + padding * 2;
  const widthPx = widthM * M_TO_PX;
  const heightPx = heightM * M_TO_PX;

  // Coordinate transform
  const toX = (m: number) => (m - bounds.minX + padding) * M_TO_PX;
  const toY = (m: number) => (m - bounds.minY + padding) * M_TO_PX;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentRef = useRef<SVGGElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragKind | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState>(null);

  // Zoom + pan state (only used in editor variant).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);

  const isEditor = variant === "editor";

  // Convert client coords → meters. Uses the inner content group's CTM so that
  // zoom/pan transforms applied to that group are accounted for automatically.
  function clientToMeters(clientX: number, clientY: number): { mx: number; my: number } | null {
    const svg = svgRef.current;
    const g = contentRef.current ?? svg;
    if (!svg || !g) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = g.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return {
      mx: p.x / M_TO_PX + bounds.minX - padding,
      my: p.y / M_TO_PX + bounds.minY - padding,
    };
  }

  // Convert client coords → svg viewBox px (does NOT account for the inner group transform).
  function clientToSvgPx(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // Wheel zoom — anchored on cursor. Attached as non-passive via useEffect below
  // so that preventDefault() actually stops the page from scrolling.
  useEffect(() => {
    if (!isEditor) return;
    const svg = svgRef.current;
    if (!svg) return;
    function handler(e: WheelEvent) {
      e.preventDefault();
      const svgPt = clientToSvgPx(e.clientX, e.clientY);
      if (!svgPt) return;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (newZoom === zoom) return;
      const cx = (svgPt.x - pan.x) / zoom;
      const cy = (svgPt.y - pan.y) / zoom;
      setPan({ x: svgPt.x - newZoom * cx, y: svgPt.y - newZoom * cy });
      setZoom(newZoom);
    }
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pan, isEditor]);

  // Programmatic zoom (used by the +/- buttons; anchors on the SVG center).
  function zoomBy(factor: number) {
    const newZoom = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);
    if (newZoom === zoom) return;
    const cx = widthPx / 2;
    const cy = heightPx / 2;
    const px = (cx - pan.x) / zoom;
    const py = (cy - pan.y) / zoom;
    setPan({ x: cx - newZoom * px, y: cy - newZoom * py });
    setZoom(newZoom);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Pan handler — drives panning state via global mouse listeners while active.
  useEffect(() => {
    if (!panning) return;
    function onMove(e: MouseEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      // Convert deltas in client px → svg viewBox px using the SVG CTM.
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const sx = 1 / ctm.a; // scale factor screen→svg
      const sy = 1 / ctm.d;
      const dx = (e.clientX - panning!.startClientX) * sx;
      const dy = (e.clientY - panning!.startClientY) * sy;
      setPan({ x: panning!.startPanX + dx, y: panning!.startPanY + dy });
      setDidDrag(true);
    }
    function onUp() {
      setPanning(null);
      setTimeout(() => setDidDrag(false), 0);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panning]);

  // Global mouse listeners while dragging — keeps drag alive even if cursor leaves SVG.
  useEffect(() => {
    if (!drag) return;
    function onMove(e: MouseEvent) {
      const m = clientToMeters(e.clientX, e.clientY);
      if (!m) return;
      setDidDrag(true);
      if (drag!.kind === "furniture") {
        const f = plan.furniture.find((x) => x.id === drag!.id);
        if (!f || !updateFurniture) return;
        const nx = snap(m.mx - drag!.offsetX);
        const ny = snap(m.my - drag!.offsetY);
        // Constrain to parent room bounds (allow free move otherwise)
        const room = plan.rooms.find((r) => r.id === f.roomId);
        let cx = nx;
        let cy = ny;
        if (room) {
          cx = Math.max(room.x, Math.min(room.x + room.width - f.width, nx));
          cy = Math.max(room.y, Math.min(room.y + room.height - f.height, ny));
        }
        updateFurniture(f.id, { x: cx, y: cy });
      } else if (drag!.kind === "wall") {
        const room = plan.rooms.find((r) => r.id === drag!.roomId);
        if (!room || !updateRoom) return;
        const orig = drag!.orig;
        if (drag!.wall === "north") {
          const newY = snap(m.my);
          const newH = orig.y + orig.height - newY;
          if (newH >= MIN_ROOM_M) updateRoom(room.id, { y: newY, height: newH });
        } else if (drag!.wall === "south") {
          const newH = snap(m.my - orig.y);
          if (newH >= MIN_ROOM_M) updateRoom(room.id, { height: newH });
        } else if (drag!.wall === "west") {
          const newX = snap(m.mx);
          const newW = orig.x + orig.width - newX;
          if (newW >= MIN_ROOM_M) updateRoom(room.id, { x: newX, width: newW });
        } else {
          const newW = snap(m.mx - orig.x);
          if (newW >= MIN_ROOM_M) updateRoom(room.id, { width: newW });
        }
      }
    }
    function onUp() {
      setDrag(null);
      // Reset didDrag on next tick so click handlers see it before clearing
      setTimeout(() => setDidDrag(false), 0);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, plan, updateFurniture, updateRoom]);

  // Dismiss context menu on outside click / escape
  useEffect(() => {
    if (!menu) return;
    function close() { setMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenu(null); }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function startFurnitureDrag(e: React.MouseEvent, f: Furniture) {
    if (!isEditor || !updateFurniture) return;
    e.stopPropagation();
    e.preventDefault();
    const m = clientToMeters(e.clientX, e.clientY);
    if (!m) return;
    setDrag({ kind: "furniture", id: f.id, offsetX: m.mx - f.x, offsetY: m.my - f.y });
    onSelect({ type: "furniture", id: f.id });
  }

  function startWallDrag(e: React.MouseEvent, room: Room, wall: Wall) {
    if (!isEditor || !updateRoom) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      kind: "wall",
      roomId: room.id,
      wall,
      orig: { x: room.x, y: room.y, width: room.width, height: room.height },
    });
    onSelect({ type: "wall", roomId: room.id, wall });
  }

  function handleSelect(target: SelectedElement, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (didDrag) return; // suppress click after drag
    onSelect(target);
  }

  function handleContextMenu(e: React.MouseEvent, target: SelectedElement) {
    if (!isEditor) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(target);
    setMenu({ x: e.clientX, y: e.clientY, target });
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="xMidYMid meet"
        className="block max-w-full max-h-full select-none"
        onMouseDown={(e) => {
          if (!isEditor) return;
          // Start pan only when mouse goes down on the SVG background itself
          // (not on a child element like a room/furniture).
          if (e.target !== e.currentTarget) return;
          if (e.button !== 0) return;
          setPanning({
            startClientX: e.clientX,
            startClientY: e.clientY,
            startPanX: pan.x,
            startPanY: pan.y,
          });
        }}
        onClick={(e) => {
          if (didDrag) return;
          // Only deselect if click landed on the SVG background itself.
          if (e.target === e.currentTarget) onSelect(null);
        }}
        onContextMenu={(e) => {
          // Right-click on empty area: dismiss any selection menu.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setMenu(null);
          }
        }}
        style={{ background: "transparent", cursor: panning ? "grabbing" : (isEditor ? "grab" : "default") }}
      >
        <defs>
          <pattern id="floor-grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#EFE8DB" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#E6DFD2" strokeWidth="0.6" />
          </pattern>
          <pattern id="tile" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="#EEE6D6" />
            <line x1="0" y1="0" x2="20" y2="0" stroke="#DDD3BD" strokeWidth="0.5" />
            <line x1="0" y1="0" x2="0" y2="20" stroke="#DDD3BD" strokeWidth="0.5" />
          </pattern>
          <pattern id="ceramica" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="#EFE8DB" />
            <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="#DDD3BD" strokeWidth="0.5" />
          </pattern>
          <pattern id="madeira" width="40" height="6" patternUnits="userSpaceOnUse">
            <rect width="40" height="6" fill="#EFE8DB" />
            <line x1="0" y1="0" x2="40" y2="0" stroke="#E0D5BB" strokeWidth="0.4" />
            <line x1="0" y1="6" x2="40" y2="6" stroke="#E0D5BB" strokeWidth="0.4" />
          </pattern>
        </defs>

        <g ref={contentRef} transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>

        {/* Floors per room */}
        {plan.rooms.map((r) => {
          const fill =
            r.floor === "porcelanato" ? "url(#tile)" :
            r.floor === "madeira" ? "url(#madeira)" :
            r.floor === "ceramica" ? "url(#ceramica)" :
            "#EEE6D6";
          const isSel = selected?.type === "room" && selected.id === r.id;
          const isHover = hover === `room-${r.id}`;
          return (
            <g key={r.id}
               onClick={(e) => handleSelect({ type: "room", id: r.id }, e)}
               onContextMenu={(e) => handleContextMenu(e, { type: "room", id: r.id })}
               onMouseEnter={() => setHover(`room-${r.id}`)}
               onMouseLeave={() => setHover((h) => (h === `room-${r.id}` ? null : h))}
               style={{ cursor: isEditor ? "pointer" : "default" }}>
              <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX} fill={fill} />
              {isHover && !isSel && isEditor && (
                <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX}
                      fill="#B8552E" opacity="0.04" pointerEvents="none" />
              )}
              {isSel && (
                <>
                  <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX}
                        fill="#B8552E" opacity="0.06" pointerEvents="none" />
                  <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX}
                        fill="none" stroke="#B8552E" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none" />
                </>
              )}
              <text
                x={toX(r.x + r.width / 2)} y={toY(r.y + r.height / 2) - 4}
                textAnchor="middle" fontSize="11"
                fill="#4A4338"
                pointerEvents="none"
                style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic" }}
              >
                {r.name}
              </text>
              <text
                x={toX(r.x + r.width / 2)} y={toY(r.y + r.height / 2) + 10}
                textAnchor="middle" fontSize="8"
                fill="#8C8478"
                pointerEvents="none"
                style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.1em" }}
              >
                {(r.width * r.height).toFixed(1).replace(".", ",")} M²
              </text>
            </g>
          );
        })}

        {/* Walls — segment-based, classified into external (12px) and
            internal/shared (8px). Each segment is rendered exactly once,
            so shared walls between adjacent rooms no longer double up. */}
        <g pointerEvents="none" shapeRendering="crispEdges">
          {walls.internal.map((s, i) => (
            <line
              key={`iw-${i}`}
              x1={s.axis === "h" ? toX(s.start) : toX(s.fixed)}
              y1={s.axis === "h" ? toY(s.fixed) : toY(s.start)}
              x2={s.axis === "h" ? toX(s.end)   : toX(s.fixed)}
              y2={s.axis === "h" ? toY(s.fixed) : toY(s.end)}
              stroke="#1F1B16"
              strokeWidth={8}
              strokeLinecap="square"
            />
          ))}
          {walls.external.map((s, i) => (
            <line
              key={`ew-${i}`}
              x1={s.axis === "h" ? toX(s.start) : toX(s.fixed)}
              y1={s.axis === "h" ? toY(s.fixed) : toY(s.start)}
              x2={s.axis === "h" ? toX(s.end)   : toX(s.fixed)}
              y2={s.axis === "h" ? toY(s.fixed) : toY(s.end)}
              stroke="#1F1B16"
              strokeWidth={12}
              strokeLinecap="square"
            />
          ))}
        </g>

        {/* Door openings */}
        {plan.doors.map((d) => {
          const isSel = selected?.type === "door" && selected.id === d.id;
          const isHover = hover === `door-${d.id}`;
          return (
            <DoorMark key={d.id} door={d} plan={plan} toX={toX} toY={toY}
                      selected={isSel}
                      hover={isHover && isEditor}
                      onSelect={(e) => handleSelect({ type: "door", id: d.id }, e)}
                      onContextMenu={(e) => handleContextMenu(e, { type: "door", id: d.id })}
                      onHoverChange={(v) => setHover(v ? `door-${d.id}` : (h) => h === `door-${d.id}` ? null : h)}
                      interactive={isEditor} />
          );
        })}

        {/* Windows */}
        {plan.windows.map((w) => {
          const isSel = selected?.type === "window" && selected.id === w.id;
          const isHover = hover === `window-${w.id}`;
          return (
            <WindowMark key={w.id} win={w} plan={plan} toX={toX} toY={toY}
                        selected={isSel}
                        hover={isHover && isEditor}
                        onSelect={(e) => handleSelect({ type: "window", id: w.id }, e)}
                        onContextMenu={(e) => handleContextMenu(e, { type: "window", id: w.id })}
                        onHoverChange={(v) => setHover(v ? `window-${w.id}` : (h) => h === `window-${w.id}` ? null : h)}
                        interactive={isEditor} />
          );
        })}

        {/* Furniture */}
        {plan.furniture.map((f) => {
          const isSel = selected?.type === "furniture" && selected.id === f.id;
          const isHover = hover === `furniture-${f.id}`;
          return (
            <FurnitureMark key={f.id} item={f} toX={toX} toY={toY}
                           selected={isSel}
                           hover={isHover && isEditor}
                           onMouseDown={(e) => startFurnitureDrag(e, f)}
                           onClick={(e) => handleSelect({ type: "furniture", id: f.id }, e)}
                           onContextMenu={(e) => handleContextMenu(e, { type: "furniture", id: f.id })}
                           onHoverChange={(v) => setHover(v ? `furniture-${f.id}` : (h) => h === `furniture-${f.id}` ? null : h)}
                           diff={showDiff && diffTargetId === f.id}
                           interactive={isEditor} />
          );
        })}

        {/* Wall handles for selected room (drag to resize) */}
        {isEditor && plan.rooms.map((r) => (
          <WallHandles
            key={`wh-${r.id}`}
            room={r}
            toX={toX}
            toY={toY}
            selected={selected}
            hover={hover}
            onHoverChange={(wall, v) => setHover(v ? `wall-${r.id}-${wall}` : (h) => h === `wall-${r.id}-${wall}` ? null : h)}
            onClick={(wall, e) => handleSelect({ type: "wall", roomId: r.id, wall }, e)}
            onContextMenu={(wall, e) => handleContextMenu(e, { type: "wall", roomId: r.id, wall })}
            onMouseDown={(wall, e) => startWallDrag(e, r, wall)}
          />
        ))}

        {/* Live-resize dimension readouts while dragging a wall */}
        {drag?.kind === "wall" && (() => {
          const room = plan.rooms.find((r) => r.id === drag.roomId);
          if (!room) return null;
          return <ResizeReadout room={room} toX={toX} toY={toY} />;
        })()}

        {/* Diff for wall-divisor */}
        {showDiff && diffTargetId === "wall-divisor" && (
          <DivisorDiff plan={plan} toX={toX} toY={toY} />
        )}

        {/* Cameras */}
        {isEditor && cameras.map((c) => (
          <CameraPin key={c.id} cam={c} toX={toX} toY={toY}
                     active={activeCameraId === c.id}
                     onSelect={() => onSelectCamera?.(c.id)} />
        ))}

        {/* Dimensions for living room (illustrative) */}
        {isEditor && (
          <Dimensions plan={plan} toX={toX} toY={toY} />
        )}

        </g>

        {/* Compass + Scale — anchored to the SVG corners (outside zoom/pan group) */}
        {isEditor && (
          <>
            <Compass x={widthPx - 60} y={50} />
            <ScaleBar x={30} y={heightPx - 30} />
          </>
        )}
      </svg>

      {/* Empty-state overlay */}
      {isEditor && plan.rooms.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="card pointer-events-auto p-5 text-center max-w-[340px] shadow-md">
            <div className="label-mono mb-2">CANVAS VAZIO</div>
            <div className="editorial text-[18px] mb-1">Comece pelo briefing</div>
            <p className="text-[12.5px] text-muted leading-relaxed mb-3">
              Descreva o projeto na conversa à direita — área, ambientes, estilo —
              e o Vibe começa a desenhar a planta.
            </p>
            {onLoadExample && (
              <button onClick={onLoadExample} className="btn-outline text-[11.5px] py-1 px-2.5">
                ↻ Carregar exemplo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      {isEditor && (
        <div className="absolute bottom-4 right-4 flex items-center gap-1 card px-1.5 py-1 shadow-sm pointer-events-auto">
          <button
            onClick={() => zoomBy(1 / 1.2)}
            title="Diminuir zoom"
            className="w-7 h-7 rounded text-muted hover:text-ink hover:bg-panel-alt flex items-center justify-center text-[14px] leading-none"
          >
            −
          </button>
          <button
            onClick={resetView}
            title="Ajustar à tela (resetar zoom)"
            className="px-2 h-7 rounded text-[11px] font-mono uppercase tracking-wider text-ink hover:bg-panel-alt min-w-[54px]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomBy(1.2)}
            title="Aumentar zoom"
            className="w-7 h-7 rounded text-muted hover:text-ink hover:bg-panel-alt flex items-center justify-center text-[14px] leading-none"
          >
            +
          </button>
        </div>
      )}

      {/* Context menu (HTML overlay so it isn't clipped by the SVG) */}
      {menu && isEditor && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          onClose={() => setMenu(null)}
          onRemove={() => { removeSelected?.(); setMenu(null); }}
          onRotate={() => { rotateSelected?.(); setMenu(null); }}
        />
      )}
    </div>
  );
}

// ---------- Wall handles ----------

function WallHandles({
  room, toX, toY, selected, hover,
  onHoverChange, onClick, onContextMenu, onMouseDown,
}: {
  room: Room;
  toX: (m: number) => number;
  toY: (m: number) => number;
  selected: SelectedElement | null;
  hover: string | null;
  onHoverChange: (wall: Wall, hovering: boolean) => void;
  onClick: (wall: Wall, e: React.MouseEvent) => void;
  onContextMenu: (wall: Wall, e: React.MouseEvent) => void;
  onMouseDown: (wall: Wall, e: React.MouseEvent) => void;
}) {
  const HANDLE_PX = 10; // hit area thickness
  const x = toX(room.x);
  const y = toY(room.y);
  const w = room.width * M_TO_PX;
  const h = room.height * M_TO_PX;

  const walls: { wall: Wall; cursor: string; rect: { x: number; y: number; w: number; h: number } }[] = [
    { wall: "north", cursor: "ns-resize", rect: { x, y: y - HANDLE_PX / 2, w, h: HANDLE_PX } },
    { wall: "south", cursor: "ns-resize", rect: { x, y: y + h - HANDLE_PX / 2, w, h: HANDLE_PX } },
    { wall: "west",  cursor: "ew-resize", rect: { x: x - HANDLE_PX / 2, y, w: HANDLE_PX, h } },
    { wall: "east",  cursor: "ew-resize", rect: { x: x + w - HANDLE_PX / 2, y, w: HANDLE_PX, h } },
  ];

  return (
    <g>
      {walls.map(({ wall, cursor, rect }) => {
        const isSel = selected?.type === "wall" && selected.roomId === room.id && selected.wall === wall;
        const isHover = hover === `wall-${room.id}-${wall}`;
        return (
          <g key={wall}>
            {/* Visible highlight on hover/select */}
            {(isSel || isHover) && (
              <rect
                x={rect.x} y={rect.y} width={rect.w} height={rect.h}
                fill={isSel ? "#B8552E" : "#B8552E"}
                opacity={isSel ? 0.55 : 0.25}
                pointerEvents="none"
              />
            )}
            {/* Hit area */}
            <rect
              x={rect.x} y={rect.y} width={rect.w} height={rect.h}
              fill="transparent"
              style={{ cursor }}
              onMouseEnter={() => onHoverChange(wall, true)}
              onMouseLeave={() => onHoverChange(wall, false)}
              onMouseDown={(e) => onMouseDown(wall, e)}
              onClick={(e) => onClick(wall, e)}
              onContextMenu={(e) => onContextMenu(wall, e)}
            />
          </g>
        );
      })}
    </g>
  );
}

function ResizeReadout({ room, toX, toY }: { room: Room; toX: (m: number) => number; toY: (m: number) => number; }) {
  const cx = toX(room.x + room.width / 2);
  const cy = toY(room.y + room.height / 2);
  return (
    <g pointerEvents="none">
      <rect x={cx - 60} y={cy - 14} width={120} height={28} rx={4} fill="#1F1B16" opacity="0.92" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="11" fill="#FAF7F0"
            style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.08em" }}>
        {room.width.toFixed(2)} × {room.height.toFixed(2)} M
      </text>
    </g>
  );
}

// ---------- Context menu ----------

function ContextMenu({
  x, y, target, onClose, onRemove, onRotate,
}: {
  x: number;
  y: number;
  target: SelectedElement;
  onClose: () => void;
  onRemove: () => void;
  onRotate: () => void;
}) {
  const canRotate = target.type === "furniture";
  const canRemove = target.type !== "wall";
  return (
    <div
      className="fixed z-50 bg-panel border border-line rounded-md shadow-[0_8px_24px_-12px_rgba(31,27,22,0.25)] py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {canRotate && (
        <button
          className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-panel-alt"
          onClick={onRotate}
        >
          Girar 90° <span className="text-muted ml-2 font-mono text-[10px]">R</span>
        </button>
      )}
      {canRemove && (
        <button
          className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-panel-alt text-[#B8552E]"
          onClick={onRemove}
        >
          Remover <span className="text-muted ml-2 font-mono text-[10px]">DEL</span>
        </button>
      )}
      <div className="h-px bg-line my-1" />
      <button
        className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-panel-alt text-muted"
        onClick={onClose}
      >
        Cancelar
      </button>
    </div>
  );
}

// ---------- Helpers (subcomponents) ----------

function wallSegment(room: Room, wall: Door["wall"], pos: number, size: number) {
  const along = (start: number, len: number) => start + (len * pos) - size / 2;
  if (wall === "north") {
    const x1 = along(room.x, room.width);
    return { x1, y1: room.y, x2: x1 + size, y2: room.y, axis: "h" as const };
  }
  if (wall === "south") {
    const x1 = along(room.x, room.width);
    return { x1, y1: room.y + room.height, x2: x1 + size, y2: room.y + room.height, axis: "h" as const };
  }
  if (wall === "west") {
    const y1 = along(room.y, room.height);
    return { x1: room.x, y1, x2: room.x, y2: y1 + size, axis: "v" as const };
  }
  const y1 = along(room.y, room.height);
  return { x1: room.x + room.width, y1, x2: room.x + room.width, y2: y1 + size, axis: "v" as const };
}

function DoorMark({ door, plan, toX, toY, selected, hover, onSelect, onContextMenu, onHoverChange, interactive }:
  { door: Door; plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number;
    selected?: boolean; hover?: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onHoverChange: (v: boolean) => void;
    interactive: boolean; }) {
  const room = plan.rooms.find((r) => r.id === door.roomId);
  if (!room) return null;
  const seg = wallSegment(room, door.wall, door.position, door.size);
  const sx = toX(Math.min(seg.x1, seg.x2));
  const sy = toY(Math.min(seg.y1, seg.y2));
  const w = seg.axis === "h" ? Math.abs(seg.x2 - seg.x1) * M_TO_PX : 14;
  const h = seg.axis === "v" ? Math.abs(seg.y2 - seg.y1) * M_TO_PX : 14;
  const radius = door.size * M_TO_PX;
  // Leaf: solid line from the hinge, perpendicular into the room (90° open).
  // Arc: dashed quarter-circle from leaf tip back to the closed position
  // along the wall, indicating the door's swing path.
  let leaf = "";
  let arc = "";
  if (seg.axis === "h") {
    const hx = toX(seg.x1);                                  // hinge x
    const hy = toY(seg.y1);                                  // wall y
    const into = door.wall === "north" ? 1 : -1;             // y direction into room
    const tipX = hx;
    const tipY = hy + into * radius;
    leaf = `M ${hx} ${hy} L ${tipX} ${tipY}`;
    // Arc from tip (perpendicular to wall) back to closed end (along wall, hx+radius).
    const sweep = door.wall === "north" ? 0 : 1;
    arc = `M ${tipX} ${tipY} A ${radius} ${radius} 0 0 ${sweep} ${hx + radius} ${hy}`;
  } else {
    const hx = toX(seg.x1);                                  // wall x
    const hy = toY(seg.y1);                                  // hinge y
    const into = door.wall === "west" ? 1 : -1;              // x direction into room
    const tipX = hx + into * radius;
    const tipY = hy;
    leaf = `M ${hx} ${hy} L ${tipX} ${tipY}`;
    const sweep = door.wall === "west" ? 1 : 0;
    arc = `M ${tipX} ${tipY} A ${radius} ${radius} 0 0 ${sweep} ${hx} ${hy + radius}`;
  }
  const stroke = selected ? "#B8552E" : hover ? "#B8552E" : "#1F1B16";
  const arcStroke = selected ? "#B8552E" : hover ? "#B8552E" : "#8C8478";
  // Punch-out fill: clear the wall behind the opening. Sized to comfortably
  // cover the 12px external wall stroke.
  const clearW = seg.axis === "h" ? w : 14;
  const clearH = seg.axis === "v" ? h : 14;
  const clearX = seg.axis === "h" ? sx : sx - 7;
  const clearY = seg.axis === "v" ? sy : sy - 7;
  return (
    <g onClick={onSelect}
       onContextMenu={onContextMenu}
       onMouseEnter={() => onHoverChange(true)}
       onMouseLeave={() => onHoverChange(false)}
       style={{ cursor: interactive ? "pointer" : "default" }}>
      <rect x={clearX} y={clearY} width={clearW} height={clearH} fill="#FAF7F0" />
      <path d={leaf} fill="none" stroke={stroke} strokeWidth={selected ? 2 : 1.4} strokeLinecap="square" />
      <path d={arc} fill="none" stroke={arcStroke} strokeWidth={selected ? 1.2 : 0.8} strokeDasharray="3 2" />
      {selected && (
        <rect x={sx - 6} y={sy - 6} width={w + 12} height={h + 12} fill="none"
              stroke="#B8552E" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />
      )}
    </g>
  );
}

function WindowMark({ win, plan, toX, toY, selected, hover, onSelect, onContextMenu, onHoverChange, interactive }:
  { win: PlanWindow; plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number;
    selected?: boolean; hover?: boolean;
    onSelect: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onHoverChange: (v: boolean) => void;
    interactive: boolean; }) {
  const room = plan.rooms.find((r) => r.id === win.roomId);
  if (!room) return null;
  const seg = wallSegment(room, win.wall, win.position, win.size);
  const sx = toX(Math.min(seg.x1, seg.x2));
  const sy = toY(Math.min(seg.y1, seg.y2));
  const w = seg.axis === "h" ? Math.abs(seg.x2 - seg.x1) * M_TO_PX : 14;
  const h = seg.axis === "v" ? Math.abs(seg.y2 - seg.y1) * M_TO_PX : 14;
  const stroke = selected ? "#B8552E" : hover ? "#B8552E" : "#1F1B16";
  // Thin double-line glass: two parallel 2px lines with a 3px gap, drawn
  // straight on the wall axis. Punch out the wall behind the opening with a
  // bone-coloured rect so the 12px wall stroke doesn't show through.
  const clearW = seg.axis === "h" ? w : 14;
  const clearH = seg.axis === "v" ? h : 14;
  const clearX = seg.axis === "h" ? sx : sx - 7;
  const clearY = seg.axis === "v" ? sy : sy - 7;
  const gapHalf = 1.5;
  return (
    <g onClick={onSelect}
       onContextMenu={onContextMenu}
       onMouseEnter={() => onHoverChange(true)}
       onMouseLeave={() => onHoverChange(false)}
       style={{ cursor: interactive ? "pointer" : "default" }}>
      <rect x={clearX} y={clearY} width={clearW} height={clearH} fill="#FAF7F0" />
      {seg.axis === "h" ? (
        <>
          <line x1={sx} y1={sy - gapHalf} x2={sx + w} y2={sy - gapHalf} stroke={stroke} strokeWidth="2" />
          <line x1={sx} y1={sy + gapHalf} x2={sx + w} y2={sy + gapHalf} stroke={stroke} strokeWidth="2" />
        </>
      ) : (
        <>
          <line x1={sx - gapHalf} y1={sy} x2={sx - gapHalf} y2={sy + h} stroke={stroke} strokeWidth="2" />
          <line x1={sx + gapHalf} y1={sy} x2={sx + gapHalf} y2={sy + h} stroke={stroke} strokeWidth="2" />
        </>
      )}
      {selected && (
        <rect x={clearX - 4} y={clearY - 4} width={clearW + 8} height={clearH + 8} fill="none"
              stroke="#B8552E" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />
      )}
    </g>
  );
}

function FurnitureMark({ item, toX, toY, selected, hover, onMouseDown, onClick, onContextMenu, onHoverChange, diff, interactive }:
  { item: Furniture; toX: (m: number) => number; toY: (m: number) => number;
    selected?: boolean; hover?: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onHoverChange: (v: boolean) => void;
    diff?: boolean; interactive: boolean; }) {
  const x = toX(item.x);
  const y = toY(item.y);
  const w = item.width * M_TO_PX;
  const h = item.height * M_TO_PX;
  const fill = furnitureFill(item.type);
  const stroke = selected ? "#B8552E" : hover ? "#B8552E" : "#3A332A";
  const sw = selected ? 2 : hover ? 1.4 : 0.8;
  const rotation = item.rotation ?? 0;
  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <g
      transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{ cursor: interactive ? "move" : "default" }}>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} rx="2" />
      {furnitureGlyph(item.type, x, y, w, h)}
      {selected && (
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="none"
              stroke="#B8552E" strokeDasharray="3 3" strokeWidth="1" rx="3" pointerEvents="none" />
      )}
      {diff && (
        <rect x={x + 25} y={y + 5} width={50} height={16} rx="3" fill="#B8552E" >
          <title>+50 cm</title>
        </rect>
      )}
    </g>
  );
}

function furnitureFill(type: string): string {
  switch (type) {
    case "sofa": return "#D9CFB8";
    case "bed": return "#D9CFB8";
    case "table":
    case "desk": return "#A8967A";
    case "tv": return "#3F362A";
    case "counter":
    case "island": return "#3A332A";
    case "stove":
    case "fridge": return "#5C5448";
    case "wardrobe": return "#7A6A52";
    case "toilet":
    case "sink":
    case "shower": return "#FFFFFF";
    default: return "#C0B299";
  }
}

function furnitureGlyph(type: string, x: number, y: number, w: number, h: number) {
  if (type === "sofa") {
    return (
      <>
        <line x1={x + 6} y1={y + 6} x2={x + w - 6} y2={y + 6} stroke="#A89C84" strokeWidth="0.6" />
        <line x1={x + w / 3} y1={y + 6} x2={x + w / 3} y2={y + h - 4} stroke="#A89C84" strokeWidth="0.6" />
        <line x1={x + (2 * w) / 3} y1={y + 6} x2={x + (2 * w) / 3} y2={y + h - 4} stroke="#A89C84" strokeWidth="0.6" />
      </>
    );
  }
  if (type === "bed") {
    return (
      <>
        <rect x={x + 4} y={y + 4} width={w - 8} height={h - 18} fill="none" stroke="#A89C84" strokeWidth="0.6" />
        <rect x={x + w / 2 - 14} y={y + 4} width={12} height={10} fill="#FAF7F0" stroke="#A89C84" strokeWidth="0.5" />
        <rect x={x + w / 2 + 2} y={y + 4} width={12} height={10} fill="#FAF7F0" stroke="#A89C84" strokeWidth="0.5" />
      </>
    );
  }
  if (type === "table" || type === "desk") {
    return <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="none" stroke="#5C5448" strokeWidth="0.5" />;
  }
  if (type === "tv") {
    return <rect x={x + w * 0.25} y={y - 4} width={w * 0.5} height={3} fill="#1F1B16" />;
  }
  if (type === "toilet") {
    return <ellipse cx={x + w / 2} cy={y + h * 0.6} rx={w * 0.3} ry={h * 0.25} fill="none" stroke="#8C8478" strokeWidth="0.6" />;
  }
  if (type === "sink") {
    return <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="none" stroke="#8C8478" strokeWidth="0.6" rx="2" />;
  }
  return null;
}

function DivisorDiff({ plan, toX, toY }: { plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number; }) {
  void plan;
  const oldY = toY(5.0);
  const newY = toY(5.5);
  const x1 = toX(2.4);
  const x2 = toX(6.4);
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={oldY} x2={x2} y2={oldY} stroke="#1F1B16" strokeWidth="6" opacity="0.35" strokeDasharray="6 4" />
      <line x1={x1} y1={newY} x2={x2} y2={newY} stroke="#B8552E" strokeWidth="4" />
      <g transform={`translate(${(x1 + x2) / 2 - 30}, ${newY + 12})`}>
        <rect width="60" height="18" rx="9" fill="#B8552E" />
        <text x="30" y="12" textAnchor="middle" fontSize="10" fill="#fff"
              style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.08em" }}>+50 CM</text>
      </g>
    </g>
  );
}

function CameraPin({ cam, toX, toY, active, onSelect }:
  { cam: Camera; toX: (m: number) => number; toY: (m: number) => number; active?: boolean; onSelect: () => void; }) {
  const cx = toX(cam.x);
  const cy = toY(cam.y);
  const range = cam.range * M_TO_PX;
  const halfFov = cam.fov / 2;
  const a1 = ((cam.angle - halfFov) * Math.PI) / 180;
  const a2 = ((cam.angle + halfFov) * Math.PI) / 180;
  const x1 = cx + range * Math.cos(a1);
  const y1 = cy + range * Math.sin(a1);
  const x2 = cx + range * Math.cos(a2);
  const y2 = cy + range * Math.sin(a2);
  const largeArc = halfFov > 90 ? 1 : 0;

  const statusColor =
    cam.status === "ready" ? "#3a8a48" :
    cam.status === "outdated" ? "#a85c2e" :
    cam.status === "generating" ? "#B8552E" : "#8C8478";

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: "pointer" }}>
      <path
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${range} ${range} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={active ? "rgba(184,85,46,0.16)" : "rgba(184,85,46,0.07)"}
        stroke="rgba(184,85,46,0.4)" strokeWidth="0.6"
      />
      <circle cx={cx} cy={cy} r={active ? 8 : 6} fill="#fff" stroke={statusColor} strokeWidth="2" />
      <circle cx={cx} cy={cy} r="2" fill={statusColor} />
    </g>
  );
}

function Dimensions({ plan, toX, toY }: { plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number; }) {
  const living = plan.rooms.find((r) => r.id === "room-living");
  if (!living) return null;
  const y = toY(living.y) - 22;
  const x1 = toX(living.x);
  const x2 = toX(living.x + living.width);
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#6E6557" strokeWidth="0.6" />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#6E6557" strokeWidth="0.6" />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#6E6557" strokeWidth="0.6" />
      <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" fontSize="9" fill="#4A4338"
            style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.08em" }}>
        {fmtMm(living.width)} MM
      </text>
    </g>
  );
}

function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <circle r="22" fill="#FFFFFF" stroke="#E6DFD2" strokeWidth="1" />
      <path d="M 0 -16 L 4 0 L 0 -2 L -4 0 Z" fill="#1F1B16" />
      <text x="0" y="-6" textAnchor="middle" fontSize="9" fill="#4A4338"
            style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.12em" }}>N</text>
    </g>
  );
}

function ScaleBar({ x, y }: { x: number; y: number }) {
  const seg = M_TO_PX;
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <line x1="0" y1="0" x2={seg * 5} y2="0" stroke="#1F1B16" strokeWidth="1.2" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <line x1={i * seg} y1="-3" x2={i * seg} y2="3" stroke="#1F1B16" strokeWidth="1" />
          <text x={i * seg} y="-7" textAnchor="middle" fontSize="9" fill="#4A4338"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
            {i}M
          </text>
        </g>
      ))}
    </g>
  );
}
