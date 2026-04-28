"use client";

// Canvas router — picks between the 2D (native SVG) and 3D (R3F) paths
// based on `viewMode` from the SceneStore. The 3D path is dynamically
// imported so the SVG-only experience doesn't ship three.js + drei +
// postprocessing (a multi-MB chunk) until the user toggles into 3D.

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { useSceneStore } from "@/lib/scene/store";
import type { ViewMode, WallNode } from "@/lib/scene/types";

import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Toolbar } from "./Toolbar";
import { Floorplan2D } from "./Floorplan2D";

// Dynamic import: the 3D path's bundle (R3F + drei + three-bvh-csg + post-
// processing) is only fetched when the user clicks 3D. Falls back to a tiny
// loading card while the chunk arrives.
const Canvas3D = dynamic(() => import("./Canvas3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="card p-4 text-[11px] uppercase tracking-[0.14em] text-muted">
        Carregando vista 3D…
      </div>
    </div>
  ),
});

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

  const center = useMemo(
    () => ({
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    }),
    [bounds]
  );

  const span = useMemo(() => {
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    return Math.max(w, d, 6);
  }, [bounds]);

  return (
    <div className="w-full h-full bg-bg relative">
      {viewMode === "2d" ? (
        <Floorplan2D onLoadExample={onLoadExample} />
      ) : (
        <Canvas3D center={center} span={span} />
      )}

      {/* Scale bar (2D only) — sits on the same vertical row as the
          2D/3D toggle, positioned to its left. Rendered as an HTML
          overlay so it stays a fixed visual size regardless of zoom. */}
      {viewMode === "2d" && <ScaleBarOverlay />}

      {/* 2D ⇄ 3D toggle */}
      <ModeToggle viewMode={viewMode} onChange={setViewMode} />

      {/* Tool toolbar (Selecionar/Mover/Parede/Cota + atalhos V/M/W/D) */}
      <Toolbar />

      {/* Validators panel (NBR/Neufert) */}
      <DiagnosticsPanel />

      {/* Empty-state card (3D only — Floorplan2D shows its own). */}
      {viewMode === "3d" && isEmpty && (
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

function ModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div
      className="absolute top-4 z-10 fade-up"
      style={{
        // Pushed to the right so the ScaleBarOverlay can sit beside it
        // on the same row (left:16). Both share the top-4 baseline.
        left: 110,
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

/** Scale bar HTML overlay — sits on the top-left row, immediately to the
 *  left of the 2D/3D toggle. Drawn in screen pixels (fixed size on screen
 *  regardless of zoom) and labelled "0—1—2 m". The previous SVG version
 *  lived in the bottom-left and shrank/grew with the viewBox; this one
 *  reads at a glance no matter how zoomed out the user is. */
function ScaleBarOverlay() {
  return (
    <div
      className="absolute top-4 z-10 fade-up flex items-center gap-2"
      style={{
        left: 16,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        padding: "5px 12px",
        boxShadow: "0 1px 2px rgba(31,27,22,0.06)",
        fontFamily: "var(--font-jetbrains-mono)",
        fontSize: 10,
        letterSpacing: "0.06em",
        color: "var(--muted)",
        textTransform: "uppercase",
      }}
      title="Escala — barra mede 2 m"
    >
      <svg width={68} height={14} viewBox="0 0 68 14">
        <line x1={2} y1={9} x2={66} y2={9} stroke="var(--ink)" strokeWidth={1} />
        <line x1={2} y1={4} x2={2} y2={12} stroke="var(--ink)" strokeWidth={1} />
        <line x1={34} y1={5} x2={34} y2={11} stroke="var(--ink)" strokeWidth={0.7} />
        <line x1={66} y1={4} x2={66} y2={12} stroke="var(--ink)" strokeWidth={1} />
      </svg>
      <span>2 m</span>
    </div>
  );
}
