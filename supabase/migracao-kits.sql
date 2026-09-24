-- ============================================================
--  Gerência Leiticia — migração: KITS por ideia de presente
--  Rode UMA vez em: Supabase → SQL Editor → New query → Run
--  Um kit junta vários produtos (itens) com um preço próprio e
--  aparece nas ideias marcadas (Dia das Mães, Para avós...).
-- ============================================================

create table if not exists public.kits (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text not null default '',
  preco       numeric(10,2) not null default 0,
  imagem_url  text,                               -- foto do kit (opcional; sem foto, o site monta com as fotos dos itens)
  ideias      text[] not null default '{}',       -- dia-das-maes-pais, avos...
  itens       text[] not null default '{}',       -- códigos dos produtos: CAD01, GAR02...
  ativo       boolean not null default true,
  posicao     integer not null default 0,
  criado_em   timestamptz not null default now()
);

create index if not exists kits_ideias_idx on public.kits using gin (ideias);

alter table public.kits enable row level security;

drop policy if exists "site le kits ativos" on public.kits;
create policy "site le kits ativos" on public.kits
  for select to anon, authenticated using (ativo = true or public.is_admin());

drop policy if exists "admin gerencia kits" on public.kits;
create policy "admin gerencia kits" on public.kits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.reordenar_kits(ids uuid[])
returns void language sql as $$
  update public.kits k
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where k.id = x.id;
$$;

grant execute on function public.reordenar_kits(uuid[]) to authenticated;
