export type Lang = "pt" | "en";

export type Dict = Record<string, { pt: string; en: string }>;

const DICT: Dict = {
  // Modes
  "mode.plan": { pt: "Planta", en: "Plan" },
  "mode.render": { pt: "Render", en: "Render" },
  "mode.presentation": { pt: "Apresentação", en: "Presentation" },
  "mode.shopping": { pt: "Lista", en: "List" },

  // Top bar
  "top.share": { pt: "Compartilhar", en: "Share" },
  "top.command": { pt: "Comandos", en: "Commands" },

  // Left nav
  "nav.environments": { pt: "Ambientes", en: "Environments" },
  "nav.cameras": { pt: "Câmeras", en: "Cameras" },
  "nav.project": { pt: "Projeto", en: "Project" },

  // Tabs
  "tab.chat": { pt: "Conversa", en: "Chat" },
  "tab.refs": { pt: "Referências", en: "References" },
  "tab.collection": { pt: "Collection", en: "Collection" },
  "tab.versions": { pt: "Versões", en: "Versions" },

  // Chat
  "chat.context": { pt: "CONTEXTO", en: "CONTEXT" },
  "chat.send": { pt: "Enviar", en: "Send" },
  "chat.placeholder": { pt: "Pergunte ao seu agente…", en: "Ask your agent…" },
  "chat.you": { pt: "VOCÊ", en: "YOU" },
  "chat.intento": { pt: "INTENTO", en: "INTENTO" },
  "chat.system": { pt: "SISTEMA", en: "SYSTEM" },
  "chat.compare": { pt: "Comparar", en: "Compare" },
  "chat.apply": { pt: "Aplicar", en: "Apply" },
  "chat.discard": { pt: "Descartar", en: "Discard" },
  "chat.thinking": { pt: "Intento está pensando…", en: "Intento is thinking…" },

  // Render mode
  "render.empty": { pt: "Câmera ainda não gerada", en: "Camera not generated yet" },
  "render.generate": { pt: "Gerar", en: "Generate" },
  "render.regenerate": { pt: "Regenerar", en: "Regenerate" },
  "render.refine": { pt: "Refinar", en: "Refine" },
  "render.refineNote": { pt: "Refinamento não altera a planta", en: "Refinement does not change the plan" },
  "render.outdated": { pt: "Planta foi alterada — render desatualizado", en: "Plan changed — render outdated" },

  // Shopping
  "shop.total": { pt: "Total estimado", en: "Estimated total" },
  "shop.exportPdf": { pt: "Exportar PDF", en: "Export PDF" },
  "shop.requestQuote": { pt: "Solicitar orçamento", en: "Request quote" },
  "shop.detail": { pt: "Detalhe", en: "Detail" },
  "shop.qty": { pt: "Qtd.", en: "Qty" },
  "shop.viewArchitect": { pt: "Visão Arquiteto", en: "Architect view" },
  "shop.viewClient": { pt: "Visão Cliente", en: "Client view" },
  "shop.helpArchitect": { pt: "Comissão e gestão visíveis. Toggle para conferir o que o cliente vê.", en: "Commission and management visible. Toggle to preview what the client sees." },
  "shop.helpClient": { pt: "Você está vendo o que o cliente vê.", en: "You are seeing what the client sees." },
  "shop.sendToClient": { pt: "Enviar para cliente", en: "Send to client" },
  "shop.talkArchitect": { pt: "Falar com o arquiteto", en: "Talk to architect" },
  "shop.approveAll": { pt: "Aprovar tudo", en: "Approve all" },
  "shop.approve": { pt: "Aprovar", en: "Approve" },
  "shop.alternative": { pt: "Alternativa", en: "Alternative" },
  "shop.requestQuoteShort": { pt: "Pedir orçamento", en: "Request quote" },
  "shop.markSpecified": { pt: "Marcar especificado", en: "Mark specified" },
  "shop.commissionTotal": { pt: "Comissão do projeto", en: "Project commission" },
  "shop.commissionPotential": { pt: "potencial · 5% sobre peças Collection", en: "potential · 5% on Collection pieces" },
  "shop.confirmed": { pt: "Confirmado", en: "Confirmed" },
  "shop.byRoom": { pt: "Por ambiente", en: "By room" },
  "shop.commissionReminder": { pt: "Comissão se realiza apenas quando a peça é efetivamente comprada pelo cliente.", en: "Commission is only realized when the piece is actually purchased." },
  "shop.partner": { pt: "Vendedor parceiro", en: "Partner vendor" },
  "shop.deliveryIn": { pt: "Entrega em", en: "Delivery in" },
  "shop.validUntil": { pt: "Válido até", en: "Valid until" },
  "shop.clientNote": { pt: "Nota do cliente", en: "Client note" },
  "shop.commission": { pt: "Comissão", en: "Commission" },
  "shop.status": { pt: "Status", en: "Status" },
  "shop.editorialReason": { pt: "Por que", en: "Why" },
  "shop.noRhythm": { pt: "No seu ritmo", en: "At your pace" },
  "shop.noRhythmBody": { pt: "Você decide quando e como cada peça entra no projeto. Algumas peças aguardam orçamento; outras chegam por encomenda. Sem pressa.", en: "You decide when and how each piece enters the project. Some wait for a quote, others come by order. No rush." },

  "channel.online_estoque": { pt: "Em estoque", en: "In stock" },
  "channel.online_encomenda": { pt: "Sob encomenda", en: "On order" },
  "channel.orcamento": { pt: "Orçamento", en: "Quote" },
  "channel.especificacao_pura": { pt: "Especificação", en: "Specification" },

  "status.sugerido": { pt: "Sugerido", en: "Suggested" },
  "status.revisao": { pt: "Em revisão", en: "In review" },
  "status.aprovado": { pt: "Aprovado", en: "Approved" },
  "status.alternativa": { pt: "Alternativa", en: "Alternative" },
  "status.comprado": { pt: "Comprado", en: "Purchased" },
  "status.aguardando_orcamento": { pt: "Aguardando orçamento", en: "Awaiting quote" },
  "status.orcamento_recebido": { pt: "Orçamento recebido", en: "Quote received" },
  "status.especificado": { pt: "Especificado", en: "Specified" },

  // Presentation
  "pres.present": { pt: "Apresentar", en: "Present" },
  "pres.exit": { pt: "Sair", en: "Exit" },
  "pres.recompose": { pt: "Recompor", en: "Recompose" },

  // Common
  "common.search": { pt: "Buscar", en: "Search" },
  "common.all": { pt: "Todos", en: "All" },
  "common.apply": { pt: "Aplicar", en: "Apply" },
  "common.cancel": { pt: "Cancelar", en: "Cancel" },
};

export function t(lang: Lang, key: string): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] ?? entry.pt;
}
