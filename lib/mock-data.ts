import type {
  Camera,
  CollectionItem,
  ReferenceImage,
  ShoppingRow,
  Slide,
  Version,
} from "./intento-types";
import type { FloorPlan, ToolName } from "./types";

/** Inline status for a tool call (or grouped run of identical tool calls)
 *  inside a chat message. When the agent fires the same tool multiple times
 *  in a row we group them under one entry: `count` shows the total and
 *  `status` is the aggregate (running while any is pending, error if any
 *  failed, done when all succeeded). `id` is the first call's id (kept for
 *  backwards-compat with seeded messages); the streaming code keeps the
 *  internal map of per-id statuses to compute the aggregate. */
export interface ToolCallStatus {
  id: string;
  name: ToolName;
  status: "running" | "done" | "error";
  /** Number of merged invocations of this same tool. Default 1 = single. */
  count?: number;
}

/* -------------------- Seed floor plan --------------------
 * A loft with: foyer, living room, dining, kitchen with island,
 * lavabo, master bedroom, master bath, office.
 * Coordinates in meters.
 */
export function seedPlan(): FloorPlan {
  return {
    rooms: [
      { id: "room-foyer", name: "Foyer", x: 0, y: 0, width: 2.4, height: 2.6, floor: "porcelanato" },
      { id: "room-living", name: "Sala de Estar", x: 2.4, y: 0, width: 6.4, height: 5.0, floor: "madeira" },
      { id: "room-dining", name: "Sala de Jantar", x: 2.4, y: 5.0, width: 4.0, height: 3.4, floor: "madeira" },
      { id: "room-kitchen", name: "Cozinha", x: 6.4, y: 5.0, width: 4.4, height: 3.4, floor: "porcelanato" },
      { id: "room-lavabo", name: "Lavabo", x: 0, y: 2.6, width: 2.4, height: 2.0, floor: "ceramica" },
      { id: "room-bedroom", name: "Suíte", x: 0, y: 4.6, width: 4.6, height: 3.8, floor: "madeira" },
      { id: "room-bath", name: "Banheiro", x: 4.6, y: 4.6, width: 2.4, height: 2.0, floor: "ceramica" },
      { id: "room-office", name: "Escritório", x: 8.8, y: 0, width: 2.6, height: 5.0, floor: "madeira" },
    ],
    doors: [
      { id: "door-1", roomId: "room-foyer", wall: "south", position: 0.5, size: 0.9 },
      { id: "door-2", roomId: "room-living", wall: "west", position: 0.3, size: 1.0 },
      { id: "door-3", roomId: "room-bedroom", wall: "north", position: 0.7, size: 0.9 },
      { id: "door-4", roomId: "room-bath", wall: "north", position: 0.5, size: 0.8 },
      { id: "door-5", roomId: "room-lavabo", wall: "north", position: 0.5, size: 0.8 },
      { id: "door-6", roomId: "room-office", wall: "west", position: 0.5, size: 0.9 },
    ],
    windows: [
      { id: "win-1", roomId: "room-living", wall: "north", position: 0.5, size: 3.0 },
      { id: "win-2", roomId: "room-kitchen", wall: "south", position: 0.5, size: 2.0 },
      { id: "win-3", roomId: "room-bedroom", wall: "south", position: 0.5, size: 2.4 },
      { id: "win-4", roomId: "room-office", wall: "east", position: 0.5, size: 1.6 },
    ],
    furniture: [
      // Living
      { id: "fur-sofa", roomId: "room-living", type: "sofa", label: "Sofá modular", x: 3.4, y: 1.6, width: 3.2, height: 1.0 },
      { id: "fur-tv", roomId: "room-living", type: "tv", label: "Credenza TV", x: 3.4, y: 4.4, width: 3.0, height: 0.45 },
      { id: "fur-rug", roomId: "room-living", type: "table", label: "Mesa de centro", x: 4.4, y: 3.0, width: 1.2, height: 0.6 },
      // Dining
      { id: "fur-dining", roomId: "room-dining", type: "table", label: "Mesa de jantar 8 lugares", x: 3.2, y: 5.7, width: 2.4, height: 1.0 },
      // Kitchen
      { id: "fur-island", roomId: "room-kitchen", type: "island", label: "Ilha", x: 7.4, y: 6.1, width: 2.4, height: 0.9 },
      { id: "fur-counter", roomId: "room-kitchen", type: "counter", label: "Bancada em L", x: 6.6, y: 5.2, width: 4.0, height: 0.6 },
      { id: "fur-stove", roomId: "room-kitchen", type: "stove", label: "Cooktop", x: 8.0, y: 5.3, width: 0.8, height: 0.5 },
      // Bedroom
      { id: "fur-bed", roomId: "room-bedroom", type: "bed", label: "Cama queen", x: 1.6, y: 5.4, width: 1.6, height: 2.0 },
      { id: "fur-wardrobe", roomId: "room-bedroom", type: "wardrobe", label: "Closet", x: 0.2, y: 4.8, width: 1.2, height: 0.6 },
      // Office
      { id: "fur-desk", roomId: "room-office", type: "desk", label: "Mesa escritório", x: 9.0, y: 1.0, width: 2.0, height: 0.8 },
      // Bath / Lavabo
      { id: "fur-toilet", roomId: "room-lavabo", type: "toilet", label: "Vaso", x: 1.6, y: 3.6, width: 0.45, height: 0.65 },
      { id: "fur-sink", roomId: "room-lavabo", type: "sink", label: "Cuba", x: 0.3, y: 3.6, width: 0.6, height: 0.4 },
      { id: "fur-shower", roomId: "room-bath", type: "shower", label: "Box ducha", x: 6.2, y: 4.8, width: 0.8, height: 0.8 },
    ],
  };
}

