-- =============================================================
-- Collection Architect Agent — RAG schema (Supabase / pgvector)
-- =============================================================
-- Rode este script uma vez no SQL Editor do Supabase.
-- Depois execute POST /api/seed para popular a base.

-- 1) Extensão pgvector (Supabase já tem disponível)
create extension if not exists vector;

-- 2) Tabela de chunks de conhecimento
create table if not exists public.knowledge_chunks (
  id          bigserial primary key,
  category    text not null,
  title       text not null,
  content     text not null,
  embedding   vector(512) not null,
  created_at  timestamptz not null default now()
);

-- 3) Índice ANN (ivfflat) para busca por similaridade de cosseno.
--    `lists` ~ sqrt(N). Para 100-200 chunks, 10 é suficiente.
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

create index if not exists knowledge_chunks_category_idx
  on public.knowledge_chunks (category);

-- 4) Função RPC consumida por searchKnowledgeBase()
create or replace function public.match_knowledge(
  query_embedding vector(512),
  match_count int default 5
)
returns table (
  category   text,
  title      text,
  content    text,
  similarity float
)
language sql stable
as $$
  select
    kc.category,
    kc.title,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- 5) (Opcional) Variante filtrando por categoria. Não é usada hoje, mas
--    deixa pronto se quisermos restringir buscas no futuro.
create or replace function public.match_knowledge_by_category(
  query_embedding vector(512),
  category_filter text,
  match_count int default 5
)
returns table (
  category   text,
  title      text,
  content    text,
  similarity float
)
language sql stable
as $$
  select
    kc.category,
    kc.title,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.category = category_filter
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- 6) RLS desabilitado: o service role key bypassa RLS de qualquer forma,
--    e o frontend nunca acessa essa tabela diretamente.
alter table public.knowledge_chunks disable row level security;
