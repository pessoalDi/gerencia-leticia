-- ============================================================
--  Gerência Leiticia — migração: OFERTAS do topo do site (Hero)
--  Rode UMA vez em: Supabase → SQL Editor → New query → Run
--  Cada oferta vira um card no topo do site. Ao clicar, o site
--  mostra os presentes da ideia ligada (ou abre o WhatsApp, se
--  nenhuma ideia estiver ligada).
-- ============================================================

create table if not exists public.ofertas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,                 -- ex.: Dia dos Pais
  detalhe    text not null default '',      -- opcional: ex.: Kits a partir de R$ 49
  icone      text not null default 'presente',
  ideia      text not null default '',      -- ideia de presente ligada (ex.: dia-das-maes-pais); vazio = abre o WhatsApp
  ativo      boolean not null default true,
  posicao    integer not null default 0,
  criado_em  timestamptz not null default now()
);

alter table public.ofertas enable row level security;

drop policy if exists "site le ofertas ativas" on public.ofertas;
create policy "site le ofertas ativas" on public.ofertas
  for select to anon, authenticated using (ativo = true or public.is_admin());

drop policy if exists "admin gerencia ofertas" on public.ofertas;
create policy "admin gerencia ofertas" on public.ofertas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.reordenar_ofertas(ids uuid[])
returns void language sql as $$
  update public.ofertas o
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where o.id = x.id;
$$;

grant execute on function public.reordenar_ofertas(uuid[]) to authenticated;

-- ofertas iniciais (só entram se a tabela estiver vazia)
insert into public.ofertas (nome, icone, ideia, posicao)
select * from (values
  ('Dia dos Pais',      'presente', 'dia-das-maes-pais', 1),
  ('Dia das Mães',      'coracao',  'dia-das-maes-pais', 2),
  ('Dia dos Namorados', 'coracoes', 'namorados',         3),
  ('Dia das Crianças',  'balao',    'criancas',          4),
  ('Natal',             'brilho',   'natal',             5),
  ('Aniversários',      'brilho',   'aniversario',       6)
) as v(nome, icone, ideia, posicao)
where not exists (select 1 from public.ofertas);
