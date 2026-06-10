// Server-side helper: run validators on a legacy FloorPlan by migrating to
// the scene graph first.

import type { FloorPlan } from "../types";
import { floorPlanToScene } from "../scene/migrate";
import { runDerivation } from "../scene/derive";
import { validateScene } from "../scene/validators";
import type { DiagnosticIssue } from "../scene/types";
import {
  doorApproachRects,
  doorCoverageFraction,
  wallSideLabel,
  worldAABB,
} from "../plan-geometry";
import { getPlacement } from "../furniture-placement";

export function validatePlan(plan: FloorPlan): DiagnosticIssue[] {
  const { scene, issues } = floorPlanToScene(plan);
  const derived = runDerivation(scene.nodes, scene.activeLevelId);
  // Migration issues (porta/janela perdida) come FIRST — the agent believes
  // the opening exists, so silently dropping it was the worst failure mode.
  return [
    ...issues,
    ...validateScene({ nodes: derived.nodes }),
    ...validateDoorApproaches(plan),
  ];
}

/** Corredor de aproximação de porta (regra GRADUADA). O quarto-de-disco já
 *  é validado na cena (DOOR_SWING_BLOCKED); aqui cobrimos o lado de CHEGADA
 *  do vão nos dois cômodos: móvel cobrindo ≥50% da largura do vão dentro do
 *  corredor = porta inutilizada (error); intrusão lateral menor = warning.
 *  Tapetes, decoração e dispositivos pontuais são isentos. */
export function validateDoorApproaches(plan: FloorPlan): DiagnosticIssue[] {
  const out: DiagnosticIssue[] = [];
  for (const room of plan.rooms ?? []) {
    const approaches = doorApproachRects(plan, room);
    if (approaches.length === 0) continue;
    for (const f of plan.furniture ?? []) {
      if (f.roomId !== room.id) continue;
      const p = getPlacement(f.type);
      if (p.category === "rug" || p.category === "decor") continue;
      if (/light|outlet|switch/.test(f.type)) continue;
      const bb = worldAABB(f);
      for (const a of approaches) {
        const frac = doorCoverageFraction(bb, a);
        if (frac < 0.15) continue;
        const door = plan.doors.find((d) => d.id === a.doorId);
        const pct = Math.round(frac * 100);
        out.push({
          code: "DOOR_APPROACH_BLOCKED",
          severity: frac >= 0.5 ? "error" : "warning",
          message:
            frac >= 0.5
              ? `'${f.label}' bloqueia a chegada da porta na parede ${wallSideLabel(a.side)} de '${room.name}' (cobre ${pct}% do vão). A porta fica inutilizável — mova o móvel para outra parede ou reposicione a porta.`
              : `'${f.label}' invade o corredor de chegada da porta na parede ${wallSideLabel(a.side)} de '${room.name}' (${pct}% do vão). Funciona, mas apertado — considere afastar.`,
          nodeIds: [
            `furniture:${f.id}`,
            ...(door ? [`door:${door.id}`] : []),
          ],
          reference: "NBR 9050",
        });
      }
    }
  }
  return out;
}

export function formatIssuesForAgent(issues: DiagnosticIssue[]): string {
  if (issues.length === 0) return "Nenhum aviso técnico. Planta dentro das normas verificadas.";
  const grouped: Record<string, DiagnosticIssue[]> = {};
  for (const i of issues) {
    grouped[i.severity] = grouped[i.severity] ?? [];
    grouped[i.severity].push(i);
  }
  const order = ["error", "warning", "info"] as const;
  const out: string[] = [];
  for (const sev of order) {
    const list = grouped[sev];
    if (!list || list.length === 0) continue;
    out.push(`## ${sev.toUpperCase()} (${list.length})`);
    for (const i of list) {
      const ref = i.reference ? ` [${i.reference}]` : "";
      // Ids dos nós da cena viram ids legados utilizáveis nas tools
      // (furniture:furn_x → furniture_id=furn_x) — sem eles o agente não
      // tinha como parametrizar move_furniture/swap_furniture.
      const legacyIds = i.nodeIds
        .filter((id) => id.startsWith("furniture:"))
        .map((id) => id.slice("furniture:".length));
      const idTag = legacyIds.length > 0 ? ` [furniture_id: ${legacyIds.join(", ")}]` : "";
      out.push(`- (${i.code})${ref} ${i.message}${idTag}`);
    }
  }
  return out.join("\n");
}

/** Hash of the diagnostic set so we can detect "no progress" between turns. */
export function diagnosticsHash(issues: DiagnosticIssue[]): string {
  const sorted = issues.slice().sort((a, b) => (a.code + a.nodeIds.join(",")).localeCompare(b.code + b.nodeIds.join(",")));
  return sorted.map((i) => `${i.code}|${i.severity}|${i.nodeIds.join("/")}`).join("||");
}
