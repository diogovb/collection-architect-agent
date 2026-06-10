// Tolerâncias geométricas unificadas (Fase 3.0).
//
// Antes desta unificação cada módulo definia o próprio epsilon (1 mm, 0,1 mm,
// 1 cm, 5 cm, 50 cm…) e o desencontro entre eles causava falhas em cascata:
// uma parede snapada a 5 cm não casava com um vértice deduplicado a 1 mm e a
// porta "caía" do segmento. Todo código novo deve importar daqui; ao mudar um
// valor, leia o comentário do porquê antes.

/** Identidade de vértice: dois pontos a menos de 1 mm são o MESMO ponto.
 *  Abaixo de qualquer relevância física ou visual em escala de planta. */
export const TOL_VERTEX_M = 0.001;

/** Pertinência a uma linha (colinearidade / sobreposição de intervalos).
 *  Mesma ordem de grandeza da identidade de vértice. */
export const TOL_LINE_M = 1e-3;

/** Guarda de denominador para interseção de retas quase paralelas
 *  (adimensional na prática — produto cruzado de direções normalizadas).
 *  Mantido separado das tolerâncias de distância de propósito. */
export const PARALLEL_EPS = 1e-4;

/** Quantização das bordas de cômodos na migração retângulo→grafo de paredes,
 *  para que cômodos criados independentemente compartilhem exatamente a mesma
 *  parede (5 cm). NÃO usar para identidade de vértice. */
export const SNAP_ROOM_GRID_M = 0.05;

/** Grade de arrasto visível ao usuário (10 cm). */
export const SNAP_UI_GRID_M = 0.1;

/** "Encostado em": bordas a menos de 1 cm são consideradas em contato
 *  (móvel rente à parede, AABBs flush). Invisível em escala de planta. */
export const TOL_CONTACT_M = 0.01;

/** "Ancorado à parede" (semântico): um móvel até 5 cm da parede ainda conta
 *  como apoiado nela. Também usado para a chave de endpoints soltos de parede
 *  (antes 2 cm — unificado em 5 cm deliberadamente: paredes desenhadas à mão
 *  com gap de 3-4 cm são, na intenção do usuário, conectadas). */
export const TOL_WALL_TOUCH_M = 0.05;

/** Duas portas com centros a menos de 50 cm são a MESMA abertura física
 *  (padrão comum: cada cômodo adjacente registra a porta compartilhada). */
export const DOOR_DEDUP_RADIUS_M = 0.5;

/** Profundidade do corredor de aproximação de porta: a faixa na frente do
 *  vão (nos DOIS lados da parede) que precisa ficar transitável para a
 *  porta ser usável. O quarto-de-disco cobre o lado do giro; este corredor
 *  cobre o lado de chegada — era o buraco que deixava um guarda-roupa ser
 *  posicionado exatamente na boca de uma porta que abre para o outro lado.
 *  A regra é GRADUADA (erro só quando ≥50% da largura do vão é coberta) e
 *  a profundidade clampada à metade do fundo útil em cômodos minúsculos —
 *  uma zona binária de 60cm já existiu aqui e foi removida por inviabilizar
 *  banheiros/cozinhas compactos. */
export const DOOR_APPROACH_DEPTH_M = 0.7;

/** Piso de ruído na detecção de faces: polígonos menores que 0,5 m² são
 *  artefatos do grafo, não cômodos. */
export const MIN_ROOM_AREA_M2 = 0.5;
