"use client";

// Floating context menu — appears next to the currently-selected canvas
// element (wall / door / window / furniture / room / slab / dimension) and
// offers per-type actions. Mirrors the modal in the user's design reference
// ("Parede divisória — L 2,20 m · h 2,80 m · Drywall 9 cm" with action
// chips). One unified component for both 2D SVG and 3D R3F paths.
//
// Positioning: caller supplies an SVGElement (or null) representing the hit
// element; we read its on-screen bounding box and place the menu ~16 px to
// the right (or left if it overflows the viewport). Recomputed on every
// render so panning the canvas keeps the menu glued.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSceneStore } from "@/lib/scene/store";
import type {
  AnyNode,
  DoorNode,
  FurnitureNode,
  RoomNode,
  SlabNode,
  WallNode,
  WindowNode,
  DimensionNode,
} from "@/lib/scene/types";
import { runDerivation } from "@/lib/scene/derive";
import { applyAutoDimensions } from "@/lib/scene/auto-dimensions";
import {
  logEditOpening,
  logEditWall,
  logMaterial,
  logRemove,
  logRename,
  logRotate,
} from "@/lib/scene/user-action-log";

interface ContextMenuProps {
  /** When provided, this element is used as the anchor for positioning.
   *  If null, the menu hides. */
  anchorEl: SVGGraphicsElement | HTMLElement | null;
  /** ID of the selected node — used to look up the node in the store. */
  selectedId: string | null;
  /** Callback to close the menu (e.g., user pressed × or ESC). */
  onClose: () => void;
  /** Optional: send a free-text instruction to the chat agent with the
   *  currently selected element pre-attached as context. */
  onSendToAgent?: (prompt: string) => void;
}

interface MenuAction {
  label: string;
  /** Run synchronously; the caller should also `onClose()` after. */
  run: () => void;
  /** Mark danger to render with accent colour. */
  danger?: boolean;
}

interface MenuConfig {
  kindLabel: string;
  description: string;
  actions: MenuAction[];
}

