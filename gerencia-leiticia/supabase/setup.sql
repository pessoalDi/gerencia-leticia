-- ============================================================
--  Gerência Leiticia — estrutura do banco (Supabase)
--  Rode este arquivo inteiro UMA vez em: Supabase → SQL Editor → New query
--  ANTES de rodar: troque o e-mail na linha marcada com  <<< SEU E-MAIL
-- ============================================================

-- ---------- quem pode administrar ----------
create table if not exists public.admins (
  email text primary key
);

insert into public.admins (email)
values ('seu-email@exemplo.com')            -- <<< SEU E-MAIL (o mesmo do login)
on conflict do nothing;

alter table public.admins enable row level security;
-- ninguém lê/escreve essa tabela pela API; só a função abaixo consulta

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------- categorias ----------
create table if not exists public.categorias (
  id         text primary key,                 -- ex.: garrafas (usado no site)
  nome       text not null,                    -- ex.: Garrafas (aparece no site)
  posicao    integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------- produtos ----------
create table if not exists public.produtos (
  id            text primary key,              -- código: GAR01, CAD02...
  nome          text not null,
  categoria     text references public.categorias(id) on update cascade on delete set null,
  descricao     text not null default '',
  preco         numeric(10,2) not null default 0,
  favorito      boolean not null default false, -- aparece em "Nossos queridinhos"
  ativo         boolean not null default true,  -- false = escondido do site
  posicao       integer not null default 0,     -- ordem de exibição
  imagem_url    text,
  atualizado_em timestamptz not null default now()
);

create index if not exists produtos_posicao_idx on public.produtos (posicao);

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists produtos_atualizado_em on public.produtos;
create trigger produtos_atualizado_em
before update on public.produtos
for each row execute function public.tocar_atualizado_em();

-- ---------- regras de acesso (RLS) ----------
alter table public.categorias enable row level security;
alter table public.produtos   enable row level security;

-- o site de vendas (visitante) só enxerga o que está ativo
drop policy if exists "site le categorias ativas" on public.categorias;
create policy "site le categorias ativas" on public.categorias
  for select to anon, authenticated using (ativo = true or public.is_admin());

drop policy if exists "site le produtos ativos" on public.produtos;
create policy "site le produtos ativos" on public.produtos
  for select to anon, authenticated using (ativo = true or public.is_admin());

-- só admins criam, editam e apagam
drop policy if exists "admin gerencia categorias" on public.categorias;
create policy "admin gerencia categorias" on public.categorias
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin gerencia produtos" on public.produtos;
create policy "admin gerencia produtos" on public.produtos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- reordenar (arrastar e soltar) ----------
create or replace function public.reordenar_produtos(ids text[])
returns void language sql as $$
  update public.produtos p
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where p.id = x.id;
$$;

create or replace function public.reordenar_categorias(ids text[])
returns void language sql as $$
  update public.categorias c
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where c.id = x.id;
$$;

grant execute on function public.reordenar_produtos(text[])   to authenticated;
grant execute on function public.reordenar_categorias(text[]) to authenticated;

-- ---------- fotos (Storage) ----------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists "admin le fotos"     on storage.objects;
drop policy if exists "admin envia fotos"  on storage.objects;
drop policy if exists "admin troca fotos"  on storage.objects;
drop policy if exists "admin apaga fotos"  on storage.objects;

create policy "admin le fotos" on storage.objects
  for select to authenticated using (bucket_id = 'produtos' and public.is_admin());
create policy "admin envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'produtos' and public.is_admin());
create policy "admin troca fotos" on storage.objects
  for update to authenticated using (bucket_id = 'produtos' and public.is_admin());
create policy "admin apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'produtos' and public.is_admin());

-- ---------- categorias iniciais (as mesmas do site hoje) ----------
insert into public.categorias (id, nome, posicao) values
  ('garrafas',   'Garrafas',   1),
  ('cadernos',   'Cadernos',   2),
  ('chaveiros',  'Chaveiros',  3),
  ('quadros',    'Quadros',    4),
  ('polaroides', 'Polaroides', 5),
  ('outros',     'Outros',     6)
on conflict (id) do nothing;
