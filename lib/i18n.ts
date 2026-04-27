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
  "chat.placeholder": { pt: "Pergunte ao Vibe…", en: "Ask Vibe…" },
  "chat.you": { pt: "VOCÊ", en: "YOU" },
  "chat.vibe": { pt: "VIBE", en: "VIBE" },
  "chat.system": { pt: "SISTEMA", en: "SYSTEM" },
  "chat.compare": { pt: "Comparar", en: "Compare" },
  "chat.apply": { pt: "Aplicar", en: "Apply" },
  "chat.discard": { pt: "Descartar", en: "Discard" },
  "chat.thinking": { pt: "Vibe está pensando…", en: "Vibe is thinking…" },

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
