"use client";

import { useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useVibeState } from "@/lib/use-vibe-state";
import { TopBar } from "@/components/vibe/TopBar";
import { LeftNav } from "@/components/vibe/LeftNav";
import { RightPanel } from "@/components/vibe/RightPanel";
import { SelectionToolbar } from "@/components/vibe/SelectionToolbar";

const Scene3D = dynamic(
  () => import("@/components/vibe/Scene3D").then((m) => m.Scene3D),
  { ssr: false, loading: () => <div className="w-full h-full bg-bg" /> }
);
import { RenderMode } from "@/components/vibe/RenderMode";
import { PresentationMode } from "@/components/vibe/PresentationMode";
import { ShoppingMode } from "@/components/vibe/ShoppingMode";
import { CommandPalette } from "@/components/vibe/CommandPalette";
import type { Furniture, Room } from "@/lib/types";

const NUDGE_M = 0.1; // arrow-key nudge step

export default function Page() {
  const v = useVibeState();
  const { selected, setSelected, plan, setPlan, mode } = v;

  // ---- Selection mutations ----
  const removeSelected = useCallback(() => {
    if (!selected) return;
    if (selected.type === "furniture") {
      v.applyPlanTool("remove_furniture", { furniture_id: selected.id });
      setSelected(null);
    } else if (selected.type === "door") {
      const next = JSON.parse(JSON.stringify(plan));
      next.doors = next.doors.filter((d: { id: string }) => d.id !== selected.id);
      setPlan(next);
      setSelected(null);
    } else if (selected.type === "window") {
      const next = JSON.parse(JSON.stringify(plan));
      next.windows = next.windows.filter((w: { id: string }) => w.id !== selected.id);
      setPlan(next);
      setSelected(null);
    } else if (selected.type === "room") {
      const r = plan.rooms.find((rr) => rr.id === selected.id);
      if (r) {
        v.applyPlanTool("remove_room", { room_name: r.name });
        setSelected(null);
      }
    }
    // walls cannot be deleted directly — would need a separate tool.
  }, [selected, plan, setPlan, setSelected, v]);

  const rotateSelected = useCallback(() => {
    if (!selected || selected.type !== "furniture") return;
    const f = plan.furniture.find((x) => x.id === selected.id);
    if (!f) return;
    const next = ((f.rotation ?? 0) + 90) % 360;
    v.updateFurniture(f.id, { rotation: next });
  }, [selected, plan, v]);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (!selected) return;
    if (selected.type === "furniture") {
      const f = plan.furniture.find((x) => x.id === selected.id);
      if (!f) return;
      v.updateFurniture(f.id, {
        x: Math.round((f.x + dx) * 10) / 10,
        y: Math.round((f.y + dy) * 10) / 10,
      });
    } else if (selected.type === "room") {
      const r = plan.rooms.find((x) => x.id === selected.id);
      if (!r) return;
      v.updateRoom(r.id, {
        x: Math.round((r.x + dx) * 10) / 10,
        y: Math.round((r.y + dy) * 10) / 10,
      });
    }
  }, [selected, plan, v]);

  // ---- Keyboard shortcuts (active in plan mode only) ----
  useEffect(() => {
    if (mode !== "plan") return;
    function isTyping(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function handler(e: KeyboardEvent) {
      if (isTyping()) return;
      if (e.key === "Escape") {
        if (selected) { setSelected(null); e.preventDefault(); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) { removeSelected(); e.preventDefault(); }
      } else if (e.key === "r" || e.key === "R") {
        if (selected?.type === "furniture") { rotateSelected(); e.preventDefault(); }
      } else if (e.key === "ArrowLeft") {
        if (selected) { nudgeSelected(-NUDGE_M, 0); e.preventDefault(); }
      } else if (e.key === "ArrowRight") {
        if (selected) { nudgeSelected(NUDGE_M, 0); e.preventDefault(); }
      } else if (e.key === "ArrowUp") {
        if (selected) { nudgeSelected(0, -NUDGE_M); e.preventDefault(); }
      } else if (e.key === "ArrowDown") {
        if (selected) { nudgeSelected(0, NUDGE_M); e.preventDefault(); }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, selected, setSelected, removeSelected, rotateSelected, nudgeSelected]);

  // Apply diff: nudge "wall-divisor" — for the seed plan, this moves the dining-living boundary 50cm.
  function applyDiff() {
    if (v.diffTargetId === "wall-divisor") {
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

  // Wrap update helpers with the right signatures.
  const updateFurniture = useCallback((id: string, patch: Partial<Furniture>) => {
    v.updateFurniture(id, patch);
  }, [v]);
  const updateRoom = useCallback((id: string, patch: Partial<Room>) => {
    v.updateRoom(id, patch);
  }, [v]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar
        mode={v.mode}
        setMode={v.setMode}
        lang={v.lang}
        setLang={v.setLang}
        onCommandPalette={() => v.setPaletteOpen(true)}
        plan={v.plan}
        versionLabel={v.versions.find((vv) => vv.current)?.label.split(" — ")[0]}
      />

      <main className="flex-1 min-h-0 min-w-0 flex">
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
            <section className="flex-1 min-w-0 min-h-0 relative bg-bg overflow-hidden flex items-center justify-center">
              <SelectionToolbar plan={v.plan} selected={v.selected} />
              <div className="w-full h-full min-h-0 min-w-0">
                <Scene3D
                  plan={v.plan}
                  selected={v.selected}
                  onSelect={v.setSelected}
                  onLoadExample={v.loadExample}
                />
              </div>
              {v.showDiff && v.diffTargetId === "wall-divisor" && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 card p-3 px-4 flex items-center gap-3 fade-up shadow-md z-10">
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
