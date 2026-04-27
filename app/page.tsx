"use client";

import { useCallback, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { FloorPlanCanvas } from "@/components/FloorPlanCanvas";
import { applyTool, emptyPlan } from "@/lib/floor-plan-engine";
import type {
  FloorPlan,
  Furniture,
  Room,
  SelectedElement,
  ToolName,
} from "@/lib/types";

export default function Page() {
  const [plan, setPlan] = useState<FloorPlan>(() => emptyPlan());
  const [selected, setSelected] = useState<SelectedElement | null>(null);

  const onApplyTool = useCallback((name: ToolName, input: unknown) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      applyTool(next, name, input);
      return next;
    });
  }, []);

  const onUpdateFurniture = useCallback(
    (id: string, patch: Partial<Furniture>) => {
      setPlan((prev) => {
        const next: FloorPlan = JSON.parse(JSON.stringify(prev));
        const f = next.furniture.find((x) => x.id === id);
        if (f) Object.assign(f, patch);
        return next;
      });
    },
    []
  );

  const onUpdateRoom = useCallback((id: string, patch: Partial<Room>) => {
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      const r = next.rooms.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      return next;
    });
  }, []);

  const onDeleteSelected = useCallback(() => {
    if (!selected) return;
    setPlan((prev) => {
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      if (selected.type === "furniture") {
        next.furniture = next.furniture.filter((f) => f.id !== selected.id);
      } else if (selected.type === "room") {
        next.rooms = next.rooms.filter((r) => r.id !== selected.id);
        next.doors = next.doors.filter((d) => d.roomId !== selected.id);
        next.windows = next.windows.filter((w) => w.roomId !== selected.id);
        next.furniture = next.furniture.filter((f) => f.roomId !== selected.id);
      } else if (selected.type === "door") {
        next.doors = next.doors.filter((d) => d.id !== selected.id);
      } else if (selected.type === "window") {
        next.windows = next.windows.filter((w) => w.id !== selected.id);
      }
      return next;
    });
    setSelected(null);
  }, [selected]);

  const onClearSelection = useCallback(() => setSelected(null), []);

  return (
    <main className="grid h-screen max-h-screen w-screen grid-cols-1 overflow-hidden lg:grid-cols-[1fr_440px]">
      <section className="relative h-full min-h-0 overflow-hidden border-r border-white/5">
        <FloorPlanCanvas
          plan={plan}
          selected={selected}
          onSelect={setSelected}
          onUpdateFurniture={onUpdateFurniture}
          onUpdateRoom={onUpdateRoom}
          onDeleteSelected={onDeleteSelected}
          onClearSelection={onClearSelection}
        />
      </section>
      <section className="h-full min-h-0 overflow-hidden border-l border-white/5">
        <ChatPanel
          plan={plan}
          selected={selected}
          onApplyTool={onApplyTool}
          onClearSelection={onClearSelection}
        />
      </section>
    </main>
  );
}
