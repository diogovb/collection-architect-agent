"use client";

// Pequeno store separado para as camadas SVG geradas pelo hybrid pipeline.
// Foi mantido fora da SceneStore principal porque essa é resetada toda vez
// que a FloorPlan muda (replaceScene), o que apagaria as camadas a cada
// atualização (ex: ao adicionar um móvel manual sobre uma planta hybrid).

import { create } from "zustand";
import type { HybridLayers } from "../types";

interface HybridStore {
  layers: HybridLayers | null;
  setLayers: (l: HybridLayers | null) => void;
}

export const useHybridStore = create<HybridStore>((set) => ({
  layers: null,
  setLayers: (l) => set({ layers: l }),
}));
