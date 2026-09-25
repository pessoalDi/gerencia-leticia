/* ============================================================
   Gerência Leiticia — configuração
   Preencha com os dados do seu projeto Supabase:
   Supabase → Project Settings → API
   ============================================================ */
window.CONFIG = {
  // "Project URL"
  SUPABASE_URL: "https://oxhemopmgqbxlwezdvfm.supabase.co",

  // chave "anon public" (é pública por natureza; quem protege os dados são as regras do setup.sql)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94aGVtb3BtZ3FieGx3ZXpkdmZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTI1MDIsImV4cCI6MjEwNTc2ODUwMn0.m8P-QdEkQo6uRmSwD28c0Uo3VIz5uSAMOpEQPG9oNzw",

  // Endereço do site de vendas (sem barra no final). Usado no botão "Ver site"
  // e para converter os caminhos de imagem da planilha antiga.
  SITE_VENDAS_URL: "https://lets-mimos.vercel.app",

  // Planilha antiga (CSV publicado). Só é usada uma vez, na tela "Importar planilha".
  PLANILHA_ANTIGA_CSV: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTYj8AOCQZ_T5bWrHHGmMMuhiLwJ5qfaZHg4PjIJozQcORvLp4DUO214UkOedkXO-7TiJynIaI_-kyz/pub?gid=205037285&single=true&output=csv"
};
