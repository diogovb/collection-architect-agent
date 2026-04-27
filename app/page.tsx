"use client";

import { useEffect } from "react";
import { useVibeState } from "@/lib/use-vibe-state";
import { TopBar } from "@/components/vibe/TopBar";
import { LeftNav } from "@/components/vibe/LeftNav";
import { RightPanel } from "@/components/vibe/RightPanel";
import { FloorPlan } from "@/components/vibe/FloorPlan";
import { SelectionToolbar } from "@/components/vibe/SelectionToolbar";
import { RenderMode } from "@/components/vibe/RenderMode";
import { PresentationMode } from "@/components/vibe/PresentationMode";
import { ShoppingMode } from "@/components/vibe/ShoppingMode";
import { CommandPalette } from "@/components/vibe/CommandPalette";

export default function Page() {
  const v = useVibeState();

  // Esc clears selection
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && v.selected) v.setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [v]);

  // Apply diff: nudge "wall-divisor" — for the seed plan, this moves the dining-living boundary 50cm.
  function applyDiff() {
    if (v.diffTargetId === "wall-divisor") {
      // Move dining 50cm down by reducing living height & increasing dining y
      const next = JSON.parse(JSON.stringify(v.plan));
      const living = next.rooms.find((r: { id: string }) => r.id === "room-living");
      const dining = next.rooms.find((r: { id: string }) => r.id === "room-dining");
      if (living && dining) {
        living.height += 0.5;
        dining.y += 0.5;
        dining.height -= 0.5;
      }
      v.setPlan(next);
    }
    v.setShowDiff(false);
    v.setDiffTargetId(null);
  }

  function compareDiff() {
    v.setShowDiff(!v.showDiff);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar
        mode={v.mode}
        setMode={v.setMode}
        lang={v.lang}
        setLang={v.setLang}
        onCommandPalette={() => v.setPaletteOpen(true)}
      />

      <main className="flex-1 min-h-0 flex">
        {v.mode === "plan" && (
          <>
            <LeftNav
              plan={v.plan}
              selected={v.selected}
              onSelect={v.setSelected}
              cameras={v.cameras}
              activeCameraId={v.activeCameraId}
              onSelectCamera={v.setActiveCameraId}
              lang={v.lang}
            />
            <section className="flex-1 min-w-0 relative bg-bg overflow-hidden flex items-center justify-center">
              <SelectionToolbar plan={v.plan} selected={v.selected} />
              <div className="w-full h-full p-6 flex items-center justify-center">
                <FloorPlan
                  plan={v.plan}
                  selected={v.selected}
                  onSelect={v.setSelected}
                  cameras={v.cameras}
                  activeCameraId={v.activeCameraId}
                  onSelectCamera={v.setActiveCameraId}
                  showDiff={v.showDiff}
                  diffTargetId={v.diffTargetId}
                />
              </div>
              {v.showDiff && v.diffTargetId === "wall-divisor" && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 card p-3 px-4 flex items-center gap-3 fade-up shadow-md">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent">PROPOSTA IA</span>
                  <span className="text-[12.5px]">Recuar parede divisória 50 cm</span>
                  <button onClick={compareDiff} className="btn-outline text-[11.5px] py-1 px-2.5">⊕ Comparar</button>
                  <button onClick={applyDiff} className="btn-primary text-[11.5px] py-1 px-2.5">Aplicar +50 cm</button>
                </div>
              )}
            </section>
            <RightPanel
              active={v.rightTab}
              onActive={v.setRightTab}
              plan={v.plan}
              selected={v.selected}
              onClearSelection={() => v.setSelected(null)}
              onApplyTool={v.applyPlanTool}
              history={v.chatHistory}
              setHistory={v.setChatHistory}
              refs={v.refs}
              setRefs={v.setRefs}
              library={v.library}
              versions={v.versions}
              lang={v.lang}
              onApplyDiff={applyDiff}
              onCompareDiff={compareDiff}
            />
          </>
        )}

        {v.mode === "render" && (
          <RenderMode
            cameras={v.cameras}
            setCameras={v.setCameras}
            activeCameraId={v.activeCameraId}
            setActiveCameraId={v.setActiveCameraId}
            generateCamera={v.generateCamera}
            lang={v.lang}
          />
        )}

        {v.mode === "presentation" && (
          <PresentationMode
            slides={v.slides}
            setSlides={v.setSlides}
            activeSlideId={v.activeSlideId}
            setActiveSlideId={v.setActiveSlideId}
            plan={v.plan}
            cameras={v.cameras}
            lang={v.lang}
          />
        )}

        {v.mode === "shopping" && <ShoppingMode shopping={v.shopping} lang={v.lang} />}
      </main>

      <CommandPalette open={v.paletteOpen} setOpen={v.setPaletteOpen} setMode={v.setMode} />
    </div>
  );
}