export function ContextMenu({
  anchorEl,
  selectedId,
  onClose,
  onSendToAgent,
}: ContextMenuProps) {
  const nodes = useSceneStore((s) => s.nodes);
  const node = selectedId ? nodes[selectedId] : undefined;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [promptInput, setPromptInput] = useState("");

  // Position the menu next to the anchor element. Re-run when the anchor
  // moves (re-render) or the menu's own size changes.
  useLayoutEffect(() => {
    if (!anchorEl || !menuRef.current) {
      setPos(null);
      return;
    }
    const a = anchorEl.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const margin = 12;
    let left = a.right + margin;
    if (left + m.width > window.innerWidth - margin) {
      left = a.left - m.width - margin;
    }
    if (left < margin) left = margin;
    let top = a.top;
    if (top + m.height > window.innerHeight - margin) {
      top = window.innerHeight - m.height - margin;
    }
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [anchorEl, selectedId, node]);

  // Close on ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!node || !anchorEl) return null;

  const config = buildMenuFor(node);
  if (!config) return null;

  const handleSend = () => {
    if (!promptInput.trim() || !onSendToAgent) return;
    onSendToAgent(promptInput.trim());
    setPromptInput("");
    onClose();
  };

  // The portal lets the menu escape any clipping ancestors (e.g., the
  // SVG card with overflow:hidden) and align to viewport coordinates.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: 50,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "0 12px 32px rgba(31,27,22,0.18), 0 1px 0 var(--line) inset",
        padding: 14,
        minWidth: 280,
        maxWidth: 360,
        opacity: pos ? 1 : 0,
        transition: "opacity 80ms ease-out",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--accent)",
              marginBottom: 2,
            }}
          >
            {config.kindLabel}
          </div>
          <div
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--ink)",
              lineHeight: 1.2,
              marginBottom: 4,
            }}
          >
            {nodeDisplayName(node)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              fontFamily: "var(--font-jetbrains-mono)",
              letterSpacing: "0.04em",
            }}
          >
            {config.description}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            color: "var(--muted)",
            fontSize: 16,
            lineHeight: 1,
            padding: "0 4px",
            cursor: "pointer",
            background: "transparent",
            border: "none",
          }}
          title="Fechar (Esc)"
          aria-label="Fechar"
        >
          ×
        </button>
      </div>

      <div
        style={{
          height: 1,
          background: "var(--line)",
          margin: "12px 0 12px",
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {config.actions.map((a, i) => (
          <button
            key={i}
            onClick={() => {
              a.run();
              onClose();
            }}
            className="chip"
            style={{
              fontSize: 11,
              padding: "5px 10px",
              border: a.danger ? "1px solid color-mix(in oklch, var(--accent), transparent 60%)" : undefined,
              color: a.danger ? "var(--accent)" : undefined,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Optional agent input — present when a chat dispatcher is wired. */}
      {onSendToAgent && (
        <>
          <div
            style={{
              height: 1,
              background: "var(--line)",
              margin: "12px 0 10px",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "var(--bg)",
              border: "1px solid var(--line)",
            }}
          >
            <span style={{ color: "var(--accent)", fontSize: 12 }}>↗</span>
            <input
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="ex: mover 2m, abrir vão 2,40m..."
              style={{
                flex: 1,
                fontSize: 11,
                fontFamily: "var(--font-jetbrains-mono)",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--ink)",
              }}
            />
            <span style={{ color: "var(--muted)", fontSize: 9 }}>↵</span>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

// ---- Per-type configuration ------------------------------------------------

function buildMenuFor(node: AnyNode): MenuConfig | null {
  switch (node.type) {
    case "wall":
      return wallMenu(node as WallNode);
    case "door":
      return doorMenu(node as DoorNode);
    case "window":
      return windowMenu(node as WindowNode);
    case "furniture":
      return furnitureMenu(node as FurnitureNode);
    case "room":
      return roomMenu(node as RoomNode);
    case "slab":
      return slabMenu(node as SlabNode);
    case "dimension":
      return dimensionMenu(node as DimensionNode);
    default:
      return null;
  }
}

function nodeDisplayName(node: AnyNode): string {
  if ("name" in node && node.name) return String(node.name);
  if ("label" in node && (node as { label?: string }).label)
    return String((node as { label: string }).label);
  switch (node.type) {
    case "wall": return "Parede";
    case "door": return "Porta";
    case "window": return "Janela";
    case "furniture": return "Móvel";
    case "room": return "Ambiente";
    case "slab": return "Piso";
    case "dimension": return "Cota";
    default: return "Elemento";
  }
}

function fmtMeter(m: number): string {
  return `${m.toFixed(2).replace(".", ",")} m`;
}

function wallMenu(w: WallNode): MenuConfig {
  const length = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
  const thicknessCm = Math.round(w.thickness * 100);
  const heightStr = fmtMeter(w.height);
  const description = `L ${fmtMeter(length)} · h ${heightStr} · espessura ${thicknessCm} cm`;
  return {
    kindLabel: "Parede",
    description,
    actions: [
      {
        label: "Espessar",
        run: () => {
          const next = Math.min(0.20, w.thickness + 0.04);
          useSceneStore.getState().updateNode<WallNode>(w.id, { thickness: next });
          rederive();
          logEditWall(`espessura ${thicknessCm} cm → ${Math.round(next * 100)} cm`);
        },
      },
      {
        label: "Afinar",
        run: () => {
          const next = Math.max(0.04, w.thickness - 0.04);
          useSceneStore.getState().updateNode<WallNode>(w.id, { thickness: next });
          rederive();
          logEditWall(`espessura ${thicknessCm} cm → ${Math.round(next * 100)} cm`);
        },
      },
      {
        label: "Abrir vão",
        run: () => {
          openVoidOnWall(w);
          logEditWall("abriu vão (porta padrão 80 cm)");
        },
      },
      {
        label: "Demolir",
        danger: true,
        run: () => {
          useSceneStore.getState().removeNode(w.id);
          rederive();
          logRemove("parede");
        },
      },
    ],
  };
}

function doorMenu(d: DoorNode): MenuConfig {
  return {
    kindLabel: "Porta",
    description: `${fmtMeter(d.width)} × h ${fmtMeter(d.height)} · ${d.swingDirection === "in" ? "abre p/ dentro" : "abre p/ fora"}`,
    actions: [
      {
        label: "Inverter lado",
        run: () => {
          useSceneStore
            .getState()
            .updateNode<DoorNode>(d.id, {
              hingeSide: d.hingeSide === "start" ? "end" : "start",
            });
          logEditOpening("porta", "inverteu lado da dobradiça");
        },
      },
      {
        label: "Inverter giro",
        run: () => {
          useSceneStore
            .getState()
            .updateNode<DoorNode>(d.id, {
              swingDirection: d.swingDirection === "in" ? "out" : "in",
            });
          logEditOpening("porta", `agora abre p/ ${d.swingDirection === "in" ? "fora" : "dentro"}`);
        },
      },
      {
        label: "+ 10 cm largura",
        run: () => {
          const next = Math.min(2, d.width + 0.1);
          useSceneStore.getState().updateNode<DoorNode>(d.id, { width: next });
          logEditOpening("porta", `largura ${fmtMeter(d.width)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "− 10 cm largura",
        run: () => {
          const next = Math.max(0.6, d.width - 0.1);
          useSceneStore.getState().updateNode<DoorNode>(d.id, { width: next });
          logEditOpening("porta", `largura ${fmtMeter(d.width)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "Remover",
        danger: true,
        run: () => {
          useSceneStore.getState().removeNode(d.id);
          logRemove("porta");
        },
      },
    ],
  };
}

function windowMenu(w: WindowNode): MenuConfig {
  return {
    kindLabel: "Janela",
    description: `${fmtMeter(w.width)} × h ${fmtMeter(w.height)} · peitoril ${fmtMeter(w.sillHeight)}`,
    actions: [
      {
        label: "+ 20 cm largura",
        run: () => {
          const next = Math.min(4, w.width + 0.2);
          useSceneStore.getState().updateNode<WindowNode>(w.id, { width: next });
          logEditOpening("janela", `largura ${fmtMeter(w.width)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "− 20 cm largura",
        run: () => {
          const next = Math.max(0.4, w.width - 0.2);
          useSceneStore.getState().updateNode<WindowNode>(w.id, { width: next });
          logEditOpening("janela", `largura ${fmtMeter(w.width)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "+ 10 cm altura",
        run: () => {
          const next = Math.min(2.4, w.height + 0.1);
          useSceneStore.getState().updateNode<WindowNode>(w.id, { height: next });
          logEditOpening("janela", `altura ${fmtMeter(w.height)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "− 10 cm altura",
        run: () => {
          const next = Math.max(0.4, w.height - 0.1);
          useSceneStore.getState().updateNode<WindowNode>(w.id, { height: next });
          logEditOpening("janela", `altura ${fmtMeter(w.height)} → ${fmtMeter(next)}`);
        },
      },
      {
        label: "Remover",
        danger: true,
        run: () => {
          useSceneStore.getState().removeNode(w.id);
          logRemove("janela");
        },
      },
    ],
  };
}

function furnitureMenu(f: FurnitureNode): MenuConfig {
  const label = f.label || f.catalogId;
  return {
    kindLabel: "Móvel",
    description: `${fmtMeter(f.dimensions.x)} × ${fmtMeter(f.dimensions.z)} · ${f.catalogId}`,
    actions: [
      {
        label: "Girar 90° (R)",
        run: () => {
          const r = (f.rotation || 0) + Math.PI / 2;
          useSceneStore.getState().updateNode<FurnitureNode>(f.id, { rotation: r });
          logRotate(label);
        },
      },
      {
        label: "Espelhar",
        run: () => {
          const r = -(f.rotation || 0);
          useSceneStore.getState().updateNode<FurnitureNode>(f.id, { rotation: r });
          logRotate(`${label} (espelhado)`);
        },
      },
      {
        label: "Remover",
        danger: true,
        run: () => {
          useSceneStore.getState().removeNode(f.id);
          logRemove(label);
        },
      },
    ],
  };
}

function roomMenu(r: RoomNode): MenuConfig {
  return {
    kindLabel: "Ambiente",
    description: `${(r.area ?? 0).toFixed(2).replace(".", ",")} m²`,
    actions: [
      {
        label: "Renomear",
        run: () => {
          const name = window.prompt("Novo nome do ambiente:", r.name) ?? r.name;
          if (name && name !== r.name) {
            useSceneStore.getState().updateNode<RoomNode>(r.id, { name });
            logRename(r.name, name);
          }
        },
      },
      {
        label: "Mobiliar",
        run: () => {
          // Hand off to the agent via a synthetic prompt — the wiring is on
          // the page-level provider that owns the chat. Falls through if the
          // host didn't supply onSendToAgent.
          window.dispatchEvent(
            new CustomEvent("ca:agent-prompt", {
              detail: `Mobiliar ${r.name}`,
            })
          );
        },
      },
    ],
  };
}

function slabMenu(s: SlabNode): MenuConfig {
  const label = "piso";
  return {
    kindLabel: "Piso",
    description: `${s.material ?? "—"} · ${s.thickness ? fmtMeter(s.thickness) : ""}`,
    actions: [
      {
        label: "Madeira",
        run: () => {
          useSceneStore.getState().updateNode<SlabNode>(s.id, { material: "madeira" });
          logMaterial(label, "madeira");
        },
      },
      {
        label: "Porcelanato",
        run: () => {
          useSceneStore.getState().updateNode<SlabNode>(s.id, { material: "porcelanato" });
          logMaterial(label, "porcelanato");
        },
      },
      {
        label: "Carpete",
        run: () => {
          useSceneStore.getState().updateNode<SlabNode>(s.id, { material: "carpete" });
          logMaterial(label, "carpete");
        },
      },
      {
        label: "Pedra",
        run: () => {
          useSceneStore.getState().updateNode<SlabNode>(s.id, { material: "pedra" });
          logMaterial(label, "pedra");
        },
      },
    ],
  };
}

function dimensionMenu(d: DimensionNode): MenuConfig {
  const length = Math.hypot(d.end.x - d.start.x, d.end.z - d.start.z);
  return {
    kindLabel: "Cota",
    description: `${fmtMeter(length)} · offset ${(d.offset * 100).toFixed(0)} cm · ${
      d.scope === "manual" ? "manual" : "auto"
    }`,
    actions: [
      {
        label: "Aproximar",
        run: () =>
          useSceneStore
            .getState()
            .updateNode<DimensionNode>(d.id, {
              offset: Math.max(0.2, d.offset - 0.2),
            }),
      },
      {
        label: "Afastar",
        run: () =>
          useSceneStore
            .getState()
            .updateNode<DimensionNode>(d.id, {
              offset: d.offset + 0.2,
            }),
      },
      {
        label: "Remover",
        danger: true,
        run: () => {
          useSceneStore.getState().removeNode(d.id);
          logRemove("cota");
        },
      },
    ],
  };
}

// ---- Helpers ---------------------------------------------------------------

/** Run the derivation pipeline + auto-dimensions after a structural mutation
 *  (changing a wall, removing a wall). Keeps slabs/rooms/cotas consistent. */
function rederive() {
  const store = useSceneStore.getState();
  const out = runDerivation(store.nodes, store.activeLevelId);
  const walls = Object.values(out.nodes).filter((n) => n.type === "wall") as WallNode[];
  const withDims = applyAutoDimensions(out.nodes, walls);
  useSceneStore.setState({ nodes: withDims });
}

let _doorSeq = 0;
function newDoorId(): string {
  _doorSeq += 1;
  return `door:user-${Date.now().toString(36)}-${_doorSeq}`;
}

/** Open a void in the wall at the centre, with default 80 cm width. The new
 *  door is then auto-selected so the user can fine-tune from the menu. */
function openVoidOnWall(w: WallNode) {
  const len = Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
  const width = Math.min(0.8, Math.max(0.6, len / 3));
  const id = newDoorId();
  const door = {
    id,
    type: "door" as const,
    parentId: w.parentId,
    wallId: w.id,
    offset: len / 2,
    width,
    height: 2.10,
    hingeSide: "start" as const,
    swingDirection: "in" as const,
  };
  useSceneStore
    .getState()
    .addNode(door as unknown as Parameters<ReturnType<typeof useSceneStore.getState>["addNode"]>[0]);
  useSceneStore.getState().setSelection([id]);
}
