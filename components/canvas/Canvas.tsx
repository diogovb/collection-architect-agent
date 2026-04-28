"use client";

// Unified R3F canvas: serves both 2D top-down (orthographic) and 3D
// perspective views from the same scene graph. Switching is just a camera
// swap + per-view material toggles in node views.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas as R3FCanvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { useSceneStore, effectiveNode, selectWalls } from "@/lib/scene/store";
import {
  type DoorNode,
  type FurnitureNode,
  type RoomNode,
  type SlabNode,
  type ViewMode,
  type WallNode,
  type WindowNode,
  type DimensionNode,
  type NodeId,
  polygonBounds,
} from "@/lib/scene/types";
import { computeWallCorners } from "@/lib/scene/wall-mitering";

import { PALETTE } from "./materials";
import { WallView } from "./nodes/WallView";
import { SlabView } from "./nodes/SlabView";
import { DoorView } from "./nodes/DoorView";
import { WindowView } from "./nodes/WindowView";
import { FurnitureView } from "./nodes/FurnitureView";
import { RoomLabel } from "./nodes/RoomLabel";
import { DimensionView } from "./nodes/DimensionView";
import { NorthArrow } from "./nodes/NorthArrow";
import { ScaleBar } from "./nodes/ScaleBar";
import { DragHandles } from "./nodes/DragHandles";
import { useFurnitureDrag } from "./hooks/useFurnitureDrag";
import { useOpeningSlide } from "./hooks/useOpeningSlide";
import { useWallDrawTool } from "./hooks/useWallDrawTool";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Toolbar } from "./Toolbar";
import { Line } from "@react-three/drei";

interface Props {
  onLoadExample?: () => void;
}

