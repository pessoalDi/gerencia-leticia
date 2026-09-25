/* ============================================================
   Gerência Leiticia — lógica do painel
   Banco: Supabase (tabelas produtos e categorias + Storage "produtos")
   ============================================================ */

const BUCKET = "produtos";

// Ideias de presente — os "id" precisam ser IGUAIS aos do site de vendas
// (js/script.js → IDEAS). A faixa de preço é automática no site e não aparece aqui.
const IDEIAS_PADRAO = [
  { grupo: "Datas comemorativas", itens: [
    ["dia-das-maes-pais", "Dia das Mães e dos Pais"],
    ["namorados", "Namorados e aniversário de casal"],
    ["professores", "Dia dos Professores"],
    ["criancas", "Dia das Crianças"],
    ["natal", "Natal e fim de ano"],
    ["dia-da-mulher", "Dia da Mulher"]
  ]},
  { grupo: "Ocasiões e celebrações", itens: [
    ["aniversario", "Aniversários"],
    ["maternidade", "Maternidade e chá de bebê"],
    ["religioso", "Batizado, comunhão e crisma"],
    ["casamento", "Casamento e padrinhos"],
    ["formatura", "Formaturas"],
    ["casa-nova", "Boas-vindas e casa nova"]
  ]},
  { grupo: "Para quem vai receber", itens: [
    ["para-ele", "Para ele"],
    ["para-ela", "Para ela"],
    ["amigos", "Amigos"],
    ["casais", "Casais"],
    ["avos", "Avós"],
    ["pets", "Pets e donos de pet"],
    ["trabalho", "Chefe, equipe e colegas"]
  ]},
  { grupo: "Por estilo do mimo", itens: [
    ["cultura-pop", "Gamer e cultura pop"],
    ["viagem", "Viagem e aventuras"],
    ["papelaria", "Papelaria afetiva"],
    ["corporativo", "Corporativo e eventos"]
  ]}
];
// As ideias vêm da tabela "ideias" (aba Ideias). A lista acima só é usada
// se a tabela ainda não existir no Supabase.
let IDEIAS = IDEIAS_PADRAO;
let NOME_IDEIA = Object.fromEntries(IDEIAS.flatMap((g) => g.itens));
const MAX_LADO_FOTO = 1200;   // px — maior lado da foto enviada
const QUALIDADE_FOTO = 0.85;

const state = {
  produtos: [],
  categorias: [],
  filtro: "todos",
  filtroIdeia: "",
  busca: "",
  kits: [],              // kits prontos por ideia
  kitsDisponivel: true,  // false se a migração de kits ainda não foi rodada
  ofertas: [],           // cards do topo do site
  ofertasDisponivel: true,
  ofertaEditando: null,
  ideias: [],            // ideias de presente cadastradas
  ideiasDisponivel: true,
  filtroKitIdeia: "",
  kitEditando: null,
  kitFotoNova: null,
  kitRemoverFoto: false,
  galTipos: [],          // galeria: tipos (Caderno A5, A6...)
  galFotos: [],          // galeria: fotos de trabalhos feitos
  galTipoSel: null,      // tipo aberto na aba Galeria
  galDisponivel: true,   // false se a migração da galeria ainda não foi rodada
  editando: null,        // produto aberto no formulário (null = novo)
  fotoNova: null,        // Blob redimensionado aguardando envio
  removerFoto: false,
  importacao: null
};

let sb = null;
let sortProdutos = null;
let sortCategorias = null;
let sortGalFotos = null;
let sortKits = null;
let sortGalTipos = null;

/* ---------------- utilidades ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const brlNumero = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "1.234,50" / "12,5" / "12.50" → 1234.5 / 12.5 / 12.5
function lerPreco(texto) {
  let t = String(texto ?? "").replace(/[R$\s]/g, "").trim();
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

function slug(texto) {
  return String(texto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let toastTimer;
function toast(msg, erro = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("erro", erro);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), erro ? 5000 : 2400);
}

function mensagemErro(err) {
  const m = (err && (err.message || err.error_description)) || String(err);
  if (/row-level security|permission denied/i.test(m)) return "Sem permissão. Confira se seu e-mail está na tabela admins do Supabase.";
  if (/duplicate key/i.test(m)) return "Já existe um produto com esse código.";
  if (/preco/i.test(m) && /galeria|column|schema cache/i.test(m)) return "Falta rodar o arquivo supabase/migracao-galeria-precos.sql no SQL Editor do Supabase.";
  if (/tags/i.test(m) && /column|schema cache/i.test(m)) return "Falta rodar o arquivo supabase/migracao-ideias.sql no SQL Editor do Supabase.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o banco. Verifique a internet e tente de novo.";
  return m;
}

function confirmar(texto, rotuloBotao = "Excluir") {
  const dlg = $("#dlgConfirma");
  $("#confirmaTexto").textContent = texto;
  $("#confirmaBotao").textContent = rotuloBotao;
  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "sim"), { once: true });
  });
}

function mostrarTela(id) {
  const carregando = $("#telaCarregando");
  if (carregando) carregando.hidden = true;
  if (carregando) carregando.style.display = "none";
  ["#telaConfig", "#telaLogin", "#telaApp"].forEach((t) => ($(t).hidden = t !== id));
}

function falhaAoIniciar(titulo, itens) {
  if (window.__mostrarErroGerencia) window.__mostrarErroGerencia(titulo, itens);
  else alert(titulo + "\n" + itens.join("\n"));
}

/* ---------------- início ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await iniciar();
  } catch (err) {
    console.error(err);
    falhaAoIniciar("A Gerência não abriu", [esc(mensagemErro(err))]);
  }
});

async function iniciar() {
  if (!window.supabase || !window.supabase.createClient) {
    falhaAoIniciar("A Gerência não abriu", ["A biblioteca do Supabase não carregou (cdn.jsdelivr.net). Teste em outra rede ou desative bloqueadores de anúncio."]);
    return;
  }
  if (!window.Sortable) {
    falhaAoIniciar("A Gerência não abriu", ["A biblioteca de arrastar e soltar não carregou (cdn.jsdelivr.net). Recarregue a página."]);
    return;
  }

  const cfg = window.CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("SEU-PROJETO") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("COLE-AQUI")) {
    mostrarTela("#telaConfig");
    return;
  }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  $("#linkSite").href = cfg.SITE_VENDAS_URL || "#";
  $("#csvUrl").value = cfg.PLANILHA_ANTIGA_CSV || "";

  ligarLogin();
  ligarAbas();
  ligarProdutos();
  ligarFormularioProduto();
  ligarCategorias();
  ligarGaleria();
  ligarKits();
  ligarOfertas();
  ligarIdeias();
  ligarImportacao();

  const { data } = await sb.auth.getSession();
  if (data.session) entrarNoPainel();
  else mostrarTela("#telaLogin");

  sb.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") mostrarTela("#telaLogin");
  });
}

/* ---------------- login ---------------- */
function ligarLogin() {
  $("#formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector("button[type=submit]");
    $("#loginErro").textContent = "";
    btn.disabled = true;
    btn.textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({
      email: f.email.value.trim(),
      password: f.senha.value
    });
    btn.disabled = false;
    btn.textContent = "Entrar";
    if (error) {
      $("#loginErro").textContent = /invalid/i.test(error.message)
        ? "E-mail ou senha incorretos."
        : mensagemErro(error);
      return;
    }
    f.senha.value = "";
    entrarNoPainel();
  });

  $("#btnSair").addEventListener("click", () => sb.auth.signOut());
}

async function entrarNoPainel() {
  const { data: ehAdmin, error } = await sb.rpc("is_admin");
  if (error || !ehAdmin) {
    await sb.auth.signOut();
    mostrarTela("#telaLogin");
    $("#loginErro").textContent = error
      ? "Não foi possível verificar a permissão. O setup.sql já foi rodado no Supabase?"
      : "Este usuário não tem acesso à Gerência. Adicione o e-mail na tabela admins.";
    return;
  }
  mostrarTela("#telaApp");
  await carregarTudo();
}

async function carregarTudo() {
  const [cats, prods] = await Promise.all([
    sb.from("categorias").select("*").order("posicao").order("nome"),
    sb.from("produtos").select("*").order("posicao").order("id"),
    carregarIdeias()
  ]);
  if (cats.error || prods.error) {
    toast(mensagemErro(cats.error || prods.error), true);
    return;
  }
  state.categorias = cats.data;
  state.produtos = prods.data;
  renderProdutos();
  renderCategorias();
  await Promise.all([carregarGaleria(), carregarKits(), carregarOfertas()]);
  renderIdeias();
}

async function carregarKits() {
  const { data, error } = await sb.from("kits").select("*").order("posicao").order("criado_em");
  state.kitsDisponivel = !error;
  state.kits = error ? [] : data;
  renderKits();
}

async function carregarGaleria() {
  const [tipos, fotos] = await Promise.all([
    sb.from("galeria_tipos").select("*").order("posicao").order("nome"),
    sb.from("galeria_fotos").select("*").order("posicao").order("criado_em")
  ]);
  if (tipos.error || fotos.error) {
    // tabelas ainda não existem: a aba mostra o aviso, o resto da Gerência segue normal
    state.galDisponivel = false;
    renderGaleria();
    return;
  }
  state.galDisponivel = true;
  state.galTipos = tipos.data;
  state.galFotos = fotos.data;
  if (!state.galTipos.some((t) => t.id === state.galTipoSel)) {
    state.galTipoSel = state.galTipos[0]?.id || null;
  }
  renderGaleria();
}

/* ---------------- abas ---------------- */
function ligarAbas() {
  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      const v = tab.dataset.view;
      $("#viewProdutos").hidden = v !== "produtos";
      $("#viewCategorias").hidden = v !== "categorias";
      $("#viewGaleria").hidden = v !== "galeria";
      $("#viewKits").hidden = v !== "kits";
      $("#viewOfertas").hidden = v !== "ofertas";
      $("#viewIdeias").hidden = v !== "ideias";
      $("#viewImportar").hidden = v !== "importar";
      window.scrollTo(0, 0);
    })
  );
}

/* ============================================================
   PRODUTOS
   ============================================================ */
function nomeCategoria(id) {
  const c = state.categorias.find((c) => c.id === id);
  return c ? c.nome : "Sem categoria";
}

function produtosVisiveis() {
  const q = state.busca.trim().toLowerCase();
  return state.produtos.filter((p) => {
    if (state.filtro === "ocultos" && p.ativo) return false;
    if (state.filtro !== "todos" && state.filtro !== "ocultos" && p.categoria !== state.filtro) return false;
    if (q && !(`${p.nome} ${p.id}`.toLowerCase().includes(q))) return false;
    const tags = p.tags || [];
    if (state.filtroIdeia === "__sem" && tags.length) return false;
    if (state.filtroIdeia && state.filtroIdeia !== "__sem" && !tags.includes(state.filtroIdeia)) return false;
    return true;
  });
}

function renderChips() {
  const cont = (fn) => state.produtos.filter(fn).length;
  const chips = [
    { id: "todos", nome: "Todos", n: state.produtos.length },
    ...state.categorias.map((c) => ({ id: c.id, nome: c.nome, n: cont((p) => p.categoria === c.id) })),
    { id: "ocultos", nome: "Fora do site", n: cont((p) => !p.ativo) }
  ];
  if (!state.categorias.some((c) => c.id === state.filtro) && !["todos", "ocultos"].includes(state.filtro)) {
    state.filtro = "todos";
  }
  $("#chipsCategorias").innerHTML = chips
    .map((c) => `<button type="button" class="chip${c.id === state.filtro ? " active" : ""}" data-filtro="${esc(c.id)}" aria-pressed="${c.id === state.filtro}">${esc(c.nome)} <b>${c.n}</b></button>`)
    .join("");
}

