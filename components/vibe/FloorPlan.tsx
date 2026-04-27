"use client";

import { useMemo } from "react";
import type { Door, FloorPlan, Furniture, Room, SelectedElement, Window as PlanWindow } from "@/lib/types";
import type { Camera } from "@/lib/vibe-types";

const M_TO_PX = 50; // 1 meter = 50px

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
}

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

function fmtMm(m: number): string {
  return `${(m * 1000).toFixed(0)}`;
}

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
}: Props) {
  const bounds = useMemo(() => computeBounds(plan), [plan]);
  const padding = 2;
  const widthM = bounds.maxX - bounds.minX + padding * 2;
  const heightM = bounds.maxY - bounds.minY + padding * 2;
  const widthPx = widthM * M_TO_PX;
  const heightPx = heightM * M_TO_PX;

  // Coordinate transform
  const toX = (m: number) => (m - bounds.minX + padding) * M_TO_PX;
  const toY = (m: number) => (m - bounds.minY + padding) * M_TO_PX;

  return (
    <svg
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      preserveAspectRatio="xMidYMid meet"
      className="block max-w-full max-h-full"
      onClick={() => onSelect(null)}
      style={{ background: "transparent" }}
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

      {/* Floors per room */}
      {plan.rooms.map((r) => {
        const fill =
          r.floor === "porcelanato" ? "url(#tile)" :
          r.floor === "madeira" ? "url(#madeira)" :
          r.floor === "ceramica" ? "url(#ceramica)" :
          "#EEE6D6";
        const isSel = selected?.type === "room" && selected.id === r.id;
        return (
          <g key={r.id}
             onClick={(e) => { e.stopPropagation(); onSelect({ type: "room", id: r.id }); }}
             style={{ cursor: "pointer" }}>
            <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX} fill={fill} />
            {isSel && (
              <rect x={toX(r.x)} y={toY(r.y)} width={r.width * M_TO_PX} height={r.height * M_TO_PX}
                    fill="none" stroke="#B8552E" strokeWidth="2" strokeDasharray="6 3" />
            )}
            <text
              x={toX(r.x + r.width / 2)} y={toY(r.y + r.height / 2) - 4}
              textAnchor="middle" fontSize="11"
              fill="#4A4338"
              style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic" }}
            >
              {r.name}
            </text>
            <text
              x={toX(r.x + r.width / 2)} y={toY(r.y + r.height / 2) + 10}
              textAnchor="middle" fontSize="8"
              fill="#8C8478"
              style={{ fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.1em" }}
            >
              {(r.width * r.height).toFixed(1).replace(".", ",")} M²
            </text>
          </g>
        );
      })}

      {/* Walls — drawn as room outlines with a thicker external edge.
          Approach: each room has a wall stroke; external/internal handled by overlap. */}
      {plan.rooms.map((r) => {
        const isSel = selected?.type === "room" && selected.id === r.id;
        return (
          <rect
            key={`wall-${r.id}`}
            x={toX(r.x)} y={toY(r.y)}
            width={r.width * M_TO_PX} height={r.height * M_TO_PX}
            fill="none"
            stroke="#1F1B16"
            strokeWidth={isSel ? 9 : 8}
            shapeRendering="crispEdges"
            pointerEvents="none"
          />
        );
      })}

      {/* External walls overlay (compute outline). */}
      <ExternalOutline plan={plan} toX={toX} toY={toY} />

      {/* Door openings (cut walls with white rect + swing arc) */}
      {plan.doors.map((d) => (
        <DoorMark key={d.id} door={d} plan={plan} toX={toX} toY={toY}
                  selected={selected?.type === "door" && selected.id === d.id}
                  onSelect={() => onSelect({ type: "door", id: d.id })} />
      ))}

      {/* Windows */}
      {plan.windows.map((w) => (
        <WindowMark key={w.id} win={w} plan={plan} toX={toX} toY={toY}
                    selected={selected?.type === "window" && selected.id === w.id}
                    onSelect={() => onSelect({ type: "window", id: w.id })} />
      ))}

      {/* Furniture */}
      {plan.furniture.map((f) => (
        <FurnitureMark key={f.id} item={f} toX={toX} toY={toY}
                       selected={selected?.type === "furniture" && selected.id === f.id}
                       onSelect={() => onSelect({ type: "furniture", id: f.id })}
                       diff={showDiff && diffTargetId === f.id} />
      ))}

      {/* Diff for wall-divisor (synthetic): show ghost old wall */}
      {showDiff && diffTargetId === "wall-divisor" && (
        <DivisorDiff plan={plan} toX={toX} toY={toY} />
      )}

      {/* Cameras */}
      {variant === "editor" && cameras.map((c) => (
        <CameraPin key={c.id} cam={c} toX={toX} toY={toY}
                   active={activeCameraId === c.id}
                   onSelect={() => onSelectCamera?.(c.id)} />
      ))}

      {/* Dimensions for living room (illustrative) */}
      {variant === "editor" && (
        <Dimensions plan={plan} toX={toX} toY={toY} />
      )}

      {/* Compass + Scale */}
      {variant === "editor" && (
        <>
          <Compass x={widthPx - 60} y={50} />
          <ScaleBar x={30} y={heightPx - 30} />
        </>
      )}
    </svg>
  );
}

// ---------- Helpers (subcomponents) ----------

function ExternalOutline({ plan, toX, toY }: { plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number; }) {
  // We don't compute true polygon outline here; keep a thicker secondary stroke around overall bbox.
  if (plan.rooms.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
  }
  return (
    <rect
      x={toX(minX) - 2} y={toY(minY) - 2}
      width={(maxX - minX) * M_TO_PX + 4} height={(maxY - minY) * M_TO_PX + 4}
      fill="none" stroke="#1F1B16" strokeWidth="12" shapeRendering="crispEdges" pointerEvents="none"
    />
  );
}

function wallSegment(room: Room, wall: Door["wall"], pos: number, size: number) {
  // Returns two points (x1,y1)-(x2,y2) along the wall in meters
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
  // east
  const y1 = along(room.y, room.height);
  return { x1: room.x + room.width, y1, x2: room.x + room.width, y2: y1 + size, axis: "v" as const };
}

function DoorMark({ door, plan, toX, toY, selected, onSelect }:
  { door: Door; plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number; selected?: boolean; onSelect: () => void; }) {
  const room = plan.rooms.find((r) => r.id === door.roomId);
  if (!room) return null;
  const seg = wallSegment(room, door.wall, door.position, door.size);
  // White rect cuts the wall
  const sx = toX(Math.min(seg.x1, seg.x2));
  const sy = toY(Math.min(seg.y1, seg.y2));
  const w = seg.axis === "h" ? Math.abs(seg.x2 - seg.x1) * M_TO_PX : 12;
  const h = seg.axis === "v" ? Math.abs(seg.y2 - seg.y1) * M_TO_PX : 12;
  // Swing arc
  const radius = door.size * M_TO_PX;
  let arc = "";
  if (seg.axis === "h") {
    const cx = toX(seg.x1);
    const cy = toY(seg.y1);
    const sweepDir = door.wall === "north" ? 1 : -1;
    arc = `M ${cx} ${cy} a ${radius} ${radius} 0 0 1 ${radius} ${sweepDir * radius}`;
  } else {
    const cx = toX(seg.x1);
    const cy = toY(seg.y1);
    const sweepDir = door.wall === "west" ? 1 : -1;
    arc = `M ${cx} ${cy} a ${radius} ${radius} 0 0 1 ${sweepDir * radius} ${radius}`;
  }
  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: "pointer" }}>
      <rect x={sx - (seg.axis === "h" ? 0 : 6)} y={sy - (seg.axis === "v" ? 0 : 6)}
            width={w} height={h} fill="#FAF7F0" />
      <path d={arc} fill="none" stroke={selected ? "#B8552E" : "#8C8478"} strokeWidth="0.8" />
    </g>
  );
}

