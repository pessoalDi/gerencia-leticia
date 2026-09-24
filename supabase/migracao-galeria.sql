-- ============================================================
--  Gerência Leiticia — migração: "Se inspire nessas ideias" (galeria)
--  Rode UMA vez em: Supabase → SQL Editor → New query → Run
--  Cria os tipos (Caderno A5, A6, A7...) e as fotos de trabalhos já feitos.
--  As fotos ficam no mesmo Storage "produtos", na pasta galeria/.
-- ============================================================

create table if not exists public.galeria_tipos (
  id         text primary key,                 -- ex.: caderno-a5 (usado no link do site)
  nome       text not null,                    -- ex.: Caderno A5
  posicao    integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.galeria_fotos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null references public.galeria_tipos(id) on update cascade on delete cascade,
  legenda     text not null default '',
  imagem_url  text not null,
  posicao     integer not null default 0,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create index if not exists galeria_fotos_tipo_idx on public.galeria_fotos (tipo, posicao);

alter table public.galeria_tipos enable row level security;
alter table public.galeria_fotos enable row level security;

-- visitante vê o que está ativo; admin vê tudo
drop policy if exists "site le tipos da galeria" on public.galeria_tipos;
create policy "site le tipos da galeria" on public.galeria_tipos
  for select to anon, authenticated using (ativo = true or public.is_admin());

drop policy if exists "site le fotos da galeria" on public.galeria_fotos;
create policy "site le fotos da galeria" on public.galeria_fotos
  for select to anon, authenticated using (ativo = true or public.is_admin());

-- só admin cria, edita e apaga
drop policy if exists "admin gerencia tipos da galeria" on public.galeria_tipos;
create policy "admin gerencia tipos da galeria" on public.galeria_tipos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin gerencia fotos da galeria" on public.galeria_fotos;
create policy "admin gerencia fotos da galeria" on public.galeria_fotos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reordenar (arrastar e soltar)
create or replace function public.reordenar_galeria_tipos(ids text[])
returns void language sql as $$
  update public.galeria_tipos t
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where t.id = x.id;
$$;

create or replace function public.reordenar_galeria_fotos(ids uuid[])
returns void language sql as $$
  update public.galeria_fotos f
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where f.id = x.id;
$$;

grant execute on function public.reordenar_galeria_tipos(text[]) to authenticated;
grant execute on function public.reordenar_galeria_fotos(uuid[]) to authenticated;

-- tipos iniciais (pode renomear, apagar ou criar outros pela Gerência)
insert into public.galeria_tipos (id, nome, posicao) values
  ('caderno-a5', 'Caderno A5', 1),
  ('caderno-a6', 'Caderno A6', 2),
  ('caderno-a7', 'Caderno A7', 3)
on conflict (id) do nothing;
