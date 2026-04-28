import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions for Claude. The frontend executes tools that mutate
// the floor plan; the server simulates results so Claude can continue.

const FURNITURE_TYPES = [
  // legacy
  "sofa", "bed", "table", "tv", "sink", "toilet", "shower", "stove", "fridge",
  "counter", "island", "wardrobe", "desk", "chair", "bookshelf", "washing_machine",
  // sala
  "sofa_2seat", "sofa_3seat", "sofa_L", "armchair", "coffee_table", "side_table",
  "tv_console", "floor_lamp", "rug_rect",
  // quarto casal
  "bed_double", "bed_king", "nightstand", "dresser", "wardrobe_sliding",
  "wardrobe_hinged", "vanity",
  // quarto solteiro / infantil
  "bed_single", "bed_bunk", "desk_study", "desk_chair",
  "crib", "bed_child", "toy_shelf", "play_table",
  // cozinha
  "stove_4burner", "stove_5burner", "cooktop", "fridge_single", "fridge_double",
  "microwave", "dishwasher", "kitchen_sink_single", "kitchen_sink_double",
  "kitchen_island", "bar_stool", "hood", "pantry",
  // banheiro
  "bidet", "sink_pedestal", "sink_vanity", "sink_double_vanity",
  "shower_square", "shower_rect", "bathtub_rect", "bathtub_corner", "towel_rack",
  // lavanderia
  "dryer", "laundry_sink", "ironing_board",
  // jantar
  "dining_table_4", "dining_table_6", "dining_table_8", "dining_table_round_4",
  "buffet", "dining_chair",
  // escritório
  "desk_L", "desk_straight", "office_chair", "filing_cabinet",
  // comercial
  "meeting_table_large", "reception_desk", "waiting_chair", "cubicle_desk",
  "display_shelf", "checkout_counter", "restaurant_table_2", "restaurant_table_4",
  "bar_counter", "commercial_stove",
  // externo
  "pool_rect", "hot_tub", "bbq_grill", "outdoor_table", "sun_lounger", "umbrella",
  "planter_round", "tree_small", "tree_large", "pergola", "fountain",
  // decoração
  "plant_pot", "mirror_wall", "ceiling_fan",
  // elétrico
  "light_ceiling", "light_spot", "power_outlet", "switch",
];

const FLOOR_MATERIALS = ["madeira", "porcelanato", "ceramica", "marmore", "grama", "deck", "pedra"];

const FURNITURE_GROUPS = [
  "dining_set_4", "dining_set_6", "dining_set_8",
  "living_basic", "living_full",
  "bedroom_couple_basic", "bedroom_couple_full",
  "bedroom_single_basic", "kids_room_basic",
  "kitchen_basic", "kitchen_full",
  "bathroom_basic", "bathroom_full",
  "office_basic", "laundry_basic",
  "garden_basic", "pool_set", "bbq_set",
];

