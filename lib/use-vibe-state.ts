"use client";

import { useCallback, useState } from "react";
import { applyTool } from "./floor-plan-engine";
import {
  SEED_CAMERAS,
  SEED_CHAT,
  SEED_LIBRARY,
  SEED_REFS,
  SEED_SHOPPING,
  SEED_SLIDES,
  SEED_VERSIONS,
  seedPlan,
  type SeededMessage,
} from "./mock-data";
import type { FloorPlan, Furniture, Room, SelectedElement, ToolName } from "./types";
import type { Lang } from "./i18n";
import type {
  Camera,
  CollectionItem,
  Mode,
  ReferenceImage,
  RightTab,
  ShoppingRow,
  Slide,
  Version,
} from "./vibe-types";

export interface VibeState {
  // Mode + view
  mode: Mode;
  setMode: (m: Mode) => void;
  rightTab: RightTab;
  setRightTab: (t: RightTab) => void;
  lang: Lang;
  setLang: (l: Lang) => void;

  // Plan + selection
  plan: FloorPlan;
  setPlan: (p: FloorPlan) => void;
  applyPlanTool: (name: ToolName, input: unknown) => void;
  updateFurniture: (id: string, patch: Partial<Furniture>) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  selected: SelectedElement | null;
  setSelected: (s: SelectedElement | null) => void;

  // Diff
  showDiff: boolean;
  setShowDiff: (v: boolean) => void;
  diffTargetId: string | null;
  setDiffTargetId: (id: string | null) => void;

  // Cameras
  cameras: Camera[];
  setCameras: (c: Camera[]) => void;
  activeCameraId: string;
  setActiveCameraId: (id: string) => void;
  generateCamera: (id: string) => void;

  // Refs / library / shopping / versions / slides
  refs: ReferenceImage[];
  setRefs: (r: ReferenceImage[]) => void;
  library: CollectionItem[];
  shopping: ShoppingRow[];
  versions: Version[];
  slides: Slide[];
  setSlides: (s: Slide[]) => void;
  activeSlideId: string;
  setActiveSlideId: (id: string) => void;

  // Chat (UI-side seed; live messages handled separately by ChatPanel)
  chatHistory: SeededMessage[];
  setChatHistory: (m: SeededMessage[] | ((prev: SeededMessage[]) => SeededMessage[])) => void;

  // Command palette
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

export function useVibeState(): VibeState {
  const [mode, setMode] = useState<Mode>("plan");
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [lang, setLang] = useState<Lang>("pt");
  const [plan, setPlan] = useState<FloorPlan>(() => seedPlan());
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [diffTargetId, setDiffTargetId] = useState<string | null>("wall-divisor");

  const [cameras, setCameras] = useState<Camera[]>(SEED_CAMERAS);
  const [activeCameraId, setActiveCameraId] = useState<string>(SEED_CAMERAS[0].id);

  const [refs, setRefs] = useState<ReferenceImage[]>(SEED_REFS);
  const [library] = useState<CollectionItem[]>(SEED_LIBRARY);
  const [shopping] = useState<ShoppingRow[]>(SEED_SHOPPING);
  const [versions] = useState<Version[]>(SEED_VERSIONS);
  const [slides, setSlides] = useState<Slide[]>(SEED_SLIDES);
  const [activeSlideId, setActiveSlideId] = useState<string>(SEED_SLIDES[0].id);
  const [chatHistory, setChatHistory] = useState<SeededMessage[]>(SEED_CHAT);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const applyPlanTool = useCallback((name: ToolName, input: unknown) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      applyTool(next, name, input);
      return next;
    });
    // Mark all rendered cameras as outdated
    setCameras((prev) =>
      prev.map((c) => (c.status === "ready" ? { ...c, status: "outdated" } : c))
    );
  }, []);

  const updateFurniture = useCallback((id: string, patch: Partial<Furniture>) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      const f = next.furniture.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
      return next;
    });
  }, []);

  const updateRoom = useCallback((id: string, patch: Partial<Room>) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      const r = next.rooms.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      return next;
    });
  }, []);

  const generateCamera = useCallback((id: string) => {
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, status: "generating" } : c)));
    setTimeout(() => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "ready", lastGeneratedAt: new Date().toISOString() }
            : c
        )
      );
    }, 2400);
  }, []);

  return {
    mode, setMode, rightTab, setRightTab, lang, setLang,
    plan, setPlan, applyPlanTool, updateFurniture, updateRoom,
    selected, setSelected,
    showDiff, setShowDiff, diffTargetId, setDiffTargetId,
    cameras, setCameras, activeCameraId, setActiveCameraId, generateCamera,
    refs, setRefs, library, shopping, versions,
    slides, setSlides, activeSlideId, setActiveSlideId,
    chatHistory, setChatHistory,
    paletteOpen, setPaletteOpen,
  };
}
