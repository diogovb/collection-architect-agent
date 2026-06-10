"use client";

// Canvas wrapper — renders the 2D (native SVG) floor plan plus the floating
// tool toolbar and the validators panel.

import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Toolbar } from "./Toolbar";
import { Floorplan2D } from "./Floorplan2D";

interface Props {
  onLoadExample?: () => void;
}

export function Canvas({ onLoadExample }: Props) {
  return (
    <div className="w-full h-full bg-bg relative">
      <Floorplan2D onLoadExample={onLoadExample} />

      {/* Tool toolbar (Selecionar/Mover/Parede/Cota + atalhos V/M/W/D) */}
      <Toolbar />

      {/* Validators panel (NBR/Neufert) */}
      <DiagnosticsPanel />
    </div>
  );
}