function renderFiltroIdeia() {
  const sel = $("#filtroIdeia");
  const conta = (id) => state.produtos.filter((p) => (p.tags || []).includes(id)).length;
  const semIdeia = state.produtos.filter((p) => !(p.tags || []).length).length;
  sel.innerHTML =
    `<option value="">Todas as ideias</option>
     <option value="__sem">Sem ideia marcada (${semIdeia})</option>` +
    IDEIAS.map((g) => `<optgroup label="${esc(g.grupo)}">${
      g.itens.map(([id, nome]) => `<option value="${id}">${esc(nome)} (${conta(id)})</option>`).join("")
    }</optgroup>`).join("");
  sel.value = state.filtroIdeia;
}

const ICONE_OLHO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONE_OLHO_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.5 4.9-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const ICONE_ESTRELA = (cheia) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="${cheia ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>`;
const ICONE_LAPIS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>`;

function linhaProduto(p) {
  const foto = p.imagem_url
    ? `<img src="${esc(p.imagem_url)}" alt="" loading="lazy">`
    : "sem foto";
  return `
  <li class="p-row${p.ativo ? "" : " is-off"}" data-id="${esc(p.id)}">
    <span class="grip" aria-hidden="true">⋮⋮</span>
    <div class="p-thumb">${foto}</div>
    <div class="p-info">
      <button type="button" class="p-name" data-acao="editar">${esc(p.nome)}</button>
      <span class="p-meta">${esc(p.id)} · ${esc(nomeCategoria(p.categoria))}${(p.tags || []).length ? ` · ${(p.tags || []).length} ${(p.tags || []).length === 1 ? "ideia" : "ideias"}` : ""}${p.ativo ? "" : " · fora do site"}</span>
    </div>
    <label class="p-price">
      <input type="text" inputmode="decimal" value="${brlNumero(p.preco)}" data-acao="preco" aria-label="Preço de ${esc(p.nome)}">
    </label>
    <div class="p-toggles">
      <button type="button" class="toggle t-ativo${p.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${p.ativo}" title="${p.ativo ? "Aparece no site — clique para esconder" : "Escondido — clique para mostrar no site"}">${p.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
      <button type="button" class="toggle t-fav${p.favorito ? " on" : ""}" data-acao="favorito" aria-pressed="${p.favorito}" title="${p.favorito ? "Está nos queridinhos — clique para tirar" : "Colocar nos queridinhos"}">${ICONE_ESTRELA(p.favorito)}</button>
    </div>
    <button type="button" class="icon-btn p-edit" data-acao="editar" aria-label="Editar ${esc(p.nome)}">${ICONE_LAPIS}</button>
  </li>`;
}

function renderProdutos() {
  renderChips();
  renderFiltroIdeia();
  const lista = produtosVisiveis();
  const total = state.produtos.length;
  const noSite = state.produtos.filter((p) => p.ativo).length;
  $("#resumoProdutos").textContent = total
    ? `${total} produto${total > 1 ? "s" : ""} · ${noSite} no site`
    : "";

  $("#listaProdutos").innerHTML = lista.map(linhaProduto).join("");
  $("#listaProdutos").hidden = lista.length === 0;

  const vazio = $("#vazioProdutos");
  vazio.hidden = lista.length > 0;
  if (!lista.length) {
    vazio.innerHTML = total
      ? `<p>Nenhum produto encontrado com esse filtro.</p>`
      : `<p>Ainda não há produtos cadastrados.</p>
         <button class="btn btn-primary" type="button" data-acao="novo">Cadastrar o primeiro</button>
         <p class="small" style="margin-top:12px">Ou traga tudo da planilha antiga pela aba “Importar planilha”.</p>`;
  }

  if (sortProdutos) sortProdutos.destroy();
  sortProdutos = new Sortable($("#listaProdutos"), {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: salvarOrdemProdutos
  });
}

// Reordena considerando o filtro: os itens visíveis trocam de lugar entre si,
// ocupando as mesmas "vagas" que já tinham na lista completa.
async function salvarOrdemProdutos(evt) {
  if (evt.oldIndex === evt.newIndex) return;
  const novaOrdemVisivel = $$("#listaProdutos .p-row").map((li) => li.dataset.id);
  const visiveis = new Set(novaOrdemVisivel);
  const fila = [...novaOrdemVisivel];
  const completa = state.produtos.map((p) => (visiveis.has(p.id) ? fila.shift() : p.id));

  const porId = Object.fromEntries(state.produtos.map((p) => [p.id, p]));
  state.produtos = completa.map((id, i) => ({ ...porId[id], posicao: i + 1 }));

  const { error } = await sb.rpc("reordenar_produtos", { ids: completa });
  if (error) {
    toast(mensagemErro(error), true);
    await carregarTudo();
  } else {
    toast("Ordem salva");
  }
}

async function atualizarProduto(id, campos) {
  const { data, error } = await sb.from("produtos").update(campos).eq("id", id).select().single();
  if (error) throw error;
  const i = state.produtos.findIndex((p) => p.id === id);
  if (i >= 0) state.produtos[i] = data;
  return data;
}

function ligarProdutos() {
  $("#busca").addEventListener("input", (e) => {
    state.busca = e.target.value;
    renderProdutos();
  });

  $("#filtroIdeia").addEventListener("change", (e) => {
    state.filtroIdeia = e.target.value;
    renderProdutos();
  });

  $("#chipsCategorias").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.filtro = chip.dataset.filtro;
    renderProdutos();
  });

  $("#btnNovoProduto").addEventListener("click", () => abrirProduto(null));
  $("#vazioProdutos").addEventListener("click", (e) => {
    if (e.target.closest("[data-acao=novo]")) abrirProduto(null);
  });

  const lista = $("#listaProdutos");

  lista.addEventListener("click", async (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    const id = alvo.closest(".p-row").dataset.id;
    const p = state.produtos.find((x) => x.id === id);
    if (!p) return;

    if (alvo.dataset.acao === "editar") abrirProduto(p);

    if (alvo.dataset.acao === "ativo" || alvo.dataset.acao === "favorito") {
      const campo = alvo.dataset.acao;
      alvo.disabled = true;
      try {
        await atualizarProduto(id, { [campo]: !p[campo] });
        renderProdutos();
        toast(campo === "ativo"
          ? (!p[campo] ? "Produto visível no site" : "Produto escondido do site")
          : (!p[campo] ? "Adicionado aos queridinhos" : "Removido dos queridinhos"));
      } catch (err) {
        alvo.disabled = false;
        toast(mensagemErro(err), true);
      }
    }
  });

  // preço: salva ao sair do campo ou apertar Enter
  lista.addEventListener("keydown", (e) => {
    if (e.target.dataset.acao === "preco" && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
    if (e.target.dataset.acao === "preco" && e.key === "Escape") {
      const p = state.produtos.find((x) => x.id === e.target.closest(".p-row").dataset.id);
      e.target.value = brlNumero(p.preco);
      e.target.blur();
    }
  });

  lista.addEventListener("focusout", async (e) => {
    const input = e.target;
    if (input.dataset.acao !== "preco") return;
    const caixa = input.closest(".p-price");
    const id = input.closest(".p-row").dataset.id;
    const p = state.produtos.find((x) => x.id === id);
    const valor = lerPreco(input.value);

    caixa.classList.remove("saved", "error");
    if (Number.isNaN(valor)) {
      caixa.classList.add("error");
      toast("Preço inválido. Use o formato 12,50", true);
      input.value = brlNumero(p.preco);
      return;
    }
    if (valor === Number(p.preco)) {
      input.value = brlNumero(p.preco);
      return;
    }
    try {
      await atualizarProduto(id, { preco: valor });
      input.value = brlNumero(valor);
      caixa.classList.add("saved");
      setTimeout(() => caixa.classList.remove("saved"), 1400);
      toast(`${p.nome}: R$ ${brlNumero(valor)}`);
    } catch (err) {
      caixa.classList.add("error");
      input.value = brlNumero(p.preco);
      toast(mensagemErro(err), true);
    }
  });
}

/* ---------------- formulário de produto ---------------- */
function sugerirCodigo(categoriaId) {
  const daCategoria = state.produtos.filter((p) => p.categoria === categoriaId);
  const prefixos = {};
  daCategoria.forEach((p) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(p.id);
    if (m) prefixos[m[1].toUpperCase()] = (prefixos[m[1].toUpperCase()] || 0) + 1;
  });
  const prefixo = Object.keys(prefixos).sort((a, b) => prefixos[b] - prefixos[a])[0]
    || slug(categoriaId || "prod").replace(/-/g, "").slice(0, 3).toUpperCase()
    || "PROD";

  const usados = new Set(state.produtos.map((p) => p.id.toUpperCase()));
  let n = 1;
  state.produtos.forEach((p) => {
    const m = new RegExp(`^${prefixo}(\\d+)$`, "i").exec(p.id);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  });
  let cod = `${prefixo}${String(n).padStart(2, "0")}`;
  while (usados.has(cod)) cod = `${prefixo}${String(++n).padStart(2, "0")}`;
  return cod;
}

function mostrarFoto(url) {
  const img = $("#fotoPreview");
  if (url) {
    img.src = url;
    img.hidden = false;
    $("#fotoVazia").hidden = true;
    $("#btnRemoverFoto").hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    $("#fotoVazia").hidden = false;
    $("#btnRemoverFoto").hidden = true;
  }
}

function abrirProduto(p) {
  const f = $("#formProduto");
  state.editando = p;
  state.fotoNova = null;
  state.removerFoto = false;
  $("#produtoErro").textContent = "";
  $("#fotoInput").value = "";

  $("#campoCategoria").innerHTML =
    state.categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("") +
    `<option value="">Sem categoria</option>`;

  $("#dlgProdutoTitulo").textContent = p ? "Editar produto" : "Novo produto";
  $("#btnExcluirProduto").hidden = !p;
  $("#btnSalvarProduto").textContent = p ? "Salvar alterações" : "Cadastrar produto";

  const catInicial = p ? (p.categoria || "") :
    (state.categorias.some((c) => c.id === state.filtro) ? state.filtro : (state.categorias[0]?.id || ""));

  f.categoria.value = catInicial;
  f.id.value = p ? p.id : sugerirCodigo(catInicial);
  f.id.readOnly = !!p;
  $("#codigoAjuda").textContent = p
    ? "O código não muda depois de cadastrado."
    : "Sugestão automática pela categoria. Pode editar.";
  f.nome.value = p?.nome || "";
  f.descricao.value = p?.descricao || "";
  f.preco.value = p ? brlNumero(p.preco) : "";
  const marcadas = new Set(p?.tags || (state.filtroIdeia && state.filtroIdeia !== "__sem" ? [state.filtroIdeia] : []));
  $("#campoIdeias").innerHTML = IDEIAS.map((g) => `
    <div class="idea-group">
      <p class="idea-group-title">${esc(g.grupo)}</p>
      <div class="idea-chips">
        ${g.itens.map(([id, nome]) => `
          <label class="idea-chip">
            <input type="checkbox" name="ideia" value="${id}"${marcadas.has(id) ? " checked" : ""}>
            <span>${esc(nome)}</span>
          </label>`).join("")}
      </div>
    </div>`).join("");
  f.ativo.checked = p ? p.ativo : true;
  f.favorito.checked = p ? p.favorito : false;
  mostrarFoto(p?.imagem_url || null);

  $("#dlgProduto").showModal();
  if (!p) setTimeout(() => f.nome.focus(), 50);
}

function redimensionar(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, MAX_LADO_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * escala);
      const h = Math.round(img.naturalHeight * escala);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar a foto."))), "image/jpeg", QUALIDADE_FOTO);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo de imagem não reconhecido. Use JPG, PNG ou WEBP."));
    };
    img.src = url;
  });
}

// caminho do arquivo dentro do bucket, se a URL for do nosso Storage
function caminhoNoStorage(url) {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
}

async function apagarFotoDoStorage(url) {
  const caminho = caminhoNoStorage(url);
  if (caminho) await sb.storage.from(BUCKET).remove([caminho]);
}

function ligarFormularioProduto() {
  const f = $("#formProduto");
  const dlg = $("#dlgProduto");

  f.categoria.addEventListener("change", () => {
    if (!state.editando) f.id.value = sugerirCodigo(f.categoria.value);
  });

  $("#fotoInput").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      state.fotoNova = await redimensionar(arquivo);
      state.removerFoto = false;
      mostrarFoto(URL.createObjectURL(state.fotoNova));
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#btnRemoverFoto").addEventListener("click", () => {
    state.fotoNova = null;
    state.removerFoto = true;
    $("#fotoInput").value = "";
    mostrarFoto(null);
  });

  f.addEventListener("submit", async (e) => {
    // botões "Cancelar"/"Fechar" também disparam submit num form method="dialog":
    // deixa o diálogo fechar normalmente
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const erro = $("#produtoErro");
    erro.textContent = "";

    const codigo = f.id.value.trim().toUpperCase().replace(/\s+/g, "");
    const nome = f.nome.value.trim();
    const preco = lerPreco(f.preco.value);

    if (!codigo) return (erro.textContent = "Informe o código do produto.");
    if (!/^[A-Z0-9_-]+$/.test(codigo)) return (erro.textContent = "O código deve ter só letras, números, - ou _.");
    if (!nome) return (erro.textContent = "Informe o nome do produto.");
    if (Number.isNaN(preco)) return (erro.textContent = "Preço inválido. Use o formato 12,50.");
    if (!state.editando && state.produtos.some((p) => p.id.toUpperCase() === codigo)) {
      return (erro.textContent = `Já existe um produto com o código ${codigo}.`);
    }

    const btn = $("#btnSalvarProduto");
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando…";

    try {
      const antigo = state.editando;
      let imagem_url = antigo?.imagem_url || null;

      if (state.fotoNova) {
        const caminho = `${codigo}-${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(caminho, state.fotoNova, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false
        });
        if (upErr) throw upErr;
        imagem_url = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      } else if (state.removerFoto) {
        imagem_url = null;
      }

      const campos = {
        nome,
        categoria: f.categoria.value || null,
        descricao: f.descricao.value.trim(),
        preco,
        ativo: f.ativo.checked,
        favorito: f.favorito.checked,
        imagem_url,
        tags: $$('#campoIdeias input[name="ideia"]:checked').map((i) => i.value)
      };

      if (antigo) {
        await atualizarProduto(antigo.id, campos);
        toast("Alterações salvas");
      } else {
        const posicao = Math.max(0, ...state.produtos.map((p) => p.posicao || 0)) + 1;
        const { data, error } = await sb.from("produtos").insert({ id: codigo, posicao, ...campos }).select().single();
        if (error) throw error;
        state.produtos.push(data);
        toast("Produto cadastrado");
      }

      // foto antiga substituída ou removida: apaga do Storage para não acumular
      if (antigo?.imagem_url && antigo.imagem_url !== imagem_url) {
        apagarFotoDoStorage(antigo.imagem_url).catch(() => {});
      }

      dlg.close();
      renderProdutos();
      renderCategorias();
    } catch (err) {
      erro.textContent = mensagemErro(err);
    } finally {
      btn.disabled = false;
      btn.textContent = rotulo;
    }
  });

  $("#btnExcluirProduto").addEventListener("click", async () => {
    const p = state.editando;
    if (!p) return;
    const ok = await confirmar(`Excluir “${p.nome}” (${p.id})? Isso não pode ser desfeito. Se quiser só tirar do site, use o botão de visibilidade.`);
    if (!ok) return;
    const { error } = await sb.from("produtos").delete().eq("id", p.id);
    if (error) return toast(mensagemErro(error), true);
    apagarFotoDoStorage(p.imagem_url).catch(() => {});
    state.produtos = state.produtos.filter((x) => x.id !== p.id);
    dlg.close();
    renderProdutos();
    renderCategorias();
    toast("Produto excluído");
  });
}

