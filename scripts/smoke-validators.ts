// Smoke test ad-hoc dos validadores espaciais (Fase 3).
// Rodar com: npx tsx scripts/smoke-validators.ts

import { applyTool, emptyPlan } from "../lib/floor-plan-engine";
import { validatePlan } from "../lib/agent/validate-plan";
import type { FloorPlan } from "../lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  OK  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function codes(plan: FloorPlan): string[] {
  return validatePlan(plan).map((i) => `${i.severity}:${i.code}`);
}

// ---------- Cenário 1: planta saudável de 2 cômodos ----------
console.log("\n[1] Planta saudável (Sala + Quarto, porta de entrada + porta interna)");
const p1 = emptyPlan();
applyTool(p1, "create_room", { name: "Sala", width: 4, height: 5, x: 0, y: 0 });
applyTool(p1, "create_room", { name: "Quarto", width: 3, height: 4, x: 4, y: 0 });
const entry = applyTool(p1, "add_door", { room_name: "Sala", wall: "west", position: 0.5 });
const inner = applyTool(p1, "add_door", { room_name: "Sala", wall: "east", position: 0.4 });
applyTool(p1, "add_window", { room_name: "Sala", wall: "north", position: 0.5, size: 1.5 });
applyTool(p1, "add_window", { room_name: "Quarto", wall: "north", position: 0.5, size: 1.5 });
check("porta de entrada criada", entry.ok, entry.message);
check("porta interna criada", inner.ok, inner.message);
const c1 = codes(p1);
check("sem ROOM_NO_DOOR", !c1.some((c) => c.includes("ROOM_NO_DOOR")), c1.join(", "));
check("sem NO_ENTRY_DOOR", !c1.some((c) => c.includes("NO_ENTRY_DOOR")), c1.join(", "));
check("sem ROOM_OVERLAP", !c1.some((c) => c.includes("ROOM_OVERLAP")), c1.join(", "));
check("sem OPENING_LOST", !c1.some((c) => c.includes("OPENING_LOST")), c1.join(", "));

// ---------- Cenário 2: quarto sem porta ----------
console.log("\n[2] Quarto sem porta → ROOM_NO_DOOR");
const p2 = emptyPlan();
applyTool(p2, "create_room", { name: "Sala", width: 4, height: 5, x: 0, y: 0 });
applyTool(p2, "create_room", { name: "Quarto", width: 3, height: 4, x: 4, y: 0 });
applyTool(p2, "add_door", { room_name: "Sala", wall: "west", position: 0.5 });
const c2 = codes(p2);
check("ROOM_NO_DOOR para o Quarto", c2.includes("error:ROOM_NO_DOOR"), c2.join(", "));

// ---------- Cenário 3: porta maior que a parede ----------
console.log("\n[3] Porta de 1,2m em parede de 1,0m → rejeição");
const p3 = emptyPlan();
applyTool(p3, "create_room", { name: "Lavabo", width: 1.0, height: 1.8, x: 0, y: 0 });
const bigDoor = applyTool(p3, "add_door", { room_name: "Lavabo", wall: "north", position: 0.5, size: 1.2 });
check("rejeitada", !bigDoor.ok, bigDoor.message);
check("mensagem cita a parede", /não cabe/.test(bigDoor.message), bigDoor.message);

// ---------- Cenário 4: posição clampada ----------
console.log("\n[4] Porta em position 0.98 → clamp com aviso");
const p4 = emptyPlan();
applyTool(p4, "create_room", { name: "Sala", width: 4, height: 5, x: 0, y: 0 });
const edgeDoor = applyTool(p4, "add_door", { room_name: "Sala", wall: "north", position: 0.98, size: 0.9 });
check("aceita com ajuste", edgeDoor.ok && /ajustada/.test(edgeDoor.message), edgeDoor.message);

// ---------- Cenário 5: cômodo sobreposto ----------
console.log("\n[5] create_room em cima de outro → rejeição com sugestão");
const p5 = emptyPlan();
applyTool(p5, "create_room", { name: "Sala", width: 4, height: 5, x: 0, y: 0 });
const overlap = applyTool(p5, "create_room", { name: "Quarto", width: 3, height: 4, x: 2, y: 2 });
check("rejeitado", !overlap.ok, overlap.message);
check("sugere posição livre", /sugerida/.test(overlap.message), overlap.message);
const adjacent = applyTool(p5, "create_room", { name: "Quarto", width: 3, height: 4, x: 4, y: 0 });
check("cômodo adjacente (parede compartilhada) aceito", adjacent.ok, adjacent.message);

