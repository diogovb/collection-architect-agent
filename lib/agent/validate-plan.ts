// Server-side helper: run validators on a legacy FloorPlan by migrating to
// the scene graph first.

import type { FloorPlan } from "../types";
import { floorPlanToScene } from "../scene/migrate";
import { runDerivation } from "../scene/derive";
import { validateScene } from "../scene/validators";
import type { DiagnosticIssue } from "../scene/types";

export function validatePlan(plan: FloorPlan): DiagnosticIssue[] {
  const { scene, issues } = floorPlanToScene(plan);
  const derived = runDerivation(scene.nodes, scene.activeLevelId);
  // Migration issues (porta/janela perdida) come FIRST — the agent believes
  // the opening exists, so silently dropping it was the worst failure mode.
  return [...issues, ...validateScene({ nodes: derived.nodes })];
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
      out.push(`- (${i.code})${ref} ${i.message}`);
    }
  }
  return out.join("\n");
}

/** Hash of the diagnostic set so we can detect "no progress" between turns. */
export function diagnosticsHash(issues: DiagnosticIssue[]): string {
  const sorted = issues.slice().sort((a, b) => (a.code + a.nodeIds.join(",")).localeCompare(b.code + b.nodeIds.join(",")));
  return sorted.map((i) => `${i.code}|${i.severity}|${i.nodeIds.join("/")}`).join("||");
}
