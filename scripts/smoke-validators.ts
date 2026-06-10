// Smoke test ad-hoc dos validadores espaciais (Fase 3).
// Rodar com: npx tsx scripts/smoke-validators.ts

import { applyTool, emptyPlan } from "../lib/floor-plan-engine";
import { validatePlan } from "../lib/agent/validate-plan";
import { usableRect, worldAABB, openingInterval, openingsOverlap1D } from "../lib/plan-geometry";
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

console.log(`\n${failures === 0 ? "TODOS OS CENÁRIOS PASSARAM" : `${failures} FALHA(S)`}`);
process.exit(failures === 0 ? 0 : 1);
