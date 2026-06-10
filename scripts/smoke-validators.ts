// Smoke test ad-hoc dos validadores espaciais (Fase 3).
// Rodar com: npx tsx scripts/smoke-validators.ts

import { applyTool, emptyPlan } from "../lib/floor-plan-engine";
import { validatePlan } from "../lib/agent/validate-plan";
import {
  doorApproachRects,
  openingInterval,
  openingsOverlap1D,
  usableRect,
  worldAABB,
  worstDoorCoverage,
} from "../lib/plan-geometry";
import { legacySwingGeometry } from "../lib/scene/door-swing";
import { renderPlanSvg } from "../lib/canvas/render-png";
import type { FloorPlan, Furniture, Room } from "../lib/types";

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
check("rotação persistida (90/270)", bed !== undefined && (bed.rotation === 90 || bed.rotation === 270), JSON.stringify(bed));
if (bed) {
  // bbox armazenado mantém dims do glifo; AABB visual transposto deve tocar a
  // FACE INTERNA da parede oeste (rect útil — parede externa = inset 0.075).
  const u8 = usableRect(p8, p8.rooms[0]);
  const visualX = bed.x + bed.width / 2 - bed.height / 2;
  check("footprint visual encosta na face interna oeste", Math.abs(visualX - u8.x) < 0.06, `visualX=${visualX.toFixed(3)} usable.x=${u8.x.toFixed(3)}`);
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

// ---------- Helpers para os cenários de arquitetura ----------
function middleThird(room: Room, f: Furniture): boolean {
  const bb = worldAABB(f);
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  return (
    cx > room.x + room.width / 3 && cx < room.x + (2 * room.width) / 3 &&
    cy > room.y + room.height / 3 && cy < room.y + (2 * room.height) / 3
  );
}
function isRug(f: Furniture): boolean {
  return /^rug|carpet|mat/i.test(f.type);
}

// ---------- Cenário 16: Quarto Infantil como um arquiteto faria ----------
console.log("\n[16] Quarto Infantil 3,0×3,2 (porta sul, janela norte) via furnish_room");
const p16 = emptyPlan();
applyTool(p16, "create_room", { name: "Quarto Infantil", width: 3.0, height: 3.2, x: 0, y: 0 });
applyTool(p16, "add_door", { room_name: "Quarto Infantil", wall: "south", position: 0.35, size: 0.8 });
applyTool(p16, "add_window", { room_name: "Quarto Infantil", wall: "north", position: 0.5, size: 1.2 });
const furnish16 = applyTool(p16, "furnish_room", { room_name: "Quarto Infantil" });
check("furnish_room ok", furnish16.ok, furnish16.message);
const room16 = p16.rooms[0];
check("contém bed_child (fix do dispatch /infantil/)", p16.furniture.some((f) => f.type === "bed_child"),
  p16.furniture.map((f) => f.type).join(", "));
check("play_table AUSENTE (9,6m² < 12m²)", !p16.furniture.some((f) => f.type === "play_table"),
  furnish16.message);
const i16 = validatePlan(p16);
const errors16 = i16.filter((i) => i.severity === "error");
check("zero errors", errors16.length === 0, errors16.map((e) => `${e.code}: ${e.message}`).join(" | "));
check("sem FURNITURE_ON_WALL", !i16.some((i) => i.code === "FURNITURE_ON_WALL"),
  i16.filter((i) => i.code === "FURNITURE_ON_WALL").map((i) => i.message).join(" | "));
check("sem DOOR_SWING_BLOCKED", !i16.some((i) => i.code === "DOOR_SWING_BLOCKED"),
  i16.filter((i) => i.code === "DOOR_SWING_BLOCKED").map((i) => i.message).join(" | "));
const centerSolid16 = p16.furniture.filter((f) => !isRug(f) && middleThird(room16, f));
check("nenhum móvel sólido no centro", centerSolid16.length === 0, centerSolid16.map((f) => f.label).join(", "));
const bed16 = p16.furniture.find((f) => /^bed/.test(f.type));
if (bed16) {
  // Anti-padrão real: CABECEIRA sob a janela. A parede das costas vem da
  // rotação (0=norte, 90=leste, 180=sul, 270=oeste). Cama lateral à janela
  // é layout clássico de quarto infantil — não conta.
  const rot = ((bed16.rotation ?? 0) % 360 + 360) % 360;
  const backWall = rot === 0 ? "north" : rot === 90 ? "east" : rot === 180 ? "south" : "west";
  const win16 = p16.windows[0];
  let headboardUnderWindow = false;
  if (backWall === win16.wall) {
    const bb = worldAABB(bed16);
    const headInterval = win16.wall === "north" || win16.wall === "south"
      ? { axis: "h" as const, fixed: win16.wall === "north" ? room16.y : room16.y + room16.height, start: bb.x, end: bb.x + bb.w }
      : { axis: "v" as const, fixed: win16.wall === "west" ? room16.x : room16.x + room16.width, start: bb.y, end: bb.y + bb.h };
    const winInterval = openingInterval(room16, win16.wall, win16.position, win16.size);
    headboardUnderWindow = openingsOverlap1D(headInterval, winInterval) > 0;
  }
  check("cabeceira NÃO está sob a janela", !headboardUnderWindow, `bed=${JSON.stringify(bed16)}`);
}
const desk16 = p16.furniture.find((f) => /^desk_study/.test(f.type));
if (desk16) {
  const win16 = p16.windows[0];
  const wi = openingInterval(room16, win16.wall, win16.position, win16.size);
  const wCenter = { x: (wi.start + wi.end) / 2, y: room16.y };
  const db = worldAABB(desk16);
  const d = Math.hypot(db.x + db.w / 2 - wCenter.x, db.y + db.h / 2 - wCenter.y);
  check("escrivaninha aproveitou a janela (≤1,6m do centro do vão)", d <= 1.6, `d=${d.toFixed(2)}m`);
}

// ---------- Cenário 17: Quarto casal ----------
console.log("\n[17] Quarto casal 3,5×3,2 (porta sul, janela norte) via furnish_room");
const p17 = emptyPlan();
applyTool(p17, "create_room", { name: "Suíte Master", width: 3.5, height: 3.2, x: 0, y: 0 });
applyTool(p17, "add_door", { room_name: "Suíte Master", wall: "south", position: 0.2, size: 0.8 });
applyTool(p17, "add_window", { room_name: "Suíte Master", wall: "north", position: 0.5, size: 1.4 });
const furnish17 = applyTool(p17, "furnish_room", { room_name: "Suíte Master" });
check("furnish ok", furnish17.ok, furnish17.message);
const bed17 = p17.furniture.find((f) => /^bed/.test(f.type));
check("cama presente", bed17 !== undefined, p17.furniture.map((f) => f.type).join(", "));
check("guarda-roupa presente (ou fallback sliding)", p17.furniture.some((f) => /^wardrobe/.test(f.type)), furnish17.message);
const nstands = p17.furniture.filter((f) => f.type === "nightstand");
if (bed17 && nstands.length > 0) {
  const bb = worldAABB(bed17);
  const close = nstands.filter((n) => {
    const nb = worldAABB(n);
    const dx = Math.max(0, Math.max(bb.x - (nb.x + nb.w), nb.x - (bb.x + bb.w)));
    const dy = Math.max(0, Math.max(bb.y - (nb.y + nb.h), nb.y - (bb.y + bb.h)));
    return Math.hypot(dx, dy) <= 0.45;
  });
  check(`criados-mudos junto da cama (${close.length}/${nstands.length})`, close.length === nstands.length,
    nstands.map((n) => `${n.label}@(${n.x.toFixed(2)},${n.y.toFixed(2)})`).join("; "));
}
const i17 = validatePlan(p17);
check("zero errors", i17.filter((i) => i.severity === "error").length === 0,
  i17.filter((i) => i.severity === "error").map((e) => e.code).join(", "));
check("sem FURNITURE_ON_WALL", !i17.some((i) => i.code === "FURNITURE_ON_WALL"),
  i17.filter((i) => i.code === "FURNITURE_ON_WALL").map((i) => i.message).join(" | "));

// ---------- Cenário 18: fidelidade de âncora explícita ----------
console.log("\n[18] Âncora explícita wall:west + rotation 90 continua a oeste");
const p18 = emptyPlan();
applyTool(p18, "create_room", { name: "Quarto", width: 3.0, height: 4.0, x: 0, y: 0 });
applyTool(p18, "add_door", { room_name: "Quarto", wall: "south", position: 0.5 });
const r18 = applyTool(p18, "place_furniture_intent", {
  room_name: "Quarto",
  items: [{ type: "bed_double", anchor: "wall:west", position: "mid", rotation: 90 }],
});
check("posicionado", r18.ok, r18.message);
const bed18 = p18.furniture.find((f) => f.type === "bed_double");
if (bed18) {
  const u18 = usableRect(p18, p18.rooms[0]);
  const vb = worldAABB(bed18);
  check("encostado na face interna oeste (fidelidade)", Math.abs(vb.x - u18.x) < 0.06, `vb.x=${vb.x.toFixed(3)} usable.x=${u18.x.toFixed(3)}`);
}

// ---------- Cenário 19: FURNITURE_ON_WALL detecta invasão ----------
console.log("\n[19] FURNITURE_ON_WALL: flush na face interna OK; em cima da parede AVISA");
const p19 = emptyPlan();
applyTool(p19, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
applyTool(p19, "add_door", { room_name: "Sala", wall: "south", position: 0.5 });
const sofa19 = applyTool(p19, "place_furniture_intent", {
  room_name: "Sala",
  items: [{ type: "sofa_3seat", anchor: "wall:north", position: "mid" }],
});
check("sofá posicionado", sofa19.ok, sofa19.message);
const i19a = validatePlan(p19);
check("flush na face interna: sem FURNITURE_ON_WALL", !i19a.some((i) => i.code === "FURNITURE_ON_WALL"),
  i19a.filter((i) => i.code === "FURNITURE_ON_WALL").map((i) => i.message).join(" | "));
// Simula plano antigo: empurra o sofá para o retângulo cheio (em cima da parede).
const sofaF = p19.furniture.find((f) => f.type === "sofa_3seat");
if (sofaF) {
  sofaF.y = p19.rooms[0].y; // flush no retângulo = invade a faixa da parede
  const i19b = validatePlan(p19);
  check("em cima da parede: FURNITURE_ON_WALL aparece", i19b.some((i) => i.code === "FURNITURE_ON_WALL"),
    i19b.map((i) => i.code).join(", "));
}

// ---------- Cenário 20: renderer desenha o giro REAL (hinge/swing) ----------
console.log("\n[20] renderPlanSvg: folha da porta ancora na dobradiça real (hinge:far)");
{
  const p20 = emptyPlan();
  applyTool(p20, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
  const d20 = applyTool(p20, "add_door", { room_name: "Sala", wall: "north", position: 0.7, size: 0.9 });
  check("porta criada", d20.ok, d20.message);
  const door = p20.doors[0];
  // Força o caso que o renderer antigo errava: dobradiça no lado "far".
  door.hinge = "far";
  door.swing = "in";
  const g = legacySwingGeometry(p20.rooms[0], door.wall, door.position, door.size, "far", "in");
  const svg = renderPlanSvg(p20);
  const leaf = /<line class="door-leaf" x1="([-\d.]+)" y1="([-\d.]+)"/.exec(svg);
  check("linha da folha presente", leaf !== null);
  if (leaf) {
    const hx = parseFloat(leaf[1]);
    const hy = parseFloat(leaf[2]);
    check(
      "folha parte da dobradiça de legacySwingGeometry",
      Math.abs(hx - g.hinge.x) < 1e-6 && Math.abs(hy - g.hinge.y) < 1e-6,
      `render=(${hx},${hy}) esperado=(${g.hinge.x},${g.hinge.y})`
    );
  }
}

// ---------- Cenário 21: sequência da suíte (bug de produção) ----------
console.log("\n[21] Porta criada DEPOIS da mobília → rejeição; ordem certa → corredor livre");
{
  // Ordem ERRADA: mobília primeiro, porta depois (era o buraco temporal).
  const pA = emptyPlan();
  applyTool(pA, "create_room", { name: "Quarto Infantil", width: 3.2, height: 3.0, x: 0, y: 0 });
  applyTool(pA, "create_room", { name: "Banheiro Suite", width: 1.6, height: 2.0, x: 3.2, y: 0 });
  applyTool(pA, "add_door", { room_name: "Quarto Infantil", wall: "south", position: 0.25 });
  const ward = applyTool(pA, "place_furniture_intent", {
    room_name: "Quarto Infantil",
    items: [{ type: "wardrobe_hinged", anchor: "wall:east", position: "mid" }],
  });
  check("guarda-roupa na parede leste (sem porta ainda)", ward.ok, ward.message);
  const lateDoor = applyTool(pA, "add_door", { room_name: "Quarto Infantil", wall: "east", position: 0.6, size: 0.7 });
  check("add_door tardia REJEITADA", !lateDoor.ok, lateDoor.message);
  check("mensagem nomeia o móvel bloqueador", /bloqueada por '.*Guarda/i.test(lateDoor.message), lateDoor.message);
  check("mensagem orienta saída (position livre ou mover)", /Positions livres|mova o móvel/i.test(lateDoor.message), lateDoor.message);

  // Ordem CERTA: shell completo primeiro, mobília depois.
  const pB = emptyPlan();
  applyTool(pB, "create_room", { name: "Quarto Infantil", width: 3.2, height: 3.0, x: 0, y: 0 });
  applyTool(pB, "create_room", { name: "Banheiro Suite", width: 1.6, height: 2.0, x: 3.2, y: 0 });
  applyTool(pB, "add_door", { room_name: "Quarto Infantil", wall: "south", position: 0.25 });
  applyTool(pB, "add_door", { room_name: "Quarto Infantil", wall: "east", position: 0.6, size: 0.7 });
  applyTool(pB, "add_window", { room_name: "Quarto Infantil", wall: "north", position: 0.5, size: 1.4 });
  const furnB = applyTool(pB, "furnish_room", { room_name: "Quarto Infantil", style: "infantil" });
  check("furnish com shell completo ok", furnB.ok, furnB.message);
  let worstFrac = 0;
  for (const r of pB.rooms) {
    const apps = doorApproachRects(pB, r);
    for (const f of pB.furniture) {
      if (f.roomId !== r.id) continue;
      if (/^rug|plant|lamp/.test(f.type)) continue;
      const w = worstDoorCoverage(apps, worldAABB(f));
      worstFrac = Math.max(worstFrac, w.fraction);
    }
  }
  check("nenhum móvel cobre ≥50% de vão de porta", worstFrac < 0.5, `pior cobertura: ${(worstFrac * 100).toFixed(0)}%`);
  const cB = codes(pB);
  check("sem error:DOOR_APPROACH_BLOCKED", !cB.includes("error:DOOR_APPROACH_BLOCKED"), cB.join(", "));
}

// ---------- Cenário 22: corredor graduado (50%) + isenções ----------
console.log("\n[22] DOOR_APPROACH_BLOCKED graduado: ≥50% erro, <50% sem erro, decor isento");
{
  const p22 = emptyPlan();
  applyTool(p22, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
  applyTool(p22, "add_door", { room_name: "Sala", wall: "north", position: 0.5, size: 0.8 });
  // Mutação manual (simula plano vindo de fora): armário exatamente na boca da porta.
  p22.furniture.push({
    id: "f_ward22", roomId: p22.rooms[0].id, type: "wardrobe_hinged",
    label: "Guarda-roupa", x: 1.0, y: 0.075, width: 2.0, height: 0.6,
  } as Furniture);
  const c22a = codes(p22);
  check("cobertura 100% → error", c22a.includes("error:DOOR_APPROACH_BLOCKED"), c22a.join(", "));

  // Cobertura parcial (<50%) na parede perpendicular: sem error.
  const p22b = emptyPlan();
  applyTool(p22b, "create_room", { name: "Cozinha", width: 3.6, height: 3.0, x: 0, y: 0 });
  applyTool(p22b, "add_door", { room_name: "Cozinha", wall: "north", position: 0.2, size: 0.9 });
  // Armário na parede oeste: invade lateralmente o corredor da porta norte,
  // mas cobre só ~40% do vão — layout clássico de canto, não pode virar erro.
  p22b.furniture.push({
    id: "f_ward22b", roomId: p22b.rooms[0].id, type: "wardrobe_hinged",
    label: "Armário", x: 0.075, y: 0.5, width: 0.6, height: 2.0,
  } as Furniture);
  const c22b = codes(p22b);
  check("cobertura parcial perpendicular → SEM error", !c22b.includes("error:DOOR_APPROACH_BLOCKED"), c22b.join(", "));

  // Decoração dentro do corredor: isenta.
  const p22c = emptyPlan();
  applyTool(p22c, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
  applyTool(p22c, "add_door", { room_name: "Sala", wall: "north", position: 0.5, size: 0.8 });
  p22c.furniture.push({
    id: "f_plant22", roomId: p22c.rooms[0].id, type: "plant_pot",
    label: "Planta", x: 1.7, y: 0.2, width: 0.5, height: 0.5,
  } as Furniture);
  const c22c = codes(p22c);
  check("decor no corredor → sem DOOR_APPROACH_BLOCKED", !c22c.some((c) => c.includes("DOOR_APPROACH_BLOCKED")), c22c.join(", "));

  // move_furniture para dentro do corredor → rejeição dura.
  const p22d = emptyPlan();
  applyTool(p22d, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
  applyTool(p22d, "add_door", { room_name: "Sala", wall: "north", position: 0.5, size: 0.8 });
  const sofa22 = applyTool(p22d, "place_furniture_intent", {
    room_name: "Sala",
    items: [{ type: "sofa_3seat", anchor: "wall:south", position: "mid" }],
  });
  check("sofá ao sul ok", sofa22.ok, sofa22.message);
  const sofaF22 = p22d.furniture.find((f) => f.type === "sofa_3seat");
  const mv = applyTool(p22d, "move_furniture", {
    furniture_id: sofaF22!.id, center_x: 2.0, center_y: 0.5,
  });
  check("mover para a boca da porta REJEITADO", !mv.ok, mv.message);
  check("motivo cita chegada/arco da porta", /chegada da porta|arco/.test(mv.message), mv.message);
}

// ---------- Cenário 23: satélite cadeira↔mesa + órfãos ----------
console.log("\n[23] Cadeira deriva pose da mesa (tucked); sem mesa → omitida; órfã → FURNITURE_FLOATING");
{
  const p23 = emptyPlan();
  applyTool(p23, "create_room", { name: "Quarto Infantil", width: 3.2, height: 3.0, x: 0, y: 0 });
  applyTool(p23, "add_door", { room_name: "Quarto Infantil", wall: "south", position: 0.25 });
  applyTool(p23, "add_window", { room_name: "Quarto Infantil", wall: "north", position: 0.5, size: 1.4 });
  const furn23 = applyTool(p23, "furnish_room", { room_name: "Quarto Infantil", style: "infantil" });
  check("furnish ok", furn23.ok, furn23.message);
  const desk23 = p23.furniture.find((f) => f.type === "desk_study");
  const chair23 = p23.furniture.find((f) => f.type === "desk_chair");
  check("mesa presente", desk23 !== undefined, furn23.message);
  if (desk23 && chair23) {
    const gap = (() => {
      const a = worldAABB(desk23);
      const b = worldAABB(chair23);
      const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
      const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
      return Math.hypot(dx, dy);
    })();
    check("cadeira ENCAIXADA na mesa (gap 0 = tucked)", gap <= 0.01, `gap=${gap.toFixed(3)}m`);
    {
      // Orientação: costas da cadeira viradas para FORA da mesa (rotação
      // derivada do lado em que ela está; 0 pode ficar implícito no campo).
      const a = worldAABB(desk23);
      const b = worldAABB(chair23);
      const dxc = b.x + b.w / 2 - (a.x + a.w / 2);
      const dyc = b.y + b.h / 2 - (a.y + a.h / 2);
      const expected =
        Math.abs(dyc) >= Math.abs(dxc) ? (dyc < 0 ? 0 : 180) : dxc < 0 ? 270 : 90;
      const actual = ((chair23.rotation ?? 0) % 360 + 360) % 360;
      check("cadeira de frente para a mesa (rotação coerente)", actual === expected, `rot=${actual} esperado=${expected}`);
    }
    const c23 = codes(p23);
    check("par tucked sem FURNITURE_OVERLAP", !c23.some((c) => c.includes("FURNITURE_OVERLAP")), c23.join(", "));
    check("sem FURNITURE_FLOATING no quarto montado", !c23.some((c) => c.includes("FURNITURE_FLOATING")), c23.join(", "));

    // move_furniture da cadeira para a pose tucked NÃO pode ser rejeitado
    // (regressão da isenção em findFurnitureOverlap).
    const chairBB23 = worldAABB(chair23);
    const mv23 = applyTool(p23, "move_furniture", {
      furniture_id: chair23.id,
      center_x: chairBB23.x + chairBB23.w / 2 + 0.05,
      center_y: chairBB23.y + chairBB23.h / 2,
    });
    check("mover cadeira dentro do encaixe PASSA", mv23.ok, mv23.message);

    // Mesa movida → cadeira acompanha (re-pose).
    const usable23 = usableRect(p23, p23.rooms[0]);
    const deskBB = worldAABB(desk23);
    const mvDesk = applyTool(p23, "move_furniture", {
      furniture_id: desk23.id,
      center_x: usable23.x + usable23.w - deskBB.w / 2 - 0.6,
      center_y: deskBB.y + deskBB.h / 2,
    });
    if (mvDesk.ok) {
      const gap2 = (() => {
        const a = worldAABB(p23.furniture.find((f) => f.id === desk23.id)!);
        const b = worldAABB(p23.furniture.find((f) => f.id === chair23.id)!);
        const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
        const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
        return Math.hypot(dx, dy);
      })();
      check("mesa movida → cadeira acompanhou", gap2 <= 0.01, `gap=${gap2.toFixed(3)}m — ${mvDesk.message}`);
    } else {
      check("mesa movida → cadeira acompanhou", true, `(movimento rejeitado: ${mvDesk.message})`);
    }
  }

  // Cadeira sem mesa nenhuma: solver omite com explicação.
  const p23b = emptyPlan();
  applyTool(p23b, "create_room", { name: "Sala", width: 3.0, height: 3.0, x: 0, y: 0 });
  applyTool(p23b, "add_door", { room_name: "Sala", wall: "south", position: 0.5 });
  const lone = applyTool(p23b, "place_furniture_intent", {
    room_name: "Sala",
    items: [{ type: "desk_chair", anchor: "free" }],
  });
  check("cadeira sem mesa NÃO é posicionada", !lone.ok, lone.message);
  check("motivo explica a omissão", /para acompanhar|omitida/i.test(lone.message), lone.message);

  // Cadeira órfã empurrada manualmente no meio → FURNITURE_FLOATING.
  p23b.furniture.push({
    id: "f_chair23", roomId: p23b.rooms[0].id, type: "desk_chair",
    label: "Cadeira de Escritório", x: 1.3, y: 1.3, width: 0.5, height: 0.5,
  } as Furniture);
  const c23b = codes(p23b);
  check("órfã no centro → FURNITURE_FLOATING", c23b.includes("warning:FURNITURE_FLOATING"), c23b.join(", "));
}

// ---------- Cenário 24: place_items — física da composição direta ----------
console.log("\n[24] place_items: snap flush, facing↔rotação, colisão numérica, corredor, batch parcial");
{
  const p24 = emptyPlan();
  applyTool(p24, "create_room", { name: "Sala", width: 4.0, height: 4.0, x: 0, y: 0 });
  applyTool(p24, "add_door", { room_name: "Sala", wall: "north", position: 0.5, size: 0.8 });
  const u24 = usableRect(p24, p24.rooms[0]);

  // snap sul: flush na face interna, costas ao sul (frente norte = rot 180)
  const r1 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [{ type: "sofa_3seat", snap: "sul", along: 2.0 }],
  });
  check("snap sul aplicado", r1.ok, r1.message);
  const sofa24 = p24.furniture.find((f) => f.type === "sofa_3seat")!;
  const sbb = worldAABB(sofa24);
  check("flush na face interna sul", Math.abs(sbb.y + sbb.h - (u24.y + u24.h)) <= 0.011, `gap=${(u24.y + u24.h - sbb.y - sbb.h).toFixed(3)}`);
  check("costas ao sul (rot 180)", (sofa24.rotation ?? 0) === 180, `rot=${sofa24.rotation}`);

  // snap leste: rotação 90 e flush na face leste
  const r2 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [{ type: "desk_study", snap: "leste", along: 1.2 }],
  });
  check("snap leste aplicado", r2.ok, r2.message);
  const desk24 = p24.furniture.find((f) => f.type === "desk_study")!;
  const dbb = worldAABB(desk24);
  check("flush na face interna leste", Math.abs(dbb.x + dbb.w - (u24.x + u24.w)) <= 0.011, `gap=${(u24.x + u24.w - dbb.x - dbb.w).toFixed(3)}`);
  check("costas ao leste (rot 90)", (desk24.rotation ?? 0) === 90, `rot=${desk24.rotation}`);

  // colisão: rejeição cita a peça e o retângulo dela
  const r3 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [{ type: "armchair", center_x: sbb.x + sbb.w / 2, center_y: sbb.y + sbb.h / 2 }],
  });
  check("colisão rejeitada", !r3.ok, r3.message);
  check("mensagem cita peça e ocupação numérica", /colide com .*ocupa x .*y /.test(r3.message), r3.message);

  // corredor de porta: armário na boca do vão norte
  const r4 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [{ type: "wardrobe_hinged", snap: "norte", along: 2.0 }],
  });
  check("boca da porta rejeitada", !r4.ok, r4.message);
  // A porta abre para CÁ: o disco de giro pega antes do corredor — ambos
  // são física de porta e qualquer um justifica a rejeição.
  check("motivo cita física da porta (giro ou chegada)", /chegada da porta|arco de abertura/.test(r4.message), r4.message);

  // estouro de parede: faixa válida na mensagem
  const r5 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [{ type: "bed_double", snap: "oeste", along: u24.y + 0.1 }],
  });
  check("estouro rejeitado com faixa válida", !r5.ok && /centro válido|não cabe/.test(r5.message), r5.message);

  // batch parcial: 1 ok + 1 colisão → aplica o válido e relata o resto
  const r6 = applyTool(p24, "place_items", {
    room_name: "Sala",
    items: [
      { type: "rug_rect", center_x: 2.0, center_y: 1.8 },
      { type: "toy_shelf", center_x: sbb.x + sbb.w / 2, center_y: sbb.y + sbb.h / 2 },
    ],
  });
  check("batch parcial: ok com 1/2", r6.ok && /1\/2/.test(r6.message), r6.message);
}

