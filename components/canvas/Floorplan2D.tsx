"use client";

// Native SVG 2D floorplan renderer (Pascal-editor style).
//
// We render the same scene graph as the 3D R3F canvas, but in pure SVG. This
// gives us crisp lines via `vector-effect="non-scaling-stroke"`, much faster
// pan/zoom (no WebGL frame), and total CSS control. Coordinate mapping:
// world.x → svg.x, world.z → svg.y (top-down).
//
// Tools (wall-draw, drag, snap) are not yet wired into the SVG path — they
// continue to work in 3D mode. We'll port them in a follow-up.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useSceneStore } from "@/lib/scene/store";
import { type WallCorners } from "@/lib/scene/wall-mitering";
import { getWallCorners } from "@/lib/scene/wall-corners-cache";
import { placeLabels, estimateLabelWidth, type LabelInput } from "@/lib/scene/label-placement";
import { useSvgTools } from "./floorplan/use-svg-tools";
import {
  polygonBounds,
  polygonCentroid,
  v2Norm,
  v2Perp,
  v2Sub,
  type DimensionNode,
  type DoorNode,
  type FurnitureNode,
  type RoomNode,
  type SlabNode,
  type WallNode,
  type WindowNode,
} from "@/lib/scene/types";
import { floorColor, PALETTE } from "./materials";

interface Props {
  onLoadExample?: () => void;
}

const ROOM_LABEL_SUPPRESS_AREA_BELOW = 4;
const ROOM_LABEL_NARROW_DIM_THRESHOLD = 2;

