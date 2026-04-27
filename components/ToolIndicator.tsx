"use client";
import type { ToolName } from "@/lib/types";

const LABELS: Record<ToolName, string> = {
  create_room: "Criando cômodo",
  remove_room: "Removendo cômodo",
  add_door: "Adicionando porta",
  add_window: "Adicionando janela",
  add_furniture: "Adicionando móvel",
  remove_furniture: "Removendo móvel",
  set_floor_material: "Trocando piso",
  move_furniture: "Movendo móvel",
  create_apartment_layout: "Gerando apartamento",
  furnish_room: "Mobiliando cômodo",
  clear_all: "Limpando planta",
};

interface ToolIndicatorProps {
  name: ToolName;
  detail?: string;
  status: "running" | "ok" | "error";
}

export function ToolIndicator({ name, detail, status }: ToolIndicatorProps) {
  const label = LABELS[name] ?? name;

  return (
    <div
      className={`fade-up flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
        status === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-gold/30 bg-gold/5 text-gold-light"
      }`}
    >
      <span className="text-base leading-none">
        {status === "running" ? (
          <span className="tool-pulse">⚙️</span>
        ) : status === "error" ? (
          "✖"
        ) : (
          "✓"
        )}
      </span>
      <span className="font-medium">{label}</span>
      {detail ? <span className="opacity-70">— {detail}</span> : null}
    </div>
  );
}
