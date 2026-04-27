// Base de conhecimento arquitetônico do Collection Architect Agent.
// Cada chunk é autoexplicativo (100-200 palavras) e citável como fonte.
// Categorias: neufert, nbr-15575, nbr-9050, orientacao-solar, zoneamento,
// materiais, paisagismo, comercial, instalacoes.

export interface KnowledgeChunk {
  category: string;
  title: string;
  content: string;
}

export const KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  // ============================================================
  // NEUFERT — Arte de Projetar em Arquitetura (30 chunks)
  // ============================================================
  {
    category: "neufert",
    title: "Corredor residencial — largura mínima e recomendada",
    content:
      "O corredor é a espinha de circulação da residência. O Neufert estabelece largura mínima de 1,20 m para corredor residencial, permitindo passagem confortável de uma pessoa carregando objetos ou cruzamento eventual com outra. A largura recomendada é 1,50 m, especialmente quando há mais de dois quartos servidos pelo corredor. Em apartamentos populares aceita-se 0,90 m apenas em trechos curtos (até 2 m de comprimento), mas evite — gera sensação de aperto e dificulta a passagem de móveis. Corredor com mais de 4 m de comprimento deve ter pelo menos 1,20 m. Para acessibilidade plena (NBR 9050), o corredor deve permitir o giro de cadeira de rodas em pelo menos um ponto, exigindo 1,50 m. Iluminação artificial do corredor precisa ser uniforme; um ponto central é insuficiente para corredores acima de 3 m.",
  },
  {
    category: "neufert",
    title: "Passagem entre móveis — folgas funcionais",
    content:
      "Neufert define três faixas de circulação entre móveis: 0,60 m é o mínimo absoluto para uma pessoa passar de lado, usado em becos curtos como entre cama e parede. 0,90 m é a passagem confortável de uma pessoa de frente, ideal para áreas de uso diário como entre sofá e mesa de centro. 1,20 m permite duas pessoas se cruzarem de frente, usado em áreas sociais movimentadas e cozinhas compartilhadas. Em frente a armários, considere 0,90 m mínimo para abrir a porta e ainda passar; em frente a portas pivotantes, 1,00 m. Em frente a gavetas profundas (cozinha) reserve 1,10 m para abrir a gaveta totalmente sem precisar recuar.",
  },
  {
    category: "neufert",
    title: "Folgas em volta da cama de casal",
    content:
      "Para uma cama de casal (1,40-1,80 m × 2,00 m), o Neufert recomenda folga lateral mínima de 0,60 m de cada lado para acessar e fazer a cama. No lado de acesso ao guarda-roupa, considere 0,70 m para abrir portas correr, ou 0,90 m para portas de abrir. Aos pés da cama, 0,60 m sem armário, e 0,90-1,00 m se houver armário, cômoda ou TV de frente, garantindo espaço para vestir e abrir gavetas. Cama encostada na parede em um dos lados é aceitável apenas em quarto de solteiro ou quarto infantil — em casal compromete o uso simétrico. A cabeceira encosta na parede sem folga; janela acima da cabeceira exige peitoril mínimo de 1,40 m.",
  },
  {
    category: "neufert",
    title: "Triângulo de trabalho da cozinha",
    content:
      "O triângulo de trabalho geladeira–pia–fogão é o conceito ergonômico central da cozinha funcional, formalizado por Neufert e amplamente adotado. Cada perna do triângulo deve medir entre 1,20 m (mínimo, evita atropelamento) e 2,70 m (máximo, evita caminhada excessiva). A soma das três pernas idealmente fica entre 4,00 m e 6,60 m. Acima de 6,60 m a cozinha cansa; abaixo de 4,00 m fica apertada e perigosa. A pia geralmente ocupa o vértice central do triângulo por ser o ponto mais usado. O fogão e a geladeira não devem ficar lado a lado — o calor compromete a eficiência da geladeira. Em cozinhas em corredor (paralelas), o triângulo é parcialmente projetado entre as duas bancadas opostas.",
  },
  {
    category: "neufert",
    title: "Bancada de cozinha — alturas e profundidades",
    content:
      "A bancada padrão Neufert tem 0,90 m de altura e 0,60 m de profundidade. A altura pode variar entre 0,85 m (usuário baixo) e 0,95 m (usuário alto) — a regra prática é altura do cotovelo menos 10 cm. Profundidade menor que 0,60 m compromete o uso da pia e do cooktop; maior que 0,65 m dificulta alcançar o fundo. Bancada com cooktop precisa de pelo menos 0,40 m de zona de apoio de cada lado, sendo 0,60 m ideal entre fogão e pia. Bancada para preparo (entre fogão e pia) precisa de 0,80 m mínimo, 1,20 m confortável. A altura do armário aéreo deve ficar entre 1,40 m e 1,50 m da bancada para alcance adequado, com profundidade de 0,30-0,35 m.",
  },
  {
    category: "neufert",
    title: "Distância entre bancadas paralelas (cozinha corredor)",
    content:
      "Em cozinha em formato corredor, com bancadas paralelas, Neufert estabelece distância mínima de 1,20 m entre as faces das bancadas. Esse valor permite uma pessoa abrir a porta do forno embaixo sem encostar na bancada oposta e ainda outra pessoa passar de lado. Para cozinha compartilhada (mais de uma pessoa cozinha simultaneamente), o ideal é 1,50 m. Acima de 1,80 m a cozinha perde eficiência — o triângulo de trabalho fica esticado. Cozinha em L ou U usa o canto como apoio; o ângulo morto do canto resolve-se com gaveteiro giratório ou gabinete em L. Na cozinha com ilha, distância entre bancada de parede e ilha segue a mesma regra: 1,20 m mínimo, 1,50 m ideal.",
  },
  {
    category: "neufert",
    title: "Mesa de jantar — folgas para puxar cadeira",
    content:
      "Mesa de jantar afastada da parede precisa de 0,75 m mínimo entre a borda da mesa e a parede, conforme Neufert — esse é o espaço para puxar a cadeira e sentar. Se atrás da cadeira sentada houver passagem de outra pessoa, considere 1,00 m de folga. Cada comensal ocupa 0,60 m de largura linear na mesa (ombro a ombro), e profundidade de 0,40 m do tampo (pratos, copos). Mesa retangular 4 lugares mínima: 0,80 × 1,20 m. Para 6 lugares: 0,90 × 1,80 m. Para 8 lugares: 1,00 × 2,40 m. Mesa redonda para 4 pessoas: diâmetro 1,00-1,10 m. Para 6 pessoas: 1,30-1,40 m. Para 8 pessoas: 1,60 m. Mesa quadrada acomoda no máximo 4 pessoas confortavelmente.",
  },
  {
    category: "neufert",
    title: "Sala de estar — layout e folgas",
    content:
      "Em sala de estar Neufert recomenda distância de 2,50-3,50 m entre o sofá e a TV (ideal: 2,5x a diagonal da TV em metros). Mesa de centro afastada do sofá em 0,40-0,50 m, permitindo apoiar bebida e ainda esticar as pernas. Entre poltronas e mesa de centro: 0,30 m. Entre o sofá e a parede de fundo (caso encostado): zero, mas reserve 0,10 m se a parede tiver rodapé alto. Circulação atrás do sofá quando solto: 0,80 m mínimo. Conjunto de poltronas em diagonal cria intimidade — afastamento entre os assentos de 0,80-1,20 m. Tapete sob o conjunto deve ultrapassar o sofá em 0,30 m de cada lado.",
  },
  {
    category: "neufert",
    title: "Banheiro — folgas em frente ao vaso e box",
    content:
      "Vaso sanitário ocupa 0,40 × 0,60 m, com folga lateral mínima de 0,20 m de cada lado (Neufert). Em frente ao vaso, deixe 0,60 m livres no mínimo, 0,75 m confortável. Distância entre vaso e bidê: 0,30 m mínimo. Box de chuveiro: 0,90 × 0,90 m mínimo (Neufert recomenda 1,00 × 1,00 m); para acessibilidade NBR 9050, 1,50 × 1,50 m. Pia de banheiro: 0,55 m de largura mínima, profundidade 0,45 m, altura 0,85-0,90 m. Folga em frente à pia: 0,75 m mínimo. Porta do banheiro abre para dentro apenas se a folga interna for suficiente; em banheiro pequeno, abre para fora ou usa porta de correr.",
  },
  {
    category: "neufert",
    title: "Escadas — espelho, piso e fórmula de Blondel",
    content:
      "Em escada residencial, espelho (riser) entre 17 e 18 cm e piso (tread) entre 28 e 30 cm. A fórmula de Blondel (2·espelho + piso ≈ 63-64 cm) garante o passo confortável humano. Largura mínima de escada residencial unifamiliar: 0,90 m; em edifício multifamiliar, 1,20 m. Escada com mais de 16 degraus deve ter patamar intermediário com profundidade igual à largura. Corrimão a 0,80-0,90 m de altura, em pelo menos um lado; em escada acima de 1,20 m de largura, dois corrimãos. Inclinação ideal entre 25° e 35°. Escada em L ou U economiza espaço em planta mas exige patamar. Pé-direito mínimo sobre a escada: 2,10 m em qualquer ponto.",
  },
  {
    category: "neufert",
    title: "Aberturas — dimensões de portas",
    content:
      "Porta de entrada: 0,90-1,00 m de largura, 2,10 m de altura. Porta interna de quarto e sala: 0,80-0,90 m. Porta de banheiro: 0,70-0,80 m, sendo 0,80 m o mínimo para acessibilidade NBR 9050. Porta de cozinha: 0,80 m. Porta de despensa ou dispensa: 0,60-0,70 m. Porta dupla (sala-jantar, sala-varanda): 1,40-1,80 m total. Folha de porta padrão tem 3,5 cm de espessura. Vão livre considerar 5 cm a menos que a largura nominal por causa do batente. Raio de varredura da porta = largura da folha; esse arco não pode invadir circulação principal, móvel ou outra porta. Porta de correr economiza esse arco mas perde isolamento acústico.",
  },
  {
    category: "neufert",
    title: "Aberturas — dimensões de janelas",
    content:
      "Janela de quarto: 1,20-1,50 m de largura, 1,00-1,20 m de altura, peitoril 1,00-1,10 m do piso. Janela de sala: 1,80-2,40 m de largura, podendo ser panorâmica até 3,00 m; altura 1,20-1,50 m, peitoril 0,90-1,00 m. Janela de cozinha: 1,00-1,20 m, peitoril coincide com a bancada (0,90 m). Janela de banheiro: 0,60-0,80 m de largura, basculante alta com peitoril 1,60-1,80 m para garantir privacidade. Janela de área de serviço: 0,80-1,20 m, peitoril 1,20 m. Porta-balcão (sala-varanda): 2,00-2,40 m de largura, altura 2,10 m. Janela maxi-air com altura 2,10 m só em sala de pé-direito alto. A altura total da janela não deve exceder o pé-direito menos 0,30 m (espaço para verga).",
  },
  {
    category: "neufert",
    title: "Guarda-roupa — profundidade e frente",
    content:
      "Guarda-roupa padrão tem profundidade de 0,55-0,65 m, suficiente para cabide na transversal. Profundidade menor que 0,55 m exige cabide em paralelo (perde capacidade). Frente livre para abrir portas: 0,80-1,00 m em portas de abrir; em portas de correr 0,60 m basta. Altura padrão 2,20-2,40 m, com gaveteiro inferior de 0,90 m e cabideiro principal entre 1,10 m e 1,90 m. Largura por módulo: 0,40 m (gaveteiro), 0,60 m (porta simples), 1,00 m (porta dupla). Em closet, circulação interna mínima 0,80 m, ideal 1,00 m. Closet em U exige 1,80 m de largura útil. Sapateira a 0,30-0,45 m do piso, profundidade 0,30 m. Guarda-roupa de canto resolve com módulo de 0,90 × 0,90 m e cabideiro diagonal.",
  },
  {
    category: "neufert",
    title: "Quarto de solteiro — dimensões mínimas",
    content:
      "Quarto de solteiro Neufert: cama 0,90 × 2,00 m, guarda-roupa 1,20 × 0,60 m, mesa de estudo 1,20 × 0,60 m, criado 0,40 × 0,40 m. Área mínima funcional: 7,5-8,0 m². Largura mínima 2,40 m (cama + folga + guarda-roupa). Comprimento mínimo 3,00 m. Quarto de solteiro infantil aceita 6,0 m² se o guarda-roupa for embutido na parede. Beliche reduz a pegada de chão mas exige pé-direito mínimo de 2,50 m com folga de 0,80 m sobre o colchão superior. Janela em parede oposta à porta favorece ventilação cruzada. Cama encostada em duas paredes (canto) é aceitável em criança até 12 anos.",
  },
  {
    category: "neufert",
    title: "Quarto de casal — dimensões mínimas",
    content:
      "Quarto de casal Neufert: cama queen 1,60 × 2,00 m com folga de 0,60 m de cada lado e 0,60 m aos pés, guarda-roupa 2,00-2,40 × 0,60 m, dois criados 0,50 × 0,40 m, e idealmente uma poltrona ou cômoda. Área mínima funcional: 10-12 m². Largura mínima 2,80 m (folga + cama + folga); ideal 3,20 m com guarda-roupa lateral. Comprimento mínimo 3,40 m (cabeceira + cama + folga aos pés + guarda-roupa frontal). Suíte adiciona banheiro próprio (mínimo 3,5 m²) com porta direta no quarto, e idealmente um closet entre quarto e banheiro como câmara acústica e térmica. Janela de quarto deve permitir ventilação noturna sem violar a privacidade — peitoril alto ou basculante.",
  },
  {
    category: "neufert",
    title: "Pé-direito — alturas confortáveis",
    content:
      "Pé-direito mínimo residencial: 2,50 m (NBR 15575). Em corredores, banheiros e closets, aceita-se 2,30 m. Pé-direito alto (3,00-3,50 m) é desejável em sala de estar para sensação de amplitude e melhor distribuição de luz; em quartos, 2,70 m é o ideal. Mezanino exige pé-direito acima do mezanino de 2,40 m mínimo, e abaixo, 2,20 m. Pé-direito reduzido (2,30 m) gera sensação de opressão e prejudica ventilação — só use em ambientes secundários. Em projetos de luxo, sala com pé-direito duplo (5,40-6,00 m) cria espaço-ícone, mas exige climatização cuidadosa. Sob escada interna, o pé-direito mínimo de 2,10 m em qualquer ponto é regra absoluta.",
  },
  {
    category: "neufert",
    title: "Cozinha americana — integração com sala",
    content:
      "Cozinha americana integra a cozinha à sala de estar/jantar via balcão ou abertura ampla. Vantagens: amplia a sensação de espaço, integra famílias, valoriza imóveis pequenos. Desvantagens: odores e fumaça invadem a sala (exige coifa potente, mín. 700 m³/h), barulho de eletrodomésticos, vista da bagunça. Bancada de divisão tem altura padrão 0,90 m do lado da cozinha, podendo ter 1,05-1,10 m do lado da sala (esconde a pia). Largura do balcão: 0,30-0,40 m (apoio), 0,50-0,60 m (almoço com banquetas — duas pessoas exigem 1,20 m de largura). Banqueta tem assento a 0,75-0,80 m do piso para bancada de 1,05 m. Coifa centralizada acima do cooktop, a 0,65-0,75 m da bancada (gás) ou 0,50-0,60 m (indução).",
  },
  {
    category: "neufert",
    title: "Lavanderia / área de serviço",
    content:
      "Área de serviço Neufert: máquina de lavar 0,60 × 0,60 m, tanque 0,55 × 0,40 m, secadora 0,60 × 0,60 m (opcional), prateleiras de produtos. Área mínima funcional: 2,0 m²; recomendada 3,5 m² com varal interno. Largura mínima 1,40 m (máquina + circulação 0,80 m). Bancada sobre máquinas a 0,90 m do piso, profundidade 0,60 m, vira superfície de dobra. Máquina e secadora podem empilhar (lava-seca) economizando 0,60 × 0,60 m. Ventilação obrigatória: janela ou exaustão mecânica. Quadro de luz fica na lavanderia em muitos apartamentos brasileiros — reserve 0,40 × 0,15 m de parede acessível. Tanque com torneira alta (1,20 m) facilita encher balde. Piso com inclinação 1,5% para ralo.",
  },
  {
    category: "neufert",
    title: "Varanda / sacada — dimensões",
    content:
      "Varanda residencial: profundidade mínima 1,20 m para acomodar mesa pequena e cadeiras encostadas no parapeito. Profundidade ideal 1,80-2,40 m (mesa + cadeira + circulação). Largura segue a sala adjacente, geralmente 3,00-5,00 m. Parapeito (peitoril/guarda-corpo): altura mínima 1,10 m até 12 m do piso e 1,30 m acima. Espaçamento de balaústres ≤ 11 cm (segurança infantil, NBR 14718). Piso com inclinação 1% para fora ou para o ralo. Cobertura preferencial — varanda totalmente exposta perde uso por chuva. Iluminação artificial impermeável (IP 65). Ponto de gás e água para churrasqueira/pia em varanda gourmet, posicionado a 0,90 m do piso.",
  },
  {
    category: "neufert",
    title: "Hall de entrada — dimensões e função",
    content:
      "O hall de entrada (ou átrio) é uma zona de transição que evita visão direta da sala/cozinha logo na porta. Profundidade mínima 1,00 m, largura mínima 1,20 m. Considere espaço para um aparador (0,80-1,20 × 0,30 m) com gaveta de chaves, espelho acima e rack de sapatos baixo. Em apartamentos pequenos o hall vira apenas um afunilamento — uma parede curta de 0,80 m após a porta basta para criar a transição visual. Hall amplo (≥ 4 m²) acomoda banco, cabide e armário fechado para casacos. Iluminação cênica (luminária pendente) marca o ambiente. Piso resistente: porcelanato ou pedra, evite madeira (entrada de água).",
  },
  {
    category: "neufert",
    title: "Sofá — dimensões e arranjo",
    content:
      "Sofá Neufert: assento 0,45-0,50 m de altura, 0,55-0,60 m de profundidade útil, 0,60 m de largura por lugar. Sofá 2 lugares: 1,60-1,80 × 0,90 m. Sofá 3 lugares: 2,00-2,20 × 0,90 m. Sofá 4 lugares: 2,40-2,80 × 0,90 m. Chaise: 1,60-1,80 × 0,90 m, anexa ao sofá em L. Cabe um sofá de 3 lugares em sala com pelo menos 3,20 m de parede livre. Conjunto sofá + 2 poltronas exige sala mínima 4,00 × 3,50 m. Sofá flutuante (afastado da parede): reserve 0,80 m atrás. Encosto alto (0,90 m) para sofá de descanso; baixo (0,75 m) para sofá social. Não posicione sofá com encosto para a entrada — gera desconforto perceptivo.",
  },
  {
    category: "neufert",
    title: "Home office — ergonomia da escrivaninha",
    content:
      "Escrivaninha Neufert: 1,20-1,60 m de largura, 0,60-0,75 m de profundidade, altura 0,72-0,75 m. Cadeira ergonômica regulável (0,42-0,50 m altura do assento). Espaço para as pernas embaixo: 0,60 m profundidade × 0,55 m largura mínimos. Folga atrás da cadeira: 0,75 m para deslizar e levantar. Folga lateral para acessar gaveteiro: 0,60 m. Iluminação: luminária de mesa com braço articulado, complementando luz geral; tela do monitor perpendicular à janela (evita reflexo). Tomadas a 0,30 m do piso (rede, energia, USB) ou na própria mesa (caixa de tomada embutida). Estante de apoio atrás ou ao lado: profundidade 0,30 m. Quarto-escritório: prever 6 m² mínimo, com isolamento acústico.",
  },
  {
    category: "neufert",
    title: "Hall de elevador / circulação coletiva",
    content:
      "Em edifício multifamiliar, hall do elevador: profundidade mínima 1,80 m em frente à porta do elevador, largura igual à porta + 0,60 m de cada lado. Considere a abertura simultânea de duas portas opostas (apartamentos). Iluminação automática com sensor. Espaço para extintor de incêndio (0,30 × 0,30 m a 1,60 m de altura). Hall de pavimento que serve mais de 4 apartamentos: 5 m² mínimo. Pé-direito 2,40 m mínimo. Acabamento durável (porcelanato, pedra) — alto tráfego e carrinhos de mudança. Caixa de correios na entrada do prédio, não no andar (norma postal). Porta corta-fogo da escada deve abrir para o hall, não invadir a saída. Sinalização de emergência fotoluminescente obrigatória.",
  },
  {
    category: "neufert",
    title: "Despensa — dimensões e organização",
    content:
      "Despensa: profundidade 0,60-0,80 m (prateleiras 0,30 m + circulação 0,30-0,50 m). Largura mínima 1,00 m, recomendada 1,20-1,50 m. Despensa walk-in: profundidade 1,80 m, com prateleiras dos dois lados (0,30 m cada) e circulação 0,80-1,00 m central. Prateleiras a 0,30, 0,60, 1,00, 1,40, 1,80 e 2,10 m do piso. Profundidade da prateleira: 0,30 m (latas, caixas), 0,40 m (eletroportáteis). Iluminação obrigatória — sensor de presença economiza energia. Ponto de tomada para freezer auxiliar. Ventilação passiva (grelha alta + baixa) controla umidade. Despensa fica idealmente entre cozinha e área de serviço, com porta para a cozinha. Piso lavável (porcelanato).",
  },
  {
    category: "neufert",
    title: "Escada de uso eventual / corrimão",
    content:
      "Escada secundária (acesso a depósito, mezanino íntimo): largura mínima 0,80 m. Espelho até 19 cm e piso até 25 cm aceito apenas em escada de serviço; para escada principal mantenha 17 cm × 28-30 cm. Escada caracol: diâmetro mínimo 1,40 m (uso eventual), 1,80 m (uso diário). Escada marinheiro (vertical): só para sótão técnico, nunca como acesso residencial. Corrimão deve ter empunhadura 4-5 cm de diâmetro, fixado a 0,80-0,90 m de altura, prolongado 0,30 m antes e depois da escada (acessibilidade NBR 9050). Em escada de mais de 1,20 m de largura, dois corrimãos. Em escada com criança, segundo corrimão a 0,55 m. Cor do corrimão contrastante com a parede para deficiência visual.",
  },
  {
    category: "neufert",
    title: "Cama de criança e quarto infantil",
    content:
      "Cama infantil 0-3 anos (berço): 0,70 × 1,30 m, com proteções laterais. Cama 3-6 anos: 0,80 × 1,60 m. Cama solteiro 6+ anos: 0,90 × 2,00 m. Quarto infantil: prever zonas distintas — dormir, brincar, estudar. Mesa baixa (0,50 m) para crianças até 6 anos; depois cresce para mesa adulta (0,72-0,75 m). Tapete grande na zona de brincar para isolamento térmico. Tomadas com proteção (criança até 6 anos). Janela com peitoril mínimo 1,40 m ou trava de segurança. Beliche permitido a partir de 6 anos, com proteção e escada inclinada. Armário acessível à criança: cabideiro a 1,00 m (alcance) com prateleiras altas para o adulto guardar coisas perigosas.",
  },
  {
    category: "neufert",
    title: "Antropometria — alcances de uso humano",
    content:
      "O Neufert fundamenta-se na antropometria: altura média do brasileiro adulto 1,70 m (homem), 1,60 m (mulher). Alcance vertical em pé com braço estendido: 2,10 m (mulher), 2,20 m (homem) — limite para prateleira sem escada. Alcance lateral: 0,80 m. Plano de trabalho confortável: altura do cotovelo menos 10 cm — 0,90 m em média. Linha do olhar adulto em pé: 1,50-1,60 m (altura do quadro). Linha do olhar sentado: 1,15 m. Largura média do quadril: 0,40 m. Largura dos ombros: 0,45 m (mulher), 0,50 m (homem). Profundidade lombar a joelho sentado: 0,55 m. Esses números fundamentam todas as folgas e dimensões de mobiliário.",
  },
  {
    category: "neufert",
    title: "Suíte e closet — sequência de zonas",
    content:
      "Suíte ideal: quarto → closet → banheiro, sequência que separa o ruído do banheiro do dormir, e usa o closet como câmara intermediária. Closet mínimo: 4 m² com cabideiros em uma parede e circulação 0,80 m; 6 m² com cabideiros em duas paredes (frente a frente, 1,80 m de largura total). Banheiro de suíte: 4-6 m², separado do closet por porta (vapor não dá no roupa). Em apartamento compacto, suíte direta sem closet: porta do banheiro próxima à cabeceira (não ao pé da cama), evitando que o usuário do banheiro caminhe sobre a cama na visual. Janela do banheiro de suíte para fora ou para shaft, nunca para o quarto.",
  },
  {
    category: "neufert",
    title: "Garagem / vaga de carro",
    content:
      "Vaga de garagem residencial: 2,40 × 5,00 m mínimo (carro pequeno/médio); 2,50 × 5,50 m (carro grande/SUV). Em condomínio, vaga acessível NBR 9050: 3,70 × 5,00 m com faixa adicional de 1,20 m para cadeira de rodas. Circulação atrás do carro: 5,50 m mínimo (raio de manobra). Pé-direito da garagem: 2,30 m mínimo, evitando lustres baixos. Em garagem fechada residencial (1-2 carros), 6,00 × 5,50 m (12 m² por carro + manobra). Box de garagem com porta basculante exige vão livre 2,40 m. Ventilação obrigatória (grelhas altas e baixas) por causa de monóxido. Piso com inclinação 1% para ralo central. Iluminação 100 lux mínimo, com tomada para carregar carro elétrico (220V/16-32A).",
  },
  {
    category: "neufert",
    title: "Mobília múltipla — sala com sofá-cama",
    content:
      "Sofá-cama em sala secundária: considere o espaço aberto (0,90 × 2,00 m) na frente do sofá, mais 0,60 m de circulação. Sala de 12 m² com sofá-cama 2 lugares (1,80 × 0,90) + cama aberta (1,80 × 2,00) + circulação 0,60 m exige 4,00 × 3,00 m. Bicama (cama embutida embaixo da cama) economiza para visita eventual. Mesa retrátil de parede: profundidade fechada 0,15 m, aberta 0,80 m — útil em quitinete. Cama beliche em quarto-escritório: cama em cima (0,90 × 2,00 m) e mesa embaixo (1,40 × 0,60 m) — exige pé-direito 2,60 m. Sofá modular permite reconfiguração — vantagem em sala de uso variável.",
  },

  // ============================================================
  // NBR 15575 — Desempenho de edifícios habitacionais (15 chunks)
  // ============================================================
  {
    category: "nbr-15575",
    title: "NBR 15575 — visão geral e aplicação",
    content:
      "A NBR 15575 (Norma de Desempenho) estabelece requisitos mínimos de desempenho para edificações habitacionais brasileiras, em vigor desde 2013. Aplica-se a edifícios novos com até 5 pavimentos (parte 1 a 6). Define critérios em seis sistemas: estrutural, vedações, pisos, coberturas, instalações hidrossanitárias e elétricas. Para cada critério há três níveis: M (mínimo, obrigatório), I (intermediário) e S (superior). A norma é referenciada pelo Código de Defesa do Consumidor — incorporadora que entrega abaixo do nível M responde judicialmente. Para o arquiteto, a norma define áreas mínimas funcionais, ventilação, iluminação, acústica, durabilidade, e segurança contra incêndio. Sempre cite a NBR 15575 ao justificar áreas mínimas e ventilação.",
  },
  {
    category: "nbr-15575",
    title: "Áreas mínimas de cômodos residenciais",
    content:
      "Embora a NBR 15575 não fixe áreas absolutas, o Código de Obras municipal (geralmente alinhado à norma) estabelece referências comuns: sala de estar/jantar ≥ 12 m² (móveis básicos: sofá, TV, mesa de 4 lugares); dormitório de casal ≥ 12 m² (cama queen + criados + guarda-roupa + circulação); dormitório solteiro ≥ 8 m²; cozinha ≥ 4 m² (mínimo absoluto), recomendado ≥ 6 m² (tringulo de trabalho funcional); banheiro ≥ 2,5 m² (vaso + pia + box); área de serviço ≥ 2 m² (máquina + tanque). Áreas abaixo destes valores comprometem o desempenho funcional e podem ser reprovadas em alvará. Em HIS (Habitação de Interesse Social), aceita-se quarto solteiro de 7,0 m² em casos específicos.",
  },
  {
    category: "nbr-15575",
    title: "Iluminação natural — vão de janela mínimo",
    content:
      "A NBR 15575 e os Códigos de Obras estabelecem que dormitórios e salas devem ter vão de iluminação natural ≥ 1/6 da área de piso do cômodo. Exemplo: quarto de 12 m² exige janela com 2 m² de vão de iluminação (ex: 1,40 × 1,40 m). Cozinha exige 1/8 ou 1/6 dependendo do município. Banheiro pode ser ventilado mecanicamente, dispensando janela. O vão de iluminação é a área da abertura sem caixilho/marco — esquadria de alumínio com 90% de aproveitamento; janela com bandeira fixa só conta a parte que ilumina. Cômodos voltados para área coberta (varanda profunda) podem ter o vão majorado. Iluminação artificial complementa, nunca substitui.",
  },
  {
    category: "nbr-15575",
    title: "Ventilação natural — vão efetivo",
    content:
      "O vão efetivo de ventilação ≥ 1/2 do vão de iluminação (NBR 15575/Códigos). Para janela de iluminação 2 m², vão de ventilação ≥ 1,0 m² (parte que abre efetivamente). Janela de correr abre 50% do vão; basculante 100%; máxim-ar 100%; pivotante 60-70%. Ventilação cruzada (entrada e saída em paredes opostas) é obrigatória em quartos e salas para conforto térmico. Em apartamento, considere a porta do cômodo como saída de ar se houver janela em outra fachada do apartamento. Banheiro sem janela exige shaft de ventilação mecânica com vazão mínima 15 m³/h por sanitário (NBR 15575). Cozinha sem janela exige coifa com saída para o exterior, vazão ≥ 90 m³/h.",
  },
  {
    category: "nbr-15575",
    title: "Pé-direito mínimo",
    content:
      "Pé-direito mínimo de cômodo de longa permanência (sala, dormitório, escritório): 2,50 m (NBR 15575). Em corredores, banheiros, despensa e área de serviço: 2,30 m. Pé-direito sob viga ou tubulação: 2,30 m em qualquer ponto. Em sótão ou cobertura inclinada, pé-direito médio 2,50 m com mínimo 1,50 m no ponto mais baixo (área inclinada conta como 50%). Em mezanino, 2,40 m acima e 2,20 m abaixo. Pé-direito de garagem 2,30 m. Pé-direito de hall coletivo 2,40 m. Cidades específicas (São Paulo, Rio) podem exigir 2,60 m em sala. Pé-direito acima de 3,00 m exige climatização cuidadosa por causa do volume de ar.",
  },
  {
    category: "nbr-15575",
    title: "Desempenho acústico — índices mínimos",
    content:
      "A NBR 15575-3 estabelece índices acústicos mínimos. Parede entre apartamentos vizinhos: Rw ≥ 45 dB (mínimo M), 50 dB (intermediário), 55 dB (superior). Parede entre dormitório e área comum: Rw ≥ 45 dB. Parede de banheiro/cozinha de vizinho com dormitório: 50 dB. Piso entre apartamentos: L'nT,w ≤ 80 dB (M), ≤ 65 dB (S) para ruído de impacto. Janela voltada para via movimentada: Rw ≥ 25 dB (vidro 6 mm), 35 dB (vidro duplo). Para garantir, usar parede dupla com manta acústica entre apartamentos, contrapiso flutuante e batente de porta com vedação. Falha acústica é a principal queixa pós-ocupação no Brasil.",
  },
  {
    category: "nbr-15575",
    title: "Desempenho térmico — zonas bioclimáticas",
    content:
      "A NBR 15575-1 divide o Brasil em 8 zonas bioclimáticas. Zona 1 (Sul frio) e 2: ênfase em isolamento e exposição solar. Zona 3-6 (maior parte do país): ênfase em ventilação e proteção solar. Zonas 7-8 (Norte/Nordeste quente úmido): máxima ventilação cruzada, paredes leves. Transmitância térmica máxima das paredes: U ≤ 3,7 W/m²K em zonas quentes; ≤ 2,5 W/m²K em zonas frias. Capacidade térmica das paredes: ≥ 130 kJ/m²K em zonas frias. Cobertura: U ≤ 2,3 W/m²K cor clara, ≤ 1,5 cor escura. Janelas em fachada exposta ao sol da tarde devem ter brise, persiana ou vidro de controle solar. Telhado com isolamento térmico (lã de vidro/PIR) reduz 4-6 °C na laje.",
  },
  {
    category: "nbr-15575",
    title: "Durabilidade — vida útil de projeto",
    content:
      "A NBR 15575 estabelece vida útil de projeto (VUP) por sistema. Estrutura: ≥ 50 anos. Vedações verticais externas: ≥ 40 anos. Coberturas: ≥ 20 anos. Pisos internos: ≥ 13 anos. Esquadrias: ≥ 20 anos. Instalações hidráulicas: ≥ 20 anos (tubulações), 30 anos (caixas). Instalações elétricas: ≥ 30 anos. Pintura externa: ≥ 8 anos. O arquiteto deve especificar materiais compatíveis com a VUP — porcelanato (vida útil 50+ anos) é adequado para área molhada permanente; laminado de média qualidade (vida útil 8 anos) não atende sem reformas. Documente a manutenção preventiva no Manual do Proprietário (entregue na chave).",
  },
  {
    category: "nbr-15575",
    title: "Estanqueidade à água — vedações",
    content:
      "Vedações verticais externas devem ser estanques à água da chuva (NBR 15575). Fachada exposta a chuva dirigida exige impermeabilização ou pintura elastomérica. Janela em fachada deve ter pingadeira (gota d'água) na verga e contramarco com transpasse de borracha. Banheiro: impermeabilização do piso e parede do box até 1,80 m, parede ao redor do vaso até 0,30 m. Sacada com piso impermeável e ralo. Cobertura: telhado com inclinação ≥ 30% (telha cerâmica) ou laje impermeabilizada com manta asfáltica + camada de proteção. Subsolo: impermeabilização externa (manta) e sistema de drenagem. Caixa d'água: impermeabilização interna obrigatória.",
  },
  {
    category: "nbr-15575",
    title: "Segurança contra incêndio — apartamentos",
    content:
      "A NBR 15575 e a NBR 9077 (saídas de emergência) exigem: porta corta-fogo PRF-30 ou PRF-60 entre apartamento e hall, em edifícios acima de 12 m. Distância máxima da porta do apartamento até a saída de emergência: 30 m em corredor com sprinkler, 20 m sem. Detector de fumaça obrigatório no hall e dormitórios em edifícios novos (Lei 13.425/2017). Material de revestimento da fuga (corredor, escada): classe IIA (baixa propagação). Cozinha em apartamento exige extintor PQS 4 kg ou ABC 4 kg. Hidrante de parede a cada 30 m no hall coletivo. Janela do dormitório acessível por escada Magirus do bombeiro: peitoril ≤ 1,10 m e vão ≥ 0,80 × 1,20 m.",
  },
  {
    category: "nbr-15575",
    title: "Instalações hidráulicas — pontos por cômodo",
    content:
      "A NBR 15575-6 e NBR 5626 definem pontos hidráulicos mínimos. Cozinha: pia (água fria + quente opcional) + máquina de lavar louças (1 ponto AF). Lavanderia: tanque + máquina lavar (2 pontos AF). Banheiro: vaso (1 AF) + pia (1 AF + opcional AQ) + chuveiro (1 AF + 1 AQ). Área externa (varanda gourmet): ponto AF para pia/churrasqueira. Pressão mínima na peça: 5 kPa (chuveiro), 15 kPa (válvula de descarga). Tubulação de água quente em PEX, PPR ou cobre — não use PVC. Esgoto primário ≥ 100 mm para vaso, secundário 50 mm para pia/chuveiro. Caixa de gordura na saída da cozinha. Ventilação de coluna de esgoto sobe até telhado.",
  },
  {
    category: "nbr-15575",
    title: "Instalações elétricas — circuitos",
    content:
      "A NBR 5410 (referenciada pela NBR 15575) exige circuitos separados: iluminação (sem tomadas), tomadas de uso geral (TUG), tomadas de uso específico (TUE — chuveiro, ar-condicionado, máquina). Cada cômodo deve ter ao menos 1 ponto de luz; banheiro com luminária IPX4 mínimo. Tomadas: cozinha mín. 1 a cada 3,5 m de bancada (2 acima da bancada por trecho); sala mín. 4 (TV, sofá×2, parede livre); quarto mín. 4 (cabeceira×2, escrivaninha, parede livre); banheiro mín. 1 ao lado da pia (IPX4). Disjuntor por circuito com proteção DR (diferencial residual) obrigatória em áreas molhadas. Quadro de distribuição em local acessível (lavanderia/hall).",
  },
  {
    category: "nbr-15575",
    title: "Acessibilidade básica — apartamento padrão",
    content:
      "A NBR 15575 não obriga acessibilidade plena em todos apartamentos, mas exige adaptabilidade — paredes não estruturais que possam ser modificadas, portas com vão livre 0,80 m mínimo (em vez de 0,70 m), banheiro com área que permita futura conversão. Reservas de tubulação que facilitem futura instalação de barras de apoio. Lei municipal pode exigir % de unidades acessíveis em condomínio (geralmente 3-5%). Em edifício comercial e empreendimento HIS público, acessibilidade plena (NBR 9050) é obrigatória em rotas, áreas comuns e percentual de unidades. Acessibilidade no apartamento: porta de entrada 0,90 m, banheiro com vão de giro 1,50 m, cozinha com bancada altura ajustável.",
  },
  {
    category: "nbr-15575",
    title: "Áreas comuns de condomínio",
    content:
      "Em edifício multifamiliar, áreas comuns dimensionadas pela NBR 15575 e Códigos: hall de entrada 5 m² mínimo; portaria com balcão (1,20 × 0,60 m) e bay window. Bicicletário: 0,60 × 1,80 m por bicicleta; mín. 1 vaga por unidade em municípios urbanos. Salão de festas: 1,2-1,5 m² por morador adulto previsto. Espaço gourmet: prever pia + churrasqueira + bancada 2,40 m + mesa para 8 pessoas. Espaço fitness: 30-50 m² para edifício de 50 unidades (1 esteira, 1 elíptica, peso livre). Brinquedoteca: 20 m² mínimo. Piscina adulto: 4,00 × 8,00 m mín. Piscina infantil: 2,50 × 4,00 m, profundidade 0,30-0,40 m. Lavanderia coletiva (em estúdios) opcional, 2-3 máquinas/30 unidades.",
  },
  {
    category: "nbr-15575",
    title: "Manual do Proprietário — entrega obrigatória",
    content:
      "A NBR 15575 (e a NBR 14037) obriga a entrega do Manual do Proprietário e Manual das Áreas Comuns com a chave. Conteúdo: descrição do imóvel, materiais usados, plantas as built, garantias, prazos, prazos de manutenção preventiva (pintura cada 3-4 anos, impermeabilização a cada 10), o que descaracteriza a garantia (reformas estruturais sem ART). Para o arquiteto, isso significa documentar especificações (planilha de acabamentos) e fornecer ao construtor. Garantia de 5 anos para vícios construtivos (Código Civil + CDC). Manutenção preventiva malfeita = perda de garantia. Síndico obriga moradores a apresentar comprovantes de manutenção em obras individuais (laudos de impermeabilização).",
  },

  // ============================================================
  // NBR 9050 — Acessibilidade (10 chunks)
  // ============================================================
  {
    category: "nbr-9050",
    title: "NBR 9050 — visão geral",
    content:
      "A NBR 9050 (atualizada em 2020) é a norma brasileira de acessibilidade a edificações, mobiliário, espaços e equipamentos urbanos. Aplica-se obrigatoriamente a edifícios públicos, comerciais e em parte das unidades residenciais (condomínios). Define rotas acessíveis, sinalização tátil/visual, dimensões de mobiliário e equipamentos, alcances de pessoa em cadeira de rodas, idoso, gestante, criança e PcD visual. O arquiteto cita NBR 9050 ao justificar largura de porta (0,80 m mínimo), corredor (1,20 m, com 1,50 m de giro a cada 25 m), rampa (inclinação máx 8,33%), barra de apoio, lavabo PcD, vaga de garagem PcD, balcão de atendimento rebaixado.",
  },
  {
    category: "nbr-9050",
    title: "Cadeira de rodas — módulo de referência",
    content:
      "A NBR 9050 define o módulo de referência (MR) da cadeira de rodas: 0,80 × 1,20 m (área ocupada pelo usuário). Faixa livre para deslocamento: 0,90 m (passagem reta). Área de manobra com rotação 90°: 1,20 × 1,20 m. Rotação 180°: 1,20 × 1,50 m. Rotação 360°: círculo de 1,50 m de diâmetro. Em ambientes acessíveis, garantir um ponto de giro 1,50 m por cômodo. Banheiro acessível: 1,50 m de giro entre vaso, pia e box. Cozinha acessível: corredor central 1,50 m, bancada com altura ajustável (0,75-0,85 m) e vão livre embaixo de 0,73 m altura × 0,30 m profundidade.",
  },
  {
    category: "nbr-9050",
    title: "Rampa — inclinação e dimensões",
    content:
      "Rampa acessível NBR 9050: inclinação máxima 8,33% (1:12) para desnível até 1,50 m. Para desníveis maiores, inclinação máxima 6,25% (1:16). Largura mínima 1,20 m, recomendada 1,50 m. Patamar a cada 1,50 m de desnível, com 1,20 m de comprimento mínimo. Patamar de início e fim com 1,20 m, em frente a porta acrescer espaço para abrir. Corrimão dos dois lados, em duas alturas (0,70 m e 0,92 m), prolongado 0,30 m antes e depois. Guia de balizamento (mureta) a 0,05 m de altura nas laterais. Piso antiderrapante. Sinalização tátil de alerta no topo e base. Inclinação transversal (caimento) máx 2%.",
  },
  {
    category: "nbr-9050",
    title: "Banheiro acessível — dimensões",
    content:
      "Banheiro acessível NBR 9050: área mínima útil considerando MR + giro de 1,50 m. Tamanho típico 1,80 × 2,40 m (4,3 m²). Vaso a 0,46 m do piso (0,43-0,45 m + assento) com barra horizontal lateral (0,80 m comprimento, a 0,75 m do piso) e barra atrás (0,40-0,50 m). Lavatório suspenso a 0,80 m do piso, com 0,73 m de vão livre embaixo (joelho da cadeira). Box de chuveiro 1,50 × 1,50 m com banco basculante a 0,46 m, ducha de mão flexível, barra L (vertical e horizontal). Porta com vão livre 0,80 m, abrindo para fora. Trincos tipo alavanca. Espelho inclinado ou comum a 0,90 m (base) — alcance visual sentado.",
  },
  {
    category: "nbr-9050",
    title: "Porta acessível",
    content:
      "Porta acessível NBR 9050: vão livre mínimo 0,80 m (folha 0,90 m considerando batente). Recomendado 0,90 m de vão livre. Maçaneta tipo alavanca a 0,90-1,10 m do piso. Porta de banheiro acessível abre para fora (segurança em caso de queda). Em frente à porta, área de aproximação: 1,20 × 1,50 m. Atrás da porta após abertura: 1,50 m para giro da cadeira. Porta com mola de retorno: força máxima 36 N (1° fase) e 45 N (2° fase). Visor a 1,40 m do piso para criança/cadeirante. Porta de vidro com sinalização horizontal (faixa) a 1,00 m e a 1,50 m. Porta de duas folhas: pelo menos uma com 0,80 m mínimo.",
  },
  {
    category: "nbr-9050",
    title: "Corredor acessível",
    content:
      "Corredor acessível NBR 9050: largura mínima 0,90 m em trecho até 4,00 m (residência); 1,20 m em trecho até 10,00 m (comercial); 1,50 m em corredor longo ou de muito tráfego. A cada 25 m, área de descanso/manobra de 1,50 × 1,50 m. Em residência acessível, corredor 1,20 m com bolsão de giro 1,50 × 1,50 m em pelo menos um ponto. Maçanetas de portas adjacentes não devem se chocar. Piso uniforme, sem desníveis acima de 0,5 cm; desnível 0,5-1,5 cm exige rebaixamento; acima 1,5 cm exige rampa. Iluminação 100 lux mínima. Não usar tapete solto (risco de tropeço).",
  },
  {
    category: "nbr-9050",
    title: "Vaga de garagem acessível",
    content:
      "Vaga acessível NBR 9050: 2,50 × 5,00 m com faixa lateral adicional de 1,20 m de largura para descida e manobra da cadeira. Total: 3,70 × 5,00 m. Sinalização horizontal (símbolo internacional de acesso) e vertical. Localização próxima à entrada (até 50 m). Piso firme e nivelado. Em condomínio: 2% das vagas, mínimo 1, devem ser acessíveis. Em comércio com mais de 100 vagas: 1% acessível. Vaga para idoso: 5% (NBR 9050), sem faixa adicional, próximo à entrada. Rota acessível conectando a vaga até a entrada do edifício, sem obstáculos, com inclinação ≤ 2% transversal e 8,33% longitudinal.",
  },
  {
    category: "nbr-9050",
    title: "Sinalização tátil — piso podotátil",
    content:
      "Piso tátil NBR 9050 tem dois tipos: alerta (relevo de pinos circulares) e direcional (relevo de barras paralelas). Alerta: usado para indicar perigo (início/fim de escada, rampa, plataforma) — faixa de 0,40-0,60 m de largura. Direcional: usado para guiar percurso (em hall amplo, calçada, plataforma) — faixa de 0,20-0,40 m. Cor contrastante com o piso adjacente. Distância mínima entre alerta e obstáculo: 0,30 m. Em escada, alerta no topo do primeiro degrau e na base do último, com 0,60 m de largura cobrindo todo o vão. Em plataforma de embarque, alerta paralelo à borda, a 0,30 m. Não use em rota de cadeira de rodas pura (gera trepidação) — use direcional pontual.",
  },
  {
    category: "nbr-9050",
    title: "Balcão de atendimento acessível",
    content:
      "Balcão acessível NBR 9050: parte rebaixada com altura 0,75-0,85 m, profundidade ≥ 0,30 m, vão livre embaixo de 0,73 m altura × 0,30 m profundidade × 0,80 m largura para joelho de cadeirante. Largura do balcão acessível ≥ 0,80 m. Em edifício comercial, ≥ 5% dos balcões acessíveis (mínimo 1 por tipo de atendimento). Sinalização visual e tátil indicando o ponto acessível. Caixa registradora: acima da bancada acessível com display a 1,40 m máx (alcance visual sentado). Atendimento prioritário: idoso, gestante, PcD, lactante — fila preferencial sinalizada. Balcão de bar/restaurante acessível: complementa o balcão alto padrão (1,10 m), não substitui.",
  },
  {
    category: "nbr-9050",
    title: "Elevador acessível",
    content:
      "Elevador acessível NBR 9050 (NBR NM 313): cabine mínima 1,10 × 1,40 m (passageiro padrão); 1,40 × 1,80 m em prédio de hospital. Porta com vão 0,80 m mínimo, 0,90 m recomendado. Botão de chamada externo a 0,90-1,10 m do piso. Botões internos a 0,89-1,35 m, com sinalização Braille e relevo. Espelho na parede oposta à porta para visualização traseira pelo cadeirante. Corrimão em três paredes, a 0,80-0,90 m. Sinalização visual e sonora de andar. Plataforma vertical (acessibilidade até 4 m): mínima 0,90 × 1,40 m. Em residência multifamiliar, edifício acima de 12 m exige elevador acessível em pelo menos uma cabine (Lei municipal pode reforçar).",
  },

  // ============================================================
  // ORIENTAÇÃO SOLAR — Hemisfério sul/Brasil (8 chunks)
  // ============================================================
  {
    category: "orientacao-solar",
    title: "Norte — a melhor orientação no Brasil",
    content:
      "No hemisfério sul (todo o Brasil), a face norte é a que recebe sol durante o ano todo: forte no inverno (sol baixo, entra fundo no cômodo, aquece) e moderado no verão (sol alto, brise/varanda barram facilmente). É a melhor orientação para sala de estar e quarto principal. Janela voltada para norte permite iluminação consistente o ano inteiro e ventilação saudável. Em zonas frias (Sul do Brasil), maximize a janela ao norte para ganho térmico no inverno. Em zonas quentes (Nordeste), a face norte ainda é boa, mas use beiral de 0,80-1,20 m ou brise horizontal para barrar o sol do verão. Apartamento de frente norte tem valor comercial superior em geral.",
  },
  {
    category: "orientacao-solar",
    title: "Leste — sol da manhã",
    content:
      "A face leste recebe sol da manhã (6h-12h), com intensidade média e ângulo baixo. Ideal para cozinha (ilumina o café da manhã), dormitório (acordar com luz natural — efeito biológico positivo) e sala de jantar de uso matinal. À tarde, a face leste fica em sombra, esfriando o cômodo — vantagem em verão. Pouco aquecimento direto, baixa carga térmica. Em apartamento, dormitório a leste é confortável: claro de manhã, fresco à tarde. Cozinha a leste favorece o preparo de refeições com luz natural (reduz consumo elétrico de manhã). Brise vertical pode ser dispensável a leste devido ao ângulo baixo do sol matinal.",
  },
  {
    category: "orientacao-solar",
    title: "Oeste — sol forte da tarde",
    content:
      "A face oeste recebe o sol da tarde (12h-18h), com intensidade alta e penetração profunda no cômodo no verão (sol baixo no fim do dia). Carga térmica acumulada — o cômodo fica quente até a noite. Evite quartos voltados para oeste (sono prejudicado por calor). Boa para área de serviço (seca rápido), depósito, garagem. Se sala/cozinha estiver a oeste, use brise vertical, persiana externa, vidro de controle solar (low-e) ou varanda profunda como sombreamento. Em apartamento, depreciar o valor comercial da face oeste em 5-10% comparado ao norte. No Sul do Brasil, oeste é mais aceitável (inverno frio compensa).",
  },
  {
    category: "orientacao-solar",
    title: "Sul — pouca luz direta",
    content:
      "A face sul recebe sol apenas durante poucas horas no verão (sol alto), e quase nada no inverno. Iluminação difusa o ano inteiro. Boa para banheiro (luz suave, não fade nos azulejos), despensa (frescor), depósito, área de serviço, escritório (sem ofuscamento na tela). Evite voltar quarto principal e sala para sul em zona fria — frio e úmido o ano todo. No Nordeste (zona quente), sul é boa orientação para dormitórios (frescor). Sul em fachada externa exige atenção à infiltração: chuva geralmente vem do quadrante sul/sudeste, exigindo pingadeira nas janelas e impermeabilização reforçada.",
  },
  {
    category: "orientacao-solar",
    title: "Nordeste e noroeste — orientações intermediárias",
    content:
      "Nordeste: combina sol da manhã (leste) com luz constante (norte). Excelente orientação para dormitórios e sala — luz boa o dia todo, sem o calor extremo do oeste. Em apartamento, nordeste é a orientação mais valorizada após norte puro. Noroeste: combina norte com tarde (oeste). Recebe sol da tarde, com carga térmica considerável. Aceitável para sala se houver brise/varanda. Evite para dormitórios. Sudeste: pouca luz direta, iluminação suave, frescor. Boa para escritório, banheiro. Sudoeste: sol da tarde no inverno, escuro no verão. Pouco usado para ambientes principais. Em Brasília, Goiânia (latitude baixa), as diferenças entre noroeste e oeste se acentuam.",
  },
  {
    category: "orientacao-solar",
    title: "Ângulos solares por estação",
    content:
      "No solstício de verão (21 dez), o sol no meio-dia em São Paulo (lat 23°S) atinge altitude de ~88° (quase a pino). Brise horizontal de 0,50 m bloqueia 100% do sol direto na janela. No solstício de inverno (21 jun), altitude no meio-dia é ~43° — o sol entra fundo na sala voltada ao norte (até 5 m de profundidade na janela de 1,20 m), aquecendo. Equinócios (21 mar e 23 set): altitude 66°. Esse comportamento sazonal é a vantagem do norte: brise barra o sol do verão e deixa entrar o do inverno. No nordeste (Recife, lat 8°S), o sol nunca passa muito ao sul — diferenças sazonais menores. Em Porto Alegre (lat 30°S), o inverno é mais marcante e a fachada norte é determinante.",
  },
  {
    category: "orientacao-solar",
    title: "Brise e proteção solar",
    content:
      "Brise (quebra-sol) controla a entrada de sol direto preservando luz e ventilação. Brise horizontal: barras paralelas ao plano da janela, projetadas 0,40-0,80 m. Eficaz no norte (sol alto no verão), inadequado no leste/oeste (sol baixo passa por baixo). Brise vertical: barras perpendiculares à fachada, eficaz no leste e oeste (sol baixo bloqueado). Brise misto: para fachada noroeste/nordeste com sol em ângulos variados. Distância entre as lâminas: 0,30-0,50 m. Material: alumínio (durável, leve), madeira (estética, demanda manutenção). Cobogó é uma alternativa econômica e ventilada. Persiana externa (rolô) é o brise dinâmico — funciona em qualquer fachada. Vidro low-e reduz radiação sem bloquear luz.",
  },
  {
    category: "orientacao-solar",
    title: "Ventilação cruzada e vento dominante",
    content:
      "No Brasil, vento dominante geralmente vem do quadrante leste/sudeste (ventos alísios). Aproveite janelas a leste como entrada de ar e oeste/norte como saída. Em São Paulo, ventos predominantes no verão vêm do sudeste; no inverno do nordeste. Ventilação cruzada exige duas aberturas em paredes opostas ou em paredes adjacentes (com diferença de pressão). Em apartamento, mesmo com janelas em uma única fachada, a porta de entrada para o hall comum gera fluxo se houver janela oposta. A janela de captação fica menor, e a de exaustão maior — gera efeito Venturi. Evite obstruir o eixo de ventilação (sofá alto, armário alto no meio). Em terreno costeiro, brisa marítima é constante.",
  },

  // ============================================================
  // ZONEAMENTO — Organização funcional (8 chunks)
  // ============================================================
  {
    category: "zoneamento",
    title: "Três zonas funcionais — social, íntima, serviço",
    content:
      "Todo apartamento ou casa se organiza em três zonas funcionais. Zona social: hall, sala de estar/jantar, lavabo, varanda — recebe visitas, perto da entrada. Zona íntima: dormitórios, suítes, banheiros, closet — privada, longe da entrada, separada por corredor ou hall íntimo. Zona de serviço: cozinha, área de serviço, despensa, dormitório de empregada — pode ser integrada à social (cozinha americana) ou independente (cozinha fechada com porta para a sala). O fluxo funcional ideal: morador entra pela zona social, transita pela íntima na hora de dormir, e a zona de serviço suporta as duas (cozinha próxima à sala, lavanderia acessível discretamente).",
  },
  {
    category: "zoneamento",
    title: "Setorização do apartamento — por circulação",
    content:
      "A circulação interna define a setorização. O corredor de 1,20 m é o conector entre social e íntima — sem ele, a privacidade dos quartos compromete. Em apartamento pequeno (até 50 m²), o corredor reduz para 1,00 m ou substitui-se por hall central (área multifuncional). A porta do banheiro social fica no corredor (não na sala) para evitar exposição. A porta do dormitório principal, idealmente a última do corredor (mais distante da sala), garantindo silêncio. Zona de serviço com porta dedicada ou lateralizada à cozinha, evitando que a área de serviço seja vista da sala.",
  },
  {
    category: "zoneamento",
    title: "Layout em planta — apartamento 2 quartos típico",
    content:
      "Apartamento 2 quartos brasileiro padrão (60-80 m²) tem layout: entrada → sala/jantar (12-18 m²) → cozinha integrada ou em L (4-8 m²) → lavanderia (2-3 m²) — zona social/serviço unidas. Corredor de 1,20 × 3,00 m levando aos: banheiro social (3-4 m²), quarto solteiro (8-10 m²), suíte (12-14 m² + banheiro 3,5 m²). Total: ~70 m² internos. Variações: cozinha americana (mais sala, menos parede), suíte com closet (consome área de serviço), lavabo separado do banheiro social (luxo). A porta de entrada deve ficar próxima da sala, não da cozinha. Varanda integrada à sala como extensão.",
  },
  {
    category: "zoneamento",
    title: "Apartamento 3 quartos — distribuição",
    content:
      "Apartamento 3 quartos (80-110 m²) tem zona íntima maior, exigindo corredor mais elaborado. Layout típico: hall de entrada → sala/jantar (16-22 m²) → cozinha (6-10 m²) → lavanderia (3-4 m²). Corredor (1,20 × 4,00 m) → banheiro social, 2 quartos solteiro/casal (10-12 m² cada), suíte (14-16 m² + banheiro 4-5 m² + closet 3-4 m²). Total: ~95 m² internos. Distribua: suíte na ponta mais distante da sala, quartos de filhos próximos ao banheiro social, banheiro social sem ser visível da sala. Aspectos: 2 quartos a leste (manhã), suíte a norte/noroeste.",
  },
  {
    category: "zoneamento",
    title: "Casa térrea — diferenças do apartamento",
    content:
      "Casa térrea permite maior flexibilidade de zoneamento. Zona social no centro (sala-jantar-varanda) com cozinha lateralizada e fundo. Zona íntima em ala separada, com corredor próprio e idealmente uma porta de separação (porta-de-passagem) que isola visual e acusticamente os quartos da sala. Zona de serviço nos fundos, com acesso externo independente (entrada de serviço). Garagem na frente, com hall coberto entre garagem e entrada principal. Jardim e área externa atrás (privacidade) e na frente (recuo ajardinado obrigatório em geral). Pé-direito mais alto na sala (3,00-3,50 m) e padrão (2,50-2,70 m) nos demais.",
  },
  {
    category: "zoneamento",
    title: "Suíte master e ala íntima",
    content:
      "Em casas e apartamentos de alto padrão, a suíte master fica em ala separada dos demais quartos, com porta intermediária (porta-de-comunicação). Isso isola os pais dos filhos, reduzindo ruído. Suíte master ideal: quarto (16-20 m²) → closet (6-10 m²) → banheiro (8-10 m²) — sequência que usa o closet como câmara acústica e térmica. Banheiro de suíte pode ser dividido (vaso/box separado da pia) para uso simultâneo do casal. Janela do banheiro principal voltada para norte/leste se possível (luz natural na hora de se arrumar). Em apartamento, suíte na quina do prédio (duas fachadas) é o luxo máximo.",
  },
  {
    category: "zoneamento",
    title: "Lavabo — função e localização",
    content:
      "Lavabo é o banheiro de visita: vaso + pia, sem chuveiro. Área mínima 1,5 m² (0,90 × 1,80). Localização: zona social, próxima à entrada da sala, mas sem porta visível da sala (preferencialmente em alcova ou nicho). Não compartilha parede com sala (ruído de descarga). Decoração mais elaborada que banheiro padrão (papel de parede, cuba sobreposta, espelho destaque). Sem janela em apartamento → exige exaustor mecânico. Considere uma altura de 0,90 m da bancada da pia (padrão) ou 0,85 m (mais inclusivo). Não substitui o banheiro social — em apartamento de 3 quartos, ter ambos é diferencial.",
  },
  {
    category: "zoneamento",
    title: "Conceito loft — zoneamento aberto",
    content:
      "Loft: apartamento com poucas paredes, geralmente apenas o banheiro fechado, e o restante em planta aberta. Zoneamento por mobiliário e mudança de piso/forro. Cozinha integrada à sala (cozinha americana). Quarto separado por painel ripado, biombo ou desnível de piso, sem porta. Pé-direito alto (3,50-4,50 m) e mezanino opcional. Vantagem: amplidão visual, multiuso. Desvantagem: privacidade nula, propagação de odor/ruído, dificuldade de venda futura para família. Loft funciona melhor em estúdio (1 morador) ou casal sem filhos. Iluminação cênica para diferenciar zonas. Áreas mínimas: total 35-50 m². Pode ter walk-in closet aberto sem porta (galpão de roupa).",
  },

  // ============================================================
  // MATERIAIS — Acabamentos (10 chunks)
  // ============================================================
  {
    category: "materiais",
    title: "Piso de madeira — tipos e aplicação",
    content:
      "Madeira em piso residencial tem três opções: laminado (HDF impregnado, 0,7-1,2 cm, custo baixo, vida útil 8-12 anos, sensível a água), engenheirado (camadas com lâmina de madeira nobre, 1,0-1,5 cm, vida útil 20-30 anos, resiste a umidade moderada), maciço (madeira nobre íntegra, 1,8-2,2 cm, lixar e envernizar várias vezes, vida útil 50+ anos). Aplicação: sala de estar, quartos (todas as opções). Não usar em cozinha, banheiro, lavanderia (umidade). Cores: claras (carvalho, freijó) ampliam o ambiente; escuras (jatobá, sucupira) acolhem. Instalação: laminado clicado sobre manta acústica; engenheirado colado ou flutuante; maciço pregado em base de cabilho.",
  },
  {
    category: "materiais",
    title: "Porcelanato — características e aplicação",
    content:
      "Porcelanato é cerâmica de alta densidade (absorção <0,5%), resistente a manchas, riscos e umidade. Vida útil 50+ anos. Tamanhos populares: 60×60, 90×90, 80×160 cm (formato grande). Acabamentos: polido (luxo, escorrega molhado), acetinado (intermediário), natural (rústico, antiderrapante). Aplicação: sala (polido ou acetinado), cozinha, lavanderia (natural), banheiros (natural ou acetinado). Áreas externas exigem porcelanato técnico antiderrapante. Junta mínima de 2 mm (porcelanato retificado) ou 4 mm (não retificado). Rejunte epóxi em áreas molhadas (cozinha, banheiro). Imitação madeira (porcelanato amadeirado) substitui madeira em áreas úmidas mantendo estética.",
  },
  {
    category: "materiais",
    title: "Mármore e granito — pisos e bancadas",
    content:
      "Mármore é rocha calcária, branda, manchável (vinho, café, suco) e ácidossensível. Aplicação: piso de sala/banheiro de luxo (selado), bancadas de banheiro (não cozinha — risco de mancha de limão). Tipos: branco Carrara, Travertino, Crema Marfil, Calacatta. Manutenção: cera ou impermeabilizante a cada 1-2 anos. Granito é rocha ígnea, dura, resistente a riscos e calor. Aplicação: bancada de cozinha (uso intensivo), soleiras, escadas. Tipos: preto São Gabriel, branco Itaúnas, vermelho Capão Bonito. Acabamentos: polido (cozinha, lavabo), apicoado (área externa, antiderrapante). Junção fina (1-2 mm). Borda boleada ou reta. Custo similar entre os dois.",
  },
  {
    category: "materiais",
    title: "Cerâmica — alternativa econômica",
    content:
      "Cerâmica esmaltada: absorção 3-10%, custo baixo. Aplicação: lavanderia, banheiros econômicos, áreas externas. Não usar em sala/quartos de padrão alto (visualmente inferior ao porcelanato). Resistência a manchas inferior; usar em ambientes secundários. Tamanhos: 30×30, 45×45, 60×60 cm. Esmaltada brilhante ou fosca. Linha rústica para varanda e área externa, antiderrapante. Cerâmica de revestimento de parede (banheiro/cozinha): ideal para box e parede do fogão, com tamanhos 30×60, 30×90, ou subway tile (10×20). Junta mínima 2-3 mm. Rejunte cimentício para parede; epóxi em áreas com umidade extrema.",
  },
  {
    category: "materiais",
    title: "Vinílico (LVT) — piso flutuante alternativo",
    content:
      "Piso vinílico LVT (Luxury Vinyl Tile): manta de PVC com camada de impressão fotográfica imitando madeira ou pedra. Espessura 2-7 mm. Vantagens: 100% impermeável, instalação rápida (clicado ou colado), absorção acústica boa, custo médio. Desvantagens: amassa com peso pontual (móveis pesados), vida útil 10-15 anos, não pode lixar. Aplicação: sala, quartos, cozinha, lavanderia (versões impermeáveis). Bom para reformas rápidas — instala sobre piso existente nivelado. Manta acústica essencial em apartamento (NBR 15575 acústica). Tipos: LVT colado (mais resistente), SPC (núcleo de pedra, mais rígido), WPC (núcleo de madeira+plástico).",
  },
  {
    category: "materiais",
    title: "Esquadrias de alumínio — janelas e portas",
    content:
      "Alumínio é o material mais usado em esquadrias residenciais brasileiras. Vantagens: leve, não enferruja, vida útil 30+ anos, baixa manutenção. Desvantagens: condutor térmico (precisa ruptura de ponte térmica em zonas frias), condensação interna em ambientes com vapor. Tipos: linha 25 (econômica, vão até 1,80 m), linha 30/40 (intermediária), linha 60+ (alta especificação, vão maior, vidro duplo). Cores: branco padrão, preto fosco, cinza, anodizado bronze, e linha madeirada (filme PVC imitando madeira). Vidro padrão 4-6 mm; em janelas grandes ou andares altos, vidro temperado. Para acústica, vidro duplo laminado (Rw 30-35 dB).",
  },
  {
    category: "materiais",
    title: "Esquadrias de madeira e PVC",
    content:
      "Madeira: estética nobre, isolamento térmico/acústico superior ao alumínio. Aplicação: portas internas, portas de entrada de luxo, janelas de casas em padrão alto. Manutenção: verniz a cada 2-3 anos. Tipos: angelim, ipê, cumaru (resistentes), pinho (econômico, mas demanda manutenção). PVC: similar ao alumínio em durabilidade, com isolamento térmico/acústico superior. Custo intermediário. Aplicação: janelas em zonas frias (Sul) e edifícios à beira-mar. Cor branca padrão; outras cores via filme PVC. Sistema oscilo-batente comum em PVC (abre lateralmente e bascula). Marca de qualidade: linha europeia (Veka, Rehau, Salamander).",
  },
  {
    category: "materiais",
    title: "Tipos de vidro em esquadrias",
    content:
      "Vidro comum (float) 4-6 mm: padrão em janelas residenciais. Vidro temperado: 5x mais resistente, quebra em pedaços pequenos. Obrigatório em janelas grandes (>1,5 m² ou andar acima de 12 m), portas de vidro, box de banheiro, guarda-corpo. Vidro laminado: duas camadas com PVB intermediário, segurança e acústica (Rw 30+). Vidro duplo (insulado): câmara de ar entre duas placas, isolamento térmico (U 1,8 vs 5,8 do simples). Aplicação em zonas frias e fachadas expostas a calor. Vidro low-e: película refletora reduz radiação infravermelha sem afetar luz. Vidro fumê/refletivo: privacidade e proteção solar. Espelhamento em apenas uma face.",
  },
  {
    category: "materiais",
    title: "Pintura de paredes — tipos e cores",
    content:
      "Tinta acrílica fosca: padrão em parede interna (sala, quarto), absorve luz. Acetinada: meia-brilhante, lavável, indicada em corredor e cozinha (suja menos). Esmalte semibrilho/brilhante: cozinha, banheiro, áreas molhadas; lava bem. Epóxi: áreas técnicas (garagem, lavanderia industrial), antiquímico. Cores: brancas (off-white) ampliam, claras (cinza claro, gelo) neutralizam, escuras (azul-marinho, terracota) criam profundidade — usar em uma parede só. Pintura externa: tinta acrílica para fachada, elastomérica em fachada com fissuras, hidrofugante invisível em pedra. Vida útil pintura interna 4-6 anos; externa 6-10 anos. Cor padrão Collection: branco gelo (Lukscolor 8112).",
  },
  {
    category: "materiais",
    title: "Forro — tipos e aplicação",
    content:
      "Forro de gesso acartonado (drywall): padrão moderno, permite recortes para luminárias embutidas, sancas (cantos rebaixados para LED). Aplicação: sala, quartos, corredor. Manutenção: pintura a cada 5 anos. Forro de gesso liso (estuque): tradicional, instalado em quartos e salas. Forro de PVC: aplicação em áreas molhadas (cozinha, área de serviço, banheiro), resistente à umidade. Forro mineral (lã de rocha): comercial, modular 60×60, com isolamento acústico. Madeira: ripado em sala de luxo, lambri em casas. Pé-direito final 2,50 m (forro a partir do piso); rebaixo de 0,30 m comum em sala (esconder ar-condicionado e iluminação).",
  },

  // ============================================================
  // PAISAGISMO E ÁREAS EXTERNAS (8 chunks)
  // ============================================================
  {
    category: "paisagismo",
    title: "Piscina residencial — dimensões",
    content:
      "Piscina residencial mínima: 3,00 × 6,00 m (18 m² água) — permite nadar 3-4 braçadas. Profundidade: 1,20 m (raso, infantil/relax) e 1,50-1,80 m (fundo, adulto). Piscina raia (alongada para natação): 2,00 × 10,00 m. Piscina infinity ou de borda transbordante: efeito visual marcante, demanda calha perimetral e reservatório técnico. Material do revestimento: pastilha de vidro (luxo, 2,5×2,5 cm), porcelanato (popular, 25×25 ou 30×30), liner vinílico (econômico). Casa de máquinas: 4-6 m², ventilada, com bomba, filtro e aquecedor. Distância da piscina à casa: 0,80 m mínimo (calçada perimetral 1,20 m ideal). Cerca/proteção: 1,10 m de altura para criança até 5 anos.",
  },
  {
    category: "paisagismo",
    title: "Espaço gourmet / churrasqueira",
    content:
      "Espaço gourmet: bancada com churrasqueira + pia + geladeira + bancada de apoio + mesa para 6-8 pessoas. Área total mínima 12 m². Bancada da churrasqueira: 2,40 × 0,60 m, altura 0,90 m (bancada) com churrasqueira embutida (boca a 0,90-1,00 m). Coifa industrial sobre churrasqueira: vazão ≥ 1.000 m³/h, saída para o exterior. Mesa: 1,80-2,40 × 0,90 m para 6-8 pessoas. Cobertura obrigatória — pode ser pergolado bioclimático (lâminas móveis) ou laje. Iluminação cênica e funcional. Ponto de gás GLP ou natural; ponto de água quente (lavar utensílios). Área mínima livre frente à churrasqueira: 1,20 m (calor + circulação). Piso porcelanato antiderrapante.",
  },
  {
    category: "paisagismo",
    title: "Jardim e canteiro — dimensões",
    content:
      "Canteiro residencial: largura mínima 0,40 m (forrações e plantas pequenas); 0,80 m (arbustos médios); 1,50 m (árvore pequena, cerca viva). Jardim em pátio: prever espaço suficiente para o crescimento da copa (raio de 2-3 m por árvore média). Profundidade do canteiro elevado: 0,30 m mínimo (grama, forração); 0,50 m (arbusto); 1,00 m (árvore pequena). Sistema de irrigação automática (gotejamento ou aspersão) economiza água. Drenagem com brita no fundo do canteiro evita encharcamento. Jardim vertical em parede externa: módulos com substrato e irrigação, espessura 0,15 m, peso 30-50 kg/m² (estrutura reforçada). Manutenção mensal essencial.",
  },
  {
    category: "paisagismo",
    title: "Pergolado e cobertura externa",
    content:
      "Pergolado: estrutura aberta para sombreamento parcial. Vão entre pilares: 3,00-4,00 m (aço ou madeira); 5,00-6,00 m (concreto). Espaçamento entre lâminas/ripas: 0,15-0,30 m, conforme intensidade de sombra desejada. Material: madeira (cedro, ipê — durável), alumínio (longa vida, manutenção zero), concreto (estrutural). Pergolado bioclimático: lâminas motorizadas que abrem/fecham conforme clima — inteligente, custo alto. Cobertura fixa (laje impermeabilizada ou telha sanduíche) protege 100%. Distância vertical do pergolado ao piso: 2,40-3,00 m. Trepadeiras em pergolado: glicínia (sazonal, flores), tumbergia (perene, flores), parreira de uva (frutífera).",
  },
  {
    category: "paisagismo",
    title: "Garagem coberta e portão",
    content:
      "Garagem coberta com cobertura plana ou inclinada. Largura por carro: 2,80-3,00 m (com folga lateral para porta de 0,40 m de cada lado). Comprimento: 5,00-5,50 m por carro. Portão social: 1,00-1,20 m de largura. Portão de carro: 2,80-3,00 m de largura (manual basculante) ou 4,00-5,00 m (automático correr). Pé-direito da cobertura: 2,30 m mínimo, 2,50 m recomendado. Iluminação 100 lux mínimo, tomada para carro elétrico (220V/16-32A), ponto de água (lavar carro). Piso intertravado (concreto pavi-S) drena água da chuva. Inclinação 1-2% para fora, evitando escoamento para dentro da casa. Calçada de acesso: 1,00-1,20 m ao lado da garagem.",
  },
  {
    category: "paisagismo",
    title: "Jardim de inverno",
    content:
      "Jardim de inverno: espaço interno com plantas, geralmente envidraçado (luz e proteção). Área típica: 4-8 m². Localização: junto à sala (visual) ou banheiro (sensorial). Pé-direito integrado ao ambiente principal. Forro com claraboia ou vidro (luz zenital). Plantas adequadas: samambaia, lírio da paz, espada-de-são-jorge, palmeiras pequenas — todas tolerantes a sombra parcial e umidade. Drenagem essencial: ralo no piso, com cortina d'água ou impermeabilização. Em apartamento, jardim de inverno na planta tem valor comercial alto. Iluminação artificial UV-A (LED grow light) suplementa luz natural se for em parede interna. Distância mínima entre planta e parede: 0,30 m (ar circular).",
  },
  {
    category: "paisagismo",
    title: "Calçada e acesso pedestre",
    content:
      "Calçada residencial: largura 1,20 m mínimo (NBR 9050), 1,50 m confortável. Inclinação transversal 1-2% para fora. Material: piso intertravado, ladrilho hidráulico, granilite, cimentado, pedra portuguesa. Antiderrapante essencial. Faixa livre central de 1,20 m sem obstáculos (lixeira, vaso, poste). Calçada com canteiro central: largura total 2,00 m (calçada 1,20 m + canteiro 0,80 m). Rampa de acesso para PcD: inclinação ≤ 8,33%. Calçada de acesso da rua à porta principal deve ter iluminação noturna (poste ou luminária embutida no piso). Soleira da porta de entrada com 1-2 cm de desnível para evitar entrada de água.",
  },
  {
    category: "paisagismo",
    title: "Quintal e área de lazer",
    content:
      "Quintal residencial: idealmente 30% do terreno (taxa de permeabilidade municipal). Área de lazer mínima: 20 m² (mesa, banco, churrasqueira pequena). Grama esmeralda ou São Carlos (sol pleno); grama batatais (sombra parcial). Solários com pergolado e espreguiçadeiras: 12-16 m². Pomar pequeno: 2-4 árvores frutíferas distantes 4 m entre si. Horta orgânica: canteiro elevado 1,20 × 2,40 m, profundidade 0,40 m. Playground infantil: balanço, escorregador, areia — área 15-25 m², piso amortecedor (areia, borracha). Iluminação cênica (postes baixos) marca caminhos. Ponto de água externo (torneira de jardim) a cada 15-20 m.",
  },

  // ============================================================
  // COMERCIAL — Tipologias (8 chunks)
  // ============================================================
  {
    category: "comercial",
    title: "Escritório — área por colaborador",
    content:
      "Escritório corporativo: área por colaborador. Open office: 6-8 m²/pessoa (incluindo circulação). Estação tradicional (com divisórias): 9-10 m²/pessoa. Sala individual: 12-15 m². Mesa: 1,40-1,60 × 0,75 m, profundidade 0,75 m. Cadeira ergonômica obrigatória (NR-17). Distância entre estações: 1,20 m (eixo de circulação). Sala de reunião pequena (4 pessoas): 8-10 m². Sala média (8-10 pessoas): 16-20 m². Sala grande (12-20 pessoas): 30-40 m². Copa: 8-12 m² para até 30 colaboradores; sanitários: 1 vaso para cada 20 funcionários (cada gênero). Iluminação 500 lux na mesa (NBR 5413). Ar-condicionado dimensionado: 600 BTU/m² + 600 BTU por pessoa.",
  },
  {
    category: "comercial",
    title: "Loja de varejo — circulação e exposição",
    content:
      "Loja de varejo: largura mínima de circulação central 1,50 m (em loja popular); 2,00-2,50 m (em loja média); 3,00 m+ (em loja de luxo). Entre prateleiras paralelas: 1,20-1,50 m para passagem com carrinho. Vitrine: profundidade 0,80-1,20 m, com iluminação dedicada (LED 3000 K, 1.200 lux na mercadoria). Caixa: balcão 1,50 × 0,80 m, altura 1,10 m (cliente) com rebaixo 0,75 m (operador) e parte acessível 0,80 m. Provador: 0,90 × 1,20 m mínimo, banco e gancheiras. Sanitário cliente: a partir de 100 m² de loja. Estoque/depósito: 15-25% da área de venda. Iluminação geral 500-750 lux; foco em mercadoria 1.000-1.500 lux.",
  },
  {
    category: "comercial",
    title: "Restaurante — área por mesa e cozinha",
    content:
      "Restaurante: 1,2-1,5 m²/comensal incluindo circulação. Mesa de 4 pessoas: 1,50 m² da mesa + 4 × 0,70 m² (cadeiras) + circulação ≈ 6 m² total. Mesa para 2 pessoas: 1,40 × 0,80 m, ocupa 4 m² total. Distância entre mesas: 0,70 m (cadeiras encostadas) + 0,60 m (circulação) ≈ 1,30 m centro-a-centro. Cozinha profissional: 30-40% da área do salão. Bancadas em aço inox. Câmara fria walk-in: 4-6 m². Pia industrial 3 cubas. Coifa industrial obrigatória, ducto até telhado. Caixa de gordura grande. Sanitário cliente: 1 vaso/20 lugares (cada gênero), preferencialmente acessível. Sanitário funcionário separado. Vestiário funcionário: 0,5 m²/funcionário.",
  },
  {
    category: "comercial",
    title: "Café e padaria — layout",
    content:
      "Café/padaria: balcão de exposição (vitrine refrigerada) na entrada, 2,40-3,60 m de comprimento × 0,80 m profundidade. Caixa adjacente. Mesas para 2-4 pessoas: 1,2 m²/pessoa. Em padaria grande, separar zona de venda de pão (com balcão dedicado) da cafeteria (mesas). Cozinha de produção (forno, masseira): 20-30 m² mínimo. Estação de café (barista): bancada 2,00 × 0,80 m com máquina de espresso, moedor, geladeira de leite. Pia 3 cubas (NBR 13599). Vitrine refrigerada com 4 °C. Forno comercial em ambiente exclusivo, com ventilação. Banheiro acessível obrigatório a partir de 50 m² de atendimento. Iluminação cênica 300-500 lux na sala, 800 lux no balcão.",
  },
  {
    category: "comercial",
    title: "Consultório / clínica — sala de atendimento",
    content:
      "Consultório médico: sala de atendimento mín. 9 m² (mesa + cadeiras + maca). Maca: 0,70 × 1,90 m, com folga lateral 0,60 m de cada lado e 0,90 m em pelo menos um lado. Pia para higienização: 0,40 × 0,30 m, com torneira automática ou alavanca, bancada de apoio. Recepção: 8-12 m² (balcão atendimento + 4-6 cadeiras de espera). Sala de espera: 1,2 m²/pessoa. Banheiro acessível obrigatório (NBR 9050). Sala de procedimento: 12 m², com pia, bancada de apoio, lixeira contaminada/comum separada. Anvisa exige piso lavável (porcelanato), parede lavável até 1,80 m, ar-condicionado com filtragem. Iluminação 1.000 lux na maca/mesa de exame.",
  },
  {
    category: "comercial",
    title: "Academia — equipamentos e circulação",
    content:
      "Academia: 4-6 m²/aluno em horário de pico. Sala de musculação: 50-100 m², com equipamentos espaçados 1,00 m entre si. Esteira: 1,20 × 2,20 m (incluindo zona de descida atrás). Bicicleta: 0,80 × 1,60 m. Equipamento de musculação grande: 2,00 × 1,50 m. Circulação central: 1,50 m. Cardio em sala separada da musculação (ventilação distinta). Sala de aulas (yoga, pilates): 30-50 m², espelho em uma parede, piso emborrachado ou madeira. Vestiário: 1 chuveiro/30 alunos, 1 vaso/20, armários (0,40 × 0,40 × 1,80). Recepção e área de espera. Pé-direito mínimo 3,00 m (para equipamentos de salto e CrossFit). Ventilação reforçada (renovação 30 m³/h por aluno).",
  },
  {
    category: "comercial",
    title: "Coworking — distribuição",
    content:
      "Coworking: combinação de open office, salas privadas e área de convivência. Estação compartilhada: 4-5 m²/pessoa (alto adensamento). Cabine telefônica/booth (call privada): 1,5 × 2,0 m, isolamento acústico. Sala de reunião (4 pessoas): 8 m² × várias. Sala de reunião grande (10 pessoas): 20 m². Café/bar: bancada 2,40 m, máquina café, geladeira, micro-ondas — ponto de descompressão. Sofás e poltronas: 15-20% da área. Impressora: ponto centralizado. Banheiros: 1 vaso/15 usuários. Pé-direito alto (3,00 m+) para dutos aparentes (estética industrial). Iluminação geral 400 lux + iluminação localizada em mesa. Wi-Fi distribuído (1 access point/40 m²).",
  },
  {
    category: "comercial",
    title: "Hotel / pousada — quarto padrão",
    content:
      "Quarto de hotel padrão (categoria 3 estrelas): 18-24 m² incluindo banheiro. Cama queen 1,60 × 2,00 m + criados + escrivaninha + TV + cadeira + frigobar. Banheiro: 4-5 m² com box, vaso, pia. Quarto de luxo (5 estrelas): 30-40 m² com sofá, mesa de café, área de trabalho, banheiro 6-8 m² com banheira. Suíte presidencial: 60-100 m² com sala. Corredor: 1,50 m largura. Em hotel, considere suíte adaptada (NBR 9050) — 5% mínimo, sendo 1 com vão de manobra. Pousada pequena: 12-18 m² por quarto. Recepção e lobby: 1,2 m²/quarto. Restaurante interno: 1,5 lugares/quarto. Estoque/lavanderia hotel: 10-15% da área total.",
  },

  // ============================================================
  // ELETRICA / HIDRAULICA (5 chunks)
  // ============================================================
  {
    category: "instalacoes",
    title: "Iluminação por cômodo — lumens",
    content:
      "Iluminação NBR 5413: sala de estar 100-200 lux geral, 300-500 lux na zona de leitura. Sala de jantar 200-300 lux na mesa. Cozinha 300-500 lux geral, 750 lux na bancada. Banheiro 200-300 lux geral, 500-750 lux no espelho. Quarto 100-150 lux geral, 300-500 lux na cabeceira. Escritório 500-1.000 lux na mesa. Garagem 75-150 lux. Para calcular: lúmens necessários = lux × área. Sala de 15 m² com 200 lux exige 3.000 lúmens (3 LED de 1.000 lm cada). LED moderno: 100 lm/W (uma lâmpada 10W rende 1.000 lm). Temperatura de cor: 2.700-3.000 K (quente, sala/quarto), 4.000 K (cozinha/escritório), 6.000 K (lavanderia/garagem). IRC ≥ 80 padrão; ≥ 90 em zona de leitura/maquiagem.",
  },
  {
    category: "instalacoes",
    title: "Tomadas — distribuição mínima",
    content:
      "NBR 5410: tomadas de uso geral (TUG) por cômodo. Cozinha: 1 TUG por bancada de 3,5 m + dedicadas (geladeira, micro-ondas, forno, cooktop), todas em circuitos exclusivos para 20A — mín. 6 tomadas. Sala: 4 TUG (TV, sofá ×2, parede livre) + 1 dedicada para ar condicionado se aplicável. Quarto: 4 TUG (cabeceira ×2, escrivaninha, parede livre). Banheiro: 1 TUG ao lado da pia (IPX4, com DR). Lavanderia: 1 TUG geral + 1 TUE para máquina de lavar (20A). Área externa: 1 TUG IP65. Altura: 0,30 m do piso (geral), 1,10 m (bancada), 2,10 m (sobre porta para portão eletrônico). Quadro de distribuição em local acessível, geralmente na lavanderia.",
  },
  {
    category: "instalacoes",
    title: "Pontos hidráulicos — distribuição",
    content:
      "NBR 5626: água fria. Cozinha: pia (1 AF + opcional AQ), máquina lava-louças (1 AF), filtro/purificador (1 AF). Lavanderia: tanque (1 AF), máquina de lavar (1 AF), ponto secadora opcional. Banheiro: vaso (1 AF), pia (1 AF + opcional AQ), chuveiro (1 AF + 1 AQ), bidê opcional (1 AF + 1 AQ). Banheiro suíte com banheira: ponto adicional. Área de serviço: torneira de área. Varanda gourmet: pia (1 AF), churrasqueira ducha. Pressão mínima na peça: 5 kPa (chuveiro, torneira), 15 kPa (válvula descarga). Pressão máxima: 400 kPa (peça). Diâmetros: alimentador geral 25 mm, ramal de cômodo 20 mm, ponto isolado 15 mm. PEX/PPR/cobre — não use PVC em água quente.",
  },
  {
    category: "instalacoes",
    title: "Ar-condicionado — dimensionamento",
    content:
      "Cálculo de capacidade: ~600 BTU/h por m² em ambiente residencial padrão (pé-direito 2,50 m, ocupação normal). Adicione 600 BTU por pessoa, 600 BTU por equipamento eletrônico (TV/PC), 800-1.200 BTU por janela exposta ao sol. Sala de 20 m² com 4 pessoas e 2 janelas oeste: 20 × 600 + 4 × 600 + 2 × 1.000 = 16.400 BTU → split de 18.000 BTU. Quarto 12 m² com 2 pessoas: 12 × 600 + 2 × 600 = 8.400 BTU → split 9.000 BTU. Tipo: split hi-wall (padrão), piso-teto (alto andar), cassete (forro), portátil (provisório). Inverter economiza 30% energia. Drenagem do condensado: ralo dedicado ou drenagem externa, com sifão. Ponto elétrico: TUE 220V (até 12.000 BTU em 127V).",
  },
  {
    category: "instalacoes",
    title: "Aquecimento de água — sistemas",
    content:
      "Sistemas de aquecimento residencial: aquecedor a gás de passagem (instantâneo, vazão 12-30 L/min, ideal para apartamento, sem reservatório), boiler elétrico (reservatório 100-500 L, recuperação lenta, alto consumo elétrico), aquecedor solar (placas no telhado + boiler 200-400 L, economia 70% vs elétrico, exige backup elétrico/gás em dia nublado), bomba de calor (eficiente, alto custo inicial). Em apartamento, gás de passagem é o padrão. Em casa, solar+gás é o ideal econômico. Aquecedor de passagem instala em área ventilada (varanda, lavanderia) — não em banheiro fechado. Vazão dimensionada: ducha 8-12 L/min + torneira 6 L/min = 18 L/min para banho com pia simultâneos.",
  },
];

