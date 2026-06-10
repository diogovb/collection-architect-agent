// Intento Project specific types — UI state, mock entities, modes.

export type Mode = "plan" | "presentation" | "shopping";

export type RightTab = "chat" | "refs" | "collection" | "versions";

export interface ReferenceImage {
  id: string;
  label: string;
  /** gradient string for thumb */
  thumb: string;
  influence: number; // 0-100
  attachedTo?: string; // selected element id
}

export interface CollectionItem {
  id: string;
  name: string;
  designer?: string;
  brand?: string;
  category: string; // e.g., "sofa", "lighting", "rug"
  /** swatch color */
  swatch: string;
  /** price in BRL */
  price: number;
  /** is part of project? */
  inProject?: boolean;
}

export type ItemStatus = "sugerido" | "revisao" | "aprovado" | "alternativa" | "comprado" | "aguardando_orcamento" | "orcamento_recebido" | "especificado";

export type FulfillmentChannel =
  | "online_estoque"
  | "online_encomenda"
  | "orcamento"
  | "especificacao_pura";

export interface Partner {
  name: string;
  type: string;
  contact?: string;
}

export interface Quote {
  value: number;
  delivery: string;
  validity: string;
}

export interface ShoppingRow {
  id: string;
  room: string;
  name: string;
  brand?: string;
  isCollection: boolean;
  qty: number;
  unitPrice: number;
  swatch: string;
  /** 0..1 share of unitPrice that goes to architect commission. 0 means none. */
  commissionRate: number;
  /** 1-2 sentence editorial reason. Required for status to leave "sugerido". */
  reason: string;
  status: ItemStatus;
  /** Optional client note shown in architect view when status === "alternativa". */
  clientNote?: string;
  fulfillment: FulfillmentChannel;
  /** For online_encomenda. */
  leadTime?: string;
  /** For orcamento. */
  partner?: Partner;
  quote?: Quote;
}

export interface Version {
  id: string;
  label: string;
  author: string;
  createdAt: string; // ISO date
  note?: string;
  current?: boolean;
}

export type SlideKind =
  | "cover"
  | "concept"
  | "plan"
  | "materials"
  | "products"
  | "list"
  | "text"
  | "section";

export interface Slide {
  id: string;
  kind: SlideKind;
  title?: string;
  subtitle?: string;
  body?: string;
}

export interface DiffProposal {
  /** id of the AI-proposed change */
  id: string;
  targetId: string; // furniture/wall/etc
  description: string;
  /** delta meters */
  deltaX?: number;
  deltaY?: number;
  /** badge text e.g. "+50cm" */
  badge?: string;
}
