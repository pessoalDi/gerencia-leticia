# Gerência Leiticia

Painel para cuidar do catálogo da Lets Mimos: preços, fotos, nomes, ordem dos
produtos, queridinhos e categorias. O site de vendas lê tudo daqui — a planilha
do Google deixa de ser usada.

Os dados ficam no **Supabase** (banco + fotos + login), no plano gratuito.

## Passo a passo (uma vez só)

1. **Criar o projeto** em https://supabase.com → New project. Região: *South America (São Paulo)*.
2. **Criar seu login**: Authentication → Users → *Add user* → *Create new user*
   (e-mail + senha, marque *Auto Confirm User*).
3. **Bloquear cadastros novos**: Authentication → Sign In / Providers →
   desligue *Allow new users to sign up*.
4. **Criar as tabelas**: SQL Editor → New query → cole o `supabase/setup.sql`,
   troque `seu-email@exemplo.com` pelo e-mail do passo 2 → *Run*.
5. **Pegar as chaves**: Project Settings → API → copie *Project URL* e a chave *anon public*. Cole em:
   - `js/config.js` desta pasta (Gerência)
   - topo do `js/script.js` do site de vendas (`SUPABASE_URL` e `SUPABASE_ANON_KEY`)
6. **Publicar a Gerência**: crie um repositório novo no GitHub (ex.: `gerencia-leiticia`),
   suba esta pasta e importe na Vercel (*Framework Preset: Other*).
7. **Trazer os produtos**: abra a Gerência → *Importar planilha* → *Pré-visualizar* → *Importar*.
   As fotos atuais continuam vindo do site de vendas; quando você trocar uma foto
   pela Gerência, ela passa a ficar no Supabase.
8. **Só depois do passo 7**, suba o `index.html` e o `js/script.js` novos no
   repositório do site de vendas. (Se subir antes, o site fica sem produtos.)

## Dia a dia

- **Preço**: clique no valor, digite (ex.: `39,90`) e aperte Enter.
- **Ordem no site**: arraste pela alça ⋮⋮. Funciona também com filtro de categoria.
- **Olho**: mostra/esconde o produto no site sem apagar.
- **Estrela**: coloca/tira dos “Nossos queridinhos”.
- **Lápis**: edita nome, descrição, categoria e foto. A foto é reduzida automaticamente.
- **Categorias**: renomear, reordenar, esconder ou criar novas. Categorias sem produto
  não aparecem nos filtros do site.

## Adicionar outra pessoa como administradora

1. Crie o usuário no Supabase (passo 2).
2. SQL Editor: `insert into public.admins (email) values ('email@dela.com');`
