-- ============================================================
--  Gerência Leiticia — migração: valores na galeria de ideias
--  Rode UMA vez em: Supabase → SQL Editor → New query → Run
--  • galeria_tipos.preco  → "a partir de R$ ..." do tipo (ex.: Caderno A5)
--  • galeria_fotos.preco  → valor daquela ideia específica (opcional)
--  Deixe em branco para não mostrar valor.
-- ============================================================

alter table public.galeria_tipos add column if not exists preco numeric(10,2);
alter table public.galeria_fotos add column if not exists preco numeric(10,2);
