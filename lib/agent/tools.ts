// Pascal-style agent tools that operate on the flat scene graph.
// These are exposed alongside the legacy plan tools (lib/anthropic-tools.ts);
// the chat route prefers scene-tools when the input contains a node id.

import type Anthropic from "@anthropic-ai/sdk";

export const sceneTools: Anthropic.Tool[] = [
  // ---- Walls ----
  {
    name: "add_wall",
    description:
      "Cria uma nova parede com endpoints absolutos. Coordenadas em metros. Espessura padrão 0,10m (interna) ou 0,15m (externa). Retorna o id da parede.",
    input_schema: {
      type: "object",
      properties: {
        start_x: { type: "number", description: "Coordenada X do start em metros." },
        start_z: { type: "number", description: "Coordenada Z do start em metros." },
        end_x: { type: "number", description: "Coordenada X do end em metros." },
        end_z: { type: "number", description: "Coordenada Z do end em metros." },
        thickness: { type: "number", description: "Espessura em metros (default 0.10)." },
        height: { type: "number", description: "Altura em metros (default 2.80)." },
        is_exterior: { type: "boolean", description: "Marca como parede externa (15cm + janelas)." },
      },
      required: ["start_x", "start_z", "end_x", "end_z"],
    },
  },
  {
    name: "move_wall_endpoint",
    description: "Move um endpoint de uma parede existente para nova posição absoluta. Recalcula rooms automaticamente.",
    input_schema: {
      type: "object",
      properties: {
        wall_id: { type: "string", description: "Id da parede." },
        endpoint: { type: "string", enum: ["start", "end"], description: "Qual endpoint mover." },
        x: { type: "number", description: "Nova coordenada X em metros." },
        z: { type: "number", description: "Nova coordenada Z em metros." },
      },
      required: ["wall_id", "endpoint", "x", "z"],
    },
  },
  {
    name: "split_wall",
    description: "Divide uma parede em duas no offset indicado, mantendo as aberturas em suas posições originais.",
    input_schema: {
      type: "object",
      properties: {
        wall_id: { type: "string" },
        at_offset: { type: "number", description: "Distância em metros desde wall.start onde dividir." },
      },
      required: ["wall_id", "at_offset"],
    },
  },
  {
    name: "delete_wall_node",
    description: "Remove uma parede pelo id. Aberturas associadas também são removidas. Pode abrir um cômodo (open-plan).",
    input_schema: {
      type: "object",
      properties: { wall_id: { type: "string" } },
      required: ["wall_id"],
    },
  },

  // ---- Openings ----
  {
    name: "attach_door",
    description:
      "Cria porta atachada a uma parede com offset (em metros desde wall.start). Largura 0,80m geral, 0,90m entrada, 0,70m banheiro.",
    input_schema: {
      type: "object",
      properties: {
        wall_id: { type: "string" },
        offset: { type: "number" },
        width: { type: "number", description: "Largura em metros (default 0.80)." },
        height: { type: "number", description: "Altura em metros (default 2.10)." },
        hinge_side: { type: "string", enum: ["start", "end"] },
        swing_direction: { type: "string", enum: ["in", "out"] },
      },
      required: ["wall_id", "offset"],
    },
  },
  {
    name: "attach_window",
    description: "Cria janela atachada a uma parede com offset. Default 1,50×1,20m, peitoril 0,90m.",
    input_schema: {
      type: "object",
      properties: {
        wall_id: { type: "string" },
        offset: { type: "number" },
        width: { type: "number", description: "Largura em metros (default 1.50)." },
        height: { type: "number", description: "Altura em metros (default 1.20)." },
        sill_height: { type: "number", description: "Altura do peitoril (default 0.90)." },
      },
      required: ["wall_id", "offset"],
    },
  },
  {
    name: "move_opening",
    description: "Desloca uma porta ou janela ao longo da parede pai (atualiza offset).",
    input_schema: {
      type: "object",
      properties: {
        opening_id: { type: "string" },
        new_offset: { type: "number" },
      },
      required: ["opening_id", "new_offset"],
    },
  },
  {
    name: "delete_opening",
    description: "Remove uma porta ou janela pelo id.",
    input_schema: {
      type: "object",
      properties: { opening_id: { type: "string" } },
      required: ["opening_id"],
    },
  },

  // ---- High-level placement ----
  {
    name: "place_room_adjacent",
    description:
      "Cria um cômodo retangular adjacente a outro pelo lado indicado, compartilhando a parede divisória. Útil para expressar 'cozinha a leste da sala' sem calcular x/y manualmente.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do novo cômodo." },
        base_room_id: { type: "string", description: "Id do cômodo de referência." },
        side: { type: "string", enum: ["north", "south", "east", "west"] },
        width: { type: "number", description: "Largura do novo cômodo em metros." },
        depth: { type: "number", description: "Profundidade do novo cômodo em metros." },
        floor_material: { type: "string" },
      },
      required: ["name", "base_room_id", "side", "width", "depth"],
    },
  },

  // ---- High-level composers ----
  {
    name: "compose_apartment_v2",
    description:
      "Composer determinístico que gera um apartamento completo a partir de um programa de cômodos. Cria envelope, paredes internas em grid, e uma janela por parede externa. Use para responder 'faz um apto X m² com Y quartos' sem precisar criar parede por parede.",
    input_schema: {
      type: "object",
      properties: {
        area_total: { type: "number", description: "Área total alvo em m² (ex: 65)." },
        orientation: {
          type: "string",
          enum: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
          description: "Orientação solar da fachada principal (hemisfério sul).",
        },
        rooms: {
          type: "array",
          description: "Lista de cômodos. Ordem importa: ordem na grid (linha por linha).",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              min_area: { type: "number", description: "m² mínimo desejado (NBR 15575)." },
              category: { type: "string", description: "living | bedroom | kitchen | bath | …" },
            },
            required: ["name"],
          },
        },
      },
      required: ["area_total", "rooms"],
    },
  },
  {
    name: "furnish_room_v2",
    description:
      "Mobília automaticamente um cômodo com layout pré-definido por categoria. Detecta categoria por nome do cômodo. Use para 'mobilia tudo' ou 'mobilia esse quarto'.",
    input_schema: {
      type: "object",
      properties: {
        room_id: { type: "string" },
        style: { type: "string", enum: ["minimal", "padrão", "completo"] },
      },
      required: ["room_id"],
    },
  },
];
