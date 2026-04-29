import type { HybridPipelineSpec } from "./types";

const STYLE_HINTS: Record<string, string> = {
  modern:
    "Estilo moderno: ambientes integrados, cozinha americana aberta para a sala, linhas retas, circulação fluida.",
  classic:
    "Estilo clássico: cômodos bem separados, hall de entrada, cozinha fechada, corredor de distribuição.",
  compact:
    "Estilo compacto: otimizar cada metro quadrado, cômodos menores mas funcionais, pouca circulação desperdiçada.",
  luxury:
    "Estilo luxo: suíte master com closet e banheiro amplo, lavabo social, cozinha gourmet, varanda generosa.",
};

export function buildStructuralPrompt(spec: HybridPipelineSpec): string {
  const style = spec.style ? STYLE_HINTS[spec.style] ?? "" : "";
  const notes = spec.additionalNotes ? `\nNotas adicionais: ${spec.additionalNotes}` : "";

  return `Desenhe uma planta baixa arquitetônica profissional (vista de cima, 2D) de um apartamento residencial brasileiro com as seguintes especificações:

- Área total: ${spec.totalArea}m²
- Quartos: ${spec.numBedrooms}
- Banheiros: ${spec.numBathrooms}
${style ? `- ${style}` : ""}${notes}

REGRAS VISUAIS (OBRIGATÓRIO):
1. Vista top-down (planta baixa), como um projeto arquitetônico profissional
2. Fundo BRANCO puro, sem texturas, sem hachuras, sem sombras, sem gradientes
3. Paredes exteriores em linhas PRETAS GROSSAS (espessura ~4px)
4. Paredes interiores em linhas PRETAS MÉDIAS (espessura ~2px)
5. Cada cômodo deve ter seu NOME em português brasileiro centralizado (ex: "Sala", "Cozinha", "Quarto Casal", "Banheiro Social", "Área de Serviço")
6. Cada cômodo deve ter a ÁREA em m² abaixo do nome (ex: "18.5 m²")
7. Portas desenhadas com o ARCO DE ABERTURA (quarter-circle swing) — convenção arquitetônica padrão
8. Janelas desenhadas como DUPLA LINHA na parede — convenção arquitetônica padrão
9. Cotas dimensionais (linhas de cota com valores em metros) nas paredes exteriores
10. Barra de escala no canto inferior
11. NÃO desenhar móveis — apenas a estrutura (paredes, portas, janelas)
12. NÃO usar cores — apenas preto sobre branco
13. Texto legível e claro em fonte simples (sans-serif)

REGRAS ARQUITETÔNICAS:
- Sala ≥ 12m², Quarto casal ≥ 12m², Quarto solteiro ≥ 8m², Cozinha ≥ 4m², Banheiro ≥ 2.5m²
- Corredor mínimo 1.20m de largura
- Porta de entrada: 0.90-1.00m, portas internas: 0.80-0.90m, banheiro: 0.70-0.80m
- Cômodos devem ter proporções realistas (nada muito estreito ou quadrado demais)
- Circulação lógica: entrada → social → íntimo

O resultado deve parecer um desenho técnico de arquitetura, NÃO uma ilustração artística.`;
}

export function buildFurniturePrompt(
  spec: HybridPipelineSpec,
  roomNames: string[],
): string {
  const roomList = roomNames.map((n) => `  - ${n}`).join("\n");

  return `Com base na planta baixa fornecida como referência, desenhe o LAYOUT DE MÓVEIS em vista de planta (top-down).

CÔMODOS DA PLANTA:
${roomList}

REGRAS VISUAIS:
1. Manter os contornos dos cômodos em CINZA CLARO como referência
2. NÃO redesenhar paredes grossas, portas ou janelas — apenas indicar os limites
3. Desenhar cada móvel como SÍMBOLO PADRÃO de planta baixa:
   - Sofás: retângulo com encosto marcado
   - Camas: retângulo com cabeceira
   - Mesas: retângulo ou círculo simples
   - Cadeiras: pequenos retângulos ou semicírculos
   - Pia/fogão/geladeira: retângulos com símbolo interno padrão
   - Vaso sanitário: símbolo oval
   - Box banheiro: retângulo com linhas de ralo
4. Escrever o NOME de cada móvel em português ao lado (ex: "Sofá 3 Lugares", "Cama Casal", "Mesa de Jantar 6L")
5. Fundo BRANCO, linhas pretas, sem cores
6. Respeitar circulação — mínimo 60cm de passagem entre móveis
7. Triângulo de cozinha: geladeira-pia-fogão, cada perna 1.2-2.7m

CATEGORIAS DE MÓVEIS POR CÔMODO:
- Sala: sofá, mesa de centro, rack/painel TV, poltrona
- Quarto Casal: cama casal/king, criados-mudo (2x), cômoda, guarda-roupa
- Quarto Solteiro: cama solteiro, criado-mudo, escrivaninha, cadeira
- Cozinha: fogão/cooktop, geladeira, pia, bancada
- Banheiro: vaso sanitário, pia, box/banheira
- Área de Serviço: tanque, máquina de lavar
- Jantar: mesa + cadeiras

O resultado deve ser um desenho técnico profissional, com mobiliário proporcional e bem posicionado.`;
}