/* ============================================================
   CATEGORIAS
   ============================================================ */
function renderCategorias() {
  const lista = $("#listaCategorias");
  lista.innerHTML = state.categorias
    .map((c) => {
      const n = state.produtos.filter((p) => p.categoria === c.id).length;
      return `
      <li class="c-row${c.ativo ? "" : " is-off"}" data-id="${esc(c.id)}">
        <span class="grip" aria-hidden="true">⋮⋮</span>
        <div>
          <input type="text" value="${esc(c.nome)}" data-acao="nome" aria-label="Nome da categoria ${esc(c.nome)}">
          <span class="c-id">código interno: ${esc(c.id)}</span>
        </div>
        <span class="c-count">${n} produto${n === 1 ? "" : "s"}</span>
        <button type="button" class="toggle t-ativo${c.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${c.ativo}" title="${c.ativo ? "Aparece no site — clique para esconder" : "Escondida — clique para mostrar"}">${c.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
        <button type="button" class="icon-btn danger" data-acao="excluir" aria-label="Excluir categoria ${esc(c.nome)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
        </button>
      </li>`;
    })
    .join("");

  if (sortCategorias) sortCategorias.destroy();
  sortCategorias = new Sortable(lista, {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const ids = $$("#listaCategorias .c-row").map((li) => li.dataset.id);
      const porId = Object.fromEntries(state.categorias.map((c) => [c.id, c]));
      state.categorias = ids.map((id, i) => ({ ...porId[id], posicao: i + 1 }));
      const { error } = await sb.rpc("reordenar_categorias", { ids });
      if (error) {
        toast(mensagemErro(error), true);
        await carregarTudo();
      } else {
        toast("Ordem salva");
        renderChips();
      }
    }
  });
}

function ligarCategorias() {
  $("#formCategoria").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    const id = slug(nome);
    if (!id) return;
    if (state.categorias.some((c) => c.id === id)) return toast(`A categoria “${nome}” já existe.`, true);
    const posicao = Math.max(0, ...state.categorias.map((c) => c.posicao || 0)) + 1;
    const { data, error } = await sb.from("categorias").insert({ id, nome, posicao }).select().single();
    if (error) return toast(mensagemErro(error), true);
    state.categorias.push(data);
    e.target.reset();
    renderCategorias();
    renderChips();
    toast("Categoria adicionada");
  });

  const lista = $("#listaCategorias");

  lista.addEventListener("keydown", (e) => {
    if (e.target.dataset.acao === "nome" && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  });

  lista.addEventListener("focusout", async (e) => {
    if (e.target.dataset.acao !== "nome") return;
    const id = e.target.closest(".c-row").dataset.id;
    const c = state.categorias.find((x) => x.id === id);
    const nome = e.target.value.trim();
    if (!nome) { e.target.value = c.nome; return; }
    if (nome === c.nome) return;
    const { error } = await sb.from("categorias").update({ nome }).eq("id", id);
    if (error) { e.target.value = c.nome; return toast(mensagemErro(error), true); }
    c.nome = nome;
    renderChips();
    toast("Nome atualizado");
  });

  lista.addEventListener("click", async (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo || alvo.dataset.acao === "nome") return;
    const id = alvo.closest(".c-row").dataset.id;
    const c = state.categorias.find((x) => x.id === id);

    if (alvo.dataset.acao === "ativo") {
      const { error } = await sb.from("categorias").update({ ativo: !c.ativo }).eq("id", id);
      if (error) return toast(mensagemErro(error), true);
      c.ativo = !c.ativo;
      renderCategorias();
      toast(c.ativo ? "Categoria visível no site" : "Categoria escondida do site");
    }

    if (alvo.dataset.acao === "excluir") {
      const n = state.produtos.filter((p) => p.categoria === id).length;
      if (n > 0) {
        return toast(`“${c.nome}” tem ${n} produto${n > 1 ? "s" : ""}. Mude a categoria deles antes de excluir.`, true);
      }
      const ok = await confirmar(`Excluir a categoria “${c.nome}”?`);
      if (!ok) return;
      const { error } = await sb.from("categorias").delete().eq("id", id);
      if (error) return toast(mensagemErro(error), true);
      state.categorias = state.categorias.filter((x) => x.id !== id);
      renderCategorias();
      renderChips();
      toast("Categoria excluída");
    }
  });
}

/* ============================================================
   IDEIAS DE PRESENTE — cadastro (aba Ideias)
   ============================================================ */
// transforma as linhas da tabela no formato usado nas telas: [{ grupo, itens: [[id, nome], ...] }]
function montarIdeias() {
  if (!state.ideiasDisponivel) {
    IDEIAS = IDEIAS_PADRAO;
  } else {
    const grupos = [];
    state.ideias.forEach((i) => {
      let g = grupos.find((x) => x.grupo === i.grupo);
      if (!g) { g = { grupo: i.grupo, itens: [] }; grupos.push(g); }
      g.itens.push([i.id, i.ativo ? i.nome : `${i.nome} (oculta)`]);
    });
    IDEIAS = grupos;
  }
  NOME_IDEIA = Object.fromEntries(IDEIAS.flatMap((g) => g.itens));
}

async function carregarIdeias() {
  const { data, error } = await sb.from("ideias").select("*").order("posicao").order("nome");
  state.ideiasDisponivel = !error;
  state.ideias = error ? [] : data;
  montarIdeias();
}

// quantos produtos e kits usam a ideia
function usoIdeia(id) {
  const p = state.produtos.filter((x) => (x.tags || []).includes(id)).length;
  const k = state.kits.filter((x) => (x.ideias || []).includes(id)).length;
  return { p, k };
}

function gruposOrdenados() {
  const grupos = [];
  state.ideias.forEach((i) => { if (!grupos.includes(i.grupo)) grupos.push(i.grupo); });
  return grupos;
}

let sortIdeias = [];

