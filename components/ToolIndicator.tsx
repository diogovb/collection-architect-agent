"use client";
import type { ToolName } from "@/lib/types";

const LABELS: Record<ToolName, string> = {
  create_room: "Desenhando cômodo",
  remove_room: "Removendo cômodo",
  add_door: "Posicionando porta",
  add_window: "Abrindo janela",
  add_furniture: "Posicionando móvel",
  remove_furniture: "Retirando móvel",
  set_floor_material: "Trocando revestimento",
  move_furniture: "Reposicionando móvel",
  create_apartment_layout: "Gerando planta do apartamento",
  furnish_room: "Mobiliando cômodo",
  clear_all: "Apagando planta",
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
