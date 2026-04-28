"use client";

// Floating measurement chip (Fase R).
//
// Sits next to the cursor while the user is drawing or editing a wall.
// Shows the live length in metres. Pressing TAB (or clicking the chip)
// flips it into an `<input>` so the architect can type the exact value;
// Enter commits via `onCommit(meters)`, ESC cancels back to display mode.
// The owner (`Floorplan2D`) handles positioning and decides what to do
// with the committed value (extend the wall to that length, replace the
// preview end-point, etc.).

import { useEffect, useState } from "react";

interface Props {
  /** Screen-space position to anchor the chip (top-left corner). */
  screen: { x: number; y: number };
  /** Live length in metres of the segment being drawn / edited. */
  meters: number;
  /** Called with a number > 0 when the user confirms a typed value. */
  onCommit?: (meters: number) => void;
  /** Optional cancel handler — fired when the input is dismissed. */
  onCancel?: () => void;
  /** When true, hide the chip entirely. */
  hidden?: boolean;
}

export function MeasurementChip({ screen, meters, onCommit, onCancel, hidden }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(meters.toFixed(2).replace(".", ","));

  // Keep the displayed value in sync with the live length while NOT editing.
  useEffect(() => {
    if (!editing) setValue(meters.toFixed(2).replace(".", ","));
  }, [meters, editing]);

  // TAB anywhere flips the chip into edit mode. Only relevant when the
  // chip is mounted (i.e. the user is actively drawing/editing).
  useEffect(() => {
    if (!onCommit || hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !editing) {
        // Don't hijack TAB when focus is in another input.
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        e.preventDefault();
        setValue(meters.toFixed(2).replace(".", ","));
        setEditing(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, meters, onCommit, hidden]);

  if (hidden) return null;

  const commit = () => {
    const m = parseFloat(value.replace(",", "."));
    if (!Number.isNaN(m) && m > 0 && onCommit) onCommit(m);
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
    setValue(meters.toFixed(2).replace(".", ","));
    onCancel?.();
  };

  return (
    <div
      className="absolute pointer-events-auto z-30 select-none"
      style={{ left: screen.x + 6, top: screen.y - 22 }}
    >
      {editing ? (
        <div className="flex items-center gap-1 rounded-md bg-paper border border-accent shadow-md px-1.5 py-1">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-12 bg-transparent text-[12px] font-mono text-accent text-right outline-none"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          />
          <span className="font-mono text-[10px] text-muted">m</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue(meters.toFixed(2).replace(".", ","));
            setEditing(true);
          }}
          className="flex items-center gap-1 rounded-md bg-paper border border-line hover:border-accent shadow-sm px-1.5 py-0.5 transition-colors"
        >
          <span
            className="font-mono text-[12px] text-accent tracking-tight"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {meters.toFixed(2).replace(".", ",")}
          </span>
          <span className="font-mono text-[10px] text-muted">m</span>
          <span className="font-mono text-[8.5px] text-muted ml-0.5 opacity-60">⇥</span>
        </button>
      )}
    </div>
  );
}