function renderIdeias() {
  const lista = $("#listaIdeias");
  const vazio = $("#vazioIdeias");
  const form = $("#formIdeia");
  form.hidden = !state.ideiasDisponivel;

  if (!state.ideiasDisponivel) {
    lista.innerHTML = "";
    vazio.hidden = false;
    vazio.innerHTML = `<p>Falta criar a tabela de ideias: rode o arquivo <code>supabase/migracao-ideias-editaveis.sql</code> no SQL Editor do Supabase e recarregue a página.</p><p class="small" style="margin-top:8px">Enquanto isso, o site usa a lista fixa de ideias.</p>`;
    return;
  }

  const grupos = gruposOrdenados();
  const ativas = state.ideias.filter((i) => i.ativo).length;
  $("#resumoIdeias").textContent = `${state.ideias.length} ideias em ${grupos.length} grupos · ${ativas} no site · as faixas de preço (até R$ 30…) são automáticas`;

  // select de grupo do formulário
  const sel = $("#ideiaGrupo");
  const atual = sel.value;
  sel.innerHTML = grupos.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("") +
    `<option value="__novo">+ Criar novo grupo…</option>`;
  sel.value = grupos.includes(atual) || atual === "__novo" ? atual : (grupos[0] || "__novo");
  $("#ideiaGrupoNovoCampo").hidden = sel.value !== "__novo";

  vazio.hidden = state.ideias.length > 0;
  if (!state.ideias.length) vazio.innerHTML = `<p>Nenhuma ideia cadastrada. Crie a primeira acima.</p>`;

  lista.innerHTML = grupos.map((g, gi) => {
    const itens = state.ideias.filter((i) => i.grupo === g);
    return `
    <section class="ideia-grupo" data-grupo="${esc(g)}">
      <div class="ideia-grupo-head">
        <input type="text" value="${esc(g)}" data-acao="grupo-nome" aria-label="Nome do grupo ${esc(g)}">
        <span class="g-count">${itens.length} ${itens.length === 1 ? "ideia" : "ideias"}</span>
        <button type="button" class="icon-btn" data-acao="grupo-subir" aria-label="Subir grupo"${gi === 0 ? " disabled" : ""}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
        <button type="button" class="icon-btn" data-acao="grupo-descer" aria-label="Descer grupo"${gi === grupos.length - 1 ? " disabled" : ""}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <ul class="cat-list" data-lista-grupo="${esc(g)}">
        ${itens.map((i) => {
          const u = usoIdeia(i.id);
          const uso = [u.p ? `${u.p} ${u.p === 1 ? "produto" : "produtos"}` : "", u.k ? `${u.k} ${u.k === 1 ? "kit" : "kits"}` : ""].filter(Boolean).join(" · ") || "sem produtos";
          return `
          <li class="i-row${i.ativo ? "" : " is-off"}" data-id="${esc(i.id)}">
            <span class="grip" aria-hidden="true">⋮⋮</span>
            <input class="i-nome" type="text" value="${esc(i.nome)}" data-acao="nome" aria-label="Nome da ideia">
            <input class="i-dica" type="text" value="${esc(i.dica || "")}" placeholder="Detalhe (opcional)" data-acao="dica" aria-label="Detalhe da ideia">
            <span class="i-uso">${uso}</span>
            <button type="button" class="toggle t-ativo${i.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${i.ativo}" title="${i.ativo ? "Aparece no site — clique para esconder" : "Escondida — clique para mostrar no site"}">${i.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
            <button type="button" class="icon-btn danger i-del" data-acao="excluir" aria-label="Excluir ideia ${esc(i.nome)}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
            </button>
          </li>`;
        }).join("")}
      </ul>
    </section>`;
  }).join("");

  sortIdeias.forEach((s) => s.destroy());
  sortIdeias = $$("#listaIdeias [data-lista-grupo]").map((ul) => new Sortable(ul, {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    onEnd: (evt) => { if (evt.oldIndex !== evt.newIndex) salvarOrdemIdeias(); }
  }));
}

// a ordem salva segue a tela: grupo por grupo, ideia por ideia
async function salvarOrdemIdeias(grupos = null) {
  const ordemGrupos = grupos || $$("#listaIdeias .ideia-grupo").map((s) => s.dataset.grupo);
  const ids = [];
  ordemGrupos.forEach((g) => {
    const naTela = $$(`#listaIdeias [data-lista-grupo="${CSS.escape(g)}"] .i-row`).map((li) => li.dataset.id);
    const doGrupo = naTela.length ? naTela : state.ideias.filter((i) => i.grupo === g).map((i) => i.id);
    ids.push(...doGrupo);
  });
  const porId = Object.fromEntries(state.ideias.map((i) => [i.id, i]));
  state.ideias = ids.map((id, n) => ({ ...porId[id], posicao: n + 1 }));
  const { error } = await sb.rpc("reordenar_ideias", { ids });
  if (error) { toast(mensagemErro(error), true); await recarregarIdeias(); return; }
  aposMudarIdeias();
  toast("Ordem salva");
}

async function recarregarIdeias() {
  await carregarIdeias();
  aposMudarIdeias();
}

// as outras telas usam a lista de ideias: atualiza todas
function aposMudarIdeias() {
  montarIdeias();
  renderIdeias();
  renderProdutos();
  renderKits();
  renderOfertas();
}

async function atualizarIdeia(id, campos) {
  const { data, error } = await sb.from("ideias").update(campos).eq("id", id).select().single();
  if (error) throw error;
  state.ideias = state.ideias.map((i) => (i.id === id ? data : i));
  return data;
}

function ligarIdeias() {
  const form = $("#formIdeia");

  $("#ideiaGrupo").addEventListener("change", (e) => {
    $("#ideiaGrupoNovoCampo").hidden = e.target.value !== "__novo";
    if (e.target.value === "__novo") setTimeout(() => form.grupoNovo.focus(), 30);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("#ideiaErro");
    erro.textContent = "";
    const nome = form.nome.value.trim();
    const grupo = form.grupo.value === "__novo" ? form.grupoNovo.value.trim() : form.grupo.value;
    if (!nome) return (erro.textContent = "Informe o nome da ideia.");
    if (!grupo) return (erro.textContent = "Informe o nome do novo grupo.");

    // código a partir do nome, sem repetir nenhum existente nem as faixas de preço
    const reservados = new Set(["ate-30", "30-a-70", "acima-70", ...state.ideias.map((i) => i.id)]);
    const base = slug(nome) || "ideia";
    let id = base, n = 2;
    while (reservados.has(id)) id = `${base}-${n++}`;

    // entra no fim do grupo escolhido
    const grupos = gruposOrdenados();
    if (!grupos.includes(grupo)) grupos.push(grupo);
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { data, error } = await sb.from("ideias")
        .insert({ id, nome, dica: form.dica.value.trim(), grupo, posicao: 9999 })
        .select().single();
      if (error) throw error;
      state.ideias.push(data);
      form.reset();
      renderIdeias();
      await salvarOrdemIdeias(grupos);
      toast(`Ideia “${nome}” criada. Marque os produtos nela pela aba Produtos.`);
    } catch (err) {
      erro.textContent = mensagemErro(err);
    } finally {
      btn.disabled = false;
    }
  });

  const lista = $("#listaIdeias");

  lista.addEventListener("keydown", (e) => {
    if (e.target.matches("input[data-acao]") && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
  });

  // renomear ideia / detalhe / grupo
  lista.addEventListener("focusout", async (e) => {
    const input = e.target;
    const acao = input.dataset && input.dataset.acao;
    if (!acao) return;

    if (acao === "grupo-nome") {
      const antigo = input.closest(".ideia-grupo").dataset.grupo;
      const novo = input.value.trim();
      if (!novo) { input.value = antigo; return; }
      if (novo === antigo) return;
      if (gruposOrdenados().includes(novo)) { input.value = antigo; return toast(`Já existe um grupo “${novo}”.`, true); }
      const { error } = await sb.from("ideias").update({ grupo: novo }).eq("grupo", antigo);
      if (error) { input.value = antigo; return toast(mensagemErro(error), true); }
      state.ideias = state.ideias.map((i) => (i.grupo === antigo ? { ...i, grupo: novo } : i));
      aposMudarIdeias();
      return toast("Nome do grupo atualizado");
    }

    if (acao !== "nome" && acao !== "dica") return;
    const id = input.closest(".i-row").dataset.id;
    const ideia = state.ideias.find((i) => i.id === id);
    const valor = input.value.trim();
    if (acao === "nome" && !valor) { input.value = ideia.nome; return; }
    if (valor === (ideia[acao] || "")) return;
    try {
      await atualizarIdeia(id, { [acao]: valor });
      input.classList.add("saved");
      setTimeout(() => input.classList.remove("saved"), 1200);
      montarIdeias();
      renderProdutos(); renderKits(); renderOfertas();
      toast(acao === "nome" ? "Nome atualizado" : "Detalhe atualizado");
    } catch (err) {
      input.value = ideia[acao] || "";
      toast(mensagemErro(err), true);
    }
  });

  lista.addEventListener("click", async (e) => {
    const alvo = e.target.closest("button[data-acao]");
    if (!alvo) return;
    const acao = alvo.dataset.acao;

    if (acao === "grupo-subir" || acao === "grupo-descer") {
      const grupos = gruposOrdenados();
      const g = alvo.closest(".ideia-grupo").dataset.grupo;
      const i = grupos.indexOf(g);
      const j = acao === "grupo-subir" ? i - 1 : i + 1;
      if (j < 0 || j >= grupos.length) return;
      [grupos[i], grupos[j]] = [grupos[j], grupos[i]];
      return salvarOrdemIdeias(grupos);
    }

    const id = alvo.closest(".i-row").dataset.id;
    const ideia = state.ideias.find((i) => i.id === id);
    if (!ideia) return;

    if (acao === "ativo") {
      try {
        await atualizarIdeia(id, { ativo: !ideia.ativo });
        aposMudarIdeias();
        toast(!ideia.ativo ? "Ideia visível no site" : "Ideia escondida do site");
      } catch (err) {
        toast(mensagemErro(err), true);
      }
    }

    if (acao === "excluir") {
      const u = usoIdeia(id);
      const usada = u.p || u.k
        ? ` Ela sai de ${[u.p ? `${u.p} produto(s)` : "", u.k ? `${u.k} kit(s)` : ""].filter(Boolean).join(" e ")}; os produtos continuam no site.`
        : "";
      const ok = await confirmar(`Excluir a ideia “${ideia.nome}”?${usada} Se quiser só tirar do site por um tempo, use o botão de visibilidade.`);
      if (!ok) return;
      try {
        // tira a marcação dos produtos e kits
        for (const p of state.produtos.filter((x) => (x.tags || []).includes(id))) {
          await atualizarProduto(p.id, { tags: p.tags.filter((t) => t !== id) });
        }
        for (const k of state.kits.filter((x) => (x.ideias || []).includes(id))) {
          await atualizarKit(k.id, { ideias: k.ideias.filter((t) => t !== id) });
        }
        const { error } = await sb.from("ideias").delete().eq("id", id);
        if (error) throw error;
        state.ideias = state.ideias.filter((i) => i.id !== id);
        aposMudarIdeias();
        toast("Ideia excluída");
      } catch (err) {
        toast(mensagemErro(err), true);
      }
    }
  });
}

/* ============================================================
   OFERTAS — cards do topo do site (Hero)
   ============================================================ */
// Mesmos ícones do site de vendas (js/script.js → OFFER_ICONS)
const ICONES_OFERTA = [
  ["presente", "Presente", '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8c-2-3-6-4-6-1.5S10 8 12 8Zm0 0c2-3 6-4 6-1.5S14 8 12 8Z"/>'],
  ["coracao", "Coração", '<path d="M12 20S4 15 4 9.5A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 8 1.9C20 15 12 20 12 20Z"/>'],
  ["coracoes", "Corações", '<path d="M9 18s-6-3.6-6-7.6A3.2 3.2 0 0 1 9 9a3.2 3.2 0 0 1 6 1.4"/><path d="M15.5 20.5S11 18 11 15a2.5 2.5 0 0 1 4.5-1.5A2.5 2.5 0 0 1 20 15c0 3-4.5 5.5-4.5 5.5Z"/>'],
  ["balao", "Balão", '<ellipse cx="12" cy="9.5" rx="6" ry="7"/><path d="M12 16.5v1.5M12 18c0 2-2 2-2 4"/><path d="M11 16.3h2"/>'],
  ["brilho", "Brilho", '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/><path d="M19 3v3M17.5 4.5h3"/>'],
  ["bolo", "Bolo", '<path d="M4 21h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7Z"/><path d="M4 16c1.3 1.2 2.7 1.2 4 0s2.7-1.2 4 0 2.7 1.2 4 0 2.7-1.2 4 0"/><path d="M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5Z"/>'],
  ["estrela", "Estrela", '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8L12 3Z"/>'],
  ["flor", "Flor", '<circle cx="12" cy="10" r="2.2"/><path d="M12 7.8C12 5 13.5 3.5 12 3c-1.5.5 0 2 0 4.8ZM14.2 10c2.8 0 4.3-1.5 4.8 0-.5 1.5-2 0-4.8 0ZM12 12.2c0 2.8 1.5 4.3 0 4.8-1.5-.5 0-2 0-4.8ZM9.8 10C7 10 5.5 11.5 5 10c.5-1.5 2 0 4.8 0Z"/><path d="M12 17v4"/>'],
  ["diploma", "Formatura", '<path d="M2 9l10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>'],
  ["bebe", "Bebê", '<circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/><path d="M10.5 8h.01M13.5 8h.01"/>'],
  ["arvore", "Árvore", '<path d="M12 3l5 7h-3l4 6H6l4-6H7l5-7Z"/><path d="M12 16v5"/>'],
  ["casa", "Casa", '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M10 21v-6h4v6"/>'],
  ["pata", "Pet", '<circle cx="7" cy="10" r="1.6"/><circle cx="10.5" cy="6.5" r="1.6"/><circle cx="14.5" cy="6.5" r="1.6"/><circle cx="18" cy="10" r="1.6"/><path d="M12 12c-3 0-5 3-5 5.5 0 1.5 1.5 2 3 1.5s2.5-.5 4 0 3 0 3-1.5C17 15 15 12 12 12Z"/>'],
  ["tag", "Etiqueta", '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>']
];
const PATH_ICONE = Object.fromEntries(ICONES_OFERTA.map(([id, , p]) => [id, p]));
const svgOferta = (id, size = 22) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATH_ICONE[id] || PATH_ICONE.presente}</svg>`;

// ideias que o card pode abrir (as faixas de preço também existem no site)
const FAIXAS_PRECO = { grupo: "Por faixa de preço", itens: [["ate-30", "Mimos até R$ 30"], ["30-a-70", "Kits de R$ 30 a R$ 70"], ["acima-70", "Presentes especiais (acima de R$ 70)"]] };
const ideiasOferta = () => [...IDEIAS, FAIXAS_PRECO];
const nomeIdeiaOferta = (id) => Object.fromEntries(ideiasOferta().flatMap((g) => g.itens))[id];

let sortOfertas = null;

async function carregarOfertas() {
  const { data, error } = await sb.from("ofertas").select("*").order("posicao").order("criado_em");
  state.ofertasDisponivel = !error;
  state.ofertas = error ? [] : data;
  renderOfertas();
}

function renderOfertas() {
  const lista = $("#listaOfertas");
  const vazio = $("#vazioOfertas");
  $("#btnNovaOferta").disabled = !state.ofertasDisponivel;

  if (!state.ofertasDisponivel) {
    lista.hidden = true;
    vazio.hidden = false;
    vazio.innerHTML = `<p>Falta criar a tabela de ofertas: rode o arquivo <code>supabase/migracao-ofertas.sql</code> no SQL Editor do Supabase e recarregue a página.</p><p class="small" style="margin-top:8px">Enquanto isso, o site mostra as 6 ofertas padrão.</p>`;
    return;
  }

  const noSite = state.ofertas.filter((o) => o.ativo).length;
  $("#resumoOfertas").textContent = state.ofertas.length
    ? `${state.ofertas.length} oferta${state.ofertas.length > 1 ? "s" : ""} · ${noSite} no site · aparecem no topo do site, ao lado do título`
    : "Cards que aparecem no topo do site, ao lado do título.";

  lista.hidden = !state.ofertas.length;
  vazio.hidden = !!state.ofertas.length;
  if (!state.ofertas.length) {
    vazio.innerHTML = `<p>Nenhuma oferta cadastrada. Sem ofertas, o topo do site mostra só o título e o botão do WhatsApp.</p><button class="btn btn-primary" type="button" data-acao="nova-oferta">Criar a primeira oferta</button>`;
  }

  lista.innerHTML = state.ofertas.map((o) => {
    const destino = o.ideia
      ? `mostra: ${nomeIdeiaOferta(o.ideia) || `${o.ideia} (ideia excluída — o card abre o WhatsApp)`}`
      : "abre o WhatsApp";
    return `
    <li class="p-row${o.ativo ? "" : " is-off"}" data-id="${esc(o.id)}">
      <span class="grip" aria-hidden="true">⋮⋮</span>
      <div class="p-thumb o-icon">${svgOferta(o.icone)}</div>
      <div class="p-info">
        <button type="button" class="p-name" data-acao="editar">${esc(o.nome)}</button>
        <span class="p-meta">${o.detalhe ? `${esc(o.detalhe)} · ` : ""}${esc(destino)}${o.ativo ? "" : " · fora do site"}</span>
      </div>
      <span class="p-price o-spacer" aria-hidden="true"></span>
      <div class="p-toggles">
        <button type="button" class="toggle t-ativo${o.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${o.ativo}" title="${o.ativo ? "Aparece no site — clique para esconder" : "Escondida — clique para mostrar no site"}">${o.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
      </div>
      <button type="button" class="icon-btn p-edit" data-acao="editar" aria-label="Editar ${esc(o.nome)}">${ICONE_LAPIS}</button>
    </li>`;
  }).join("");

  if (sortOfertas) sortOfertas.destroy();
  sortOfertas = new Sortable(lista, {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const ids = $$("#listaOfertas .p-row").map((li) => li.dataset.id);
      const porId = Object.fromEntries(state.ofertas.map((o) => [o.id, o]));
      state.ofertas = ids.map((id, i) => ({ ...porId[id], posicao: i + 1 }));
      const { error } = await sb.rpc("reordenar_ofertas", { ids });
      if (error) { toast(mensagemErro(error), true); await carregarOfertas(); }
      else toast("Ordem das ofertas salva");
    }
  });
}

function atualizarPreviaOferta() {
  const f = $("#formOferta");
  const icone = (f.querySelector('input[name="icone"]:checked') || {}).value || "presente";
  const nome = f.nome.value.trim() || "Nome da oferta";
  const detalhe = f.detalhe.value.trim();
  $("#ofertaPrevia").innerHTML = `
    <span class="pv-icon">${svgOferta(icone, 20)}</span>
    <span><span class="pv-name">${esc(nome)}</span>${detalhe ? `<span class="pv-detail">${esc(detalhe)}</span>` : ""}</span>
    <svg class="pv-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`;
}