/* -------------------- Cameras -------------------- */
export const SEED_CAMERAS: Camera[] = [
  {
    id: "cam-1",
    name: "Estar — vista do entrada",
    x: 2.8, y: 0.6, angle: 75, fov: 60, range: 4.5,
    status: "ready",
    renderUrl: null,
    lastGeneratedAt: "2026-04-26T14:20:00Z",
    atmosphere: { lightHour: 16, warmth: 65, materialIntensity: 55 },
  },
  {
    id: "cam-2",
    name: "Cozinha — ilha frontal",
    x: 8.6, y: 7.6, angle: -90, fov: 65, range: 4.0,
    status: "outdated",
    renderUrl: null,
    lastGeneratedAt: "2026-04-22T10:00:00Z",
    atmosphere: { lightHour: 11, warmth: 50, materialIntensity: 70 },
  },
  {
    id: "cam-3",
    name: "Suíte — cabeceira",
    x: 4.0, y: 8.0, angle: -90, fov: 55, range: 3.8,
    status: "empty",
    atmosphere: { lightHour: 19, warmth: 75, materialIntensity: 50 },
  },
  {
    id: "cam-4",
    name: "Escritório — bancada",
    x: 11.0, y: 0.6, angle: 180, fov: 55, range: 3.5,
    status: "empty",
    atmosphere: { lightHour: 14, warmth: 45, materialIntensity: 60 },
  },
];

/* -------------------- References -------------------- */
export const SEED_REFS: ReferenceImage[] = [
  { id: "ref-1", label: "Sala terracota Studio Mk", thumb: "linear-gradient(135deg,#B8552E,#E8B895)", influence: 75 },
  { id: "ref-2", label: "Cozinha pedra natural", thumb: "linear-gradient(160deg,#5C5448,#A89C84)", influence: 50 },
  { id: "ref-3", label: "Iluminação tarde", thumb: "linear-gradient(180deg,#E8C794,#B8804E)", influence: 90 },
];