export const tools: Anthropic.Tool[] = [
  // ============ ROOMS ============
  {
    name: "create_room",
    description:
      "Cria um cômodo retangular com o nome dado. Tamanho em metros. Se x/y forem omitidos, posiciona automaticamente.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do cômodo, ex: 'Sala', 'Quarto 1', 'Cozinha'." },
        x: { type: "number", description: "Coordenada X em metros (canto superior-esquerdo)." },
        y: { type: "number", description: "Coordenada Y em metros." },
        width: { type: "number", description: "Largura em metros." },
        height: { type: "number", description: "Altura em metros." },
        floor_type: { type: "string", enum: FLOOR_MATERIALS, description: "Material do piso." },
      },
      required: ["name", "width", "height"],
    },
  },
  {
    name: "remove_room",
    description: "Remove um cômodo (e tudo dentro dele) pelo nome.",
    input_schema: {
      type: "object",
      properties: { room_name: { type: "string" } },
      required: ["room_name"],
    },
  },
  {
    name: "resize_room",
    description: "Redimensiona um cômodo existente (mantém posição do canto superior-esquerdo).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["room_name", "width", "height"],
    },
  },
  {
    name: "duplicate_room",
    description: "Duplica um cômodo existente (com móveis), com offset opcional.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        new_name: { type: "string" },
        offset_x: { type: "number" },
        offset_y: { type: "number" },
      },
      required: ["room_name"],
    },
  },

  // ============ OPENINGS ============
  {
    name: "add_door",
    description: "Adiciona uma porta numa parede de um cômodo. position é 0..1 ao longo da parede.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
        position: { type: "number", default: 0.5 },
        size: { type: "number", default: 0.9 },
      },
      required: ["room_name", "wall"],
    },
  },
  {
    name: "add_window",
    description: "Adiciona uma janela numa parede de um cômodo. position é 0..1.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
        position: { type: "number", default: 0.5 },
        size: { type: "number", default: 1.5 },
      },
      required: ["room_name", "wall"],
    },
  },

  // ============ WALLS / STRUCTURE ============
  {
    name: "delete_wall",
    description:
      "Remove uma parede inteira de um cômodo (vira passagem aberta — útil pra integrar ambientes).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
      },
      required: ["room_name", "wall"],
    },
  },
  {
    name: "merge_rooms",
    description:
      "Funde dois cômodos adjacentes em um só. Os cômodos precisam compartilhar uma parede inteira.",
    input_schema: {
      type: "object",
      properties: {
        room_a: { type: "string" },
        room_b: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["room_a", "room_b"],
    },
  },
  {
    name: "add_partition",
    description:
      "Adiciona uma divisória interna num cômodo, criando um cômodo novo. Não muda o cômodo original (use split_room para dividir de fato).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        orientation: { type: "string", enum: ["horizontal", "vertical"] },
        position: { type: "number", description: "0..1, posição da divisória.", default: 0.5 },
        new_room_name: { type: "string" },
      },
      required: ["room_name", "orientation"],
    },
  },
  {
    name: "split_room",
    description:
      "Divide um cômodo em dois. orientation horizontal divide ao longo da largura (cria cômodo abaixo); vertical divide ao longo da altura (cria cômodo à direita).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        orientation: { type: "string", enum: ["horizontal", "vertical"] },
        position: { type: "number", default: 0.5 },
        new_room_name: { type: "string" },
        new_room_floor: { type: "string", enum: FLOOR_MATERIALS },
      },
      required: ["room_name", "orientation"],
    },
  },
  {
    name: "move_wall",
    description:
      "Move uma parede de um cômodo (cresce ou diminui). delta em metros (positivo = parede pra fora).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
        delta: { type: "number" },
      },
      required: ["room_name", "wall", "delta"],
    },
  },
  {
    name: "add_column",
    description: "Adiciona uma coluna estrutural na planta (posição absoluta em metros).",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        size: { type: "number", default: 0.3 },
        shape: { type: "string", enum: ["square", "round"], default: "square" },
      },
      required: ["x", "y"],
    },
  },

  // ============ FLOOR ============
  {
    name: "set_floor_material",
    description: "Troca o material do piso de um cômodo inteiro.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        material: { type: "string", enum: FLOOR_MATERIALS },
      },
      required: ["room_name", "material"],
    },
  },
  {
    name: "set_railing_material",
    description:
      "Troca o material do guarda-corpo de uma varanda já existente. Atualiza apenas as paredes externas marcadas como guarda-corpo (kind === 'railing').",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string", description: "Nome da varanda." },
        material: { type: "string", enum: ["concrete", "glass", "metal"] },
      },
      required: ["room_name", "material"],
    },
  },
  {
    name: "split_floor",
    description:
      "Divide o piso de um cômodo em duas zonas com materiais diferentes (essencial para open-plan: ex: sala madeira / cozinha porcelanato no mesmo espaço).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        orientation: { type: "string", enum: ["horizontal", "vertical"] },
        position: { type: "number", default: 0.5 },
        second_material: { type: "string", enum: FLOOR_MATERIALS },
      },
      required: ["room_name", "orientation", "second_material"],
    },
  },

  // ============ FURNITURE ============
  {
    name: "add_furniture",
    description:
      "Adiciona um móvel num cômodo. relative_x/relative_y são 0..1 dentro do cômodo (0,0 = canto superior-esquerdo).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        furniture_type: { type: "string", enum: FURNITURE_TYPES },
        label: { type: "string" },
        relative_x: { type: "number", default: 0.5 },
        relative_y: { type: "number", default: 0.5 },
      },
      required: ["room_name", "furniture_type"],
    },
  },
  {
    name: "add_furniture_group",
    description:
      "Adiciona um conjunto pré-definido de móveis num cômodo (ex: 'dining_set_6' = mesa de jantar 6 lugares + 6 cadeiras).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        group: { type: "string", enum: FURNITURE_GROUPS },
      },
      required: ["room_name", "group"],
    },
  },
  {
    name: "swap_furniture",
    description: "Troca o tipo de um móvel existente, mantendo a posição.",
    input_schema: {
      type: "object",
      properties: {
        furniture_id: { type: "string" },
        new_type: { type: "string", enum: FURNITURE_TYPES },
      },
      required: ["furniture_id", "new_type"],
    },
  },
  {
    name: "remove_furniture",
    description: "Remove um móvel pelo id ou pela label (texto exato).",
    input_schema: {
      type: "object",
      properties: { furniture_id: { type: "string" }, label: { type: "string" } },
    },
  },
  {
    name: "move_furniture",
    description: "Move um móvel para uma posição absoluta (em metros) na planta.",
    input_schema: {
      type: "object",
      properties: {
        furniture_id: { type: "string" },
        new_x: { type: "number" },
        new_y: { type: "number" },
      },
      required: ["furniture_id", "new_x", "new_y"],
    },
  },

  // ============ LAYOUT TRANSFORMATIONS ============
  {
    name: "mirror_layout",
    description: "Espelha toda a planta no eixo X ou Y.",
    input_schema: {
      type: "object",
      properties: { axis: { type: "string", enum: ["x", "y"] } },
      required: ["axis"],
    },
  },
  {
    name: "rotate_layout",
    description: "Gira toda a planta 90, 180 ou 270 graus.",
    input_schema: {
      type: "object",
      properties: { degrees: { type: "number", enum: [90, 180, 270] } },
      required: ["degrees"],
    },
  },

  // ============ STAIRS / BALCONY ============
  {
    name: "add_balcony",
    description:
      "Adiciona uma varanda com guarda-corpo (parapeto baixo ~1.10 m) nas três faces externas. A parede compartilhada com o cômodo pai (attached_to) permanece sólida e tipicamente recebe uma porta-balcão. Material padrão do guarda-corpo é concreto; use 'glass' para visual moderno transparente ou 'metal' para estilo industrial.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        attached_to: { type: "string", description: "Nome do cômodo de referência." },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
        width: { type: "number" },
        depth: { type: "number" },
        railing_material: {
          type: "string",
          enum: ["concrete", "glass", "metal"],
          description: "Material do guarda-corpo. Default 'concrete'.",
        },
      },
      required: ["width", "depth"],
    },
  },
  {
    name: "add_stairs",
    description: "Adiciona uma escada (straight, L, U ou spiral).",
    input_schema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["straight", "L", "U", "spiral"] },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        direction: { type: "string", enum: ["up", "down"], default: "up" },
        rotation: { type: "number", default: 0 },
        room_name: { type: "string" },
      },
      required: ["shape", "x", "y", "width", "height"],
    },
  },

  // ============ ANNOTATIONS ============
  {
    name: "add_dimension",
    description: "Adiciona uma cota dimensional entre dois pontos (em metros).",
    input_schema: {
      type: "object",
      properties: {
        x1: { type: "number" },
        y1: { type: "number" },
        x2: { type: "number" },
        y2: { type: "number" },
        text: { type: "string", description: "Texto opcional. Se omitido, calcula a distância." },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
  },
  {
    name: "add_text_note",
    description: "Adiciona uma anotação de texto livre na planta.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        text: { type: "string" },
      },
      required: ["x", "y", "text"],
    },
  },
  {
    name: "add_north_arrow",
    description:
      "Adiciona uma rosa-dos-ventos / seta de norte na planta. angle em graus (0 = norte para cima).",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        angle: { type: "number", default: 0 },
      },
    },
  },

  // ============ HIGH-LEVEL ============
  {
    name: "create_apartment_layout",
    description:
      "Gera um apartamento completo (vários cômodos) com layout inteligente. Use quando o pedido for de alto nível, ex: 'cria apartamento de 70m² com 2 quartos'.",
    input_schema: {
      type: "object",
      properties: {
        total_area: { type: "number" },
        num_bedrooms: { type: "number" },
        num_bathrooms: { type: "number" },
        style: { type: "string", enum: ["modern", "classic", "compact"], default: "modern" },
      },
      required: ["total_area", "num_bedrooms", "num_bathrooms"],
    },
  },
  {
    name: "furnish_room",
    description: "Mobilia automaticamente um cômodo com móveis adequados ao tipo dele.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        style: { type: "string", enum: ["modern", "minimal", "classic"], default: "modern" },
      },
      required: ["room_name"],
    },
  },
  {
    name: "clear_all",
    description: "Apaga toda a planta. Pergunte antes se for destrutivo.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_knowledge_base",
    description:
      "Consulta a base de conhecimento arquitetônico (Neufert, NBR 15575, NBR 9050, orientação solar, zoneamento, materiais, paisagismo, comercial, instalações). Use SEMPRE antes de tomar decisões de projeto que envolvam dimensões mínimas, normas, orientação solar, ergonomia ou recomendações técnicas — não confie só na sua memória; busque a referência. Retorna até `limit` trechos relevantes com título e fonte. Cite os títulos dos trechos retornados ao justificar decisões. Se quiser restringir, use `category` (ex: 'neufert', 'nbr-15575', 'nbr-9050', 'orientacao-solar', 'zoneamento', 'materiais', 'paisagismo', 'comercial', 'instalacoes').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Pergunta ou tema a buscar, em português, ex: 'largura mínima de corredor', 'triângulo de trabalho cozinha', 'orientação solar quarto'.",
        },
        category: {
          type: "string",
          description:
            "Filtro opcional por categoria. Omita para buscar em toda a base.",
        },
      },
      required: ["query"],
    },
  },
];