function abrirOferta(o) {
  const f = $("#formOferta");
  state.ofertaEditando = o;
  $("#ofertaErro").textContent = "";
  $("#dlgOfertaTitulo").textContent = o ? "Editar oferta" : "Nova oferta";
  $("#btnExcluirOferta").hidden = !o;
  $("#btnSalvarOferta").textContent = o ? "Salvar alterações" : "Criar oferta";

  f.nome.value = o?.nome || "";
  f.detalhe.value = o?.detalhe || "";
  f.ativo.checked = o ? o.ativo : true;
  const iconeAtual = o?.icone || "presente";
  $("#ofertaIcones").innerHTML = ICONES_OFERTA.map(([id, nome]) => `
    <label class="icon-opt">
      <input type="radio" name="icone" value="${id}"${id === iconeAtual ? " checked" : ""}>
      <span>${svgOferta(id)}<small>${esc(nome)}</small></span>
    </label>`).join("");
  $("#ofertaIdeia").innerHTML =
    `<option value="">Nenhuma — abrir o WhatsApp</option>` +
    ideiasOferta().map((g) => `<optgroup label="${esc(g.grupo)}">${
      g.itens.map(([id, nome]) => `<option value="${id}">${esc(nome)}</option>`).join("")
    }</optgroup>`).join("");
  f.ideia.value = o?.ideia || "";
  atualizarPreviaOferta();

  $("#dlgOferta").showModal();
  if (!o) setTimeout(() => f.nome.focus(), 50);
}

function ligarOfertas() {
  const dlg = $("#dlgOferta");
  const f = $("#formOferta");

  $("#btnNovaOferta").addEventListener("click", () => abrirOferta(null));
  $("#vazioOfertas").addEventListener("click", (e) => {
    if (e.target.closest("[data-acao=nova-oferta]")) abrirOferta(null);
  });

  // prévia ao vivo
  f.addEventListener("input", atualizarPreviaOferta);
  f.addEventListener("change", atualizarPreviaOferta);

  // sugere um ícone e a ideia pelo nome (só numa oferta nova e se ainda não mexeu)
  f.nome.addEventListener("blur", () => {
    if (state.ofertaEditando || f.ideia.value) return;
    const n = slug(f.nome.value);
    const pistas = [
      [/pais|maes|mae|pai/, "dia-das-maes-pais"], [/namorad|casal|casament/, "namorados"],
      [/professor/, "professores"], [/crianc/, "criancas"], [/natal|fim-de-ano/, "natal"],
      [/mulher/, "dia-da-mulher"], [/aniversari/, "aniversario"], [/bebe|maternidade|cha/, "maternidade"],
      [/formatura/, "formatura"], [/pet/, "pets"], [/avo/, "avos"]
    ];
    const achou = pistas.find(([re]) => re.test(n));
    if (achou) { f.ideia.value = achou[1]; atualizarPreviaOferta(); }
  });

  f.addEventListener("submit", async (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const erro = $("#ofertaErro");
    erro.textContent = "";
    const nome = f.nome.value.trim();
    if (!nome) return (erro.textContent = "Informe o nome da oferta.");

    const campos = {
      nome,
      detalhe: f.detalhe.value.trim(),
      icone: (f.querySelector('input[name="icone"]:checked') || {}).value || "presente",
      ideia: f.ideia.value,
      ativo: f.ativo.checked
    };

    const btn = $("#btnSalvarOferta");
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const antiga = state.ofertaEditando;
      if (antiga) {
        const { data, error } = await sb.from("ofertas").update(campos).eq("id", antiga.id).select().single();
        if (error) throw error;
        state.ofertas = state.ofertas.map((o) => (o.id === antiga.id ? data : o));
        toast("Oferta atualizada");
      } else {
        const posicao = Math.max(0, ...state.ofertas.map((o) => o.posicao || 0)) + 1;
        const { data, error } = await sb.from("ofertas").insert({ ...campos, posicao }).select().single();
        if (error) throw error;
        state.ofertas.push(data);
        toast("Oferta criada");
      }
      dlg.close();
      renderOfertas();
    } catch (err) {
      erro.textContent = mensagemErro(err);
    } finally {
      btn.disabled = false;
      btn.textContent = rotulo;
    }
  });

  $("#btnExcluirOferta").addEventListener("click", async () => {
    const o = state.ofertaEditando;
    if (!o) return;
    const ok = await confirmar(`Excluir a oferta “${o.nome}”? Se quiser só tirar do site por um tempo, use o botão de visibilidade.`);
    if (!ok) return;
    const { error } = await sb.from("ofertas").delete().eq("id", o.id);
    if (error) return toast(mensagemErro(error), true);
    state.ofertas = state.ofertas.filter((x) => x.id !== o.id);
    dlg.close();
    renderOfertas();
    toast("Oferta excluída");
  });

  $("#listaOfertas").addEventListener("click", async (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    const id = alvo.closest(".p-row").dataset.id;
    const o = state.ofertas.find((x) => x.id === id);
    if (!o) return;
    if (alvo.dataset.acao === "editar") abrirOferta(o);
    if (alvo.dataset.acao === "ativo") {
      const { data, error } = await sb.from("ofertas").update({ ativo: !o.ativo }).eq("id", id).select().single();
      if (error) return toast(mensagemErro(error), true);
      state.ofertas = state.ofertas.map((x) => (x.id === id ? data : x));
      renderOfertas();
      toast(data.ativo ? "Oferta visível no site" : "Oferta escondida do site");
    }
  });
}

