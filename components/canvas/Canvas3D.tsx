"use client";

// 3D path: R3F + Three.js, CSG-cut walls, multi-material wall finishes,
// SSAO + Outline post-processing. Split out of Canvas.tsx so:
//  1. Canvas.tsx stays a thin router between 2D and 3D.
//  2. The bundle for the SVG-only 2D path doesn't drag along three.js,
//     postprocessing, drei — those are dynamic-imported only when the user
//     toggles into 3D (see Canvas.tsx).

import { Suspense, useEffect, useMemo } from "react";
import { Canvas as R3FCanvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";

import { useSceneStore, effectiveNode } from "@/lib/scene/store";
import { liveRoomPolygon, liveSlabPolygon } from "@/lib/scene/live-derive";
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
} from "@/lib/scene/types";
import { getWallCorners } from "@/lib/scene/wall-corners-cache";

import { WallView } from "./nodes/WallView";
import { SlabView } from "./nodes/SlabView";
import { DoorView } from "./nodes/DoorView";
import { WindowView } from "./nodes/WindowView";
import { FurnitureView } from "./nodes/FurnitureView";
import { RoomLabel } from "./nodes/RoomLabel";
import { DimensionView } from "./nodes/DimensionView";
import { DragHandles } from "./nodes/DragHandles";
import { useFurnitureDrag } from "./hooks/useFurnitureDrag";
import { useOpeningSlide } from "./hooks/useOpeningSlide";
import { useWallDrawTool } from "./hooks/useWallDrawTool";
import { CanvasPostprocessing } from "./postprocessing";

interface Props {
  center: { x: number; z: number };
  span: number;
}

// Feature flag: opt-in WebGPU renderer. Three.js's WebGPU support is still
// experimental — on browsers without WebGPU it falls back to WebGL2, which
// matches our default path anyway. Default OFF in production. To enable,
// set NEXT_PUBLIC_WEBGPU=1 in .env.local and rebuild.
const USE_WEBGPU =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_WEBGPU === "1";

async function makeWebGpuRenderer(canvas: HTMLCanvasElement) {
  // Dynamic import to keep WebGPU bytes out of the bundle when the flag is off.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import("three/webgpu")) as any;
  const renderer = new mod.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  return renderer;
}

export default function Canvas3D({ center, span }: Props) {
  const glProp = USE_WEBGPU
    ? async (canvas: HTMLCanvasElement) => {
        try {
          return await makeWebGpuRenderer(canvas);
        } catch (e) {
          // WebGPU not available — R3F will create a WebGL2 renderer instead.
          console.warn("[canvas] WebGPU unavailable, falling back to WebGL2", e);
          return undefined;
        }
      }
    : { antialias: true, preserveDrawingBuffer: false, alpha: false, premultipliedAlpha: false };

  return (
    <R3FCanvas
      camera={{
        fov: 45,
        position: [center.x + span * 0.6, span * 0.7, center.z + span * 0.6],
        near: 0.1,
        far: 200,
      }}
      style={{ background: "#FAF7F0", display: "block" }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gl={glProp as any}
      dpr={[1, 2]}
      onCreated={(state) => {
        state.gl.setClearColor("#FAF7F0", 1);
        state.gl.clear();
      }}
      onPointerMissed={() => useSceneStore.getState().setSelection([])}
    >
      <color attach="background" args={["#FAF7F0"]} />
      <CameraSync center={center} span={span} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={["#FFFFFF", "#E6DFD2", 0.55]} />
      <directionalLight position={[10, 20, 10]} intensity={0.85} castShadow={false} />
      <gridHelper args={[60, 60, "#D6CCB8", "#ECE4D2"]} position={[center.x, -0.06, center.z]} />

      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>

      <CanvasPostprocessing />

      <OrbitControls
        enableRotate
        enablePan
        enableZoom
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        target={[center.x, 0, center.z]}
      />
    </R3FCanvas>
  );
}

function CameraSync({
  center,
  span,
}: {
  center: { x: number; z: number };
  span: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.position.set(center.x + span * 0.6, span * 0.7, center.z + span * 0.6);
      camera.lookAt(center.x, 0, center.z);
      camera.updateProjectionMatrix();
    }
  }, [camera, center.x, center.z, span]);
  return null;
}

function SceneContents() {
  const viewMode: ViewMode = "3d";
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

  const walls = useMemo(
    () =>
      Object.values(nodes)
        .filter((n): n is WallNode => n.type === "wall")
        .map((w) => effectiveNode<WallNode>({ nodes, liveTransforms }, w.id)!)
        .filter(Boolean),
    [nodes, liveTransforms]
  );

  const corners = useMemo(() => getWallCorners(walls), [walls]);

  const rawSlabs = useMemo(
    () => Object.values(nodes).filter((n): n is SlabNode => n.type === "slab"),
    [nodes]
  );
  const rawRooms = useMemo(
    () => Object.values(nodes).filter((n): n is RoomNode => n.type === "room"),
    [nodes]
  );
  // Mirror Floorplan2D's live derivation pass so slabs / rooms / floor zones
  // follow walls during drag in 3D too (otherwise the wall fills move but the
  // slab below stays at the committed polygon — visible as a sliver of bare
  // ground when the user shrinks a room live).
  const rooms = useMemo(() => {
    if (rawRooms.length === 0) return rawRooms;
    const liveState = { nodes, liveTransforms };
    return rawRooms.map((r) => {
      if (!r.boundaryAnchors) return r;
      const polygon = liveRoomPolygon(r, liveState);
      return { ...r, polygon };
    });
  }, [rawRooms, nodes, liveTransforms]);
  const slabs = useMemo(() => {
    if (rawSlabs.length === 0) return rawSlabs;
    return rawSlabs.map((s) => {
      const room = rooms.find((r) => r.id === s.roomId);
      if (!room || !room.boundaryAnchors) return s;
      return { ...s, polygon: liveSlabPolygon(room.polygon) };
    });
  }, [rawSlabs, rooms]);
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
      {slabs.map((slab) => (
        <SlabView key={slab.id} slab={slab} viewMode={viewMode} />
      ))}

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
              if (tool !== "select" && tool !== "move") return;
              startOpeningSlide(d.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
          />
        );
      })}

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
              if (tool !== "select" && tool !== "move") return;
              startOpeningSlide(w.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
          />
        );
      })}

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
            // Plain click on the mesh selects but does NOT start a drag —
            // we let the event bubble so OrbitControls can grab subsequent
            // pointer moves and rotate the camera. Only the dedicated
            // gizmo above the selected furniture initiates a translate.
            onPointerDown={() => {}}
            onGizmoPointerDown={(cx, cy) => startFurnitureDrag(f.id, cx, cy)}
          />
        );
      })}

      {rooms.map((r) => (
        <RoomLabel key={r.id} room={r} viewMode={viewMode} />
      ))}

      {/* Dimensions are 2D-only on the SVG path, so 3D omits them. */}

      {selected.map((id) => {
        const node = nodes[id];
        if (node?.type !== "wall") return null;
        const w = (liveTransforms.get(id)
          ? { ...node, ...liveTransforms.get(id) }
          : node) as WallNode;
        return <DragHandles key={`handles-${id}`} wall={w} viewMode={viewMode} />;
      })}

      {tool === "wall" && <WallDrawOverlay drawTool={drawTool} />}
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
