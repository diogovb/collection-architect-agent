# Collection Architect Agent

Agente de arquitetura com IA para criação de plantas baixas em tempo real, conversando em português. Desenvolvido para a **Collection**.

## Como funciona

A tela é dividida em duas partes:

- **Esquerda**: Planta baixa 2D em tempo real (Canvas) mostrando cômodos, paredes, portas, janelas e mobiliário com cotas e legendas.
- **Direita**: Chat onde você conversa em português com o agente. O Claude (Anthropic) interpreta o pedido e usa ferramentas para desenhar/modificar a planta.

Exemplos do que você pode pedir:

- *"Cria um apartamento de 70m² com 2 quartos"*
- *"Coloca um sofá na sala"*
- *"Cozinha americana com ilha"*
- *"Troca o piso da sala pra madeira"*
- *"Adiciona uma janela no quarto"*

## Pré-requisitos

- **Node.js 18.18+** (recomendado 20+)
- **npm** (já vem com o Node)
- Uma chave de API da Anthropic — pegue em https://console.anthropic.com/

## Instalação (passo a passo)

1. Abra o terminal na pasta do projeto:
   ```bash
   cd collection-architect-agent
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure a chave da API. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env.local
   ```
   Depois abra `.env.local` em qualquer editor e cole sua chave da Anthropic no lugar de `your-key-here`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

4. Rode em modo desenvolvimento:
   ```bash
   npm run dev
   ```

5. Abra http://localhost:3000 no navegador.

## Como usar

1. Digite um pedido no chat à direita (em português).
2. O agente vai chamar ferramentas (você vê os indicadores aparecendo) e a planta vai se desenhando em tempo real à esquerda.
3. Use a roda do mouse para dar zoom; arraste para mover a planta.

## Estrutura

```
collection-architect-agent/
├── app/
│   ├── api/chat/route.ts   # API streaming com Claude (tool use)
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── FloorPlanCanvas.tsx # Canvas 2D
│   ├── ChatPanel.tsx       # Chat
│   └── ToolIndicator.tsx
└── lib/
    ├── anthropic-tools.ts       # Definição das ferramentas para Claude
    ├── floor-plan-engine.ts     # Algoritmos de layout e mobília
    ├── system-prompt.ts
    ├── types.ts
    ├── embeddings.ts            # Voyage AI + Supabase pgvector
    ├── knowledge-base-content.ts# 102 trechos de Neufert/NBR/etc
    └── supabase-setup.sql       # Schema + função match_knowledge
```

## Modelo

Usa `claude-fable-5` com thinking adaptativo e `effort: "xhigh"` (constante `MODEL` em `app/api/chat/route.ts`).

## Base de conhecimento (RAG) — opcional

O agente pode consultar uma base vetorial de **102 trechos** sobre Neufert, NBR 15575, NBR 9050, orientação solar, zoneamento, materiais, paisagismo, projetos comerciais e instalações. A IA chama a tool `search_knowledge_base` antes de tomar decisões e cita as fontes.

Sem essas variáveis o app continua funcionando — Claude só não vai ter o RAG e responderá com base no system prompt e conhecimento próprio.

### Setup

1. Crie um projeto no [Supabase](https://supabase.com/) e copie URL + service role key.
2. Pegue uma chave da [Voyage AI](https://www.voyageai.com/) (modelo `voyage-3-lite`, 512 dim).
3. Preencha no `.env.local`:
   ```
   VOYAGE_API_KEY=...
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=...
   SEED_SECRET=qualquer-string-secreta
   ```
4. No Supabase SQL Editor, rode o script `lib/supabase-setup.sql` (cria a tabela `knowledge_chunks`, índice ivfflat, e função `match_knowledge`).
5. Popule a base chamando o endpoint de seed:
   ```bash
   curl -X POST http://localhost:3000/api/seed \
     -H "Authorization: Bearer SEU_SEED_SECRET"
   ```
   Vai gerar embeddings em lotes de 10 e gravar no Supabase. Resposta: `{ ok: true, total: 102, inserted: 102, batches: 11 }`.

Depois disso a tool `search_knowledge_base` fica ativa nas conversas.

## Build de produção

```bash
npm run build
npm start
```

## Problemas comuns

- **"Faltou a chave da API"**: confira `.env.local` na raiz do projeto e reinicie o `npm run dev`.
- **Erros de digitação no chat sem resposta**: verifique no console do navegador (F12) ou no terminal onde rodou o `npm run dev`.