/* ============================================================
   KITS — conjuntos de produtos por ideia de presente
   ============================================================ */
function htmlChipsIdeias(marcadas, nomeCampo) {
  return IDEIAS.map((g) => `
    <div class="idea-group">
      <p class="idea-group-title">${esc(g.grupo)}</p>
      <div class="idea-chips">
        ${g.itens.map(([id, nome]) => `
          <label class="idea-chip">
            <input type="checkbox" name="${nomeCampo}" value="${id}"${marcadas.has(id) ? " checked" : ""}>
            <span>${esc(nome)}</span>
          </label>`).join("")}
      </div>
    </div>`).join("");
}

const produtoPorId = (id) => state.produtos.find((p) => p.id === id);

function somaItens(ids) {
  return ids.reduce((t, id) => t + Number(produtoPorId(id)?.preco || 0), 0);
}

function thumbKit(k) {
  if (k.imagem_url) return `<img src="${esc(k.imagem_url)}" alt="" loading="lazy">`;
  const fotos = (k.itens || []).map((id) => produtoPorId(id)?.imagem_url).filter(Boolean).slice(0, 4);
  if (!fotos.length) return "sem foto";
  if (fotos.length === 1) return `<img src="${esc(fotos[0])}" alt="" loading="lazy">`;
  return `<div class="k-thumb-collage">${fotos.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>`;
}

function renderFiltroKitIdeia() {
  const sel = $("#filtroKitIdeia");
  const conta = (id) => state.kits.filter((k) => (k.ideias || []).includes(id)).length;
  sel.innerHTML = `<option value="">Todas as ideias (${state.kits.length})</option>` +
    IDEIAS.map((g) => `<optgroup label="${esc(g.grupo)}">${
      g.itens.map(([id, nome]) => `<option value="${id}">${esc(nome)} (${conta(id)})</option>`).join("")
    }</optgroup>`).join("");
  sel.value = state.filtroKitIdeia;
}

function renderKits() {
  const lista = $("#listaKits");
  const vazio = $("#vazioKits");
  $("#btnNovoKit").disabled = !state.kitsDisponivel;

  if (!state.kitsDisponivel) {
    lista.hidden = true;
    vazio.hidden = false;
    vazio.innerHTML = `<p>Falta criar a tabela de kits: rode o arquivo <code>supabase/migracao-kits.sql</code> no SQL Editor do Supabase e recarregue a página.</p>`;
    return;
  }

  renderFiltroKitIdeia();
  const visiveis = state.kits.filter((k) => !state.filtroKitIdeia || (k.ideias || []).includes(state.filtroKitIdeia));
  const noSite = state.kits.filter((k) => k.ativo).length;
  $("#resumoKits").textContent = state.kits.length
    ? `${state.kits.length} kit${state.kits.length > 1 ? "s" : ""} · ${noSite} no site · aparecem dentro de cada ideia de presente`
    : "Kits prontos que aparecem dentro de cada ideia de presente no site.";

  lista.hidden = visiveis.length === 0;
  vazio.hidden = visiveis.length > 0;
  if (!visiveis.length) {
    vazio.innerHTML = state.kits.length
      ? `<p>Nenhum kit nesta ideia ainda.</p><button class="btn btn-primary" type="button" data-acao="novo-kit">Montar um kit para esta ideia</button>`
      : `<p>Nenhum kit cadastrado ainda.</p><button class="btn btn-primary" type="button" data-acao="novo-kit">Montar o primeiro kit</button>`;
  }

  lista.innerHTML = visiveis.map((k) => {
    const nItens = (k.itens || []).length;
    const nIdeias = (k.ideias || []).length;
    return `
    <li class="p-row${k.ativo ? "" : " is-off"}" data-id="${esc(k.id)}">
      <span class="grip" aria-hidden="true">⋮⋮</span>
      <div class="p-thumb">${thumbKit(k)}</div>
      <div class="p-info">
        <button type="button" class="p-name" data-acao="editar">${esc(k.nome)}</button>
        <span class="p-meta">${nItens} ${nItens === 1 ? "produto" : "produtos"} · ${nIdeias ? `${nIdeias} ${nIdeias === 1 ? "ideia" : "ideias"}` : "nenhuma ideia marcada"}${k.ativo ? "" : " · fora do site"}</span>
      </div>
      <label class="p-price">
        <input type="text" inputmode="decimal" value="${brlNumero(k.preco)}" data-acao="preco" aria-label="Preço de ${esc(k.nome)}">
      </label>
      <div class="p-toggles">
        <button type="button" class="toggle t-ativo${k.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${k.ativo}" title="${k.ativo ? "Aparece no site — clique para esconder" : "Escondido — clique para mostrar no site"}">${k.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
      </div>
      <button type="button" class="icon-btn p-edit" data-acao="editar" aria-label="Editar ${esc(k.nome)}">${ICONE_LAPIS}</button>
    </li>`;
  }).join("");

  if (sortKits) sortKits.destroy();
  sortKits = new Sortable(lista, {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      // mesma lógica dos produtos: com filtro, os visíveis trocam de lugar entre si
      const nova = $$("#listaKits .p-row").map((li) => li.dataset.id);
      const vis = new Set(nova);
      const fila = [...nova];
      const completa = state.kits.map((k) => (vis.has(k.id) ? fila.shift() : k.id));
      const porId = Object.fromEntries(state.kits.map((k) => [k.id, k]));
      state.kits = completa.map((id, i) => ({ ...porId[id], posicao: i + 1 }));
      const { error } = await sb.rpc("reordenar_kits", { ids: completa });
      if (error) { toast(mensagemErro(error), true); await carregarKits(); }
      else toast("Ordem dos kits salva");
    }
  });
}

async function atualizarKit(id, campos) {
  const { data, error } = await sb.from("kits").update(campos).eq("id", id).select().single();
  if (error) throw error;
  const i = state.kits.findIndex((k) => k.id === id);
  if (i >= 0) state.kits[i] = data;
  return data;
}

/* ---------- formulário do kit ---------- */
function mostrarFotoKit(url) {
  const img = $("#kitFotoPreview");
  if (url) {
    img.src = url;
    img.hidden = false;
    $("#kitFotoVazia").hidden = true;
    $("#btnRemoverKitFoto").hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    $("#kitFotoVazia").hidden = false;
    $("#btnRemoverKitFoto").hidden = true;
  }
}

function itensMarcadosKit() {
  return $$('#kitProdutos input[name="kitItem"]:checked').map((i) => i.value);
}

let kitItensSelecionados = [];

function renderEscolhaProdutos() {
  const q = $("#kitBuscaProduto").value.trim().toLowerCase();
  const sel = new Set(kitItensSelecionados);
  // marcados primeiro, depois os demais na ordem do site
  const lista = [
    ...state.produtos.filter((p) => sel.has(p.id)),
    ...state.produtos.filter((p) => !sel.has(p.id) && (!q || `${p.nome} ${p.id}`.toLowerCase().includes(q)))
  ];
  $("#kitProdutos").innerHTML = lista.length
    ? lista.map((p) => `
      <li class="${sel.has(p.id) ? "is-picked" : ""}">
        <label>
          <input type="checkbox" name="kitItem" value="${esc(p.id)}"${sel.has(p.id) ? " checked" : ""}>
          <span class="kp-thumb">${p.imagem_url ? `<img src="${esc(p.imagem_url)}" alt="" loading="lazy">` : ""}</span>
          <span class="kp-name">${esc(p.nome)}<span class="kp-meta">${esc(p.id)}${p.ativo ? "" : " · fora do site"}</span></span>
          <span class="kp-price">R$ ${brlNumero(p.preco)}</span>
        </label>
      </li>`).join("")
    : `<li class="kp-empty">Nenhum produto encontrado.</li>`;
  atualizarSomaKit();
}

function atualizarSomaKit() {
  const f = $("#formKit");
  const n = kitItensSelecionados.length;
  const soma = somaItens(kitItensSelecionados);
  const preco = lerPreco(f.preco.value);
  let txt = n ? `${n} ${n === 1 ? "produto" : "produtos"} · separados custariam R$ ${brlNumero(soma)}` : "Marque os produtos que vão no kit.";
  if (n && !Number.isNaN(preco) && preco < soma) {
    txt += ` · <span class="ok">economia de R$ ${brlNumero(soma - preco)} no kit</span>`;
  }
  $("#kitSoma").innerHTML = txt;
}

function abrirKit(k) {
  const f = $("#formKit");
  state.kitEditando = k;
  state.kitFotoNova = null;
  state.kitRemoverFoto = false;
  $("#kitErro").textContent = "";
  $("#kitFotoInput").value = "";
  $("#kitBuscaProduto").value = "";
  $("#dlgKitTitulo").textContent = k ? "Editar kit" : "Novo kit";
  $("#btnExcluirKit").hidden = !k;
  $("#btnSalvarKit").textContent = k ? "Salvar alterações" : "Criar kit";

  f.nome.value = k?.nome || "";
  f.descricao.value = k?.descricao || "";
  f.preco.value = k ? brlNumero(k.preco) : "";
  f.ativo.checked = k ? k.ativo : true;
  kitItensSelecionados = [...(k?.itens || [])];
  // num kit novo, já vem marcada a ideia do filtro ativo
  const ideias = new Set(k?.ideias || (state.filtroKitIdeia ? [state.filtroKitIdeia] : []));
  $("#kitIdeias").innerHTML = htmlChipsIdeias(ideias, "kitIdeia");
  mostrarFotoKit(k?.imagem_url || null);
  renderEscolhaProdutos();

  $("#dlgKit").showModal();
  if (!k) setTimeout(() => f.nome.focus(), 50);
}