/* -------------------- Collection Library -------------------- */
export const SEED_LIBRARY: CollectionItem[] = [
  { id: "lib-sofa-aria", name: "Sofá Aria 320", designer: "Studio MK", brand: "Collection", category: "sofa", swatch: "#D9CFB8", price: 28400, inProject: true },
  { id: "lib-poltrona-ova", name: "Poltrona Ovo", designer: "Lina Bo", brand: "Collection", category: "armchair", swatch: "#A8967A", price: 9800 },
  { id: "lib-mesa-jantar", name: "Mesa Jantar Carvalho", designer: "Atelier 12", brand: "Collection", category: "dining", swatch: "#A8967A", price: 18600, inProject: true },
  { id: "lib-luminaria-arco", name: "Luminária Arco", designer: "Castiglioni", brand: "Flos", category: "lighting", swatch: "#3F362A", price: 12400 },
  { id: "lib-tapete-natural", name: "Tapete Natural 3×4", brand: "By Kamy", category: "rug", swatch: "#E8DDC8", price: 8200 },
  { id: "lib-mesa-centro", name: "Mesa Centro Pedra", designer: "Studio MK", brand: "Collection", category: "table", swatch: "#5C5448", price: 6800, inProject: true },
  { id: "lib-credenza-tv", name: "Credenza TV Nogueira", designer: "Carvalho Filho", brand: "Collection", category: "credenza", swatch: "#3F362A", price: 11200, inProject: true },
  { id: "lib-banqueta", name: "Banqueta Bar Couro", brand: "Collection", category: "stool", swatch: "#7A5D3D", price: 2400 },
];

/* -------------------- Shopping list -------------------- */
export const SEED_SHOPPING: ShoppingRow[] = [
  { id: "sh-1", room: "Sala de Estar", name: "Sofá Tide 320", brand: "Collection", isCollection: true, qty: 1, unitPrice: 28400, swatch: "#D9CFB8",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_estoque",
    reason: "Modular para receber sem rigidez. O encosto baixo deixa o tapete e a vista da janela protagonistas." },
  { id: "sh-2", room: "Sala de Estar", name: "Mesa Centro Pedra", brand: "Collection", isCollection: true, qty: 1, unitPrice: 6800, swatch: "#5C5448",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_estoque",
    reason: "Pedra natural escura para criar peso visual no centro do estar, em contraponto à madeira clara." },
  { id: "sh-3", room: "Sala de Estar", name: "Credenza TV Nogueira", brand: "Collection", isCollection: true, qty: 1, unitPrice: 11200, swatch: "#3F362A",
    commissionRate: 0.05, status: "aprovado", fulfillment: "online_encomenda", leadTime: "4 semanas",
    reason: "Ancoragem visual do estar. A nogueira escura faz contraponto à cal das paredes e ao tapete claro." },
  { id: "sh-4", room: "Sala de Estar", name: "Tapete Natural 3×4", brand: "By Kamy", isCollection: false, qty: 1, unitPrice: 8200, swatch: "#E8DDC8",
    commissionRate: 0, status: "revisao", fulfillment: "online_estoque",
    reason: "Fibra natural para temperatura do piso e definição do estar dentro da planta livre." },
  { id: "sh-5", room: "Sala de Jantar", name: "Mesa Tora — Carvalho", brand: "Atelier Madeira & Cia", isCollection: false, qty: 1, unitPrice: 18600, swatch: "#A8967A",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_encomenda", leadTime: "6 semanas",
    reason: "Madeira maciça em tora única, 220cm. Calibrada para 8 lugares confortáveis sem comprimir a circulação." },
  { id: "sh-6", room: "Sala de Jantar", name: "Cadeira Wishbone (×8)", brand: "Carl Hansen", isCollection: false, qty: 8, unitPrice: 6200, swatch: "#A8967A",
    commissionRate: 0, status: "sugerido", fulfillment: "online_encomenda", leadTime: "8 semanas",
    reason: "Clássico atemporal em palhinha. Aerodinâmica visual leve para não competir com a tora da mesa." },
  { id: "sh-7", room: "Sala de Jantar", name: "Luminária Arco", brand: "Flos", isCollection: false, qty: 1, unitPrice: 12400, swatch: "#3F362A",
    commissionRate: 0, status: "sugerido", fulfillment: "online_estoque",
    reason: "Iluminação descentralizada da mesa sem furar o teto. Cobertura de 2.10m em raio." },
  { id: "sh-8", room: "Cozinha", name: "Marcenaria sob medida", brand: "Atelier Madeira & Cia", isCollection: false, qty: 1, unitPrice: 42000, swatch: "#7A5D3D",
    commissionRate: 0.03, status: "aguardando_orcamento", fulfillment: "orcamento",
    partner: { name: "Atelier Madeira & Cia", type: "Marcenaria parceira", contact: "André · (11) 9 8421-3300" },
    reason: "Marcenaria sob medida em carvalho americano, com puxadores embutidos. Integra cooktop + ilha + nicho." },
  { id: "sh-9", room: "Cozinha", name: "Banqueta Bar Couro (×3)", brand: "Collection", isCollection: true, qty: 3, unitPrice: 2400, swatch: "#7A5D3D",
    commissionRate: 0.05, status: "aprovado", fulfillment: "online_estoque",
    reason: "Couro escuro e altura calibrada para a ilha de 1.10m. Encosto baixo preserva linha visual." },
  { id: "sh-10", room: "Cozinha", name: "Cooktop Tramontina Indução 5b", brand: "Tramontina", isCollection: false, qty: 1, unitPrice: 4800, swatch: "#3A332A",
    commissionRate: 0, status: "especificado", fulfillment: "especificacao_pura",
    reason: "Indução para resposta rápida e segurança com a ilha aberta. 5 bocas para receber." },
  { id: "sh-11", room: "Suíte", name: "Cama Queen Estofada", brand: "Collection", isCollection: true, qty: 1, unitPrice: 14200, swatch: "#A89C84",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_encomenda", leadTime: "5 semanas",
    reason: "Cabeceira estofada alta cria parede tátil. Linho areia conversa com a cal e o piso." },
  { id: "sh-12", room: "Suíte", name: "Mesa Cabeceira (×2)", brand: "Collection", isCollection: true, qty: 2, unitPrice: 3400, swatch: "#5C5448",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_estoque",
    reason: "Volume escuro pequeno para equilibrar a cama clara. Gaveta única, sem maçaneta visível." },
  { id: "sh-13", room: "Escritório", name: "Mesa Escritório Carvalho", brand: "Collection", isCollection: true, qty: 1, unitPrice: 8600, swatch: "#A8967A",
    commissionRate: 0.05, status: "sugerido", fulfillment: "online_estoque",
    reason: "Bancada limpa em carvalho, 1.60m. Suficiente para dupla tela sem bloquear a passagem da janela." },
  { id: "sh-14", room: "Escritório", name: "Cadeira Eames Office", brand: "Herman Miller", isCollection: false, qty: 1, unitPrice: 11200, swatch: "#3F362A",
    commissionRate: 0, status: "alternativa", fulfillment: "online_encomenda", leadTime: "10 semanas", clientNote: "Quero ver opção mais leve, em couro claro.",
    reason: "Couro escuro para escritório com uso intensivo. Estrutura em alumínio para durabilidade." },
];

