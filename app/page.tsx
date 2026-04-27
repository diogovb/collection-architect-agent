"use client";

import { useCallback, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { FloorPlanCanvas } from "@/components/FloorPlanCanvas";
import { applyTool, emptyPlan } from "@/lib/floor-plan-engine";
import type { FloorPlan, ToolName } from "@/lib/types";

export default function Page() {
  const [plan, setPlan] = useState<FloorPlan>(() => emptyPlan());

  const onApplyTool = useCallback((name: ToolName, input: unknown) => {
    setPlan((prev) => {
      // Deep clone so React notices the change.
      const next: FloorPlan = JSON.parse(JSON.stringify(prev));
      applyTool(next, name, input);
      return next;
    });
  }, []);

  return (
    <main className="grid h-screen max-h-screen w-screen grid-cols-1 overflow-hidden lg:grid-cols-[1fr_440px]">
      <section className="relative h-full min-h-0 overflow-hidden border-r border-white/5">
        <FloorPlanCanvas plan={plan} />
      </section>
      <section className="h-full min-h-0 overflow-hidden border-l border-white/5">
        <ChatPanel plan={plan} onApplyTool={onApplyTool} />
      </section>
    </main>
  );
}