function ligarKits() {
  const dlg = $("#dlgKit");
  const f = $("#formKit");

  $("#btnNovoKit").addEventListener("click", () => abrirKit(null));
  $("#vazioKits").addEventListener("click", (e) => {
    if (e.target.closest("[data-acao=novo-kit]")) abrirKit(null);
  });
  $("#filtroKitIdeia").addEventListener("change", (e) => {
    state.filtroKitIdeia = e.target.value;
    renderKits();
  });

  // escolha dos produtos
  $("#kitBuscaProduto").addEventListener("input", renderEscolhaProdutos);
  $("#kitProdutos").addEventListener("change", (e) => {
    if (e.target.name !== "kitItem") return;
    const id = e.target.value;
    if (e.target.checked) { if (!kitItensSelecionados.includes(id)) kitItensSelecionados.push(id); }
    else kitItensSelecionados = kitItensSelecionados.filter((x) => x !== id);
    e.target.closest("li").classList.toggle("is-picked", e.target.checked);
    atualizarSomaKit();
  });
  f.preco.addEventListener("input", atualizarSomaKit);

  // foto
  $("#kitFotoInput").addEventListener("change", async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      state.kitFotoNova = await redimensionar(arquivo);
      state.kitRemoverFoto = false;
      mostrarFotoKit(URL.createObjectURL(state.kitFotoNova));
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#btnRemoverKitFoto").addEventListener("click", () => {
    state.kitFotoNova = null;
    state.kitRemoverFoto = true;
    $("#kitFotoInput").value = "";
    mostrarFotoKit(null);
  });

  // salvar
  f.addEventListener("submit", async (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    const erro = $("#kitErro");
    erro.textContent = "";
    const nome = f.nome.value.trim();
    const preco = lerPreco(f.preco.value);
    if (!nome) return (erro.textContent = "Informe o nome do kit.");
    if (!kitItensSelecionados.length) return (erro.textContent = "Marque pelo menos um produto do kit.");
    if (Number.isNaN(preco)) return (erro.textContent = "Preço inválido. Use o formato 89,90.");

    const btn = $("#btnSalvarKit");
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const antigo = state.kitEditando;
      let imagem_url = antigo?.imagem_url || null;
      if (state.kitFotoNova) {
        const caminho = `kits/kit-${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(caminho, state.kitFotoNova, {
          contentType: "image/jpeg", cacheControl: "31536000", upsert: false
        });
        if (upErr) throw upErr;
        imagem_url = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      } else if (state.kitRemoverFoto) {
        imagem_url = null;
      }

      const campos = {
        nome,
        descricao: f.descricao.value.trim(),
        preco,
        ativo: f.ativo.checked,
        imagem_url,
        itens: [...kitItensSelecionados],
        ideias: $$('#kitIdeias input[name="kitIdeia"]:checked').map((i) => i.value)
      };

      if (antigo) {
        await atualizarKit(antigo.id, campos);
        toast("Kit atualizado");
      } else {
        const posicao = Math.max(0, ...state.kits.map((k) => k.posicao || 0)) + 1;
        const { data, error } = await sb.from("kits").insert({ ...campos, posicao }).select().single();
        if (error) throw error;
        state.kits.push(data);
        toast(campos.ideias.length ? "Kit criado" : "Kit criado. Marque ao menos uma ideia para ele aparecer no site.");
      }
      if (antigo?.imagem_url && antigo.imagem_url !== imagem_url) {
        apagarFotoDoStorage(antigo.imagem_url).catch(() => {});
      }
      dlg.close();
      renderKits();
    } catch (err) {
      erro.textContent = mensagemErro(err);
    } finally {
      btn.disabled = false;
      btn.textContent = rotulo;
    }
  });

  // excluir
  $("#btnExcluirKit").addEventListener("click", async () => {
    const k = state.kitEditando;
    if (!k) return;
    const ok = await confirmar(`Excluir o kit “${k.nome}”? Os produtos continuam cadastrados. Se quiser só tirar do site, use o botão de visibilidade.`);
    if (!ok) return;
    const { error } = await sb.from("kits").delete().eq("id", k.id);
    if (error) return toast(mensagemErro(error), true);
    apagarFotoDoStorage(k.imagem_url).catch(() => {});
    state.kits = state.kits.filter((x) => x.id !== k.id);
    dlg.close();
    renderKits();
    toast("Kit excluído");
  });

  // lista: editar, visibilidade e preço
  const lista = $("#listaKits");
  lista.addEventListener("click", async (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo || alvo.dataset.acao === "preco") return;
    const id = alvo.closest(".p-row").dataset.id;
    const k = state.kits.find((x) => x.id === id);
    if (!k) return;
    if (alvo.dataset.acao === "editar") abrirKit(k);
    if (alvo.dataset.acao === "ativo") {
      try {
        await atualizarKit(id, { ativo: !k.ativo });
        renderKits();
        toast(!k.ativo ? "Kit visível no site" : "Kit escondido do site");
      } catch (err) {
        toast(mensagemErro(err), true);
      }
    }
  });
  lista.addEventListener("keydown", (e) => {
    if (e.target.dataset.acao === "preco" && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
  });
  lista.addEventListener("focusout", async (e) => {
    const input = e.target;
    if (input.dataset.acao !== "preco") return;
    const caixa = input.closest(".p-price");
    const id = input.closest(".p-row").dataset.id;
    const k = state.kits.find((x) => x.id === id);
    const valor = lerPreco(input.value);
    caixa.classList.remove("saved", "error");
    if (Number.isNaN(valor)) {
      caixa.classList.add("error");
      toast("Preço inválido. Use o formato 89,90", true);
      input.value = brlNumero(k.preco);
      return;
    }
    if (valor === Number(k.preco)) { input.value = brlNumero(k.preco); return; }
    try {
      await atualizarKit(id, { preco: valor });
      input.value = brlNumero(valor);
      caixa.classList.add("saved");
      setTimeout(() => caixa.classList.remove("saved"), 1400);
      toast(`${k.nome}: R$ ${brlNumero(valor)}`);
    } catch (err) {
      caixa.classList.add("error");
      input.value = brlNumero(k.preco);
      toast(mensagemErro(err), true);
    }
  });
}

/* ============================================================
   GALERIA — "Se inspire nessas ideias"
   ============================================================ */
function fotosDoTipo(tipoId) {
  return state.galFotos.filter((f) => f.tipo === tipoId);
}

function renderGaleria() {
  const semTabelas = !state.galDisponivel;
  $("#formGalTipo").hidden = semTabelas;
  if (semTabelas) {
    $("#galTipos").innerHTML = "";
    $("#galPainel").hidden = true;
    $("#galSemTipos").hidden = false;
    $("#galSemTipos").innerHTML = `<p>Falta criar as tabelas da galeria: rode o arquivo <code>supabase/migracao-galeria.sql</code> no SQL Editor do Supabase e recarregue a página.</p>`;
    return;
  }

  // chips dos tipos
  $("#galTipos").innerHTML = state.galTipos
    .map((t) => {
      const n = fotosDoTipo(t.id).length;
      const sel = t.id === state.galTipoSel;
      return `<button type="button" class="chip${sel ? " active" : ""}${t.ativo ? "" : " is-off"}" data-tipo="${esc(t.id)}" aria-pressed="${sel}">${esc(t.nome)} <b>${n}</b></button>`;
    })
    .join("");

  const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
  $("#galSemTipos").hidden = !!state.galTipos.length;
  $("#galSemTipos").innerHTML = `<p>Crie o primeiro tipo acima (ex.: Caderno A5) para começar a adicionar fotos.</p>`;
  $("#galPainel").hidden = !tipo;

  if (sortGalTipos) sortGalTipos.destroy();
  sortGalTipos = new Sortable($("#galTipos"), {
    animation: 150,
    delay: 250,
    delayOnTouchOnly: true,
    ghostClass: "sortable-ghost",
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const ids = $$("#galTipos .chip").map((c) => c.dataset.tipo);
      const porId = Object.fromEntries(state.galTipos.map((t) => [t.id, t]));
      state.galTipos = ids.map((id, i) => ({ ...porId[id], posicao: i + 1 }));
      const { error } = await sb.rpc("reordenar_galeria_tipos", { ids });
      if (error) { toast(mensagemErro(error), true); await carregarGaleria(); }
      else toast("Ordem dos tipos salva");
    }
  });

  if (!tipo) return;

  // cabeçalho do tipo
  const nomeInput = $("#galTipoNome");
  if (document.activeElement !== nomeInput) nomeInput.value = tipo.nome;
  const precoTipo = $("#galTipoPreco");
  if (document.activeElement !== precoTipo) precoTipo.value = tipo.preco != null ? brlNumero(tipo.preco) : "";
  const btnAtivo = $("#galTipoAtivo");
  btnAtivo.classList.toggle("on", tipo.ativo);
  btnAtivo.setAttribute("aria-pressed", String(tipo.ativo));
  btnAtivo.title = tipo.ativo ? "Aparece no site — clique para esconder este tipo" : "Escondido — clique para mostrar no site";
  btnAtivo.innerHTML = tipo.ativo ? ICONE_OLHO : ICONE_OLHO_OFF;

  // fotos
  const fotos = fotosDoTipo(tipo.id);
  $("#galVazio").hidden = fotos.length > 0;
  $("#galFotos").hidden = fotos.length === 0;
  $("#galFotos").innerHTML = fotos
    .map((f) => `
      <li class="gal-card${f.ativo ? "" : " is-off"}" data-id="${esc(f.id)}">
        <div class="gal-thumb">
          <img src="${esc(f.imagem_url)}" alt="" loading="lazy">
          <span class="grip" aria-hidden="true">⋮⋮</span>
        </div>
        <div class="gal-body">
          <input type="text" value="${esc(f.legenda)}" placeholder="Legenda (opcional)" data-acao="legenda" aria-label="Legenda da foto">
          <label class="gal-price">
            <input type="text" inputmode="decimal" value="${f.preco != null ? brlNumero(f.preco) : ""}" placeholder="${tipo.preco != null ? "igual ao tipo" : "valor (opcional)"}" data-acao="preco-foto" aria-label="Valor desta ideia">
          </label>
          <div class="gal-card-actions">
            <button type="button" class="toggle t-ativo${f.ativo ? " on" : ""}" data-acao="ativo" aria-pressed="${f.ativo}" title="${f.ativo ? "Aparece no site — clique para esconder" : "Escondida — clique para mostrar"}">${f.ativo ? ICONE_OLHO : ICONE_OLHO_OFF}</button>
            <button type="button" class="icon-btn danger" data-acao="excluir" aria-label="Excluir foto">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
            </button>
          </div>
        </div>
      </li>`)
    .join("");

  if (sortGalFotos) sortGalFotos.destroy();
  sortGalFotos = new Sortable($("#galFotos"), {
    handle: ".grip",
    animation: 150,
    ghostClass: "sortable-ghost",
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const ids = $$("#galFotos .gal-card").map((li) => li.dataset.id);
      const pos = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
      state.galFotos.forEach((f) => { if (pos[f.id]) f.posicao = pos[f.id]; });
      state.galFotos.sort((a, b) => a.posicao - b.posicao);
      const { error } = await sb.rpc("reordenar_galeria_fotos", { ids });
      if (error) { toast(mensagemErro(error), true); await carregarGaleria(); }
      else toast("Ordem das fotos salva");
    }
  });
}

async function atualizarFotoGaleria(id, campos) {
  const { data, error } = await sb.from("galeria_fotos").update(campos).eq("id", id).select().single();
  if (error) throw error;
  const i = state.galFotos.findIndex((f) => f.id === id);
  if (i >= 0) state.galFotos[i] = data;
  return data;
}

function ligarGaleria() {
  // escolher tipo
  $("#galTipos").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.galTipoSel = chip.dataset.tipo;
    renderGaleria();
  });

  // criar tipo
  $("#formGalTipo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = e.target.nome.value.trim();
    const id = slug(nome);
    if (!id) return;
    if (state.galTipos.some((t) => t.id === id)) return toast(`O tipo “${nome}” já existe.`, true);
    const posicao = Math.max(0, ...state.galTipos.map((t) => t.posicao || 0)) + 1;
    const { data, error } = await sb.from("galeria_tipos").insert({ id, nome, posicao }).select().single();
    if (error) return toast(mensagemErro(error), true);
    state.galTipos.push(data);
    state.galTipoSel = data.id;
    e.target.reset();
    renderGaleria();
    toast("Tipo criado. Agora adicione as fotos.");
  });

  // renomear tipo
  const nomeInput = $("#galTipoNome");
  nomeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); nomeInput.blur(); }
  });
  nomeInput.addEventListener("blur", async () => {
    const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
    if (!tipo) return;
    const nome = nomeInput.value.trim();
    if (!nome) { nomeInput.value = tipo.nome; return; }
    if (nome === tipo.nome) return;
    const { error } = await sb.from("galeria_tipos").update({ nome }).eq("id", tipo.id);
    if (error) { nomeInput.value = tipo.nome; return toast(mensagemErro(error), true); }
    tipo.nome = nome;
    renderGaleria();
    toast("Nome do tipo atualizado");
  });

  // preço "a partir de" do tipo (vazio = sem valor)
  const precoTipo = $("#galTipoPreco");
  precoTipo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); precoTipo.blur(); }
  });
  precoTipo.addEventListener("blur", async () => {
    const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
    if (!tipo) return;
    const texto = precoTipo.value.trim();
    const preco = texto ? lerPreco(texto) : null;
    if (Number.isNaN(preco)) {
      toast("Valor inválido. Use o formato 35,00", true);
      precoTipo.value = tipo.preco != null ? brlNumero(tipo.preco) : "";
      return;
    }
    if ((tipo.preco == null ? null : Number(tipo.preco)) === preco) {
      precoTipo.value = preco != null ? brlNumero(preco) : "";
      return;
    }
    const { error } = await sb.from("galeria_tipos").update({ preco }).eq("id", tipo.id);
    if (error) {
      precoTipo.value = tipo.preco != null ? brlNumero(tipo.preco) : "";
      return toast(mensagemErro(error), true);
    }
    tipo.preco = preco;
    precoTipo.classList.add("saved");
    setTimeout(() => precoTipo.classList.remove("saved"), 1200);
    renderGaleria();
    toast(preco != null ? `${tipo.nome}: a partir de R$ ${brlNumero(preco)}` : `${tipo.nome}: sem valor no site`);
  });

  // mostrar/esconder tipo
  $("#galTipoAtivo").addEventListener("click", async () => {
    const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
    if (!tipo) return;
    const { error } = await sb.from("galeria_tipos").update({ ativo: !tipo.ativo }).eq("id", tipo.id);
    if (error) return toast(mensagemErro(error), true);
    tipo.ativo = !tipo.ativo;
    renderGaleria();
    toast(tipo.ativo ? "Tipo visível no site" : "Tipo escondido do site");
  });

  // excluir tipo (e suas fotos)
  $("#galTipoExcluir").addEventListener("click", async () => {
    const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
    if (!tipo) return;
    const fotos = fotosDoTipo(tipo.id);
    const ok = await confirmar(fotos.length
      ? `Excluir o tipo “${tipo.nome}” e as ${fotos.length} foto(s) dele? Isso não pode ser desfeito. Se quiser só tirar do site, use o botão de visibilidade.`
      : `Excluir o tipo “${tipo.nome}”?`);
    if (!ok) return;
    const { error } = await sb.from("galeria_tipos").delete().eq("id", tipo.id);
    if (error) return toast(mensagemErro(error), true);
    const caminhos = fotos.map((f) => caminhoNoStorage(f.imagem_url)).filter(Boolean);
    if (caminhos.length) sb.storage.from(BUCKET).remove(caminhos).catch(() => {});
    state.galTipos = state.galTipos.filter((t) => t.id !== tipo.id);
    state.galFotos = state.galFotos.filter((f) => f.tipo !== tipo.id);
    state.galTipoSel = state.galTipos[0]?.id || null;
    renderGaleria();
    toast("Tipo excluído");
  });

  // enviar várias fotos
  $("#galFotosInput").addEventListener("change", async (e) => {
    const arquivos = [...e.target.files];
    e.target.value = "";
    const tipo = state.galTipos.find((t) => t.id === state.galTipoSel);
    if (!tipo || !arquivos.length) return;

    const progresso = $("#galProgresso");
    progresso.hidden = false;
    let pos = Math.max(0, ...fotosDoTipo(tipo.id).map((f) => f.posicao || 0));
    let enviadas = 0;
    const falhas = [];

    for (let i = 0; i < arquivos.length; i++) {
      progresso.textContent = `Enviando foto ${i + 1} de ${arquivos.length}…`;
      try {
        const blob = await redimensionar(arquivos[i]);
        const caminho = `galeria/${tipo.id}-${Date.now()}-${i}.jpg`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(caminho, blob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false
        });
        if (upErr) throw upErr;
        const imagem_url = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
        const { data, error } = await sb.from("galeria_fotos")
          .insert({ tipo: tipo.id, imagem_url, posicao: ++pos })
          .select().single();
        if (error) throw error;
        state.galFotos.push(data);
        enviadas++;
        renderGaleria();
      } catch (err) {
        falhas.push(`${arquivos[i].name}: ${mensagemErro(err)}`);
      }
    }

    progresso.hidden = true;
    if (falhas.length) toast(`${enviadas} enviada(s), ${falhas.length} com erro. ${falhas[0]}`, true);
    else toast(`${enviadas} foto(s) adicionada(s) em ${tipo.nome}`);
  });

  // legenda, visibilidade e exclusão de cada foto
  const grade = $("#galFotos");

  grade.addEventListener("keydown", (e) => {
    if ((e.target.dataset.acao === "legenda" || e.target.dataset.acao === "preco-foto") && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
  });

  grade.addEventListener("focusout", async (e) => {
    const input = e.target;
    if (input.dataset.acao === "preco-foto") {
      const id = input.closest(".gal-card").dataset.id;
      const foto = state.galFotos.find((f) => f.id === id);
      if (!foto) return;
      const texto = input.value.trim();
      const preco = texto ? lerPreco(texto) : null;
      const atual = foto.preco == null ? null : Number(foto.preco);
      if (Number.isNaN(preco)) {
        toast("Valor inválido. Use o formato 45,00", true);
        input.value = atual != null ? brlNumero(atual) : "";
        return;
      }
      if (preco === atual) {
        input.value = preco != null ? brlNumero(preco) : "";
        return;
      }
      try {
        await atualizarFotoGaleria(id, { preco });
        input.value = preco != null ? brlNumero(preco) : "";
        input.classList.add("saved");
        setTimeout(() => input.classList.remove("saved"), 1200);
        toast(preco != null ? `Valor salvo: R$ ${brlNumero(preco)}` : "Valor removido desta foto");
      } catch (err) {
        input.value = atual != null ? brlNumero(atual) : "";
        toast(mensagemErro(err), true);
      }
      return;
    }
    if (input.dataset.acao !== "legenda") return;
    const id = input.closest(".gal-card").dataset.id;
    const foto = state.galFotos.find((f) => f.id === id);
    const legenda = input.value.trim();
    if (!foto || legenda === foto.legenda) return;
    try {
      await atualizarFotoGaleria(id, { legenda });
      input.classList.add("saved");
      setTimeout(() => input.classList.remove("saved"), 1200);
      toast("Legenda salva");
    } catch (err) {
      input.value = foto.legenda;
      toast(mensagemErro(err), true);
    }
  });

  grade.addEventListener("click", async (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo || alvo.dataset.acao === "legenda" || alvo.dataset.acao === "preco-foto") return;
    const id = alvo.closest(".gal-card").dataset.id;
    const foto = state.galFotos.find((f) => f.id === id);
    if (!foto) return;

    if (alvo.dataset.acao === "ativo") {
      try {
        await atualizarFotoGaleria(id, { ativo: !foto.ativo });
        renderGaleria();
        toast(!foto.ativo ? "Foto visível no site" : "Foto escondida do site");
      } catch (err) {
        toast(mensagemErro(err), true);
      }
    }

    if (alvo.dataset.acao === "excluir") {
      const ok = await confirmar("Excluir esta foto da galeria? Isso não pode ser desfeito.");
      if (!ok) return;
      const { error } = await sb.from("galeria_fotos").delete().eq("id", id);
      if (error) return toast(mensagemErro(error), true);
      apagarFotoDoStorage(foto.imagem_url).catch(() => {});
      state.galFotos = state.galFotos.filter((f) => f.id !== id);
      renderGaleria();
      toast("Foto excluída");
    }
  });
}

/* ============================================================
   IMPORTAR PLANILHA ANTIGA (Google Sheets CSV)
   ============================================================ */
function campo(row, ...nomes) {
  for (const n of nomes) if (row[n] !== undefined && row[n] !== null) return String(row[n]).trim();
  return "";
}

function urlImagemAbsoluta(caminho) {
  if (!caminho) return null;
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const base = (window.CONFIG.SITE_VENDAS_URL || "").replace(/\/+$/, "");
  return `${base}/${caminho.replace(/^\/+/, "")}`;
}

function ligarImportacao() {
  $("#btnPrevia").addEventListener("click", async () => {
    const url = $("#csvUrl").value.trim();
    const erro = $("#importErro");
    erro.textContent = "";
    $("#importPrevia").innerHTML = "";
    $("#btnImportar").disabled = true;
    if (!url) return (erro.textContent = "Cole o link CSV da planilha.");

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`A planilha respondeu com erro ${resp.status}.`);
      const texto = await resp.text();
      const parsed = Papa.parse(texto, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });

      const linhas = parsed.data.map((row, i) => {
        const id = campo(row, "id", "COD PRODUTO", "Cod Produto").toUpperCase();
        const nome = campo(row, "name", "NOME", "Nome");
        const categoria = slug(campo(row, "category", "CATEGORIA", "Categoria"));
        const preco = lerPreco(campo(row, "price", "PREÇO", "Preço"));
        const fav = campo(row, "favorite", "FAVORITO", "Favorito").toUpperCase();
        return {
          id, nome, categoria,
          descricao: campo(row, "desc", "DESCRIÇÃO", "Descrição"),
          preco,
          favorito: fav === "SIM" || fav === "TRUE",
          imagem_url: urlImagemAbsoluta(campo(row, "photo", "IMAGEM", "Imagem")),
          posicao: i + 1,
          valido: !!(id && nome && !Number.isNaN(preco))
        };
      });

      state.importacao = linhas.filter((l) => l.valido);
      const invalidas = linhas.length - state.importacao.length;

      $("#importPrevia").innerHTML = `
        <p class="muted" style="margin-bottom:8px">${state.importacao.length} produto(s) prontos para importar${invalidas ? ` · ${invalidas} linha(s) ignorada(s) por falta de código, nome ou preço` : ""}.</p>
        <table>
          <thead><tr><th>Código</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Queridinho</th><th>Foto</th></tr></thead>
          <tbody>
            ${linhas.map((l) => `
              <tr class="${l.valido ? "" : "bad"}">
                <td>${esc(l.id || "—")}</td>
                <td>${esc(l.nome || "—")}</td>
                <td>${esc(l.categoria || "—")}</td>
                <td>${Number.isNaN(l.preco) ? "sem preço" : "R$ " + brlNumero(l.preco)}</td>
                <td>${l.favorito ? "sim" : ""}</td>
                <td>${l.imagem_url ? "sim" : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>`;
      $("#btnImportar").disabled = state.importacao.length === 0;
      $("#btnImportar").textContent = `Importar ${state.importacao.length} produto(s)`;
    } catch (err) {
      erro.textContent = `Não foi possível ler a planilha: ${mensagemErro(err)}`;
    }
  });

  $("#btnImportar").addEventListener("click", async () => {
    const itens = state.importacao || [];
    if (!itens.length) return;
    const ok = await confirmar(`Importar ${itens.length} produto(s)? Produtos com o mesmo código serão atualizados com os dados da planilha.`, "Importar");
    if (!ok) return;

    const btn = $("#btnImportar");
    btn.disabled = true;
    btn.textContent = "Importando…";

    try {
      // cria categorias que existem na planilha mas não no banco
      const existentes = new Set(state.categorias.map((c) => c.id));
      let pos = Math.max(0, ...state.categorias.map((c) => c.posicao || 0));
      const novas = [...new Set(itens.map((i) => i.categoria).filter((c) => c && !existentes.has(c)))]
        .map((id) => ({ id, nome: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " "), posicao: ++pos }));
      if (novas.length) {
        const { error } = await sb.from("categorias").insert(novas);
        if (error) throw error;
      }

      const registros = itens.map(({ valido, ...r }) => ({ ...r, categoria: r.categoria || null, ativo: true }));
      const { error } = await sb.from("produtos").upsert(registros, { onConflict: "id" });
      if (error) throw error;

      await carregarTudo();
      toast(`${registros.length} produto(s) importados`);
      $$(".tab").find((t) => t.dataset.view === "produtos").click();
    } catch (err) {
      $("#importErro").textContent = mensagemErro(err);
    } finally {
      btn.disabled = false;
      btn.textContent = `Importar ${itens.length} produto(s)`;
    }
  });
}