/* -------------------- Versions -------------------- */
export const SEED_VERSIONS: Version[] = [
  { id: "v-5", label: "v5 — Layout final aprovado", author: "Intento", createdAt: "2026-04-27T09:30:00Z", note: "Cliente aprovou TV mais alta", current: true },
  { id: "v-4", label: "v4 — Cozinha repensada", author: "Diogo", createdAt: "2026-04-25T17:10:00Z" },
  { id: "v-3", label: "v3 — Suíte ampliada", author: "Intento", createdAt: "2026-04-23T14:00:00Z" },
  { id: "v-2", label: "v2 — Após reunião cliente", author: "Diogo", createdAt: "2026-04-21T11:20:00Z" },
  { id: "v-1", label: "v1 — Concepção inicial", author: "Intento", createdAt: "2026-04-19T15:50:00Z" },
];

/* -------------------- Slides -------------------- */
export const SEED_SLIDES: Slide[] = [
  { id: "sl-1", kind: "cover", title: "Loft Atelier", subtitle: "Projeto residencial / 168m²" },
  { id: "sl-2", kind: "concept", title: "Conceito", body: "Materialidade quente, terracota e madeira clara, com pontos de pedra natural escura como contraponto." },
  { id: "sl-3", kind: "plan", title: "Planta humanizada" },
  { id: "sl-4", kind: "render", title: "Sala de Estar", refId: "cam-1" },
  { id: "sl-5", kind: "render", title: "Cozinha", refId: "cam-2" },
  { id: "sl-6", kind: "materials", title: "Paleta de materiais" },
  { id: "sl-7", kind: "products", title: "Produtos selecionados" },
  { id: "sl-8", kind: "list", title: "Lista de compras" },
  { id: "sl-9", kind: "section", title: "Próximos passos" },
];