export function Canvas({ onLoadExample }: Props) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const nodes = useSceneStore((s) => s.nodes);
  const walls = useMemo(
    () => Object.values(nodes).filter((n): n is WallNode => n.type === "wall"),
    [nodes]
  );
  const isEmpty = walls.length === 0;

  const bounds = useMemo(() => {
    if (walls.length === 0) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      for (const p of [w.start, w.end]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    return { minX, maxX, minZ, maxZ };
  }, [walls]);

  const center = useMemo(() => ({
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  }), [bounds]);

  const span = useMemo(() => {
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    return Math.max(w, d, 6);
  }, [bounds]);

  return (
    <div className="w-full h-full bg-bg relative">
      <R3FCanvas
        key={viewMode}
        orthographic={viewMode === "2d"}
        camera={
          viewMode === "2d"
            ? { position: [center.x, 50, center.z], zoom: 40, near: 0.1, far: 200, up: [0, 0, -1] }
            : { fov: 45, position: [center.x + span * 0.6, span * 0.7, center.z + span * 0.6], near: 0.1, far: 200 }
        }
        style={{ background: "#FAF7F0", display: "block" }}
        gl={{ antialias: true, preserveDrawingBuffer: false, alpha: false, premultipliedAlpha: false }}
        dpr={[1, 2]}
        onCreated={(state) => {
          state.gl.setClearColor("#FAF7F0", 1);
          state.gl.clear();
        }}
        onPointerMissed={() => useSceneStore.getState().setSelection([])}
      >
        {/* Scene background ensures even the first frame is paper-colored. */}
        <color attach="background" args={["#FAF7F0"]} />
        <CameraSync center={center} span={span} viewMode={viewMode} />
        <ambientLight intensity={viewMode === "2d" ? 0.95 : 0.65} />
        <hemisphereLight args={["#FFFFFF", "#E6DFD2", viewMode === "2d" ? 0.3 : 0.55]} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={viewMode === "2d" ? 0.0 : 0.85}
          castShadow={false}
        />
        {/* Background paper — only when the scene has content. Showing it on an
            empty scene was perceived as a stray "gray square" behind the empty
            state card. */}
        {!isEmpty && <PaperBackground bounds={bounds} viewMode={viewMode} />}
        {viewMode === "3d" && (
          <gridHelper args={[60, 60, "#D6CCB8", "#ECE4D2"]} position={[center.x, -0.06, center.z]} />
        )}

        <Suspense fallback={null}>
          <SceneContents viewMode={viewMode} />
        </Suspense>

        <OrbitControls
          enableRotate={viewMode === "3d"}
          enablePan
          enableZoom
          mouseButtons={{
            LEFT: viewMode === "2d" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          target={[center.x, 0, center.z]}
        />

        {viewMode === "2d" && <NorthArrow rotationDeg={0} />}
        {viewMode === "2d" && <ScaleBarPx />}
      </R3FCanvas>

      {/* 2D ⇄ 3D toggle */}
      <ModeToggle viewMode={viewMode} onChange={setViewMode} />

      {/* Tool toolbar (Selecionar/Mover/Parede/Cota + atalhos V/M/W/D) */}
      <Toolbar />

      {/* Validators panel (NBR/Neufert) */}
      <DiagnosticsPanel />

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="card p-6 max-w-sm text-center pointer-events-auto fade-up">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">PROJETO VAZIO</div>
            <h3 className="editorial text-[22px] mt-2">Comece pedindo ao agente</h3>
            <p className="text-[12.5px] text-muted mt-2">
              Descreva o ambiente que você quer criar. Ex.: "Faça um apartamento de 65m² com 2 quartos."
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

function CameraSync({
  center,
  span,
  viewMode,
}: {
  center: { x: number; z: number };
  span: number;
  viewMode: ViewMode;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (viewMode === "2d") {
      if (camera instanceof THREE.OrthographicCamera) {
        const minDim = Math.min(size.width, size.height);
        const padding = 1.4;
        const newZoom = (minDim / (span * padding)) || 40;
        camera.zoom = newZoom;
        camera.position.set(center.x, 50, center.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(center.x, 0, center.z);
        camera.updateProjectionMatrix();
      }
    } else if (camera instanceof THREE.PerspectiveCamera) {
      camera.position.set(center.x + span * 0.6, span * 0.7, center.z + span * 0.6);
      camera.lookAt(center.x, 0, center.z);
      camera.updateProjectionMatrix();
    }
  }, [camera, center.x, center.z, span, size.width, size.height, viewMode]);
  return null;
}

function PaperBackground({
  bounds,
  viewMode,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  viewMode: ViewMode;
}) {
  if (viewMode !== "2d") return null;
  const margin = 4;
  const w = bounds.maxX - bounds.minX + margin * 2;
  const d = bounds.maxZ - bounds.minZ + margin * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (
    <mesh position={[cx, -0.001, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={PALETTE.paper} />
    </mesh>
  );
}

function ScaleBarPx() {
  const { camera, size } = useThree();
  const meterPx = camera instanceof THREE.OrthographicCamera ? camera.zoom : 40;
  return <ScaleBar meterPx={meterPx} />;
}

function SceneContents({ viewMode }: { viewMode: ViewMode }) {
  const nodes = useSceneStore((s) => s.nodes);
  const liveTransforms = useSceneStore((s) => s.liveTransforms);
  const selected = useSceneStore((s) => s.selected);
  const hovered = useSceneStore((s) => s.hovered);
  const setHover = useSceneStore((s) => s.setHover);
  const toggleSelection = useSceneStore((s) => s.toggleSelection);
  const tool = useSceneStore((s) => s.tool);
  const startFurnitureDrag = useFurnitureDrag();
  const startOpeningSlide = useOpeningSlide();
  const drawTool = useWallDrawTool();

  const walls = useMemo(() =>
    Object.values(nodes).filter((n): n is WallNode => n.type === "wall")
      .map((w) => effectiveNode<WallNode>({ nodes, liveTransforms }, w.id)!)
      .filter(Boolean),
    [nodes, liveTransforms]
  );

  const corners = useMemo(() => computeWallCorners(walls), [walls]);

  const slabs = useMemo(() =>
    Object.values(nodes).filter((n): n is SlabNode => n.type === "slab"),
    [nodes]
  );
  const rooms = useMemo(() =>
    Object.values(nodes).filter((n): n is RoomNode => n.type === "room"),
    [nodes]
  );
  const doors = useMemo(() =>
    Object.values(nodes).filter((n): n is DoorNode => n.type === "door"),
    [nodes]
  );
  const windows = useMemo(() =>
    Object.values(nodes).filter((n): n is WindowNode => n.type === "window"),
    [nodes]
  );
  const furniture = useMemo(() =>
    Object.values(nodes).filter((n): n is FurnitureNode => n.type === "furniture"),
    [nodes]
  );
  const dimensions = useMemo(() =>
    Object.values(nodes).filter((n): n is DimensionNode => n.type === "dimension"),
    [nodes]
  );

  const doorsByWall = useMemo(() => {
    const m = new Map<NodeId, DoorNode[]>();
    for (const d of doors) {
      if (!m.has(d.wallId)) m.set(d.wallId, []);
      m.get(d.wallId)!.push(d);
    }
    return m;
  }, [doors]);

  const windowsByWall = useMemo(() => {
    const m = new Map<NodeId, WindowNode[]>();
    for (const w of windows) {
      if (!m.has(w.wallId)) m.set(w.wallId, []);
      m.get(w.wallId)!.push(w);
    }
    return m;
  }, [windows]);

  const isSel = (id: NodeId) => selected.includes(id);

  return (
    <group>
      {/* Floor slabs first (lowest layer) */}
      {slabs.map((slab) => (
        <SlabView key={slab.id} slab={slab} viewMode={viewMode} />
      ))}

      {/* Walls (above slabs in 2D) */}
      {walls.map((wall) => {
        const c = corners.get(wall.id);
        if (!c) return null;
        const wd = doorsByWall.get(wall.id) ?? [];
        const ww = windowsByWall.get(wall.id) ?? [];
        return (
          <WallView
            key={wall.id}
            wall={wall}
            corners={c}
            viewMode={viewMode}
            selected={isSel(wall.id)}
            hovered={hovered === wall.id}
            doors={wd}
            windows={ww}
            onPointerOver={(e) => { e.stopPropagation(); setHover(wall.id); }}
            onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
            onClick={(e) => { e.stopPropagation(); toggleSelection(wall.id, e.shiftKey); }}
            onPointerDown={() => {}}
          />
        );
      })}

      {/* Doors */}
      {doors.map((d) => {
        const live = liveTransforms.get(d.id);
        const effective: DoorNode = live?.offset !== undefined ? { ...d, offset: live.offset } : d;
        const wall = nodes[effective.wallId] as WallNode | undefined;
        if (!wall) return null;
        return (
          <DoorView
            key={d.id}
            door={effective}
            wall={wall}
            viewMode={viewMode}
            selected={isSel(d.id)}
            hovered={hovered === d.id}
            onPointerOver={(e) => { e.stopPropagation(); setHover(d.id); }}
            onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
            onClick={(e) => { e.stopPropagation(); toggleSelection(d.id, e.shiftKey); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (viewMode !== "2d" || tool !== "select" && tool !== "move") return;
              startOpeningSlide(d.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
          />
        );
      })}

      {/* Windows */}
      {windows.map((w) => {
        const live = liveTransforms.get(w.id);
        const effective: WindowNode = live?.offset !== undefined ? { ...w, offset: live.offset } : w;
        const wall = nodes[effective.wallId] as WallNode | undefined;
        if (!wall) return null;
        return (
          <WindowView
            key={w.id}
            win={effective}
            wall={wall}
            viewMode={viewMode}
            selected={isSel(w.id)}
            hovered={hovered === w.id}
            onPointerOver={(e) => { e.stopPropagation(); setHover(w.id); }}
            onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
            onClick={(e) => { e.stopPropagation(); toggleSelection(w.id, e.shiftKey); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (viewMode !== "2d" || tool !== "select" && tool !== "move") return;
              startOpeningSlide(w.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
          />
        );
      })}

      {/* Furniture (with drag) */}
      {furniture.map((f) => {
        const live = liveTransforms.get(f.id);
        const effective: FurnitureNode = live?.position
          ? { ...f, position: { ...f.position, ...live.position } }
          : f;
        return (
          <FurnitureView
            key={f.id}
            furniture={effective}
            viewMode={viewMode}
            selected={isSel(f.id)}
            hovered={hovered === f.id}
            onPointerOver={(e) => { e.stopPropagation(); setHover(f.id); }}
            onPointerOut={(e) => { e.stopPropagation(); setHover(null); }}
            onClick={(e) => { e.stopPropagation(); toggleSelection(f.id, e.shiftKey); }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (viewMode !== "2d") return;
              startFurnitureDrag(f.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
          />
        );
      })}

      {/* Room labels */}
      {rooms.map((r) => (
        <RoomLabel key={r.id} room={r} viewMode={viewMode} />
      ))}

      {/* Dimensions */}
      {viewMode === "2d" && dimensions.map((d) => (
        <DimensionView key={d.id} dim={d} />
      ))}

      {/* Drag handles for selected walls */}
      {viewMode === "2d" &&
        selected.map((id) => {
          const node = nodes[id];
          if (node?.type !== "wall") return null;
          const w = (liveTransforms.get(id)
            ? { ...node, ...liveTransforms.get(id) }
            : node) as WallNode;
          return <DragHandles key={`handles-${id}`} wall={w} viewMode={viewMode} />;
        })}

      {/* Wall-draw tool overlay: ground plane catcher + preview line */}
      {viewMode === "2d" && tool === "wall" && (
        <WallDrawOverlay drawTool={drawTool} />
      )}
    </group>
  );
}

function WallDrawOverlay({ drawTool }: { drawTool: ReturnType<typeof useWallDrawTool> }) {
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    drawTool.onCanvasMove(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    drawTool.onCanvasClick(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        renderOrder={-1}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {drawTool.preview && drawTool.pointerWorld && (
        <Line
          points={[
            [drawTool.preview.x, 0.05, drawTool.preview.z],
            [drawTool.pointerWorld.x, 0.05, drawTool.pointerWorld.z],
          ]}
          color="#B8552E"
          lineWidth={1.5}
          dashed
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
      {drawTool.pointerWorld && (
        <mesh position={[drawTool.pointerWorld.x, 0.06, drawTool.pointerWorld.z]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshBasicMaterial color="#B8552E" />
        </mesh>
      )}
    </>
  );
}

function ModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div
      className="absolute top-4 left-4 z-10 fade-up"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        padding: 3,
        display: "inline-flex",
        gap: 0,
        boxShadow: "0 1px 2px rgba(31,27,22,0.06)",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      <button
        onClick={() => onChange("2d")}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          background: viewMode === "2d" ? "var(--ink)" : "transparent",
          color: viewMode === "2d" ? "var(--bg)" : "var(--muted)",
          border: "none",
          cursor: "pointer",
        }}
      >
        2D
      </button>
      <button
        onClick={() => onChange("3d")}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          background: viewMode === "3d" ? "var(--ink)" : "transparent",
          color: viewMode === "3d" ? "var(--bg)" : "var(--muted)",
          border: "none",
          cursor: "pointer",
        }}
      >
        3D
      </button>
    </div>
  );
}