// ---------- Cenário 6: fogão no quarto ----------
console.log("\n[6] Fogão no Quarto → FURNITURE_ROOM_MISMATCH");
const p6 = emptyPlan();
applyTool(p6, "create_room", { name: "Quarto Casal", width: 4, height: 4, x: 0, y: 0 });
applyTool(p6, "add_door", { room_name: "Quarto Casal", wall: "west", position: 0.5 });
const stove = applyTool(p6, "add_furniture", { room_name: "Quarto Casal", furniture_type: "stove", relative_x: 0.8, relative_y: 0.0 });
const c6 = codes(p6);
check("fogão adicionado", stove.ok, stove.message);
check("mismatch detectado", c6.includes("warning:FURNITURE_ROOM_MISMATCH"), c6.join(", "));

// ---------- Cenário 7: arco da porta ----------
console.log("\n[7] Móvel dentro do arco da porta → DOOR_SWING_BLOCKED / rejeição");
const p7 = emptyPlan();
applyTool(p7, "create_room", { name: "Sala", width: 5, height: 5, x: 0, y: 0 });
applyTool(p7, "add_door", { room_name: "Sala", wall: "north", position: 0.15, size: 0.9 });
// Tenta colocar uma estante exatamente no arco (canto NW, junto da porta).
const inArc = applyTool(p7, "add_furniture", { room_name: "Sala", furniture_type: "bookshelf", relative_x: 0.0, relative_y: 0.0 });
check("placement no arco rejeitado", !inArc.ok, inArc.message);
check("mensagem cita arco", /arco/.test(inArc.message), inArc.message);
// Sofá longe da porta deve passar.
const farSofa = applyTool(p7, "add_furniture", { room_name: "Sala", furniture_type: "sofa", relative_x: 0.5, relative_y: 1.0 });
check("sofá longe da porta aceito", farSofa.ok, farSofa.message);

// ---------- Cenário 8: rotação 90° no solver ----------
console.log("\n[8] place_furniture_intent com rotation 90 → footprint transposto");
const p8 = emptyPlan();
applyTool(p8, "create_room", { name: "Quarto", width: 3.0, height: 4.0, x: 0, y: 0 });
applyTool(p8, "add_door", { room_name: "Quarto", wall: "south", position: 0.5 });
const bedR = applyTool(p8, "place_furniture_intent", {
  room_name: "Quarto",
  items: [{ type: "bed_double", anchor: "wall:west", position: "mid", rotation: 90 }],
});
check("cama rotacionada posicionada", bedR.ok, bedR.message);
const bed = p8.furniture.find((f) => f.type === "bed_double");
check("rotação persistida", bed?.rotation === 90, JSON.stringify(bed));
if (bed) {
  // bbox armazenado mantém dims do glifo; AABB visual transposto deve tocar a parede oeste.
  const visualX = bed.x + bed.width / 2 - bed.height / 2;
  check("footprint visual encosta na parede oeste", Math.abs(visualX - 0) < 0.06, `visualX=${visualX.toFixed(3)}`);
}

// ---------- Cenário 9: bancada sobre porta ----------
console.log("\n[9] add_millwork_run cobrindo a porta → rejeição");
const p9 = emptyPlan();
applyTool(p9, "create_room", { name: "Cozinha", width: 3.6, height: 3.0, x: 0, y: 0 });
applyTool(p9, "add_door", { room_name: "Cozinha", wall: "north", position: 0.2, size: 0.9 });
const runOverDoor = applyTool(p9, "add_millwork_run", {
  room_name: "Cozinha",
  wall: "north",
  type: "kitchen_counter",
  modules: [
    { kind: "sink_double" },
    { kind: "cooktop_4" },
    { kind: "cabinet_door_double" },
  ],
});
check("run sobre porta rejeitado", !runOverDoor.ok, runOverDoor.message);
const runOk = applyTool(p9, "add_millwork_run", {
  room_name: "Cozinha",
  wall: "south",
  type: "kitchen_counter",
  modules: [
    { kind: "sink_double" },
    { kind: "cooktop_4" },
    { kind: "cabinet_door_double" },
  ],
});
check("run na parede livre aceito", runOk.ok, runOk.message);

// ---------- Cenário 10: janela × porta ----------
console.log("\n[10] Janela sobrepondo porta → rejeição");
const p10 = emptyPlan();
applyTool(p10, "create_room", { name: "Sala", width: 4, height: 5, x: 0, y: 0 });
applyTool(p10, "add_door", { room_name: "Sala", wall: "north", position: 0.5, size: 0.9 });
const winOverDoor = applyTool(p10, "add_window", { room_name: "Sala", wall: "north", position: 0.55, size: 1.5 });
check("janela sobre porta rejeitada", !winOverDoor.ok, winOverDoor.message);