/* -------------------- Initial chat history -------------------- */

/** A single chunk of an assistant message. The chat panel renders these
 *  in order, allowing text → tool → text → tool sequences to read like a
 *  real timeline of what the agent did. */
export type ChatBlock =
  | { type: "text"; content: string }
  | { type: "tool"; tool: ToolCallStatus }
  | {
      type: "user-action";
      kind: "remove" | "move" | "edit-wall" | "edit-furniture" | "edit-opening" | "rename" | "material" | "rotate";
      label: string;
      /** Optional payload — diff data the user can read at a glance. */
      detail?: string;
      /** Optional undo handler. */
      undoLabel?: string;
      /** Number of consecutive identical actions merged into this entry.
       *  Default 1. The renderer shows "· N×" when > 1 and the label/
       *  detail reflect the LAST action so the user sees current state. */
      count?: number;
    }
  | {
      type: "debug_image";
      /** Data URL (image/png) que pode ir direto pra <img src>. */
      dataUrl: string;
      label: string;
      phase: "structural" | "furniture" | string;
    }
  | {
      type: "debug_svg";
      /** SVG bruto (string). Renderizado via dangerouslySetInnerHTML após sanitização. */
      svg: string;
      label: string;
      phase: "structural" | "furniture" | string;
    };

export interface SeededMessage {
  id: string;
  role: "system" | "user" | "assistant";
  /** Legacy plain-text content. When `blocks` is present, this is rendered
   *  only as the fallback and for API submission. */
  content: string;
  time: string;
  diff?: { description: string; badge: string; targetId?: string };
  proactive?: boolean;
  /** Legacy: tools shown as a flat list at the END of the message. Kept for
   *  back-compat with seeded chats. New chats use `blocks` instead. */
  toolCalls?: ToolCallStatus[];
  /** Preferred (Fase 4A): chronological blocks. Renderer prefers this
   *  field when present. */
  blocks?: ChatBlock[];
}

function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Welcome chat used on a fresh empty project. */
export const WELCOME_CHAT: SeededMessage[] = [
  {
    id: "m-welcome",
    role: "system",
    time: nowTime(),
    content:
      "Projeto iniciado. Descreva o briefing do seu cliente — área, estilo, ambientes — e eu começo a projetar. Por exemplo: \"Apartamento de 86m² com 2 quartos, sala integrada à cozinha americana e suíte master\".",
  },
];

/** Initial empty version so the Versions tab isn't empty. */
export const INITIAL_VERSIONS: Version[] = [
  {
    id: "v-0.1",
    label: "v0.1 — Projeto criado",
    author: "Intento",
    createdAt: new Date().toISOString(),
    note: "Aguardando briefing",
    current: true,
  },
];

export const SEED_CHAT: SeededMessage[] = [
  { id: "m-1", role: "system", time: "14:02", content: "Loft Atelier — projeto carregado a partir do briefing inicial." },
  { id: "m-2", role: "user", time: "14:04", content: "Quero algo aconchegante, mas com presença. Pensei em terracota e madeira." },
  { id: "m-3", role: "assistant", time: "14:04", content: "Boa direção. Trabalhei o estar com sofá modular voltado para a vidraça norte e uma credenza de nogueira como ancoragem visual. A cozinha ganhou ilha de 2.40m para servir como mesa rápida." },
  { id: "m-4", role: "user", time: "14:08", content: "A parede divisória do estar/jantar está pesando. Pode abrir mais?" },
  {
    id: "m-5", role: "assistant", time: "14:08",
    content: "Posso recuar a divisória 50cm e abrir a passagem para 1.40m, ganhando fluidez sem perder o sentido dos ambientes.",
    diff: { description: "Recuar parede divisória 50 cm e ampliar passagem", badge: "+50 cm", targetId: "wall-divisor" },
  },
  { id: "m-6", role: "assistant", time: "14:12", content: "Sugiro também aproximar a credenza da TV em 8 cm da parede — resolve um conflito visual com a moldura.", proactive: true },
];
