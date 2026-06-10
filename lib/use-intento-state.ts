"use client";

import { useCallback, useState } from "react";
import { applyTool, emptyPlan } from "./floor-plan-engine";
import {
  INITIAL_VERSIONS,
  SEED_CHAT,
  SEED_LIBRARY,
  SEED_REFS,
  SEED_SHOPPING,
  SEED_SLIDES,
  SEED_VERSIONS,
  WELCOME_CHAT,
  seedPlan,
  type SeededMessage,
} from "./mock-data";
import type { FloorPlan, Furniture, Room, SelectedElement, ToolName } from "./types";
import type { Lang } from "./i18n";
import type {
  CollectionItem,
  Mode,
  ReferenceImage,
  RightTab,
  ShoppingRow,
  Slide,
  Version,
} from "./intento-types";

export interface IntentoState {
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

  // Demo helper — load the canned seed project.
  loadExample: () => void;
}

export function useIntentoState(): IntentoState {
  const [mode, setMode] = useState<Mode>("plan");
  const [rightTab, setRightTab] = useState<RightTab>("chat");
  const [lang, setLang] = useState<Lang>("pt");
  const [plan, setPlan] = useState<FloorPlan>(() => emptyPlan());
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffTargetId, setDiffTargetId] = useState<string | null>(null);

  const [refs, setRefs] = useState<ReferenceImage[]>([]);
  const [library, setLibrary] = useState<CollectionItem[]>(SEED_LIBRARY);
  const [shopping, setShopping] = useState<ShoppingRow[]>([]);
  const [versions, setVersions] = useState<Version[]>(INITIAL_VERSIONS);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<SeededMessage[]>(WELCOME_CHAT);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const applyPlanTool = useCallback((name: ToolName, input: unknown) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      applyTool(next, name, input);
      return next;
    });
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

  const loadExample = useCallback(() => {
    setPlan(seedPlan());
    setRefs(SEED_REFS);
    setLibrary(SEED_LIBRARY);
    setShopping(SEED_SHOPPING);
    setVersions(SEED_VERSIONS);
    setSlides(SEED_SLIDES);
    setActiveSlideId(SEED_SLIDES[0]?.id ?? "");
    setChatHistory(SEED_CHAT);
    setShowDiff(true);
    setDiffTargetId("wall-divisor");
  }, []);

  return {
    mode, setMode, rightTab, setRightTab, lang, setLang,
    plan, setPlan, applyPlanTool, updateFurniture, updateRoom,
    selected, setSelected,
    showDiff, setShowDiff, diffTargetId, setDiffTargetId,
    refs, setRefs, library, shopping, versions,
    slides, setSlides, activeSlideId, setActiveSlideId,
    chatHistory, setChatHistory,
    paletteOpen, setPaletteOpen,
    loadExample,
  };
}
