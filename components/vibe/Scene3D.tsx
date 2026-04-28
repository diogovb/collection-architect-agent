"use client";

// Scene3D — R3F top-down 3D rendering of a FloorPlan.
//
// The component derives a BuildingModel from the FloorPlan via the bridge, then
// renders walls (with CSG cutouts for openings), floor slabs, and furniture
// boxes. Camera is orthographic, top-down, with pan+zoom (rotation disabled).

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Evaluator } from "three-bvh-csg";

import type { FloorPlan, SelectedElement } from "@/lib/types";
import { floorPlanToBuildingModel } from "@/lib/3d/tool-bridge";
import { applyCSGCutouts } from "@/lib/3d/wall-geometry";
import { createSlabGeometry } from "@/lib/3d/slab-geometry";
import type { FurnitureNode, LevelNode, SlabNode, WallNode } from "@/lib/3d/types";

const WALL_COLOR = "#E6DFD2";
const WALL_EDGE = "#B8AE9C";
const ZONE_FILL = "#F2DDD0";

interface Props {
  plan: FloorPlan;
  selected?: SelectedElement | null;
  onSelect?: (s: SelectedElement | null) => void;
  /** Optional empty-state CTA. */
  onLoadExample?: () => void;
}

export function Scene3D({ plan, selected, onSelect, onLoadExample }: Props) {
  const isEmpty = plan.rooms.length === 0;

  // Compute view bounds for camera framing.
  const bounds = useMemo(() => {
    if (plan.rooms.length === 0) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of plan.rooms) {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x + r.width);
      minZ = Math.min(minZ, r.y);
      maxZ = Math.max(maxZ, r.y + r.height);
    }
    return { minX, maxX, minZ, maxZ };
  }, [plan.rooms]);

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
      <Canvas
        orthographic
        camera={{
          position: [center.x, 50, center.z],
          zoom: 40,
          near: 0.1,
          far: 200,
          up: [0, 0, -1],
        }}
        onPointerMissed={() => onSelect?.(null)}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
      >
        <CameraSync center={center} span={span} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#FFFFFF", "#E6DFD2", 0.6]} />
        <directionalLight position={[10, 20, 10]} intensity={0.9} castShadow={false} />
        <directionalLight position={[-10, 15, -8]} intensity={0.35} />

        <gridHelper
          args={[60, 60, "#D6CCB8", "#ECE4D2"]}
          position={[0, -0.06, 0]}
        />

        <Suspense fallback={null}>
          <ModelView plan={plan} selected={selected ?? null} onSelect={onSelect} />
        </Suspense>

        <OrbitControls
          enableRotate={false}
          enablePan={true}
          enableZoom={true}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          target={[center.x, 0, center.z]}
        />
      </Canvas>

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

// Re-frame camera when plan bounds change significantly.
function CameraSync({ center, span }: { center: { x: number; z: number }; span: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    // Pick a zoom that fits `span` meters into the smaller viewport dimension.
    const minDim = Math.min(size.width, size.height);
    const padding = 1.4;
    const newZoom = (minDim / (span * padding)) || 40;
    camera.zoom = newZoom;
    camera.position.set(center.x, 50, center.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
  }, [camera, center.x, center.z, span, size.width, size.height]);
  return null;
}

function ModelView({
  plan,
  selected,
  onSelect,
}: {
  plan: FloorPlan;
  selected: SelectedElement | null;
  onSelect?: (s: SelectedElement | null) => void;
}) {
  const model = useMemo(() => floorPlanToBuildingModel(plan), [plan]);
  const level: LevelNode = model.levels[0];

  // Shared CSG evaluator (kept stable across renders).
  const evaluator = useMemo(() => {
    const e = new Evaluator();
    e.useGroups = false;
    return e;
  }, []);

  return (
    <group>
      {level.zones.map((zone) => {
        const isSel = selected?.type === "room" && zone.id === `zone-${selected.id}`;
        const roomId = zone.id.replace(/^zone-/, "");
        return (
          <ZoneFill
            key={zone.id}
            zone={zone}
            highlight={isSel}
            onClick={(e) => { e.stopPropagation(); onSelect?.({ type: "room", id: roomId }); }}
          />
        );
      })}
      {level.slabs.map((slab) => (
        <Slab key={slab.id} slab={slab} />
      ))}
      {level.walls.map((wall) => (
        <Wall key={wall.id} wall={wall} evaluator={evaluator} />
      ))}
      {level.furniture.map((f) => {
        const isSel = selected?.type === "furniture" && selected.id === f.id;
        return (
          <FurnitureBox
            key={f.id}
            furniture={f}
            highlight={isSel}
            onClick={(e) => { e.stopPropagation(); onSelect?.({ type: "furniture", id: f.id }); }}
          />
        );
      })}
    </group>
  );
}

function ZoneFill({
  zone,
  highlight,
  onClick,
}: {
  zone: LevelNode["zones"][number];
  highlight: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(zone.polygon[0].x, zone.polygon[0].z);
    for (let i = 1; i < zone.polygon.length; i++) {
      shape.lineTo(zone.polygon[i].x, zone.polygon[i].z);
    }
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [zone.polygon]);

  return (
    <mesh geometry={geom} position={[0, 0.005, 0]} onClick={onClick}>
      <meshBasicMaterial
        color={highlight ? "#F2DDD0" : ZONE_FILL}
        transparent
        opacity={highlight ? 0.55 : 0.0}
      />
    </mesh>
  );
}

function Slab({ slab }: { slab: SlabNode }) {
  const geom = useMemo(() => createSlabGeometry(slab), [slab]);
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color={slab.material} roughness={0.92} metalness={0} />
    </mesh>
  );
}

function Wall({ wall, evaluator }: { wall: WallNode; evaluator: Evaluator }) {
  // Memoize CSG result on wall identity (children + endpoints + thickness).
  const geom = useMemo(() => {
    return applyCSGCutouts(wall, evaluator);
  }, [wall, evaluator]);

  // Top edge highlight via lines.
  return (
    <group>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

function FurnitureBox({
  furniture,
  highlight,
  onClick,
}: {
  furniture: FurnitureNode;
  highlight: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  return (
    <mesh
      ref={ref}
      position={[furniture.position.x, furniture.position.y, furniture.position.z]}
      rotation={[0, furniture.rotation, 0]}
      onClick={onClick}
      castShadow
    >
      <boxGeometry args={[furniture.dimensions.x, furniture.dimensions.y, furniture.dimensions.z]} />
      <meshStandardMaterial
        color={highlight ? "#B8552E" : furniture.color}
        emissive={highlight ? "#B8552E" : "#000000"}
        emissiveIntensity={highlight ? 0.18 : 0}
        roughness={0.7}
        metalness={0}
      />
    </mesh>
  );
}