// ---------- Cenário 11: apartamentos em várias metragens (regressão) ----------
// 60/90/110m² geram coordenadas fora da grade de 5cm (derivadas de raiz
// quadrada) — antes do fix de snap, TODAS as portas/janelas dessas plantas
// eram perdidas na migração (OPENING_LOST + ROOM_NO_DOOR em massa).
for (const area of [60, 70, 90, 110]) {
  console.log(`\n[11] create_apartment_layout ${area}m² (regressão sem perda de aberturas)`);
  const p11 = emptyPlan();
  const apt = applyTool(p11, "create_apartment_layout", { total_area: area, num_bedrooms: 2, num_bathrooms: 2 });
  check(`layout ${area}m² gerado`, apt.ok, apt.message);
  const i11 = validatePlan(p11);
  const errors11 = i11.filter((i) => i.severity === "error");
  console.log(`  (diagnósticos: ${i11.length} — errors: ${errors11.map((e) => e.code).join(", ") || "nenhum"})`);
  check(`${area}m²: sem OPENING_LOST`, !i11.some((i) => i.code === "OPENING_LOST"), errors11.map((e) => e.message).join(" | "));
  check(`${area}m²: sem ROOM_NO_DOOR`, !errors11.some((e) => e.code === "ROOM_NO_DOOR"), errors11.map((e) => e.message).join(" | "));
  check(`${area}m²: sem ROOM_OVERLAP`, !errors11.some((e) => e.code === "ROOM_OVERLAP"), errors11.map((e) => e.message).join(" | "));
}

// ---------- Cenário 12: update_door substitui porta estreita ----------
console.log("\n[12] update_door alarga porta estreita (caminho do MIN_DOOR_WIDTH)");
const p12 = emptyPlan();
applyTool(p12, "create_room", { name: "Banheiro", width: 2.0, height: 1.8, x: 0, y: 0 });
applyTool(p12, "add_door", { room_name: "Banheiro", wall: "north", position: 0.5, size: 0.6 });
const upd = applyTool(p12, "update_door", { room_name: "Banheiro", wall: "north", new_size: 0.7 });
check("porta alargada", upd.ok && p12.doors[0]?.size === 0.7, `${upd.message} size=${p12.doors[0]?.size}`);
const redo = applyTool(p12, "add_door", { room_name: "Banheiro", wall: "north", position: 0.5, size: 0.8 });
check("add_door no mesmo lugar substitui (não engole)", redo.ok && p12.doors[0]?.size === 0.8 && p12.doors.length === 1, `${redo.message} size=${p12.doors[0]?.size} n=${p12.doors.length}`);
const rem = applyTool(p12, "remove_door", { room_name: "Banheiro", wall: "north" });
check("remove_door funciona", rem.ok && p12.doors.length === 0, rem.message);

// ---------- Cenário 13: varanda a oeste sem invadir o cômodo ----------
console.log("\n[13] add_balcony west não sobrepõe o cômodo pai");
const p13 = emptyPlan();
applyTool(p13, "create_room", { name: "Sala", width: 5, height: 4, x: 2, y: 0 });
applyTool(p13, "add_door", { room_name: "Sala", wall: "north", position: 0.5 });
const balc = applyTool(p13, "add_balcony", { name: "Varanda", attached_to: "Sala", wall: "west", width: 3, depth: 1.5 });
check("varanda criada", balc.ok, balc.message);
const i13 = validatePlan(p13);
check("sem ROOM_OVERLAP", !i13.some((i) => i.code === "ROOM_OVERLAP"), i13.filter((i) => i.code === "ROOM_OVERLAP").map((i) => i.message).join(" | "));

// ---------- Cenário 14: resize_room não pode invadir vizinho ----------
console.log("\n[14] resize_room rejeitado quando invadiria vizinho");
const p14 = emptyPlan();
applyTool(p14, "create_room", { name: "Sala", width: 4, height: 4, x: 0, y: 0 });
applyTool(p14, "create_room", { name: "Quarto", width: 3, height: 4, x: 4, y: 0 });
const grow = applyTool(p14, "resize_room", { room_name: "Sala", width: 5, height: 4 });
check("resize que invade rejeitado", !grow.ok && /invadiria/.test(grow.message), grow.message);
const growOk = applyTool(p14, "resize_room", { room_name: "Sala", width: 4, height: 5 });
check("resize em direção livre aceito", growOk.ok, growOk.message);

// ---------- Cenário 15: swap rotacionado respeita footprint visual ----------
console.log("\n[15] swap_furniture com rotação 90° usa footprint transposto");
const p15 = emptyPlan();
applyTool(p15, "create_room", { name: "Sala Estreita", width: 1.4, height: 4.0, x: 0, y: 0 });
p15.furniture.push({ id: "f-arm", roomId: p15.rooms[0].id, type: "armchair", label: "Poltrona", x: 0.3, y: 1.5, width: 0.8, height: 0.8, rotation: 90 });
const swapV = applyTool(p15, "swap_furniture", { furniture_id: "f-arm", new_type: "sofa_2seat" });
// sofa_2seat ~1.6×0.9 rotacionado vira 0.9×1.6 → cabe em 1.4m de largura.
check("swap rotacionado aceito (footprint 0.9×1.6 cabe)", swapV.ok, swapV.message);

console.log(`\n${failures === 0 ? "TODOS OS CENÁRIOS PASSARAM" : `${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