export function Floorplan2D({ onLoadExample }: Props) {
  const rawNodes = useSceneStore((s) => s.nodes);
  const liveTransforms = useSceneStore((s) => s.liveTransforms);
  const setSelection = useSceneStore((s) => s.setSelection);
  const selected = useSceneStore((s) => s.selected);
  const hovered = useSceneStore((s) => s.hovered);
  const setHover = useSceneStore((s) => s.setHover);
  const toggleSelection = useSceneStore((s) => s.toggleSelection);

  // Merge live drag transforms into the node graph so the SVG re-renders
  // immediately on every pointermove. Without this, drag previews are silent
  // and the user only sees the new position when they release.
  const nodes = useMemo(() => {
    if (liveTransforms.size === 0) return rawNodes;
    const merged = { ...rawNodes };
    for (const [id, live] of liveTransforms) {
      const base = merged[id];
      if (!base) continue;
      merged[id] = { ...base, ...live };
    }
    return merged;
  }, [rawNodes, liveTransforms]);

  const walls = useMemo(
    () => Object.values(nodes).filter((n): n is WallNode => n.type === "wall"),
    [nodes]
  );
  const slabs = useMemo(
    () => Object.values(nodes).filter((n): n is SlabNode => n.type === "slab"),
    [nodes]
  );
  const rooms = useMemo(
    () => Object.values(nodes).filter((n): n is RoomNode => n.type === "room"),
    [nodes]
  );
  const doors = useMemo(
    () => Object.values(nodes).filter((n): n is DoorNode => n.type === "door"),
    [nodes]
  );
  const windows = useMemo(
    () => Object.values(nodes).filter((n): n is WindowNode => n.type === "window"),
    [nodes]
  );
  const furniture = useMemo(
    () => Object.values(nodes).filter((n): n is FurnitureNode => n.type === "furniture"),
    [nodes]
  );
  const dimensions = useMemo(
    () => Object.values(nodes).filter((n): n is DimensionNode => n.type === "dimension"),
    [nodes]
  );

  const corners = useMemo(() => getWallCorners(walls), [walls]);
  const isEmpty = walls.length === 0;

  // ---- Auto-layout for room/area labels + dimension labels (Pascal pattern) ----
  // Two-pass approach: render an invisible measurement layer first, read each
  // <text>'s real bbox via getBBox(), then run greedy collision avoidance.
  // On the very first render we don't have measurements yet, so we fall back
  // to a heuristic estimate (~60 px/m); subsequent renders use the real values.
  interface LabelSpec {
    id: string;
    text: string;
    fontFamily: string;
    fontSizePx: number;
    fontStyle?: string;
    letterSpacing?: string;
    anchor: { x: number; z: number };
    priority: number;
    searchDirs: { x: number; z: number }[];
    maxOffset: number;
  }

  const labelSpecs = useMemo<LabelSpec[]>(() => {
    const out: LabelSpec[] = [];
    for (const r of rooms) {
      const c = polygonCentroid(r.polygon);
      const b = polygonBounds(r.polygon);
      const shortSide = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
      const showArea =
        r.area >= ROOM_LABEL_SUPPRESS_AREA_BELOW &&
        shortSide >= ROOM_LABEL_NARROW_DIM_THRESHOLD;
      out.push({
        id: `name:${r.id}`,
        text: r.name,
        fontFamily: "var(--font-instrument-serif), serif",
        fontStyle: "italic",
        fontSizePx: 14,
        anchor: { x: c.x, z: c.z + (showArea ? -0.18 : 0.05) },
        priority: 2,
        searchDirs: [
          { x: 0, z: -1 },
          { x: 0, z: 1 },
          { x: 1, z: 0 },
          { x: -1, z: 0 },
        ],
        maxOffset: 0.4,
      });
      if (showArea) {
        const areaTxt = `${r.area.toFixed(2).replace(".", ",")} M²`;
        out.push({
          id: `area:${r.id}`,
          text: areaTxt,
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSizePx: 10,
          letterSpacing: "0.1em",
          anchor: { x: c.x, z: c.z + 0.22 },
          priority: 1,
          searchDirs: [
            { x: 0, z: 1 },
            { x: 0, z: -1 },
            { x: 1, z: 0 },
            { x: -1, z: 0 },
          ],
          maxOffset: 0.4,
        });
      }
    }
    for (const d of dimensions) {
      const dir = v2Norm(v2Sub(d.end, d.start));
      const perp = v2Perp(dir);
      const cx = (d.start.x + d.end.x) / 2 + perp.x * d.offset;
      const cz = (d.start.z + d.end.z) / 2 + perp.z * d.offset;
      const labelSide = d.offset >= 0 ? 1 : -1;
      const baseX = cx + perp.x * 0.25 * labelSide;
      const baseZ = cz + perp.z * 0.25 * labelSide;
      const text =
        d.text ??
        `${Math.hypot(d.end.x - d.start.x, d.end.z - d.start.z).toFixed(2).replace(".", ",")} m`;
      out.push({
        id: `dim:${d.id}`,
        text,
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSizePx: 11,
        anchor: { x: baseX, z: baseZ },
        priority: 0,
        searchDirs: [
          { x: perp.x * labelSide, z: perp.z * labelSide },
          { x: -perp.x * labelSide, z: -perp.z * labelSide },
          { x: dir.x, z: dir.z },
          { x: -dir.x, z: -dir.z },
        ],
        maxOffset: 0.5,
      });
    }
    return out;
  }, [rooms, dimensions]);

  // Measured bboxes from the invisible measurement layer. Indexed by spec id.
  const measureRefs = useRef<Map<string, SVGTextElement | null>>(new Map());
  const [measuredBboxes, setMeasuredBboxes] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());

  // After every render where labelSpecs changed, read the real bboxes from the
  // hidden text elements and store them. useLayoutEffect runs synchronously
  // before paint, so the user never sees the heuristic positions.
  useLayoutEffect(() => {
    let changed = measuredBboxes.size !== labelSpecs.length;
    const next = new Map<string, { width: number; height: number }>();
    for (const spec of labelSpecs) {
      const el = measureRefs.current.get(spec.id);
      if (!el) {
        // No element yet — keep any previous measurement to avoid flicker.
        const prev = measuredBboxes.get(spec.id);
        if (prev) next.set(spec.id, prev);
        else changed = true;
        continue;
      }
      try {
        const box = el.getBBox();
        next.set(spec.id, { width: box.width, height: box.height });
        const prev = measuredBboxes.get(spec.id);
        if (
          !prev ||
          Math.abs(prev.width - box.width) > 1e-3 ||
          Math.abs(prev.height - box.height) > 1e-3
        ) {
          changed = true;
        }
      } catch {
        // getBBox throws if the element isn't mounted yet — skip.
      }
    }
    if (changed) setMeasuredBboxes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelSpecs]);

  const labelLayout = useMemo(() => {
    const PX_PER_M_FALLBACK = 60;
    const inputs: LabelInput[] = labelSpecs.map((spec) => {
      const measured = measuredBboxes.get(spec.id);
      const heightFallback = spec.fontSizePx / PX_PER_M_FALLBACK;
      return {
        id: spec.id,
        x: spec.anchor.x,
        z: spec.anchor.z,
        width: measured ? measured.width : estimateLabelWidth(spec.text, heightFallback),
        height: measured ? measured.height : heightFallback,
        priority: spec.priority,
        searchDirs: spec.searchDirs,
        maxOffset: spec.maxOffset,
      };
    });
    return placeLabels(inputs);
  }, [labelSpecs, measuredBboxes]);

  // ---- Auto-fit viewBox ----
  const fitBounds = useMemo(() => {
    if (walls.length === 0) return { minX: -5, minZ: -5, maxX: 5, maxZ: 5 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      for (const p of [w.start, w.end]) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }
    const margin = 2;
    return {
      minX: minX - margin,
      minZ: minZ - margin,
      maxX: maxX + margin,
      maxZ: maxZ + margin,
    };
  }, [walls]);

  // ---- Pan + zoom (viewBox manipulation) ----
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Re-fit the viewBox whenever the wall envelope changes (stable key avoids
  // re-fit on every drag — only when bounds actually shift by >0.1 m).
  const fitKey = `${fitBounds.minX.toFixed(1)},${fitBounds.minZ.toFixed(1)},${fitBounds.maxX.toFixed(1)},${fitBounds.maxZ.toFixed(1)}`;
  useEffect(() => {
    setView({
      x: fitBounds.minX,
      y: fitBounds.minZ,
      w: fitBounds.maxX - fitBounds.minX,
      h: fitBounds.maxZ - fitBounds.minZ,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  const v = view ?? { x: -5, y: -5, w: 10, h: 10 };
  const viewBox = `${v.x} ${v.y} ${v.w} ${v.h}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; vx: number; vy: number } | null>(null);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; z: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, z: 0 };
      const rect = svg.getBoundingClientRect();
      // viewBox is fit with preserveAspectRatio="xMidYMid meet". Compute the
      // actual rendered viewBox accounting for letterboxing.
      const aspectV = v.w / v.h;
      const aspectR = rect.width / rect.height;
      let usedW: number;
      let usedH: number;
      let ox: number;
      let oy: number;
      if (aspectR > aspectV) {
        // Letterbox left/right
        usedH = rect.height;
        usedW = usedH * aspectV;
        ox = (rect.width - usedW) / 2;
        oy = 0;
      } else {
        usedW = rect.width;
        usedH = usedW / aspectV;
        ox = 0;
        oy = (rect.height - usedH) / 2;
      }
      const px = clientX - rect.left - ox;
      const py = clientY - rect.top - oy;
      return {
        x: v.x + (px / usedW) * v.w,
        z: v.y + (py / usedH) * v.h,
      };
    },
    [v]
  );

  // Tool layer (drag, slide, wall-draw). Lives on window listeners so fast
  // movements don't drop drags when the pointer leaves the SVG.
  const tools = useSvgTools(screenToWorld);
  const tool = useSceneStore((s) => s.tool);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    // Right-click or middle-click to pan; also shift+left-click.
    const isPan = e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey);
    if (!isPan) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, vx: v.x, vy: v.y };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    // Wall-draw preview tracking — runs every move when the tool is active.
    if (tool === "wall") tools.onSvgBackgroundMove(e.clientX, e.clientY);
    const p = panRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - p.startX) / rect.width) * v.w;
    const dy = ((e.clientY - p.startY) / rect.height) * v.h;
    setView({ ...v, x: p.vx - dx, y: p.vy - dy });
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = panRef.current;
    if (p && p.pointerId === e.pointerId) panRef.current = null;
  };
  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const cursor = screenToWorld(e.clientX, e.clientY);
    const factor = Math.exp(e.deltaY * 0.001);
    const newW = Math.max(2, Math.min(200, v.w * factor));
    const newH = Math.max(2, Math.min(200, v.h * factor));
    // Keep cursor's world position fixed.
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    setView({
      x: cursor.x - fracX * newW,
      y: cursor.z - fracY * newH,
      w: newW,
      h: newH,
    });
  };

  const onBackgroundClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    // When the wall-draw tool is active, route clicks to the tool layer.
    if (tool === "wall") {
      tools.onSvgBackgroundClick(e.clientX, e.clientY);
      return;
    }
    setSelection([]);
  };

  // ---- Render ----
  return (
    <div className="w-full h-full relative" style={{ background: "#FAF7F0" }}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          // Wall-draw shows crosshair so the click target is unambiguous; pan
          // shows grabbing once the gesture has started.
          cursor: panRef.current
            ? "grabbing"
            : tool === "wall"
              ? "crosshair"
              : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onBackgroundClick}
      >
        <defs>
          <pattern
            id="floorplan-grid-major"
            x="0"
            y="0"
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              stroke="#E6DFD2"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
          <pattern
            id="floorplan-grid-minor"
            x="0"
            y="0"
            width="0.25"
            height="0.25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0.25 0 L 0 0 0 0.25"
              fill="none"
              stroke="#ECE4D2"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>

        {/* Background grid */}
        <rect
          x={v.x - 50}
          y={v.y - 50}
          width={v.w + 100}
          height={v.h + 100}
          fill={`url(#floorplan-grid-minor)`}
        />
        <rect
          x={v.x - 50}
          y={v.y - 50}
          width={v.w + 100}
          height={v.h + 100}
          fill={`url(#floorplan-grid-major)`}
        />

        {/* Slabs (lowest visual layer above grid) */}
        <g className="slabs">
          {slabs.map((s) => (
            <polygon
              key={s.id}
              points={polygonToSvg(s.polygon)}
              fill={floorColor(s.material)}
              opacity={0.85}
            />
          ))}
        </g>

        {/* Walls (filled + stroked) */}
        <g className="walls">
          {walls.map((w) => {
            const c = corners.get(w.id);
            if (!c) return null;
            const isSel = selected.includes(w.id);
            const isHov = hovered === w.id;
            const stroke = isSel ? PALETTE.accent : isHov ? PALETTE.hoverStroke : PALETTE.ink;
            return (
              <polygon
                key={w.id}
                points={cornersToSvg(c)}
                fill={PALETTE.wallFill}
                stroke={stroke}
                strokeWidth={isSel ? 2 : 1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                onPointerOver={(e) => { e.stopPropagation(); setHover(w.id); }}
                onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
                onClick={(e) => { e.stopPropagation(); toggleSelection(w.id, e.shiftKey); }}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </g>

        {/* Doors */}
        <g className="doors">
          {doors.map((d) => {
            const wall = nodes[d.wallId] as WallNode | undefined;
            if (!wall) return null;
            const isSel = selected.includes(d.id);
            const isHov = hovered === d.id;
            return (
              <DoorSvg
                key={d.id}
                door={d}
                wall={wall}
                stroke={isSel ? PALETTE.accent : isHov ? PALETTE.hoverStroke : PALETTE.ink}
                onHover={(over) => setHover(over ? d.id : null)}
                onClick={(shift) => toggleSelection(d.id, shift)}
                onPointerDown={(clientX, clientY) =>
                  tools.beginOpeningSlide(d.id, clientX, clientY)
                }
              />
            );
          })}
        </g>

        {/* Windows */}
        <g className="windows">
          {windows.map((w) => {
            const wall = nodes[w.wallId] as WallNode | undefined;
            if (!wall) return null;
            const isSel = selected.includes(w.id);
            const isHov = hovered === w.id;
            return (
              <WindowSvg
                key={w.id}
                window={w}
                wall={wall}
                stroke={isSel ? PALETTE.accent : isHov ? PALETTE.hoverStroke : PALETTE.ink}
                onHover={(over) => setHover(over ? w.id : null)}
                onClick={(shift) => toggleSelection(w.id, shift)}
                onPointerDown={(clientX, clientY) =>
                  tools.beginOpeningSlide(w.id, clientX, clientY)
                }
              />
            );
          })}
        </g>

        {/* Furniture (draggable when selected via the move tool) */}
        <g className="furniture">
          {furniture.map((f) => {
            const isSel = selected.includes(f.id);
            const isHov = hovered === f.id;
            const stroke = isSel ? PALETTE.accent : isHov ? PALETTE.hoverStroke : PALETTE.inkSoft;
            // Furniture position is corner-anchored (x,z = top-left in world XZ).
            const w = f.dimensions.x;
            const d = f.dimensions.z;
            const cx = f.position.x + w / 2;
            const cz = f.position.z + d / 2;
            const rot = -(f.rotation ?? 0) * (180 / Math.PI);
            return (
              <g
                key={f.id}
                transform={`translate(${cx} ${cz}) rotate(${rot})`}
                onPointerOver={(e) => { e.stopPropagation(); setHover(f.id); }}
                onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.shiftKey) return;
                  e.stopPropagation();
                  tools.beginFurnitureDrag(f.id, e.clientX, e.clientY);
                }}
                onClick={(e) => { e.stopPropagation(); toggleSelection(f.id, e.shiftKey); }}
                style={{ cursor: tool === "select" ? "grab" : "pointer" }}
              >
                <rect
                  x={-w / 2}
                  y={-d / 2}
                  width={w}
                  height={d}
                  fill={PALETTE.accentSoft}
                  stroke={stroke}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </g>

        {/* Dimensions (positions resolved through auto-layout) */}
        <g className="dimensions">
          {dimensions.map((d) => {
            const layout = labelLayout.get(`dim:${d.id}`);
            return (
              <DimensionSvg
                key={d.id}
                dim={d}
                labelOverride={layout ? { x: layout.x, z: layout.z } : null}
              />
            );
          })}
        </g>

        {/* Room labels (positions resolved through auto-layout) */}
        <g className="labels">
          {rooms.map((r) => {
            const b = polygonBounds(r.polygon);
            const shortSide = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
            const showArea =
              r.area >= ROOM_LABEL_SUPPRESS_AREA_BELOW &&
              shortSide >= ROOM_LABEL_NARROW_DIM_THRESHOLD;
            const namePos = labelLayout.get(`name:${r.id}`);
            const areaPos = labelLayout.get(`area:${r.id}`);
            if (!namePos) return null;
            return (
              <g key={r.id} pointerEvents="none">
                <text
                  x={namePos.x}
                  y={namePos.z}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontFamily: "var(--font-instrument-serif), serif",
                    fontStyle: "italic",
                    fontSize: 14,
                    fill: PALETTE.inkSoft,
                  }}
                  fontSize={14}
                >
                  {r.name}
                </text>
                {showArea && areaPos && (
                  <text
                    x={areaPos.x}
                    y={areaPos.z}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      letterSpacing: "0.1em",
                      fontSize: 10,
                      fill: PALETTE.muted,
                    }}
                    fontSize={10}
                  >
                    {`${r.area.toFixed(2).replace(".", ",")} M²`}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Hidden measurement layer — produces a real getBBox() for every label
            so the auto-layout can use accurate widths instead of heuristics.
            Rendered with visibility:hidden (still laid out) so the user never
            sees the duplicated text. */}
        <g
          className="label-measure"
          style={{ visibility: "hidden" }}
          aria-hidden="true"
          pointerEvents="none"
        >
          {labelSpecs.map((spec) => (
            <text
              key={`measure-${spec.id}`}
              ref={(el) => {
                measureRefs.current.set(spec.id, el);
              }}
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: spec.fontFamily,
                fontStyle: spec.fontStyle,
                fontSize: spec.fontSizePx,
                letterSpacing: spec.letterSpacing,
              }}
              fontSize={spec.fontSizePx}
            >
              {spec.text}
            </text>
          ))}
        </g>

        {/* Wall-draw tool overlay: anchor + ghost line + cursor crosshair */}
        {tool === "wall" && (
          <g className="wall-draw-overlay" pointerEvents="none">
            {tools.wallDraw.state.phase === "anchored" && tools.wallDraw.state.anchor && (
              <circle
                cx={tools.wallDraw.state.anchor.x}
                cy={tools.wallDraw.state.anchor.z}
                r={0.08}
                fill={PALETTE.accent}
              />
            )}
            {tools.wallDraw.state.phase === "anchored" &&
              tools.wallDraw.state.anchor &&
              tools.wallDraw.pointerWorld && (
                <line
                  x1={tools.wallDraw.state.anchor.x}
                  y1={tools.wallDraw.state.anchor.z}
                  x2={tools.wallDraw.pointerWorld.x}
                  y2={tools.wallDraw.pointerWorld.z}
                  stroke={PALETTE.accent}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            {tools.wallDraw.pointerWorld && (
              <circle
                cx={tools.wallDraw.pointerWorld.x}
                cy={tools.wallDraw.pointerWorld.z}
                r={0.05}
                fill="none"
                stroke={PALETTE.accent}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )}
      </svg>

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="card p-6 max-w-sm text-center pointer-events-auto fade-up">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">PROJETO VAZIO</div>
            <h3 className="editorial text-[22px] mt-2">Comece pedindo ao agente</h3>
            <p className="text-[12.5px] text-muted mt-2">
              Descreva o ambiente que você quer criar. Ex.: &quot;Faça um apartamento de 65m² com 2 quartos.&quot;
            </p>
            {onLoadExample && (
              <button onClick={onLoadExample} className="btn-primary mt-4 text-[12px]">
                Carregar exemplo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- helpers ----

function polygonToSvg(poly: { x: number; z: number }[]): string {
  return poly.map((p) => `${p.x},${p.z}`).join(" ");
}

function cornersToSvg(c: WallCorners): string {
  return `${c.startLeft.x},${c.startLeft.z} ${c.endLeft.x},${c.endLeft.z} ${c.endRight.x},${c.endRight.z} ${c.startRight.x},${c.startRight.z}`;
}

interface DoorSvgProps {
  door: DoorNode;
  wall: WallNode;
  stroke: string;
  onHover: (over: boolean) => void;
  onClick: (shift: boolean) => void;
  /** Begin sliding the door along its wall on left mouse down. */
  onPointerDown?: (clientX: number, clientY: number) => void;
}

function DoorSvg({ door, wall, stroke, onHover, onClick, onPointerDown }: DoorSvgProps) {
  const dir = v2Norm(v2Sub(wall.end, wall.start));
  const perp = v2Perp(dir);
  const center = {
    x: wall.start.x + dir.x * door.offset,
    z: wall.start.z + dir.z * door.offset,
  };
  const half = door.width / 2;
  const aLeft = { x: center.x - dir.x * half, z: center.z - dir.z * half };
  const aRight = { x: center.x + dir.x * half, z: center.z + dir.z * half };
  const wt = wall.thickness;
  const halfT = wt / 2 + 0.005;

  const bone = `${aLeft.x + perp.x * halfT},${aLeft.z + perp.z * halfT} ${aRight.x + perp.x * halfT},${aRight.z + perp.z * halfT} ${aRight.x - perp.x * halfT},${aRight.z - perp.z * halfT} ${aLeft.x - perp.x * halfT},${aLeft.z - perp.z * halfT}`;

  const hinge = door.hingeSide === "start" ? aLeft : aRight;
  const tip = door.hingeSide === "start" ? aRight : aLeft;
  const swingSign = door.swingDirection === "in" ? 1 : -1;
  const leafEnd = {
    x: hinge.x + perp.x * door.width * swingSign,
    z: hinge.z + perp.z * door.width * swingSign,
  };

  // Arc path: large-arc=0, sweep depends on swing+hinge
  const sweep = swingSign > 0 ? 1 : 0;

  return (
    <g
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(false); }}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.shiftKey || !onPointerDown) return;
        e.stopPropagation();
        onPointerDown(e.clientX, e.clientY);
      }}
      onClick={(e) => { e.stopPropagation(); onClick(e.shiftKey); }}
      style={{ cursor: onPointerDown ? "grab" : "pointer" }}
    >
      <polygon points={bone} fill={PALETTE.bg} />
      <line
        x1={hinge.x}
        y1={hinge.z}
        x2={leafEnd.x}
        y2={leafEnd.z}
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M ${tip.x} ${tip.z} A ${door.width} ${door.width} 0 0 ${sweep} ${leafEnd.x} ${leafEnd.z}`}
        fill="none"
        stroke={stroke}
        strokeWidth={0.8}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

interface WindowSvgProps {
  window: WindowNode;
  wall: WallNode;
  stroke: string;
  onHover: (over: boolean) => void;
  onClick: (shift: boolean) => void;
  /** Begin sliding the window along its wall on left mouse down. */
  onPointerDown?: (clientX: number, clientY: number) => void;
}

function WindowSvg({ window: win, wall, stroke, onHover, onClick, onPointerDown }: WindowSvgProps) {
  const dir = v2Norm(v2Sub(wall.end, wall.start));
  const perp = v2Perp(dir);
  const cx = wall.start.x + dir.x * win.offset;
  const cz = wall.start.z + dir.z * win.offset;
  const half = win.width / 2;
  const wt = wall.thickness;
  const halfT = wt / 2 + 0.005;
  const aLeft = { x: cx - dir.x * half, z: cz - dir.z * half };
  const aRight = { x: cx + dir.x * half, z: cz + dir.z * half };

  const bone = `${aLeft.x + perp.x * halfT},${aLeft.z + perp.z * halfT} ${aRight.x + perp.x * halfT},${aRight.z + perp.z * halfT} ${aRight.x - perp.x * halfT},${aRight.z - perp.z * halfT} ${aLeft.x - perp.x * halfT},${aLeft.z - perp.z * halfT}`;

  const glassOff = wt / 4;
  return (
    <g
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(false); }}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.shiftKey || !onPointerDown) return;
        e.stopPropagation();
        onPointerDown(e.clientX, e.clientY);
      }}
      onClick={(e) => { e.stopPropagation(); onClick(e.shiftKey); }}
      style={{ cursor: onPointerDown ? "grab" : "pointer" }}
    >
      <polygon points={bone} fill={PALETTE.bg} />
      <line
        x1={aLeft.x + perp.x * glassOff}
        y1={aLeft.z + perp.z * glassOff}
        x2={aRight.x + perp.x * glassOff}
        y2={aRight.z + perp.z * glassOff}
        stroke={stroke}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={aLeft.x - perp.x * glassOff}
        y1={aLeft.z - perp.z * glassOff}
        x2={aRight.x - perp.x * glassOff}
        y2={aRight.z - perp.z * glassOff}
        stroke={stroke}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

interface DimensionSvgProps {
  dim: DimensionNode;
  /** Override label position from auto-layout. Falls back to natural position
   *  if null. */
  labelOverride?: { x: number; z: number } | null;
}

function DimensionSvg({ dim, labelOverride }: DimensionSvgProps) {
  const dir = v2Norm(v2Sub(dim.end, dim.start));
  const perp = v2Perp(dir);
  const a = { x: dim.start.x + perp.x * dim.offset, z: dim.start.z + perp.z * dim.offset };
  const b = { x: dim.end.x + perp.x * dim.offset, z: dim.end.z + perp.z * dim.offset };
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const text = dim.text ?? `${length.toFixed(2).replace(".", ",")} m`;
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  // label offset away from line, on the same side as the dim is offset.
  const labelSide = dim.offset >= 0 ? 1 : -1;
  const labelX = labelOverride?.x ?? cx + perp.x * 0.25 * labelSide;
  const labelZ = labelOverride?.z ?? cz + perp.z * 0.25 * labelSide;
  // tick (perpendicular, both sides of line)
  const tick = 0.12;
  return (
    <g pointerEvents="none">
      {/* extension lines from wall to dim line */}
      <line
        x1={dim.start.x}
        y1={dim.start.z}
        x2={a.x}
        y2={a.z}
        stroke={PALETTE.muted}
        strokeWidth={0.6}
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={dim.end.x}
        y1={dim.end.z}
        x2={b.x}
        y2={b.z}
        stroke={PALETTE.muted}
        strokeWidth={0.6}
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      {/* main dim line */}
      <line
        x1={a.x}
        y1={a.z}
        x2={b.x}
        y2={b.z}
        stroke={PALETTE.inkSoft}
        strokeWidth={0.9}
        vectorEffect="non-scaling-stroke"
      />
      {/* tick marks */}
      <line
        x1={a.x - perp.x * tick}
        y1={a.z - perp.z * tick}
        x2={a.x + perp.x * tick}
        y2={a.z + perp.z * tick}
        stroke={PALETTE.inkSoft}
        strokeWidth={0.9}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={b.x - perp.x * tick}
        y1={b.z - perp.z * tick}
        x2={b.x + perp.x * tick}
        y2={b.z + perp.z * tick}
        stroke={PALETTE.inkSoft}
        strokeWidth={0.9}
        vectorEffect="non-scaling-stroke"
      />
      {/* label */}
      <text
        x={labelX}
        y={labelZ}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 11,
          fill: PALETTE.inkSoft,
        }}
        fontSize={11}
      >
        {text}
      </text>
    </g>
  );
}