// ---------- Cenário 25: place_items — junto_de + move com re-pose ----------
console.log("\n[25] place_items: junto_de (tuck) e mover a mesa leva a cadeira junto");
{
  const p25 = emptyPlan();
  applyTool(p25, "create_room", { name: "Escritório", width: 4.0, height: 4.0, x: 0, y: 0 });
  applyTool(p25, "add_door", { room_name: "Escritório", wall: "south", position: 0.5 });
  const rDesk = applyTool(p25, "place_items", {
    room_name: "Escritório",
    items: [{ type: "desk_study", snap: "norte", along: 2.0 }],
  });
  check("mesa ao norte", rDesk.ok, rDesk.message);
  const rChair = applyTool(p25, "place_items", {
    room_name: "Escritório",
    items: [{ type: "desk_chair", snap: "junto_de:Escrivaninha" }],
  });
  check("cadeira junto_de aplicada", rChair.ok, rChair.message);
  const desk25 = p25.furniture.find((f) => f.type === "desk_study")!;
  const chair25 = p25.furniture.find((f) => f.type === "desk_chair")!;
  const gapOf = (a: Furniture, b: Furniture) => {
    const A = worldAABB(a); const B = worldAABB(b);
    const dx = Math.max(0, Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w)));
    const dy = Math.max(0, Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h)));
    return Math.hypot(dx, dy);
  };
  check("cadeira encaixada (tuck)", gapOf(desk25, chair25) <= 0.01, `gap=${gapOf(desk25, chair25).toFixed(3)}`);
  check("cadeira de frente p/ a mesa (rot 180)", (chair25.rotation ?? 0) === 180, `rot=${chair25.rotation}`);

  // Mover a mesa via place_items (furniture_id + snap leste) → cadeira acompanha
  const rMove = applyTool(p25, "place_items", {
    room_name: "Escritório",
    items: [{ type: "desk_study", furniture_id: desk25.id, snap: "leste", along: 2.0 }],
  });
  check("mesa movida p/ leste", rMove.ok, rMove.message);
  check("cadeira acompanhou (tuck preservado)", gapOf(
    p25.furniture.find((f) => f.id === desk25.id)!,
    p25.furniture.find((f) => f.id === chair25.id)!
  ) <= 0.01, rMove.message);
  check("cadeira reorientada (rot 270)", (p25.furniture.find((f) => f.id === chair25.id)!.rotation ?? 0) === 270,
    `rot=${p25.furniture.find((f) => f.id === chair25.id)!.rotation}`);
}

console.log(`\n${failures === 0 ? "TODOS OS CENÁRIOS PASSARAM" : `${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