export const VISION_EXTRACT_STRUCTURE_PROMPT = `Você é um especialista em leitura de plantas baixas arquitetônicas. Analise a imagem e extraia TODOS os dados estruturais em formato JSON.

RETORNE EXATAMENTE este formato JSON (sem texto adicional, sem markdown, apenas JSON puro):

{
  "rooms": [
    {
      "name": "Nome do Cômodo",
      "x": 0.0,
      "y": 0.0,
      "width": 5.0,
      "height": 4.0,
      "material": "madeira"
    }
  ],
  "doors": [
    {
      "roomName": "Nome do Cômodo",
      "wall": "south",
      "position": 0.5,
      "size": 0.9
    }
  ],
  "windows": [
    {
      "roomName": "Nome do Cômodo",
      "wall": "north",
      "position": 0.5,
      "size": 1.2
    }
  ],
  "confidence": 0.85,
  "issues": []
}

REGRAS DE EXTRAÇÃO:
1. COORDENADAS em metros. O cômodo superior-esquerdo da planta começa em (0, 0).
2. "x" e "y" são a posição do canto superior-esquerdo do cômodo no espaço.
3. "width" e "height" são as dimensões do cômodo em metros.
4. Cômodos ADJACENTES devem compartilhar coordenadas (sem gaps entre paredes).
5. PAREDES: norte = topo, sul = baixo, leste = direita, oeste = esquerda.
6. POSIÇÃO de porta/janela: 0..1 ao longo da parede (0 = início, 1 = final).
7. TAMANHO de porta/janela: em metros (porta típica 0.80-0.90m, janela 1.0-2.0m).
8. MATERIAL do piso: usar "madeira" para quartos/sala, "porcelanato" para cozinha/banheiro/lavanderia, "ceramica" para banheiro, "grama" para áreas externas.
9. Se não conseguir determinar uma dimensão com certeza, estime com base nas proporções visíveis e na área total informada.
10. "confidence": sua confiança geral na extração (0..1).
11. "issues": lista de problemas encontrados (cômodo sem nome legível, dimensão ambígua, etc).

DICAS:
- Se a planta tiver cotas dimensionais, USE-AS — são a fonte mais precisa.
- Cômodos comuns em PT-BR: Sala, Cozinha, Quarto Casal, Quarto Solteiro, Suíte, Banheiro Social, Banheiro Suíte, Lavabo, Área de Serviço, Varanda, Hall, Corredor, Closet, Escritório, Jantar.
- Arcos de porta indicam onde há porta e para que lado abre.
- Janelas são representadas por linhas duplas paralelas na parede.`;

export function buildVisionFurniturePrompt(
  existingRooms: Array<{ name: string; width: number; height: number }>,
  furnitureCatalog: string[],
): string {
  const rooms = existingRooms
    .map((r) => `  - ${r.name} (${r.width}×${r.height}m)`)
    .join("\n");

  const catalog = furnitureCatalog.join(", ");

  return `Você é um especialista em leitura de plantas baixas mobiliadas. Analise a imagem e extraia TODOS os móveis em formato JSON.

CÔMODOS DA PLANTA:
${rooms}

CATÁLOGO DE TIPOS DE MÓVEIS DISPONÍVEIS:
${catalog}

RETORNE EXATAMENTE este formato JSON (sem texto adicional, sem markdown, apenas JSON puro):

{
  "items": [
    {
      "type": "sofa_3seat",
      "roomName": "Sala",
      "relativeX": 0.5,
      "relativeY": 0.8,
      "rotation": 0,
      "label": "Sofá 3 Lugares",
      "confidence": 0.9
    }
  ],
  "unrecognized": [
    {
      "roomName": "Sala",
      "description": "Objeto não identificado no canto NE"
    }
  ],
  "confidence": 0.8
}

REGRAS:
1. "type" DEVE ser um dos tipos do catálogo listado acima.
2. "roomName" DEVE ser um dos cômodos listados acima.
3. "relativeX" e "relativeY": posição relativa DENTRO do cômodo (0..1). (0,0) = canto superior-esquerdo, (1,1) = canto inferior-direito.
4. "rotation": em graus (0, 90, 180, 270). 0 = orientação padrão.
5. "label": nome em português do móvel.
6. Se um móvel não corresponde a nenhum tipo do catálogo, coloque em "unrecognized".
7. "confidence" por item: sua confiança na identificação daquele móvel específico.`;
}
