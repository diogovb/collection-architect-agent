// Altura física estimada por tipo de móvel (Capacidade E).
//
// O plano legado só guarda o footprint (largura × profundidade); a altura é
// estimada por padrão do catalogId. Usada para: (1) detectar móveis que
// bloqueiam janelas (mais altos que o peitoril) e (2) dar dimensão Y real aos
// FurnitureNodes da cena (antes era 0,5 fixo).

const HEIGHT_PATTERNS: Array<[RegExp, number]> = [
  // Altos (≥ 1,8 m): guarda-roupas, despensas, torres de forno, geladeiras.
  [/wardrobe|closet|armario|module_tall|pantry_tall|oven_tower|fridge|geladeira/i, 2.0],
  [/bookshelf|estante|shelf_tall/i, 1.8],
  // Suspensos: armários superiores e exaustor (topo ~2,15 m).
  [/module_upper|upper_cabinet|hood_built_in/i, 2.1],
  // Linha de bancada / eletrodomésticos de piso (~0,85–0,92 m).
  [/washing_machine|dryer|dishwasher|stove|cooktop|oven(?!_tower)|^module_|bancada|counter|vanity|sink/i, 0.9],
  [/dresser|comoda|buffet|sideboard|desk|table|mesa/i, 0.78],
  [/sofa|armchair|poltrona|chair|cadeira|banqueta|stool/i, 0.85],
  [/toilet|vaso|bidet/i, 0.78],
  [/bed|cama|crib|berco/i, 0.6],
  [/nightstand|criado|side_table/i, 0.55],
  [/bathtub|banheira|shower|box/i, 0.6],
  [/plant|planta/i, 1.2],
  [/rug|carpet|mat|tapete/i, 0.02],
  [/light|lumin|outlet|switch|tomada/i, 0.1],
];

const DEFAULT_HEIGHT_M = 0.75;

export function estimatedHeightM(catalogId: string): number {
  for (const [re, h] of HEIGHT_PATTERNS) {
    if (re.test(catalogId)) return h;
  }
  return DEFAULT_HEIGHT_M;
}
