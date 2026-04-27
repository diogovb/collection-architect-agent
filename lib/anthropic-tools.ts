import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions for Claude. The frontend executes tools that mutate
// the floor plan; the server simulates results so Claude can continue.

export const tools: Anthropic.Tool[] = [
  {
    name: "create_room",
    description:
      "Cria um cômodo retangular com o nome dado. Tamanho em metros. Se x/y forem omitidos, posiciona automaticamente. floor_type é opcional.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nome do cômodo, ex: 'Sala', 'Quarto 1', 'Cozinha'.",
        },
        x: { type: "number", description: "Coordenada X em metros (canto superior-esquerdo)." },
        y: { type: "number", description: "Coordenada Y em metros." },
        width: { type: "number", description: "Largura em metros." },
        height: { type: "number", description: "Altura em metros." },
        floor_type: {
          type: "string",
          enum: ["madeira", "porcelanato", "ceramica", "marmore"],
          description: "Material do piso.",
        },
      },
      required: ["name", "width", "height"],
    },
  },
  {
    name: "remove_room",
    description: "Remove um cômodo (e tudo dentro dele) pelo nome.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
      },
      required: ["room_name"],
    },
  },
  {
    name: "add_door",
    description: "Adiciona uma porta numa parede de um cômodo. position é 0..1 ao longo da parede.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        wall: { type: "string", enum: ["north", "south", "east", "west"] },
        position: { type: "number", description: "0 a 1, posição na parede.", default: 0.5 },
        size: { type: "number", description: "Largura da porta em metros.", default: 0.9 },
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
  {
    name: "add_furniture",
    description:
      "Adiciona um móvel num cômodo. relative_x/relative_y são 0..1 dentro do cômodo (0,0 = canto superior-esquerdo).",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        furniture_type: {
          type: "string",
          enum: [
            "sofa",
            "bed",
            "table",
            "tv",
            "sink",
            "toilet",
            "shower",
            "stove",
            "fridge",
            "counter",
            "island",
            "wardrobe",
            "desk",
            "chair",
            "bookshelf",
            "washing_machine",
          ],
        },
        label: { type: "string", description: "Etiqueta a mostrar no canvas." },
        relative_x: { type: "number", default: 0.5 },
        relative_y: { type: "number", default: 0.5 },
      },
      required: ["room_name", "furniture_type"],
    },
  },
  {
    name: "remove_furniture",
    description: "Remove um móvel pelo id ou pela label (texto exato).",
    input_schema: {
      type: "object",
      properties: {
        furniture_id: { type: "string" },
        label: { type: "string" },
      },
    },
  },
  {
    name: "set_floor_material",
    description: "Troca o material do piso de um cômodo.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        material: {
          type: "string",
          enum: ["madeira", "porcelanato", "ceramica", "marmore"],
        },
      },
      required: ["room_name", "material"],
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
  {
    name: "create_apartment_layout",
    description:
      "Gera um apartamento completo (vários cômodos) com layout inteligente. Use quando o pedido for de alto nível, ex: 'cria apartamento de 70m² com 2 quartos'.",
    input_schema: {
      type: "object",
      properties: {
        total_area: { type: "number", description: "Área total aproximada em m²." },
        num_bedrooms: { type: "number" },
        num_bathrooms: { type: "number" },
        style: {
          type: "string",
          enum: ["modern", "classic", "compact"],
          default: "modern",
        },
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
        style: {
          type: "string",
          enum: ["modern", "minimal", "classic"],
          default: "modern",
        },
      },
      required: ["room_name"],
    },
  },
  {
    name: "clear_all",
    description: "Apaga toda a planta. Pergunte antes se for destrutivo.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];
