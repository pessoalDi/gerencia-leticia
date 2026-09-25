-- ============================================================
--  Gerência Leiticia — migração: IDEIAS DE PRESENTE editáveis
--  Rode UMA vez em: Supabase → SQL Editor → New query → Run
--  As ideias saem do código e passam a ser cadastradas pela
--  Gerência (aba Ideias). As 23 ideias atuais já entram aqui,
--  com os mesmos códigos — produtos, kits e ofertas marcados
--  continuam funcionando. As faixas de preço seguem automáticas.
-- ============================================================

create table if not exists public.ideias (
  id         text primary key,               -- código usado nos produtos (ex.: dia-das-maes-pais)
  nome       text not null,                  -- como aparece no site
  dica       text not null default '',       -- linha pequena opcional embaixo do nome
  grupo      text not null,                  -- ex.: Datas comemorativas
  posicao    integer not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

alter table public.ideias enable row level security;

drop policy if exists "site le ideias ativas" on public.ideias;
create policy "site le ideias ativas" on public.ideias
  for select to anon, authenticated using (ativo = true or public.is_admin());

drop policy if exists "admin gerencia ideias" on public.ideias;
create policy "admin gerencia ideias" on public.ideias
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.reordenar_ideias(ids text[])
returns void language sql as $$
  update public.ideias i
     set posicao = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where i.id = x.id;
$$;

grant execute on function public.reordenar_ideias(text[]) to authenticated;

insert into public.ideias (id, nome, dica, grupo, posicao) values
  ('dia-das-maes-pais', 'Dia das Mães e dos Pais', '', 'Datas comemorativas', 1),
  ('namorados', 'Dia dos Namorados e aniversário de namoro ou casamento', '', 'Datas comemorativas', 2),
  ('professores', 'Dia dos Professores', '', 'Datas comemorativas', 3),
  ('criancas', 'Dia das Crianças', '', 'Datas comemorativas', 4),
  ('natal', 'Natal e fim de ano', 'Brindes e agradecimentos', 'Datas comemorativas', 5),
  ('dia-da-mulher', 'Dia da Mulher', '', 'Datas comemorativas', 6),
  ('aniversario', 'Aniversários', '', 'Ocasiões e celebrações', 7),
  ('maternidade', 'Maternidade, chá de bebê e revelação', '', 'Ocasiões e celebrações', 8),
  ('religioso', 'Batizado, primeira comunhão e crisma', '', 'Ocasiões e celebrações', 9),
  ('casamento', 'Casamento e padrinhos', '', 'Ocasiões e celebrações', 10),
  ('formatura', 'Formaturas', '', 'Ocasiões e celebrações', 11),
  ('casa-nova', 'Boas-vindas e casa nova', '', 'Ocasiões e celebrações', 12),
  ('para-ele', 'Para ele', '', 'Para quem vai receber', 13),
  ('para-ela', 'Para ela', '', 'Para quem vai receber', 14),
  ('amigos', 'Para amigos e melhores amigos', '', 'Para quem vai receber', 15),
  ('casais', 'Para casais', '', 'Para quem vai receber', 16),
  ('avos', 'Para avós', '', 'Para quem vai receber', 17),
  ('pets', 'Para pets e donos de pet', '', 'Para quem vai receber', 18),
  ('trabalho', 'Para chefe, equipe e colegas de trabalho', '', 'Para quem vai receber', 19),
  ('cultura-pop', 'Gamer e cultura pop', 'Fãs de séries e música', 'Por estilo do mimo', 20),
  ('viagem', 'Viagem e aventuras', 'Passaportes, tags de mala, chaveiros', 'Por estilo do mimo', 21),
  ('papelaria', 'Organização e papelaria afetiva', 'Planners, agendas, cadernos', 'Por estilo do mimo', 22),
  ('corporativo', 'Corporativo e eventos', 'Kits personalizados para empresas', 'Por estilo do mimo', 23)
on conflict (id) do nothing;