function WindowMark({ win, plan, toX, toY, selected, onSelect }:
  { win: PlanWindow; plan: FloorPlan; toX: (m: number) => number; toY: (m: number) => number; selected?: boolean; onSelect: () => void; }) {
  const room = plan.rooms.find((r) => r.id === win.roomId);
  if (!room) return null;
  const seg = wallSegment(room, win.wall, win.position, win.size);
  const sx = toX(Math.min(seg.x1, seg.x2));
  const sy = toY(Math.min(seg.y1, seg.y2));
  const w = seg.axis === "h" ? Math.abs(seg.x2 - seg.x1) * M_TO_PX : 10;
  const h = seg.axis === "v" ? Math.abs(seg.y2 - seg.y1) * M_TO_PX : 10;
  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: "pointer" }}>
      <rect x={sx - (seg.axis === "h" ? 0 : 5)} y={sy - (seg.axis === "v" ? 0 : 5)}
            width={w} height={h} fill="#FAF7F0" stroke={selected ? "#B8552E" : "#1F1B16"} strokeWidth="1.5" />
      {seg.axis === "h" ? (
        <line x1={sx} y1={sy} x2={sx + w} y2={sy} stroke="#1F1B16" strokeWidth="1" />
      ) : (
        <line x1={sx} y1={sy} x2={sx} y2={sy + h} stroke="#1F1B16" strokeWidth="1" />
      )}
    </g>
  );
}

function FurnitureMark({ item, toX, toY, selected, onSelect, diff }:
  { item: Furniture; toX: (m: number) => number; toY: (m: number) => number; selected?: boolean; onSelect: () => void; diff?: boolean; }) {
  const x = toX(item.x);
  const y = toY(item.y);
  const w = item.width * M_TO_PX;
  const h = item.height * M_TO_PX;
  const fill = furnitureFill(item.type);
  const stroke = selected ? "#B8552E" : "#3A332A";

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 0.8} rx="2" />
      {furnitureGlyph(item.type, x, y, w, h)}
      {selected && (
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="none" stroke="#B8552E" strokeDasharray="3 3" strokeWidth="1" rx="3" />
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
    // Cushion lines
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
  // Wall between dining (room-dining: x=2.4..6.4, y=5..8.4) and living
  // Display ghost old position and new position 50cm down
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
  const seg = M_TO_PX; // 1m
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
