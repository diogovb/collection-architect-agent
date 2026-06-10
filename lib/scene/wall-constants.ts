// Espessuras de parede — fonte única (Fase 1.1 do overhaul espacial).
//
// As paredes são geradas CENTRADAS nas bordas do retângulo do cômodo
// (migrate.ts), então a face interna avança espessura/2 para dentro do
// retângulo. Tudo que posiciona móveis precisa descontar esse meio-vão
// (ver wallInset/usableRect em lib/plan-geometry.ts). Zero imports aqui —
// este módulo é folha, importável por qualquer camada sem ciclo.

export const EXTERNAL_WALL_THICKNESS_M = 0.15;
export const INTERNAL_WALL_THICKNESS_M = 0.1;
export const RAILING_THICKNESS_M = 0.1;
