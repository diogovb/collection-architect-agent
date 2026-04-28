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
import { styleOf, type FurnitureStyle } from "./floorplan/furniture-style";
import { ContextMenu } from "./ContextMenu";
import { findJunction, JUNCTION_TOLERANCE } from "@/lib/scene/junctions";
import { buildWallOutlinePath } from "@/lib/scene/wall-outline";
import { MeasurementChip } from "./MeasurementChip";

// SVG `font-size` is in user-space units. Our viewBox is in metres, so
// fontSize:14 would mean "14 metres tall" (huge). We want ~14 CSS pixels at
// default zoom. With a typical apartment view of ~15m at ~1100px wide
// (≈ 73 px/m), 14px = 14/73 ≈ 0.19 user units. We use 1/60 as a stable
// constant — close enough for typical apartments and consistent with the
// PX_PER_M heuristic in the bbox-fallback path.
const WORLD_PER_CSS_PX = 1 / 60;
function pxToWorld(px: number): number {
  return px * WORLD_PER_CSS_PX;
}
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
  // Style Guide §8 — auto-dimensions need to reflect the LIVE wall positions
  // during drag, not the committed ones. We re-run computeEnvelopeDimensions
  // on the effective walls (with liveTransforms applied) and overlay the
  // result on top of the stored auto-envelope cotas. Manual cotas pass
  // through unchanged.
  const dimensions = useMemo(() => {
    const stored = Object.values(nodes).filter((n): n is DimensionNode => n.type === "dimension");
    if (liveTransforms.size === 0) return stored;
    const liveAuto = (() => {
      // Lazy require to avoid an import cycle at module load.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { computeEnvelopeDimensions } = require("@/lib/scene/auto-dimensions") as typeof import("@/lib/scene/auto-dimensions");
        return computeEnvelopeDimensions(walls);
      } catch {
        return [] as DimensionNode[];
      }
    })();
    // Replace stored auto-envelope dims with the live ones; keep manual.
    const manual = stored.filter((d) => d.scope === "manual");
    return [...liveAuto, ...manual];
  }, [nodes, walls, liveTransforms]);

  const corners = useMemo(() => getWallCorners(walls), [walls]);

  // Pixel-perfect wall outline (Fase L). Earlier we used buildWallEnvelope
  // which offset each room polygon by HALF THE AVERAGE wall thickness; with
  // mixed thicknesses (exterior 0.20 + interior 0.10) the resulting line
  // visibly drifted *inside* the polygon fills. The new helper traces the
  // exact mitered edges from `getWallCorners` so the outline coincides with
  // the wall fills to the pixel.
  const envelopeOutlinePath = useMemo(() => buildWallOutlinePath(walls), [walls]);
  const isEmpty = walls.length === 0;

  // Hide the "Comece pedindo ao agente" overlay the moment the user fires
  // off a request — even before the first wall lands. ChatPanel dispatches
  // `ca:agent-busy` { busy: true } on send, false on completion (Fase T).
  const [agentBusy, setAgentBusy] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ busy: boolean }>).detail;
      setAgentBusy(!!detail?.busy);
    };
    window.addEventListener("ca:agent-busy", handler as EventListener);
    return () => window.removeEventListener("ca:agent-busy", handler as EventListener);
  }, []);
  const showEmptyState = isEmpty && !agentBusy;

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
    /** World-space position the visible <text> reads. For text-anchor=start
     *  this is the top-left of the rendered glyphs; for text-anchor=middle
     *  this is the centre. The placement algorithm internally shifts to
     *  bbox centre for collision tests. */
    anchor: { x: number; z: number };
    /** Determines the SVG anchor model and how the bbox aligns to `anchor`. */
    align: "center" | "top-left";
    priority: number;
    searchDirs: { x: number; z: number }[];
    maxOffset: number;
  }

  const labelSpecs = useMemo<LabelSpec[]>(() => {
    const out: LabelSpec[] = [];
    for (const r of rooms) {
      const b = polygonBounds(r.polygon);
      const shortSide = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
      const showArea =
        r.area >= ROOM_LABEL_SUPPRESS_AREA_BELOW &&
        shortSide >= ROOM_LABEL_NARROW_DIM_THRESHOLD;
      // Fase I — labels back to the centre of the room. The user prefers
      // centred typography (more "editorial" read) over corner-pinned
      // labels. Auto-layout still nudges them when they would collide.
      const isPrincipal = r.area >= 15;
      const c = polygonCentroid(r.polygon);
      const nameAnchorX = c.x;
      const nameAnchorZ = c.z;
      out.push({
        id: `name:${r.id}`,
        text: r.name,
        fontFamily: "var(--font-instrument-serif), serif",
        fontStyle: "normal",
        fontSizePx: isPrincipal ? 13 : 11,
        anchor: { x: nameAnchorX, z: nameAnchorZ },
        align: "center",
        priority: 2,
        searchDirs: [
          { x: 0, z: 1 },
          { x: 0, z: -1 },
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
          fontSizePx: isPrincipal ? 8 : 7,
          letterSpacing: "0.13em",
          anchor: { x: nameAnchorX, z: nameAnchorZ + 0.22 },
          align: "center",
          priority: 1,
          searchDirs: [
            { x: 0, z: 1 },
            { x: 0, z: -1 },
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
        align: "center",
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
    // For top-left aligned labels, shift the placement anchor to the bbox
    // centre so collision detection (which assumes centred bboxes) reasons
    // correctly. After placement we shift back to the visible anchor.
    const inputs: LabelInput[] = labelSpecs.map((spec) => {
      const measured = measuredBboxes.get(spec.id);
      const heightFallback = spec.fontSizePx / PX_PER_M_FALLBACK;
      const w = measured ? measured.width : estimateLabelWidth(spec.text, heightFallback);
      const h = measured ? measured.height : heightFallback;
      const dx = spec.align === "top-left" ? w / 2 : 0;
      const dz = spec.align === "top-left" ? h / 2 : 0;
      return {
        id: spec.id,
        x: spec.anchor.x + dx,
        z: spec.anchor.z + dz,
        width: w,
        height: h,
        priority: spec.priority,
        searchDirs: spec.searchDirs,
        maxOffset: spec.maxOffset,
      };
    });
    const placed = placeLabels(inputs);
    // Translate back: subtract the centre offset so consumers always see
    // the visible anchor (top-left for room labels, centre for dim labels).
    const out = new Map<string, { x: number; z: number; moved: boolean }>();
    for (const spec of labelSpecs) {
      const r = placed.get(spec.id);
      if (!r) continue;
      const measured = measuredBboxes.get(spec.id);
      const heightFallback = spec.fontSizePx / PX_PER_M_FALLBACK;
      const w = measured ? measured.width : estimateLabelWidth(spec.text, heightFallback);
      const h = measured ? measured.height : heightFallback;
      const dx = spec.align === "top-left" ? w / 2 : 0;
      const dz = spec.align === "top-left" ? h / 2 : 0;
      out.set(spec.id, { x: r.x - dx, z: r.z - dz, moved: r.moved });
    }
    return out;
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
  // Track the pointer in screen-space so the floating measurement chip
  // (Fase R) can position itself next to the cursor without re-doing the
  // world→screen conversion.
  const [pointerScreen, setPointerScreen] = useState<{ x: number; y: number } | null>(null);
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    setPointerScreen({ x: e.clientX, y: e.clientY });
    // Wall + dimension draw preview tracking.
    if (tool === "wall" || tool === "dimension") {
      tools.onSvgBackgroundMove(e.clientX, e.clientY);
    }
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
    // Wall and dimension draw modes intercept background clicks.
    if (tool === "wall" || tool === "dimension") {
      tools.onSvgBackgroundClick(e.clientX, e.clientY);
      return;
    }
    setSelection([]);
  };

  // ---- Render ----
  return (
    <div className="w-full h-full relative" style={{ background: PALETTE.paper }}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          // Wall + dimension draw show crosshair so the click target is
          // unambiguous; pan shows grabbing once the gesture has started.
          cursor: panRef.current
            ? "grabbing"
            : tool === "wall" || tool === "dimension"
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
          {/* Grid (major = 1 m, minor = 0.25 m). Style Guide §3 layer 2.
              Both render with opacity 0.04 / 0.06 so they sit behind everything
              else and only define a "system" rather than competing for read. */}
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

          {/* Floor patterns — Style Guide §7. patternUnits=userSpaceOnUse so
              the cell size is in metres regardless of viewBox. */}
          {/* Madeira: ripa de 0.40 m de comprimento, linha a cada 6 cm. */}
          <pattern
            id="floor-wood"
            x="0"
            y="0"
            width="0.40"
            height="0.06"
            patternUnits="userSpaceOnUse"
          >
            <rect width="0.40" height="0.06" fill={PALETTE.floorWood} />
            <line
              x1="0"
              y1="0.03"
              x2="0.40"
              y2="0.03"
              stroke={PALETTE.ink}
              strokeOpacity="0.06"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              y1="0"
              x2="0.40"
              y2="0"
              stroke={PALETTE.ink}
              strokeOpacity="0.04"
              strokeWidth="0.3"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
          {/* Porcelanato: placas 0.60 × 0.60 m. */}
          <pattern
            id="floor-tile"
            x="0"
            y="0"
            width="0.60"
            height="0.60"
            patternUnits="userSpaceOnUse"
          >
            <rect width="0.60" height="0.60" fill={PALETTE.floorTile} />
            <path
              d="M0 0 L0.60 0 L0.60 0.60 L0 0.60 Z"
              fill="none"
              stroke={PALETTE.ink}
              strokeOpacity="0.07"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
          {/* Carpete: pontilhado fino 0.06 m. */}
          <pattern
            id="floor-carpet"
            x="0"
            y="0"
            width="0.06"
            height="0.06"
            patternUnits="userSpaceOnUse"
          >
            <rect width="0.06" height="0.06" fill={PALETTE.floorCarpetBase} />
            <circle
              cx="0.03"
              cy="0.03"
              r="0.004"
              fill={PALETTE.ink}
              fillOpacity="0.15"
            />
          </pattern>
          {/* Pedra/cimento (futuro). Pontilhado esparso. */}
          <pattern
            id="floor-stone"
            x="0"
            y="0"
            width="0.30"
            height="0.30"
            patternUnits="userSpaceOnUse"
          >
            <rect width="0.30" height="0.30" fill={PALETTE.floorPedra} />
            <circle
              cx="0.15"
              cy="0.15"
              r="0.008"
              fill={PALETTE.ink}
              fillOpacity="0.10"
            />
          </pattern>

          {/* Soft shadow for principal furniture (Style Guide §6.1). Gauss
              1.2 + offset 1 + opacity 0.18 — converted to world units. */}
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.02" />
            <feOffset dx="0.015" dy="0.025" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.18" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
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

        {/* Slabs (lowest visual layer above grid). Style Guide §7: pattern
            fill by material — woodgrain/tile/carpet are vector patterns
            defined in <defs>, never raster. */}
        <g className="slabs">
          {slabs.map((s) => (
            <polygon
              key={s.id}
              points={polygonToSvg(s.polygon)}
              fill={slabPatternUrl(s.material) ?? floorColor(s.material)}
              opacity={1}
            />
          ))}
        </g>

        {/* Walls — solid fill per wall, NO stroke (Fase F). The mitered
            quads from `getWallCorners` already share corner vertices so
            adjacent fills meet without gaps, but rendering a stroke on
            each polygon would draw the diagonal "quina" line across every
            corner. We let the envelope outline path below paint a single
            continuous border instead. Hover / selection get a tinted
            accent OVERLAY (also without stroke — just a lighter fill) so
            the user still has visual feedback. */}
        <g className="walls">
          {walls.map((w) => {
            const c = corners.get(w.id);
            if (!c) return null;
            const isSel = selected.includes(w.id);
            const isHov = hovered === w.id;
            const fill = isSel
              ? PALETTE.accent
              : isHov
                ? PALETTE.hoverStroke
                : PALETTE.wallFill;
            return (
              <polygon
                key={w.id}
                data-node-id={w.id}
                points={cornersToSvg(c)}
                fill={fill}
                stroke="none"
                onPointerOver={(e) => { e.stopPropagation(); setHover(w.id); }}
                onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
                onClick={(e) => { e.stopPropagation(); toggleSelection(w.id, e.shiftKey); }}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </g>

        {/* Wall envelope outline — single SVG path that traces the
            apartment outer perimeter + each room's inner ring. fill=none,
            stroke=ink. Because it's one continuous path, the corners
            (including 3+ junctions) render as clean miter joints with no
            transversal seams. Pointer-events disabled so it doesn't
            steal clicks from the wall fills below. */}
        {envelopeOutlinePath && (
          <path
            d={envelopeOutlinePath}
            fill="none"
            stroke={PALETTE.ink}
            strokeWidth={1.2}
            strokeLinejoin="miter"
            strokeMiterlimit={6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

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

        {/* Tapetes — Style Guide §3 layer 8: rendered BEFORE furniture so a
            sofa "sits on" its rug. Inferred from furniture kind=rug. */}
        <g className="tapetes">
          {furniture
            .filter((f) => styleOf(f).kind === "rug")
            .map((f) => {
              const w = f.dimensions.x;
              const d = f.dimensions.z;
              const cx = f.position.x + w / 2;
              const cz = f.position.z + d / 2;
              const rot = -(f.rotation ?? 0) * (180 / Math.PI);
              return (
                <g key={f.id} transform={`translate(${cx} ${cz}) rotate(${rot})`}>
                  <rect
                    x={-w / 2}
                    y={-d / 2}
                    width={w}
                    height={d}
                    fill="url(#floor-carpet)"
                    stroke={PALETTE.ink}
                    strokeOpacity={0.2}
                    strokeWidth={0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
        </g>

        {/* Furniture — Style Guide §6. Each piece resolves to a palette token
            (terra pigment) and a shadow flag via styleOf(). Detalhes internos
            (encosto, tampo, divisões) são desenhados pelo FurniturePiece. */}
        <g className="furniture">
          {furniture
            .filter((f) => styleOf(f).kind !== "rug")
            .map((f) => {
              const isSel = selected.includes(f.id);
              const isHov = hovered === f.id;
              const fStyle = styleOf(f);
              const w = f.dimensions.x;
              const d = f.dimensions.z;
              const cx = f.position.x + w / 2;
              const cz = f.position.z + d / 2;
              const rot = -(f.rotation ?? 0) * (180 / Math.PI);
              const stroke = isSel
                ? PALETTE.accent
                : isHov
                  ? PALETTE.hoverStroke
                  : PALETTE.ink;
              return (
                <g
                  key={f.id}
                  data-node-id={f.id}
                  transform={`translate(${cx} ${cz}) rotate(${rot})`}
                  filter={fStyle.shadow ? "url(#softShadow)" : undefined}
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
                  <FurniturePiece w={w} d={d} style={fStyle} stroke={stroke} selected={isSel} />
                </g>
              );
            })}
        </g>

        {/* Dimensions (positions resolved through auto-layout) */}
        <g className="dimensions">
          {dimensions.map((d) => {
            const layout = labelLayout.get(`dim:${d.id}`);
            const isSel = selected.includes(d.id);
            const isHov = hovered === d.id;
            return (
              <DimensionSvg
                key={d.id}
                dim={d}
                labelOverride={layout ? { x: layout.x, z: layout.z } : null}
                selected={isSel}
                hovered={isHov}
                onPointerOver={() => setHover(d.id)}
                onPointerOut={() => setHover(null)}
                onClick={(shift) => toggleSelection(d.id, shift)}
                onPointerDown={(clientX, clientY) =>
                  tools.beginDimensionOffsetDrag(d.id, clientX, clientY)
                }
              />
            );
          })}
        </g>

        {/* Room labels — Style Guide §9.3: anchored at top-left corner of the
            room (text-anchor=start). Auto-layout shifts only if collision is
            detected. Typography splits Instrument Serif (name) + JetBrains
            Mono (area in m²). */}
        <g className="labels">
          {rooms.map((r) => {
            const b = polygonBounds(r.polygon);
            const shortSide = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
            const showArea =
              r.area >= ROOM_LABEL_SUPPRESS_AREA_BELOW &&
              shortSide >= ROOM_LABEL_NARROW_DIM_THRESHOLD;
            const isPrincipal = r.area >= 15;
            const namePos = labelLayout.get(`name:${r.id}`);
            const areaPos = labelLayout.get(`area:${r.id}`);
            if (!namePos) return null;
            const namePx = isPrincipal ? 13 : 11;
            const areaPx = isPrincipal ? 8 : 7;
            return (
              <g key={r.id} pointerEvents="none">
                <text
                  x={namePos.x}
                  y={namePos.z}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontFamily: "var(--font-instrument-serif), serif",
                    fontSize: pxToWorld(namePx),
                    fill: PALETTE.ink,
                  }}
                  fontSize={pxToWorld(namePx)}
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
                      letterSpacing: isPrincipal ? "0.13em" : "0.06em",
                      fontSize: pxToWorld(areaPx),
                      fill: PALETTE.muted,
                    }}
                    fontSize={pxToWorld(areaPx)}
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
            sees the duplicated text. Font size is in WORLD units (metres) — see
            WORLD_PER_CSS_PX above for the conversion. */}
        <g
          className="label-measure"
          style={{ visibility: "hidden" }}
          aria-hidden="true"
          pointerEvents="none"
        >
          {labelSpecs.map((spec) => {
            // Match the live render: room labels use top-left anchor, dim
            // labels are centered. getBBox is anchor-independent so this is
            // mostly cosmetic, but we keep the same setup for clarity.
            const isDim = spec.id.startsWith("dim:");
            return (
              <text
                key={`measure-${spec.id}`}
                ref={(el) => {
                  measureRefs.current.set(spec.id, el);
                }}
                x={0}
                y={0}
                textAnchor={isDim ? "middle" : "start"}
                dominantBaseline={isDim ? "middle" : "hanging"}
                style={{
                  fontFamily: spec.fontFamily,
                  fontStyle: spec.fontStyle,
                  fontSize: pxToWorld(spec.fontSizePx),
                  letterSpacing: spec.letterSpacing,
                }}
                fontSize={pxToWorld(spec.fontSizePx)}
              >
                {spec.text}
              </text>
            );
          })}
        </g>

        {/* Norte (North arrow) — Style Guide §10.1: canto superior-direito da
            viewBox, círculo r 14 px + seta + letra "N" mono 8 px. Always
            present, never hidden. */}
        <NorthSymbol viewX={v.x} viewY={v.y} viewW={v.w} />

        {/* Escala gráfica — Style Guide §10.2: canto inferior-esquerdo. 2 m
            de barra com ticks 0 / 1 / 2. Confirma a escala 1:50 visualmente. */}
        <ScaleBarSymbol viewX={v.x} viewY={v.y} viewH={v.h} />

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

        {/* Wall edit handles — appear when a single wall is selected. Two
            endpoint circles (start / end) and one center handle for parallel
            translate. liveTransforms applied via the merged `nodes` so the
            handle positions track the drag in real time.
            Junction indicator (Fase B): if the endpoint sits on a junction
            shared with other walls we draw a dashed accent ring around it
            telling the user "all these walls move together". Hold Alt to
            detach. */}
        {selected.length === 1 &&
          (() => {
            const sel = selected[0];
            const w = nodes[sel] as WallNode | undefined;
            if (!w || w.type !== "wall") return null;
            const cx = (w.start.x + w.end.x) / 2;
            const cz = (w.start.z + w.end.z) / 2;
            const startJ = findJunction(walls, w.start, JUNCTION_TOLERANCE);
            const endJ = findJunction(walls, w.end, JUNCTION_TOLERANCE);
            const startConnected = !!startJ && startJ.members.length >= 2;
            const endConnected = !!endJ && endJ.members.length >= 2;
            return (
              <g className="wall-handles">
                {startConnected && (
                  <circle
                    cx={w.start.x}
                    cy={w.start.z}
                    r={0.18}
                    fill="none"
                    stroke={PALETTE.accent}
                    strokeWidth={1.5}
                    strokeDasharray="0.06 0.06"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={w.start.x}
                  cy={w.start.z}
                  r={0.10}
                  fill={PALETTE.paper}
                  stroke={PALETTE.accent}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    tools.beginWallEndpointDrag(w.id, "start", e.clientX, e.clientY);
                  }}
                  style={{ cursor: "grab" }}
                />
                {endConnected && (
                  <circle
                    cx={w.end.x}
                    cy={w.end.z}
                    r={0.18}
                    fill="none"
                    stroke={PALETTE.accent}
                    strokeWidth={1.5}
                    strokeDasharray="0.06 0.06"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={w.end.x}
                  cy={w.end.z}
                  r={0.10}
                  fill={PALETTE.paper}
                  stroke={PALETTE.accent}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    tools.beginWallEndpointDrag(w.id, "end", e.clientX, e.clientY);
                  }}
                  style={{ cursor: "grab" }}
                />
                <circle
                  cx={cx}
                  cy={cz}
                  r={0.08}
                  fill={PALETTE.accent}
                  stroke={PALETTE.paper}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    tools.beginWallTranslate(w.id, e.clientX, e.clientY);
                  }}
                  style={{ cursor: "move" }}
                />
              </g>
            );
          })()}

        {/* Dimension-draw tool overlay: same visual language as wall-draw,
            but only renders the anchor + ghost line. The committed
            DimensionNode then takes over rendering through <DimensionSvg>. */}
        {tool === "dimension" && (
          <g className="dimension-draw-overlay" pointerEvents="none">
            {tools.dimensionDraw.state.phase === "anchored" &&
              tools.dimensionDraw.state.anchor && (
                <circle
                  cx={tools.dimensionDraw.state.anchor.x}
                  cy={tools.dimensionDraw.state.anchor.z}
                  r={0.08}
                  fill={PALETTE.accent}
                />
              )}
            {tools.dimensionDraw.state.phase === "anchored" &&
              tools.dimensionDraw.state.anchor &&
              tools.dimensionDraw.pointerWorld && (
                <line
                  x1={tools.dimensionDraw.state.anchor.x}
                  y1={tools.dimensionDraw.state.anchor.z}
                  x2={tools.dimensionDraw.pointerWorld.x}
                  y2={tools.dimensionDraw.pointerWorld.z}
                  stroke={PALETTE.accent}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            {tools.dimensionDraw.pointerWorld && (
              <circle
                cx={tools.dimensionDraw.pointerWorld.x}
                cy={tools.dimensionDraw.pointerWorld.z}
                r={0.05}
                fill="none"
                stroke={PALETTE.accent}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )}
      </svg>

      {/* Floating context menu — anchored to the currently-selected node's
          DOM element via data-node-id. We rebind on every selection / live
          transform change so it tracks panning and dragging. */}
      <FloorplanContextMenu svgRef={svgRef} selected={selected} liveSig={liveTransforms.size} />

      {/* Floating measurement chip — Fase R. Shows the live length of the
          wall being drawn next to the cursor. TAB or click swaps the chip
          for a numeric input; Enter commits a wall of that exact length. */}
      {tool === "wall" &&
        tools.wallDraw.state.phase === "anchored" &&
        tools.wallDraw.state.anchor &&
        tools.wallDraw.pointerWorld &&
        pointerScreen && (
          (() => {
            const a = tools.wallDraw.state.anchor;
            const e = tools.wallDraw.pointerWorld;
            const len = Math.hypot(e.x - a.x, e.z - a.z);
            return (
              <MeasurementChip
                screen={pointerScreen}
                meters={len}
                onCommit={(m) => tools.commitDrawWallWithLength(m)}
              />
            );
          })()
        )}

      {/* Empty state overlay */}
      {showEmptyState && (
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

/** Map a slab material to one of the SVG `<pattern>` ids defined in `<defs>`.
 *  Returns null for materials without a vector pattern (caller falls back to
 *  solid colour from materials.ts:floorColor). */
function slabPatternUrl(material: string | undefined): string | null {
  switch (material) {
    case "madeira":
    case "wood":
      return "url(#floor-wood)";
    case "porcelanato":
    case "ceramica":
    case "tile":
      return "url(#floor-tile)";
    case "carpete":
    case "carpet":
      return "url(#floor-carpet)";
    case "pedra":
    case "cimento":
    case "stone":
      return "url(#floor-stone)";
    default:
      return null;
  }
}

function polygonToSvg(poly: { x: number; z: number }[]): string {
  return poly.map((p) => `${p.x},${p.z}`).join(" ");
}

function cornersToSvg(c: WallCorners): string {
  return `${c.startLeft.x},${c.startLeft.z} ${c.endLeft.x},${c.endLeft.z} ${c.endRight.x},${c.endRight.z} ${c.startRight.x},${c.startRight.z}`;
}

// ---- FurniturePiece ------------------------------------------------------
// Style Guide §6: top-down silhouette with one fill token + ink stroke +
// optional internal details (encosto, tampo, divisão). Centered at (0, 0)
// in local space — the parent <g> handles position + rotation + shadow.

interface FurniturePieceProps {
  w: number;
  d: number;
  style: FurnitureStyle;
  stroke: string;
  selected: boolean;
}

function FurniturePiece({ w, d, style, stroke, selected }: FurniturePieceProps) {
  const halfW = w / 2;
  const halfD = d / 2;
  const baseRx = Math.min(style.radius, Math.min(halfW, halfD) * 0.4);
  const detailStroke = PALETTE.ink;
  const detailOpacity = 0.18;
  const strokeW = selected ? 1.6 : 0.8;

  // Bar stools / lamps — circular silhouettes.
  if (style.kind === "bar-stool" || style.kind === "lamp") {
    const r = Math.min(halfW, halfD);
    return (
      <>
        <circle
          cx={0}
          cy={0}
          r={r}
          fill={style.fill === "transparent" ? "none" : style.fill}
          stroke={stroke}
          strokeWidth={strokeW}
          strokeDasharray={style.kind === "lamp" ? "0.05 0.04" : undefined}
          vectorEffect="non-scaling-stroke"
        />
        {style.kind === "lamp" && (
          <circle cx={0} cy={0} r={r * 0.18} fill={PALETTE.accent} fillOpacity={0.6} />
        )}
      </>
    );
  }

  // Round coffee table — ellipse silhouette + concentric inner ellipse.
  if (style.kind === "coffee-table" && Math.abs(w - d) < 0.05) {
    const rx = halfW;
    const ry = halfD;
    return (
      <>
        <ellipse
          cx={0}
          cy={0}
          rx={rx}
          ry={ry}
          fill={style.fill}
          stroke={stroke}
          strokeWidth={strokeW}
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx={0}
          cy={0}
          rx={rx * 0.78}
          ry={ry * 0.78}
          fill="none"
          stroke={detailStroke}
          strokeOpacity={0.18}
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  }

  // Generic rectangle silhouette.
  return (
    <>
      <rect
        x={-halfW}
        y={-halfD}
        width={w}
        height={d}
        rx={baseRx}
        ry={baseRx}
        fill={style.fill}
        stroke={stroke}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      {/* Sofa — back rail (long edge) + cushion divisions. */}
      {style.kind === "sofa" && (
        <>
          {/* Back rail = thin strip on the longer edge, towards +y (= "back"
              of the local frame). When the sofa is rotated by f.rotation,
              the parent <g> rotates this whole group, so "back" follows. */}
          <rect
            x={-halfW + 0.04}
            y={-halfD + 0.04}
            width={w - 0.08}
            height={Math.min(0.18, d * 0.28)}
            rx={Math.min(0.04, baseRx)}
            ry={Math.min(0.04, baseRx)}
            fill={detailStroke}
            fillOpacity={0.08}
          />
          {/* Cushion dividers — 1/3 and 2/3 along the longer axis. */}
          {w > d ? (
            <>
              <line
                x1={-halfW + w / 3}
                y1={-halfD + 0.18}
                x2={-halfW + w / 3}
                y2={halfD - 0.05}
                stroke={detailStroke}
                strokeOpacity={detailOpacity}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={-halfW + (2 * w) / 3}
                y1={-halfD + 0.18}
                x2={-halfW + (2 * w) / 3}
                y2={halfD - 0.05}
                stroke={detailStroke}
                strokeOpacity={detailOpacity}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : (
            <>
              <line
                x1={-halfW + 0.18}
                y1={-halfD + d / 3}
                x2={halfW - 0.05}
                y2={-halfD + d / 3}
                stroke={detailStroke}
                strokeOpacity={detailOpacity}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={-halfW + 0.18}
                y1={-halfD + (2 * d) / 3}
                x2={halfW - 0.05}
                y2={-halfD + (2 * d) / 3}
                stroke={detailStroke}
                strokeOpacity={detailOpacity}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </>
      )}
      {/* Bed — pillow strip near the head (top edge in local frame) + central
          line as a quilt seam. */}
      {style.kind === "bed" && (
        <>
          <rect
            x={-halfW + 0.06}
            y={-halfD + 0.04}
            width={w - 0.12}
            height={Math.min(0.32, d * 0.22)}
            rx={0.03}
            ry={0.03}
            fill={detailStroke}
            fillOpacity={0.06}
            stroke={detailStroke}
            strokeOpacity={0.14}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            y1={-halfD + 0.06 + Math.min(0.32, d * 0.22)}
            x2={0}
            y2={halfD - 0.05}
            stroke={detailStroke}
            strokeOpacity={0.14}
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {/* Dining table — wood grain hint along the long axis. */}
      {style.kind === "dining-table" && w > d && (
        <line
          x1={-halfW + 0.08}
          y1={0}
          x2={halfW - 0.08}
          y2={0}
          stroke={detailStroke}
          strokeOpacity={0.16}
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* Kitchen island — stool dots along the long edge. */}
      {style.kind === "kitchen-island" && (
        <>
          {Array.from({ length: Math.max(1, Math.round(w / 0.8)) }).map((_, i, arr) => {
            const t = (i + 1) / (arr.length + 1);
            const px = -halfW + t * w;
            return (
              <circle
                key={i}
                cx={px}
                cy={halfD + 0.18}
                r={0.09}
                fill={PALETTE.furnWoodLight}
                stroke={detailStroke}
                strokeOpacity={0.5}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </>
      )}
      {/* Fridge — vertical line marking the door. */}
      {style.kind === "fridge" && (
        <line
          x1={-halfW + w * 0.12}
          y1={-halfD + 0.04}
          x2={-halfW + w * 0.12}
          y2={halfD - 0.04}
          stroke={detailStroke}
          strokeOpacity={0.4}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* Stove — 4 burner circles. */}
      {style.kind === "stove" && (
        <>
          {[
            [-0.25, -0.15],
            [0.25, -0.15],
            [-0.25, 0.15],
            [0.25, 0.15],
          ].map(([x, y], i) => (
            <circle
              key={i}
              cx={x * Math.min(1, w / 0.6)}
              cy={y * Math.min(1, d / 0.4)}
              r={0.06}
              fill="none"
              stroke={detailStroke}
              strokeOpacity={0.45}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      )}
      {/* Sink (lavabo / kitchen) — interior basin ellipse. */}
      {(style.kind === "sink" || style.kind === "toilet") && (
        <ellipse
          cx={0}
          cy={style.kind === "toilet" ? d * 0.1 : 0}
          rx={halfW * 0.7}
          ry={halfD * 0.7}
          fill="none"
          stroke={detailStroke}
          strokeOpacity={0.5}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* TV console / bookshelf — divisões verticais finas. */}
      {(style.kind === "tv-console" || style.kind === "bookshelf") &&
        Array.from({ length: Math.max(0, Math.floor(w / 0.6) - 1) }).map((_, i, arr) => {
          const t = (i + 1) / (arr.length + 1);
          return (
            <line
              key={i}
              x1={-halfW + t * w}
              y1={-halfD + 0.04}
              x2={-halfW + t * w}
              y2={halfD - 0.04}
              stroke={PALETTE.bg}
              strokeOpacity={0.18}
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      {/* Selection handles (Style Guide §6.3). */}
      {selected && (
        <>
          {[
            [-halfW, -halfD],
            [halfW, -halfD],
            [halfW, halfD],
            [-halfW, halfD],
          ].map(([hx, hy], i) => (
            <circle
              key={i}
              cx={hx}
              cy={hy}
              r={0.05}
              fill={PALETTE.paper}
              stroke={PALETTE.accent}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ))}
        </>
      )}
    </>
  );
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
      data-node-id={door.id}
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
      {/* Paper coverage — "erases" the wall under the door opening. */}
      <polygon points={bone} fill={PALETTE.paper} />
      {/* Door leaf — solid ink line from hinge to open position. */}
      <line
        x1={hinge.x}
        y1={hinge.z}
        x2={leafEnd.x}
        y2={leafEnd.z}
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* Swing arc — dashed ink from tip to leafEnd. */}
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

  // Style Guide §5.2 — janela = 3 linhas paralelas (peitoril externo, central
  // sobre a parede, peitoril interno) + cobertura "papel" para "apagar" o
  // trecho da parede onde está o vão. Caixilho central vertical em janelas
  // largas (>1.4 m, sliding).
  const outerOff = wt / 2 - 0.005;
  const middleOff = 0;
  const isWide = win.width > 1.4;
  return (
    <g
      data-node-id={win.id}
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
      {/* Paper coverage — "erases" the wall segment beneath the window. */}
      <polygon points={bone} fill={PALETTE.paper} />
      {/* Linha 1: peitoril externo. */}
      <line
        x1={aLeft.x + perp.x * outerOff}
        y1={aLeft.z + perp.z * outerOff}
        x2={aRight.x + perp.x * outerOff}
        y2={aRight.z + perp.z * outerOff}
        stroke={stroke}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      {/* Linha 2: central (sobre o eixo da parede). */}
      <line
        x1={aLeft.x + perp.x * middleOff}
        y1={aLeft.z + perp.z * middleOff}
        x2={aRight.x + perp.x * middleOff}
        y2={aRight.z + perp.z * middleOff}
        stroke={stroke}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
      {/* Linha 3: peitoril interno. */}
      <line
        x1={aLeft.x - perp.x * outerOff}
        y1={aLeft.z - perp.z * outerOff}
        x2={aRight.x - perp.x * outerOff}
        y2={aRight.z - perp.z * outerOff}
        stroke={stroke}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      {/* Linhas verticais nas extremidades (Fase Q) — fecham o retângulo
          da janela, ligando o peitoril externo ao interno em start e end.
          Sem elas, o desenho técnico fica "aberto". */}
      <line
        x1={aLeft.x + perp.x * outerOff}
        y1={aLeft.z + perp.z * outerOff}
        x2={aLeft.x - perp.x * outerOff}
        y2={aLeft.z - perp.z * outerOff}
        stroke={stroke}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={aRight.x + perp.x * outerOff}
        y1={aRight.z + perp.z * outerOff}
        x2={aRight.x - perp.x * outerOff}
        y2={aRight.z - perp.z * outerOff}
        stroke={stroke}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      {/* Caixilho central de janela larga (sliding). */}
      {isWide && (
        <line
          x1={cx - perp.x * outerOff}
          y1={cz - perp.z * outerOff}
          x2={cx + perp.x * outerOff}
          y2={cz + perp.z * outerOff}
          stroke={stroke}
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

interface DimensionSvgProps {
  dim: DimensionNode;
  /** Override label position from auto-layout. Falls back to natural position
   *  if null. */
  labelOverride?: { x: number; z: number } | null;
  selected?: boolean;
  hovered?: boolean;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onClick?: (shiftKey: boolean) => void;
  onPointerDown?: (clientX: number, clientY: number) => void;
}

function DimensionSvg({
  dim,
  labelOverride,
  selected,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
  onPointerDown,
}: DimensionSvgProps) {
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
  const stroke = selected ? PALETTE.accent : hovered ? PALETTE.hoverStroke : PALETTE.inkSoft;
  // Padding for the invisible hit zone — wide enough to grab without
  // having to land on a 0.9px line, narrow enough not to swallow nearby
  // wall clicks.
  const hitPad = 0.18;
  return (
    <g>
      {/* Invisible hit zone: a fat polygon hugging the dim line so that
          clicking anywhere near the cota selects it (and dragging starts
          an offset drag). pointerEvents=visible so the transparent fill
          still receives hits. */}
      <polygon
        data-node-id={dim.id}
        points={[
          [a.x - perp.x * hitPad, a.z - perp.z * hitPad],
          [b.x - perp.x * hitPad, b.z - perp.z * hitPad],
          [b.x + perp.x * hitPad, b.z + perp.z * hitPad],
          [a.x + perp.x * hitPad, a.z + perp.z * hitPad],
        ]
          .map(([x, z]) => `${x},${z}`)
          .join(" ")}
        fill="transparent"
        pointerEvents="visible"
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e.shiftKey);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onPointerDown?.(e.clientX, e.clientY);
        }}
        style={{ cursor: selected ? "grab" : "pointer" }}
      />
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
        pointerEvents="none"
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
        pointerEvents="none"
      />
      {/* main dim line */}
      <line
        x1={a.x}
        y1={a.z}
        x2={b.x}
        y2={b.z}
        stroke={stroke}
        strokeWidth={selected ? 1.4 : 0.9}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {/* tick marks */}
      <line
        x1={a.x - perp.x * tick}
        y1={a.z - perp.z * tick}
        x2={a.x + perp.x * tick}
        y2={a.z + perp.z * tick}
        stroke={stroke}
        strokeWidth={selected ? 1.4 : 0.9}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <line
        x1={b.x - perp.x * tick}
        y1={b.z - perp.z * tick}
        x2={b.x + perp.x * tick}
        y2={b.z + perp.z * tick}
        stroke={stroke}
        strokeWidth={selected ? 1.4 : 0.9}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {/* label */}
      <text
        x={labelX}
        y={labelZ}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: pxToWorld(11),
          fill: stroke,
        }}
        fontSize={pxToWorld(11)}
        pointerEvents="none"
      >
        {text}
      </text>
    </g>
  );
}

// ---- North symbol --------------------------------------------------------
// Style Guide §10.1. Sized in WORLD metres (1 user unit = 1 m on our viewBox).
// We anchor 0.6 m inside the viewBox top-right corner.

function NorthSymbol({ viewX, viewY, viewW }: { viewX: number; viewY: number; viewW: number }) {
  const cx = viewX + viewW - 0.6;
  const cy = viewY + 0.6;
  const r = 0.22; // ≈ 22 cm — reads well at apartment scale
  // NOTE: SVG `stroke-width` and `font-size` on a <g> are interpreted in
  // user-space units (= metres here). Without per-element `vector-effect`,
  // strokes balloon to absurd metre-thick lines. We attach the effect to
  // every stroked child explicitly because browsers don't always inherit it
  // through grouping the way the spec implies.
  return (
    <g transform={`translate(${cx} ${cy})`} pointerEvents="none">
      <circle
        r={r}
        fill="none"
        stroke={PALETTE.ink}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
      {/* Arrow pointing up. */}
      <path
        d={`M0 ${-r * 0.7} L${r * 0.28} ${r * 0.55} L0 ${r * 0.28} L${-r * 0.28} ${r * 0.55} Z`}
        fill={PALETTE.ink}
      />
      <text
        x={0}
        y={-r - 0.05}
        textAnchor="middle"
        dominantBaseline="auto"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: pxToWorld(8),
          fill: PALETTE.ink,
          letterSpacing: "0.06em",
        }}
        fontSize={pxToWorld(8)}
        fill={PALETTE.ink}
      >
        N
      </text>
    </g>
  );
}

// ---- Scale bar -----------------------------------------------------------
// Style Guide §10.2. 2 m barra with three ticks (0 / 1 / 2 m).

function ScaleBarSymbol({
  viewX,
  viewY,
  viewH,
}: {
  viewX: number;
  viewY: number;
  viewH: number;
}) {
  const startX = viewX + 0.6;
  const startY = viewY + viewH - 0.6;
  const length = 2; // 2 m
  // Same vector-effect-per-child rule as the north symbol — see comment there.
  const lineProps = {
    stroke: PALETTE.ink,
    strokeWidth: 0.5,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <g transform={`translate(${startX} ${startY})`} pointerEvents="none">
      <line x1={0} y1={0} x2={length} y2={0} {...lineProps} />
      <line x1={0} y1={-0.06} x2={0} y2={0.06} {...lineProps} />
      <line x1={length / 2} y1={-0.04} x2={length / 2} y2={0.04} {...lineProps} />
      <line x1={length} y1={-0.06} x2={length} y2={0.06} {...lineProps} />
      <text
        x={0}
        y={0.18}
        textAnchor="middle"
        dominantBaseline="hanging"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: pxToWorld(8),
          fill: PALETTE.ink,
          opacity: 0.6,
        }}
        fontSize={pxToWorld(8)}
        fill={PALETTE.ink}
      >
        0
      </text>
      <text
        x={length}
        y={0.18}
        textAnchor="middle"
        dominantBaseline="hanging"
        style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: pxToWorld(8),
          fill: PALETTE.ink,
          opacity: 0.6,
        }}
        fontSize={pxToWorld(8)}
        fill={PALETTE.ink}
      >
        2 m
      </text>
    </g>
  );
}

// ---- Floating context menu wiring ---------------------------------------
// Resolves the SVG element that represents the currently-selected node
// (via the data-node-id attribute we attach in the renderer) and feeds it
// to the shared <ContextMenu> component. liveSig is just a render trigger
// so the menu repositions during drag.
function FloorplanContextMenu({
  svgRef,
  selected,
  liveSig,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  selected: string[];
  liveSig: number;
}) {
  const setSelection = useSceneStore((s) => s.setSelection);
  const single = selected.length === 1 ? selected[0] : null;
  const [anchor, setAnchor] = useState<SVGGraphicsElement | null>(null);

  useEffect(() => {
    if (!single) {
      setAnchor(null);
      return;
    }
    const root = svgRef.current;
    if (!root) return;
    const el = root.querySelector(
      `[data-node-id="${cssEscape(single)}"]`
    ) as SVGGraphicsElement | null;
    setAnchor(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, svgRef, liveSig]);

  if (!single) return null;
  return (
    <ContextMenu
      anchorEl={anchor}
      selectedId={single}
      onClose={() => setSelection([])}
      onSendToAgent={(prompt) => {
        // Forward to the chat panel via a window-level event. ChatPanel
        // listens and runs `send(prompt)`.
        window.dispatchEvent(
          new CustomEvent("ca:agent-prompt", { detail: prompt })
        );
      }}
    />
  );
}

function cssEscape(s: string): string {
  // CSS.escape may not be available in all SSR contexts; fall back to a
  // permissive replacement of characters that would break a selector.
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/(["\\#.[\]:])/g, "\\$1");
}
