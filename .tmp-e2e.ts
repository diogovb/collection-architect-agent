import { applyTool, emptyPlan } from "./lib/floor-plan-engine";
import { validatePlan } from "./lib/agent/validate-plan";
import { renderPlanPng } from "./lib/canvas/render-png";
import { writeFileSync } from "fs";
import type { ToolName, FloorPlan } from "./lib/types";

const SCENARIOS: Record<string, { name: string; prompt: string; out: string }> = {
  "1": {
    name: "quarto infantil + suite",
    prompt: "cria um quarto infantil de 3,2 por 3 metros com um banheiro suíte ao lado, com porta de entrada, porta para a suíte e janela, e mobilia tudo",
    out: ".tmp-e2e-1.png",
  },
  "2": {
    name: "studio 25m2 integrado",
    prompt: "projeta um studio de 25m² integrado: área de dormir, estar com sofá e TV, cozinha compacta numa parede e banheiro separado. Mobilia tudo com bom gosto",
    out: ".tmp-e2e-2.png",
  },
  "3": {
    name: "sala aconchegante com canto de leitura",
    prompt: "cria uma sala de estar de 4 por 5 metros aconchegante, com um canto de leitura junto à janela, e mobilia",
    out: ".tmp-e2e-3.png",
  },
};

async function main() {
  const sc = SCENARIOS[process.argv[2] ?? "1"];
  console.log(`=== ${sc.name} ===`);
  const res = await fetch("https://epic-pasteur-16134d.vercel.app/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: sc.prompt }],
      plan: { rooms: [], doors: [], windows: [], furniture: [] },
    }),
  });
  if (!res.ok || !res.body) { console.log("HTTP", res.status); process.exit(1); }
  const plan: FloorPlan = emptyPlan();
  const names = new Map<string, ToolName>();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let nTools = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      let ev: any;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === "text_delta") text += ev.text;
      else if (ev.type === "tool_start") names.set(ev.id, ev.name);
      else if (ev.type === "tool_input") {
        const n = names.get(ev.id);
        if (n) { const r = applyTool(plan, n, ev.input); nTools++; console.log(`[${nTools}] ${n} -> ${r.ok ? "ok" : "FAIL"}: ${r.message.split("\n")[0].slice(0, 95)}`); }
      } else if (ev.type === "error") console.log("ERRO SSE:", ev.message);
    }
  }
  console.log(`-- moveis: ${plan.furniture.length}; resposta: ${text.trim().slice(0, 180) || "(vazia)"}`);
  const issues = validatePlan(plan).filter((i) => i.severity !== "info");
  for (const i of issues) console.log(`  ${i.severity}:${i.code} ${i.message.slice(0, 90)}`);
  if (issues.length === 0) console.log("  validadores: limpo");
  writeFileSync(sc.out, await renderPlanPng(plan, 1400, { doorZones: true }));
  console.log(`PNG: ${sc.out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
