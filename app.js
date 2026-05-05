// ============================================================
// PCP — app.js — Lógica completa do frontend
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxGobGm5H2Mee6IoP-smUcBovlmEs15_lhHgg-yyFKNErmkQKs7K8atb06ph-VViT5Q/exec';

// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  token:  localStorage.getItem('pcp_token')  || null,
  perfil: localStorage.getItem('pcp_perfil') || null,
  nome:   localStorage.getItem('pcp_nome')   || null,
  telaAtual: 'dashboard',
  modalCallback: null,
};

// ============================================================
// API — Comunicação com o Apps Script (JSONP)
// ============================================================
const Api = {
  async get(action, params = {}) {
    Spinner.mostrar();
    return new Promise((resolve) => {
      const cbName = 'cb_' + Date.now();
      const qs = new URLSearchParams({ action, token: Estado.token, ...params, callback: cbName }).toString();
      const script = document.createElement('script');
      script.src = `${API_URL}?${qs}`;
      window[cbName] = (data) => {
        resolve(data);
        delete window[cbName];
        if (document.body.contains(script)) document.body.removeChild(script);
        Spinner.ocultar();
      };
      script.onerror = () => { resolve({ ok: false, erro: 'Erro de conexão.' }); Spinner.ocultar(); };
      document.body.appendChild(script);
    });
  },
  async post(action, body = {}) {
    Spinner.mostrar();
    return new Promise((resolve) => {
      const cbName = 'cb_' + Date.now();
      const params = new URLSearchParams({ action, token: Estado.token, ...body, callback: cbName }).toString();
      const script = document.createElement('script');
      script.src = `${API_URL}?${params}`;
      window[cbName] = (data) => {
        resolve(data);
        delete window[cbName];
        if (document.body.contains(script)) document.body.removeChild(script);
        Spinner.ocultar();
      };
      script.onerror = () => { resolve({ ok: false, erro: 'Erro de conexão.' }); Spinner.ocultar(); };
      document.body.appendChild(script);
    });
  }
};

// ============================================================
// UTILITÁRIOS
// ============================================================
const Toast = {
  show(msg, tipo = 'sucesso') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast visivel ${tipo}`;
    clearTimeout(Toast._t);
    Toast._t = setTimeout(() => t.classList.remove('visivel'), 3500);
  }
};

const Spinner = {
  _el: null,
  mostrar() {
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.className = 'spinner-overlay';
      this._el.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(this._el);
    }
    this._el.style.display = 'flex';
  },
  ocultar() { if (this._el) this._el.style.display = 'none'; }
};

const Modal = {
  abrir(titulo, html, callbackSalvar, esconderBotoes = false) {
    document.getElementById('modal-titulo').textContent = titulo;
    document.getElementById('modal-corpo').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
    Estado.modalCallback = callbackSalvar;
    const footer = document.querySelector('.modal-footer');
    footer.style.display = esconderBotoes ? 'none' : 'flex';
  },
  fechar() {
    document.getElementById('modal-overlay').style.display = 'none';
    Estado.modalCallback = null;
  },
  salvar() {
    if (Estado.modalCallback) Estado.modalCallback();
  }
};

function moeda(v) {
  return 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function dataFormatada(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function badgeStatus(status) {
  const mapa = {
    'Não Iniciado': 'badge-cinza',
    'Em Produção':  'badge-azul',
    'Parcial':      'badge-amarelo',
    'Finalizado':   'badge-verde'
  };
  return `<span class="badge ${mapa[status] || 'badge-cinza'}">${status}</span>`;
}

function filtrarTabela(inputId, tabelaId) {
  const termo = document.getElementById(inputId).value.toLowerCase();
  const linhas = document.querySelectorAll(`#${tabelaId} tbody tr`);
  linhas.forEach(l => {
    l.style.display = l.textContent.toLowerCase().includes(termo) ? '' : 'none';
  });
}

let _debounceTimers = {};
function debounce(fn, id, ms = 300) {
  clearTimeout(_debounceTimers[id]);
  _debounceTimers[id] = setTimeout(fn, ms);
}

// ============================================================
// CARDS MOBILE
// ============================================================
function gerarCardsTabela(itens, campos, acaoHtml) {
  if (!itens || itens.length === 0) return '<div class="card-lista"><p class="text-soft">Nenhum registro encontrado.</p></div>';
  const cards = itens.map(item => {
    const linhas = campos.map(c => `
      <div class="card-item-row">
        <span class="ci-label">${c.label}</span>
        <span class="ci-valor">${c.render ? c.render(item) : (item[c.campo] !== undefined && item[c.campo] !== '' ? item[c.campo] : '—')}</span>
      </div>`).join('');
    const acao = acaoHtml ? acaoHtml(item) : '';
    return `<div class="card-item">${linhas}${acao ? `<div class="card-item-acoes">${acao}</div>` : ''}</div>`;
  }).join('');
  return `<div class="card-lista">${cards}</div>`;
}

// ============================================================
// APP — Navegação e autenticação
// ============================================================
const App = {
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const msg = document.getElementById('login-msg');
    if (!email || !senha) { msg.innerHTML = '<span class="msg-erro">Preencha e-mail e senha.</span>'; return; }
    msg.innerHTML = '';
    const r = await Api.post('login', { email, senha });
    if (!r.ok) { msg.innerHTML = `<span class="msg-erro">${r.erro}</span>`; return; }

    Estado.token  = r.token;
    Estado.perfil = r.perfil;
    Estado.nome   = r.nome;
    localStorage.setItem('pcp_token',  r.token);
    localStorage.setItem('pcp_perfil', r.perfil);
    localStorage.setItem('pcp_nome',   r.nome);

    this.iniciarApp();
  },

  logout() {
    localStorage.clear();
    location.reload();
  },

  mostrarReset() {
    document.getElementById('login-form-wrap').style.display = 'none';
    document.getElementById('reset-form-wrap').style.display = '';
  },
  mostrarLogin() {
    document.getElementById('reset-form-wrap').style.display = 'none';
    document.getElementById('login-form-wrap').style.display = '';
  },

  async solicitarReset() {
    const email = document.getElementById('reset-email').value.trim();
    if (!email) { Toast.show('Informe seu e-mail.', 'erro'); return; }
    const r = await Api.post('resetSenha', { email });
    if (r.ok) { Toast.show('Link enviado! Verifique seu e-mail.'); this.mostrarLogin(); }
    else Toast.show(r.erro, 'erro');
  },

  iniciarApp() {
    document.getElementById('tela-login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sidebar-user').textContent = Estado.nome;
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = Estado.perfil === 'admin' ? 'flex' : 'none';
    });
    this.navegar('dashboard');
  },

  navegar(tela) {
    App.fecharMenuMobile();

    const adminOnly = ['produtos', 'funcionarios', 'usuarios', 'despesas', 'dre'];
    if (adminOnly.includes(tela) && Estado.perfil !== 'admin') {
      Toast.show('Acesso restrito.', 'erro'); return;
    }

    document.querySelectorAll('#main-content > div').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('ativo'));

    const el = document.getElementById('tela-' + tela);
    if (el) el.style.display = '';

    const navEl = document.querySelector(`.nav-item[data-tela="${tela}"]`);
    if (navEl) navEl.classList.add('ativo');

    Estado.telaAtual = tela;

    const render = {
      dashboard:    Telas.dashboard,
      recebimento:  Telas.recebimento,
      apontamento:  Telas.apontamento,
      produtos:     Telas.produtos,
      funcionarios: Telas.funcionarios,
      usuarios:     Telas.usuarios,
      despesas:     Telas.despesas,
      dre:          Telas.dre
    };
    if (render[tela]) render[tela]();
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
  },

  abrirMenuMobile() {
    document.getElementById('sidebar').classList.add('aberta');
    document.getElementById('sidebar-overlay').classList.add('visivel');
  },

  fecharMenuMobile() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebar-overlay');
    if (s) s.classList.remove('aberta');
    if (o) o.classList.remove('visivel');
  }
};

// ============================================================
// TELAS
// ============================================================
const Telas = {

  // ==================== DASHBOARD ====================
  async dashboard() {
    const el = document.getElementById('tela-dashboard');
    el.innerHTML = '<div class="page-titulo">📊 Dashboard</div><div class="text-soft">Carregando...</div>';

    if (Estado.perfil === 'admin') {
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      const r = await Api.get('dashboardAdmin', { mes, ano });
      if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
      el.innerHTML = htmlGrafico() + renderDashboardAdmin(r, mes, ano);
      document.getElementById('sel-mes').onchange = Telas._atualizarDashAdmin;
      document.getElementById('sel-ano').onchange = Telas._atualizarDashAdmin;
    } else {
      const r = await Api.get('dashboardOperador');
      if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
      el.innerHTML = htmlGrafico() + renderDashboardOperador(r);
    }
    // Carregar gráfico com valores padrão
    setTimeout(() => Telas._atualizarGrafico(), 100);
  },

  async _atualizarGrafico() {
    const mesIni  = document.getElementById('graf-mes-ini')?.value;
    const anoIni  = document.getElementById('graf-ano-ini')?.value;
    const mesFim  = document.getElementById('graf-mes-fim')?.value;
    const anoFim  = document.getElementById('graf-ano-fim')?.value;
    const mostrar = document.getElementById('graf-mostrar')?.value || 'ambos';
    if (!mesIni || !anoIni || !mesFim || !anoFim) return;
    await renderGrafico(mesIni, anoIni, mesFim, anoFim, mostrar);
  },

  async _atualizarDashAdmin() {
    const mes = document.getElementById('sel-mes').value;
    const ano = document.getElementById('sel-ano').value;
    const r = await Api.get('dashboardAdmin', { mes, ano });
    if (!r.ok) { Toast.show(r.erro, 'erro'); return; }
    const el = document.getElementById('tela-dashboard');
    el.innerHTML = renderDashboardAdmin(r, mes, ano);
    document.getElementById('sel-mes').value = mes;
    document.getElementById('sel-ano').value = ano;
    document.getElementById('sel-mes').onchange = Telas._atualizarDashAdmin;
    document.getElementById('sel-ano').onchange = Telas._atualizarDashAdmin;
  },

  // ==================== RECEBIMENTO ====================
  async recebimento() {
    const el = document.getElementById('tela-recebimento');
    const r = await Api.get('listarProdutos', { tipo: 'master', ativo: 'true' });
    const produtos = r.ok ? r.dados : [];

    const opts = produtos.map(p =>
      `<option value="${p.id}" data-cod="${p.codigo}" data-desc="${p.descricao}">${p.codigo} — ${p.descricao}</option>`
    ).join('');

    el.innerHTML = `
      <div class="page-titulo">📦 Lançamento de Recebimento</div>
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label>Data</label>
            <input type="date" id="rec-data" value="${new Date().toISOString().split('T')[0]}" disabled />
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Produto Master</label>
            <select id="rec-produto-sel" onchange="Acoes.selecionarProdutoRec()">
              <option value="">-- Selecione o produto master --</option>
              ${opts}
            </select>
          </div>
          <div class="form-group">
            <label>Código selecionado</label>
            <input type="text" id="rec-cod-view" disabled placeholder="Preenchido automaticamente" />
          </div>
          <div class="form-group">
            <label>Descrição selecionada</label>
            <input type="text" id="rec-desc-view" disabled placeholder="Preenchido automaticamente" />
          </div>
          <div class="form-group">
            <label>Quantidade Recebida (kg)</label>
            <input type="number" id="rec-qtde" min="0.01" step="0.01" placeholder="Ex: 25" />
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Observações (opcional)</label>
            <input type="text" id="rec-obs" placeholder="..." />
          </div>
        </div>
        <div class="form-acoes">
          <button class="btn btn-verde" onclick="Acoes.salvarRecebimento()">✅ Registrar Recebimento</button>
        </div>
        <div id="rec-msg" style="margin-top:12px;font-size:14px"></div>
      </div>
    `;
  },

  // ==================== APONTAMENTO ====================
  async apontamento(opPreSelecionada = null) {
    const el = document.getElementById('tela-apontamento');
    const [rOPs, rProds] = await Promise.all([
      Api.get('listarOPs', { status: 'Não Iniciado,Em Produção' }),
      Api.get('listarProdutos', { ativo: 'true' })
    ]);
    const ops = rOPs.ok ? rOPs.dados : [];
    const produtos = rProds.ok ? rProds.dados : [];

    const opOpts = ops.map(op => {
      const prod = produtos.find(p => p.id === op.produto_master_id);
      return `<option value="${op.id}" data-master="${op.produto_master_id}" data-kg="${op.quantidade_recebida_kg}" ${opPreSelecionada === op.id ? 'selected' : ''}>${op.numero_op} — ${prod ? prod.descricao : ''} (${dataFormatada(op.data_criacao)})</option>`;
    }).join('');

    el.innerHTML = `
      <div class="page-titulo">✅ Lançamento de Apontamento</div>
      <div class="card">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Ordem de Produção (OP)</label>
            <select id="ap-op" onchange="Acoes.filtrarProdutosFinaisSelect()">
              <option value="">-- Selecione a OP --</option>
              ${opOpts}
            </select>
          </div>
          <div class="form-group">
            <label>Quantidade Recebida na OP (kg)</label>
            <input type="text" id="ap-kg-op" disabled placeholder="Selecione a OP acima" style="font-size:18px;font-weight:700;color:var(--azul-light)" />
          </div>
          <div class="form-group">
            <label>Tipo de Apontamento</label>
            <select id="ap-tipo" onchange="Acoes.calcularPerdaGanho()">
              <option value="Parcial">Parcial</option>
              <option value="Final">Final (Encerra a OP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data do Apontamento</label>
            <input type="date" id="ap-data" value="${new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Produto Final</label>
            <select id="ap-produto-sel" onchange="Acoes.selecionarProdutoFinal()">
              <option value="">-- Selecione primeiro a OP --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Quantidade Produzida (unidades)</label>
            <input type="number" id="ap-qtde" min="1" placeholder="Ex: 50" oninput="Acoes.calcularPerdaGanho()" />
          </div>
        </div>

        <div id="ap-resultado" style="display:none;margin-top:16px;padding:16px;border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:13px;color:var(--text-soft);font-weight:600;margin-bottom:10px">📊 RESULTADO DO APONTAMENTO FINAL</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
            <div style="background:var(--bg3);border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:11px;color:var(--text-soft);margin-bottom:4px">RECEBIDO</div>
              <div id="ap-res-recebido" style="font-size:20px;font-weight:800;color:var(--azul-light)">—</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:11px;color:var(--text-soft);margin-bottom:4px">PRODUZIDO</div>
              <div id="ap-res-produzido" style="font-size:20px;font-weight:800;color:var(--verde-light)">—</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:14px;text-align:center">
              <div id="ap-res-diff-label" style="font-size:11px;color:var(--text-soft);margin-bottom:4px">DIFERENÇA</div>
              <div id="ap-res-diff" style="font-size:20px;font-weight:800">—</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:14px;text-align:center">
              <div style="font-size:11px;color:var(--text-soft);margin-bottom:4px">PERCENTUAL</div>
              <div id="ap-res-pct" style="font-size:20px;font-weight:800">—</div>
            </div>
          </div>
        </div>

        <div class="form-acoes" style="margin-top:16px">
          <button class="btn btn-verde" onclick="Acoes.salvarApontamento()">✅ Registrar Apontamento</button>
        </div>
        <div id="ap-msg" style="margin-top:12px;font-size:14px"></div>
      </div>
    `;
    Autocomplete._produtosTodos = produtos;
    if (opPreSelecionada) Acoes.filtrarProdutosFinaisSelect();
  },

  // ==================== PRODUTOS ====================
  async produtos() {
    const el = document.getElementById('tela-produtos');
    el.innerHTML = '<div class="page-titulo">🏷️ Cadastro de Produtos</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarProdutos');
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;
    const masters = lista.filter(p => p.tipo === 'master');

    const cards = gerarCardsTabela(lista, [
      { label: 'Código', campo: 'codigo' },
      { label: 'Descrição', campo: 'descricao' },
      { label: 'Tipo', render: p => `<span class="badge ${p.tipo==='master'?'badge-azul':'badge-verde'}">${p.tipo}</span>` },
      { label: 'Peso/Emb', render: p => p.tipo==='master'?(p.peso_master_kg+' kg'):(p.peso_final||'-') },
      { label: 'Status', render: p => p.ativo=='true'||p.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>' }
    ], p => `<button class="btn btn-secondary btn-sm" onclick='Acoes.abrirModalProduto(${JSON.stringify(p).replace(/'/g,"&#39;")},${JSON.stringify(masters).replace(/'/g,"&#39;")})'>✏️ Editar</button>`);

    el.innerHTML = `
      <div class="page-titulo">🏷️ Cadastro de Produtos</div>
      <div class="barra-topo">
        <input class="input-busca" id="busca-produtos" placeholder="🔍 Buscar produto..." oninput="filtrarTabela('busca-produtos','tabela-produtos')" />
        <button class="btn btn-verde btn-sm" onclick="Acoes.abrirModalProduto(null,${JSON.stringify(masters).replace(/"/g,'&quot;')})">+ Novo Produto</button>
      </div>
      <div class="card tabela-wrap">
        <table id="tabela-produtos">
          <thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Peso/Emb</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${lista.map(p => `<tr>
              <td>${p.codigo}</td><td>${p.descricao}</td>
              <td><span class="badge ${p.tipo==='master'?'badge-azul':'badge-verde'}">${p.tipo}</span></td>
              <td>${p.tipo==='master'?(p.peso_master_kg+' kg'):(p.peso_final||'-')}</td>
              <td>${p.ativo=='true'||p.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalProduto(${JSON.stringify(p).replace(/'/g,"&#39;")},${JSON.stringify(masters).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${cards}
      </div>
    `;
  },

  // ==================== FUNCIONÁRIOS ====================
  async funcionarios() {
    const el = document.getElementById('tela-funcionarios');
    el.innerHTML = '<div class="page-titulo">👷 Cadastro de Funcionários</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarFuncionarios');
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;

    const cards = gerarCardsTabela(lista, [
      { label: 'Código', campo: 'codigo_sequencial' },
      { label: 'Nome', campo: 'nome' },
      { label: 'Salário+Encargos', render: f => moeda(f.salario_encargos) },
      { label: 'Status', render: f => f.ativo=='true'||f.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>' }
    ], f => `<button class="btn btn-secondary btn-sm" onclick='Acoes.abrirModalFuncionario(${JSON.stringify(f).replace(/'/g,"&#39;")})'>✏️ Editar</button>`);

    el.innerHTML = `
      <div class="page-titulo">👷 Cadastro de Funcionários</div>
      <div class="barra-topo">
        <input class="input-busca" id="busca-func" placeholder="🔍 Buscar funcionário..." oninput="filtrarTabela('busca-func','tabela-func')" />
        <button class="btn btn-verde btn-sm" onclick="Acoes.abrirModalFuncionario(null)">+ Novo Funcionário</button>
      </div>
      <div class="card tabela-wrap">
        <table id="tabela-func">
          <thead><tr><th>Código</th><th>Nome</th><th>Salário+Encargos</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${lista.map(f => `<tr>
              <td>${f.codigo_sequencial}</td><td>${f.nome}</td>
              <td>${moeda(f.salario_encargos)}</td>
              <td>${f.ativo=='true'||f.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalFuncionario(${JSON.stringify(f).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${cards}
      </div>
    `;
  },

  // ==================== USUÁRIOS ====================
  async usuarios() {
    const el = document.getElementById('tela-usuarios');
    el.innerHTML = '<div class="page-titulo">👤 Cadastro de Usuários</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarUsuarios');
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;

    const cards = gerarCardsTabela(lista, [
      { label: 'Nome', campo: 'nome' },
      { label: 'E-mail', campo: 'email' },
      { label: 'Perfil', render: u => `<span class="badge ${u.perfil==='admin'?'badge-vermelho':'badge-azul'}">${u.perfil}</span>` },
      { label: 'Status', render: u => u.ativo=='true'||u.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>' }
    ], u => `<button class="btn btn-secondary btn-sm" onclick='Acoes.abrirModalUsuario(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️ Editar</button>`);

    el.innerHTML = `
      <div class="page-titulo">👤 Cadastro de Usuários</div>
      <div class="barra-topo">
        <input class="input-busca" id="busca-usr" placeholder="🔍 Buscar usuário..." oninput="filtrarTabela('busca-usr','tabela-usr')" />
        <button class="btn btn-verde btn-sm" onclick="Acoes.abrirModalUsuario(null)">+ Novo Usuário</button>
      </div>
      <div class="card tabela-wrap">
        <table id="tabela-usr">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${lista.map(u => `<tr>
              <td>${u.nome}</td><td>${u.email}</td>
              <td><span class="badge ${u.perfil==='admin'?'badge-vermelho':'badge-azul'}">${u.perfil}</span></td>
              <td>${u.ativo=='true'||u.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalUsuario(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${cards}
      </div>
    `;
  },

  // ==================== DESPESAS ====================
  async despesas() {
    const el = document.getElementById('tela-despesas');
    const hoje = new Date();
    await Telas._carregarDespesas(el, hoje.getMonth() + 1, hoje.getFullYear());
  },

  async _carregarDespesas(el, mes, ano) {
    el.innerHTML = '<div class="page-titulo">💸 Despesas Operacionais</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarDespesas', { mes, ano });
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;

    const cards = gerarCardsTabela(lista, [
      { label: 'Descrição', campo: 'descricao' },
      { label: 'Categoria', campo: 'categoria' },
      { label: 'Data', render: d => dataFormatada(d.data_competencia) },
      { label: 'Valor', render: d => moeda(d.valor) }
    ], d => `<button class="btn btn-secondary btn-sm" onclick='Acoes.abrirModalDespesa(${JSON.stringify(d).replace(/'/g,"&#39;")})'>✏️ Editar</button>`);

    el.innerHTML = `
      <div class="page-titulo">💸 Despesas Operacionais</div>
      <div class="periodo-selector">
        ${seletorMesAno(mes, ano, 'desp-mes', 'desp-ano', 'Telas._trocarPeriodoDespesas()')}
      </div>
      <div class="barra-topo">
        <input class="input-busca" id="busca-desp" placeholder="🔍 Buscar..." oninput="filtrarTabela('busca-desp','tabela-desp')" />
        <button class="btn btn-verde btn-sm" onclick="Acoes.abrirModalDespesa(null)">+ Nova Despesa</button>
      </div>
      <div class="card tabela-wrap">
        <table id="tabela-desp">
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>
            ${lista.map(d => `<tr>
              <td>${d.descricao}</td><td>${d.categoria||'-'}</td>
              <td>${dataFormatada(d.data_competencia)}</td>
              <td>${moeda(d.valor)}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalDespesa(${JSON.stringify(d).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${cards}
      </div>
      <div class="card" style="text-align:right">
        <strong>Total do período: <span class="text-verde">${moeda(lista.reduce((a,d)=>a+(parseFloat(d.valor)||0),0))}</span></strong>
      </div>
    `;
  },

  _trocarPeriodoDespesas() {
    const mes = document.getElementById('desp-mes').value;
    const ano = document.getElementById('desp-ano').value;
    Telas._carregarDespesas(document.getElementById('tela-despesas'), mes, ano);
  },

  // ==================== DRE ====================
  async dre() {
    const el = document.getElementById('tela-dre');
    const hoje = new Date();
    await Telas._carregarDRE(el, hoje.getMonth()+1, hoje.getFullYear());
  },

  async _carregarDRE(el, mes, ano) {
    el.innerHTML = '<div class="page-titulo">📈 DRE</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('dre', { mes, ano });
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const d = r.dre;
    const lucroClass = d.lucro_liquido >= 0 ? 'text-verde' : 'text-vermelho';

    el.innerHTML = `
      <div class="page-titulo">📈 DRE — Demonstrativo de Resultado</div>
      <div class="periodo-selector">
        ${seletorMesAno(mes, ano, 'dre-mes', 'dre-ano', 'Telas._trocarPeriodoDRE()')}
      </div>
      <div class="card" style="max-width:640px">
        <div class="dre-linha">
          <span>(+) Receita Bruta</span>
          <span class="text-verde negrito">${moeda(d.receita_bruta)}</span>
        </div>
        <div class="dre-linha">
          <div>
            <span>(−) Despesas Operacionais</span>
            <button class="btn-icon btn-sm" onclick="toggleExpansivel('dre-desp-op')">▾</button>
          </div>
          <span class="text-vermelho">${moeda(d.despesas_operacionais.total)} <span class="pct">${d.percentuais.despesas_operacionais}</span></span>
        </div>
        <div id="dre-desp-op" class="expansivel-conteudo">
          ${(d.despesas_operacionais.itens||[]).map(i=>`
            <div class="dre-detalhe"><span>${i.descricao} (${i.categoria||'—'})</span> <span>${moeda(i.valor)}</span></div>
          `).join('') || '<div class="dre-detalhe text-soft">Nenhuma despesa no período.</div>'}
        </div>
        <div class="dre-linha">
          <div>
            <span>(−) Despesas com Pessoas</span>
            <button class="btn-icon btn-sm" onclick="toggleExpansivel('dre-pessoas')">▾</button>
          </div>
          <span class="text-vermelho">${moeda(d.despesas_pessoas.total)} <span class="pct">${d.percentuais.despesas_pessoas}</span></span>
        </div>
        <div id="dre-pessoas" class="expansivel-conteudo">
          ${(d.despesas_pessoas.itens||[]).map(i=>`
            <div class="dre-detalhe"><span>${i.nome}</span> <span>${moeda(i.salario)}</span></div>
          `).join('') || '<div class="dre-detalhe text-soft">Nenhum funcionário ativo.</div>'}
        </div>
        <hr class="separador">
        <div class="dre-linha total">
          <span>(=) Lucro Líquido</span>
          <span class="${lucroClass} negrito">${moeda(d.lucro_liquido)} <span class="pct">${d.percentuais.lucro_liquido}</span></span>
        </div>
      </div>
    `;
  },

  _trocarPeriodoDRE() {
    const mes = document.getElementById('dre-mes').value;
    const ano = document.getElementById('dre-ano').value;
    Telas._carregarDRE(document.getElementById('tela-dre'), mes, ano);
  }
};

function toggleExpansivel(id) {
  document.getElementById(id).classList.toggle('aberto');
}

function seletorMesAno(mes, ano, idMes, idAno, callback) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const anos = [2023,2024,2025,2026,2027];
  return `
    <select id="${idMes}" onchange="${callback}">
      ${meses.map((m,i)=>`<option value="${i+1}" ${i+1==mes?'selected':''}>${m}</option>`).join('')}
    </select>
    <select id="${idAno}" onchange="${callback}">
      ${anos.map(a=>`<option value="${a}" ${a==ano?'selected':''}>${a}</option>`).join('')}
    </select>
  `;
}

// ============================================================
// GRÁFICO DE RECEBIMENTO vs PRODUÇÃO
// ============================================================
async function renderGrafico(mesIni, anoIni, mesFim, anoFim, mostrar) {
  const el = document.getElementById('grafico-container');
  if (!el) return;
  el.innerHTML = '<div class="text-soft" style="text-align:center;padding:20px">Carregando gráfico...</div>';

const rOPs = await Api.get('listarOPs', {});
const rApont = await Api.get('listarApontamentos', {});
const rProds = await Api.get('listarProdutos', { ativo: 'true' });

  const ops = rOPs.ok ? rOPs.dados : [];
  const apont = rApont.ok ? rApont.dados : [];
  const produtos = rProds.ok ? rProds.dados : [];

  // Gerar lista de meses no intervalo
  const meses = [];
  let y = parseInt(anoIni), m = parseInt(mesIni);
  const yFim = parseInt(anoFim), mFim = parseInt(mesFim);
  while (y < yFim || (y === yFim && m <= mFim)) {
    meses.push({ y, m });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labels = meses.map(x => `${nomesMeses[x.m-1]}/${x.y}`);

  // Recebido em kg por mês
  const recebidoKg = meses.map(({ y, m }) =>
    ops.filter(op => {
      const d = new Date(op.data_criacao);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }).reduce((acc, op) => acc + (parseFloat(op.quantidade_recebida_kg) || 0), 0)
  );

  // Produzido em unidades por mês
  const produzidoUn = meses.map(({ y, m }) =>
    apont.filter(ap => {
      const d = new Date(ap.data_apontamento);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }).reduce((acc, ap) => acc + (parseFloat(ap.quantidade_produzida) || 0), 0)
  );

  // Montar SVG do gráfico
  const W = el.offsetWidth || 600;
  const H = 260;
  const padL = 60, padR = 20, padT = 30, padB = 50;
  const gW = W - padL - padR;
  const gH = H - padT - padB;
  const n = labels.length;
  const barW = Math.max(8, Math.min(40, (gW / (n || 1)) * 0.35));
  const gap = gW / (n || 1);

  const maxKg = Math.max(...recebidoKg, 1);
  const maxUn = Math.max(...produzidoUn, 1);

  const scaleKg = v => gH - (v / maxKg) * gH;
  const scaleUn = v => gH - (v / maxUn) * gH;

  const showEnt = mostrar !== 'saida';
  const showSai = mostrar !== 'entrada';

  // Barras entradas
  let barsEnt = '', barsSai = '', linePoints = '', dots = '';
  labels.forEach((lb, i) => {
    const x = padL + gap * i + gap / 2;
    const hKg = (recebidoKg[i] / maxKg) * gH;
    const hUn = (produzidoUn[i] / maxUn) * gH;

    if (showEnt) {
      barsEnt += `<rect x="${x - barW - 2}" y="${padT + scaleKg(recebidoKg[i])}" width="${barW}" height="${hKg}" fill="#3b82f6" rx="3" opacity="0.85">
        <title>Recebido: ${recebidoKg[i].toFixed(1)} kg</title></rect>`;
    }
    if (showSai) {
      barsSai += `<rect x="${x + 2}" y="${padT + scaleUn(produzidoUn[i])}" width="${barW}" height="${hUn}" fill="#22c55e" rx="3" opacity="0.85">
        <title>Produzido: ${produzidoUn[i]} un</title></rect>`;
    }
  });

  // Linha de produção
  if (showSai && n > 1) {
    const pts = labels.map((lb, i) => {
      const x = padL + gap * i + gap / 2 + 2 + barW / 2;
      const y = padT + scaleUn(produzidoUn[i]);
      return `${x},${y}`;
    }).join(' ');
    linePoints = `<polyline points="${pts}" fill="none" stroke="#4ade80" stroke-width="2" stroke-dasharray="4,2" opacity="0.6"/>`;
    labels.forEach((lb, i) => {
      const x = padL + gap * i + gap / 2 + 2 + barW / 2;
      const y = padT + scaleUn(produzidoUn[i]);
      dots += `<circle cx="${x}" cy="${y}" r="3" fill="#4ade80"/>`;
    });
  }

  // Eixo Y esquerdo (kg) e direito (un)
  const yTicks = 4;
  let yAxisKg = '', yAxisUn = '', gridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (gH / yTicks) * i;
    const valKg = maxKg - (maxKg / yTicks) * i;
    const valUn = maxUn - (maxUn / yTicks) * i;
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#334155" stroke-width="1"/>`;
    yAxisKg += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${valKg >= 1000 ? (valKg/1000).toFixed(1)+'k' : valKg.toFixed(0)}</text>`;
    yAxisUn += `<text x="${W - padR + 6}" y="${y + 4}" text-anchor="start" fill="#94a3b8" font-size="11">${valUn >= 1000 ? (valUn/1000).toFixed(1)+'k' : valUn.toFixed(0)}</text>`;
  }

  // Labels eixo X
  let xLabels = '';
  labels.forEach((lb, i) => {
    const x = padL + gap * i + gap / 2;
    xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="#94a3b8" font-size="11">${lb}</text>`;
  });

  // Labels eixos
  const labelKg = showEnt ? `<text x="14" y="${H/2}" text-anchor="middle" fill="#3b82f6" font-size="11" transform="rotate(-90,14,${H/2})">Recebido (kg)</text>` : '';
  const labelUn = showSai ? `<text x="${W-8}" y="${H/2}" text-anchor="middle" fill="#22c55e" font-size="11" transform="rotate(90,${W-8},${H/2})">Produzido (un)</text>` : '';

  el.innerHTML = `
    <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${barsEnt}${barsSai}
      ${linePoints}${dots}
      ${yAxisKg}${yAxisUn}
      ${xLabels}
      ${labelKg}${labelUn}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+gH}" stroke="#475569" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+gH}" x2="${W-padR}" y2="${padT+gH}" stroke="#475569" stroke-width="1"/>
    </svg>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;flex-wrap:wrap">
      ${showEnt ? '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8"><span style="width:14px;height:14px;background:#3b82f6;border-radius:3px;display:inline-block"></span>Recebido (kg)</div>' : ''}
      ${showSai ? '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8"><span style="width:14px;height:14px;background:#22c55e;border-radius:3px;display:inline-block"></span>Produzido (un)</div>' : ''}
    </div>
  `;
}

function htmlGrafico() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const anos = [2024, 2025, 2026, 2027];

  const selMes = (id, val) => meses.map((m,i) => `<option value="${i+1}" ${i+1==val?'selected':''}>${m}</option>`).join('');
  const selAno = (id, val) => anos.map(a => `<option value="${a}" ${a==val?'selected':''}>${a}</option>`).join('');

  // Padrão: últimos 6 meses
  let mIni = mesAtual - 5; let aIni = anoAtual;
  if (mIni <= 0) { mIni += 12; aIni--; }

  return `
    <div class="card" style="margin-bottom:20px">
      <div class="card-titulo">📊 Recebimento vs Produção</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
        <div class="form-group" style="min-width:120px">
          <label>Mês inicial</label>
          <select id="graf-mes-ini">${selMes('graf-mes-ini', mIni)}</select>
        </div>
        <div class="form-group" style="min-width:100px">
          <label>Ano inicial</label>
          <select id="graf-ano-ini">${selAno('graf-ano-ini', aIni)}</select>
        </div>
        <div class="form-group" style="min-width:120px">
          <label>Mês final</label>
          <select id="graf-mes-fim">${selMes('graf-mes-fim', mesAtual)}</select>
        </div>
        <div class="form-group" style="min-width:100px">
          <label>Ano final</label>
          <select id="graf-ano-fim">${selAno('graf-ano-fim', anoAtual)}</select>
        </div>
        <div class="form-group" style="min-width:140px">
          <label>Exibir</label>
          <select id="graf-mostrar">
            <option value="ambos">Entradas e Saídas</option>
            <option value="entrada">Somente Entradas</option>
            <option value="saida">Somente Saídas</option>
          </select>
        </div>
        <button class="btn btn-verde btn-sm" onclick="Telas._atualizarGrafico()" style="margin-bottom:2px">🔄 Atualizar</button>
      </div>
      <div id="grafico-container" style="width:100%;min-height:260px"></div>
    </div>
  `;
}

// ============================================================
// RENDERS DO DASHBOARD
// ============================================================
function renderDashboardOperador(r) {
  const cardsOPs = gerarCardsTabela(r.pendentes, [
    { label: 'Nº OP', campo: 'numero_op' },
    { label: 'Produto', campo: 'produto_descricao' },
    { label: 'Data', render: op => dataFormatada(op.data_criacao) },
    { label: 'Qtde (kg)', campo: 'quantidade_recebida_kg' },
    { label: 'Status', render: op => badgeStatus(op.status) }
  ], op => `<button class="btn btn-sm btn-verde" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">Apontar</button>`);

  return `
    <div class="page-titulo">📊 Dashboard</div>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="num num-azul">${r.resumo.nao_iniciado}</div><div class="label">Não Iniciadas</div></div>
      <div class="resumo-card"><div class="num num-amarelo">${r.resumo.em_producao}</div><div class="label">Em Produção</div></div>
      <div class="resumo-card"><div class="num num-verde">${r.resumo.finalizadas_mes}</div><div class="label">Finalizadas no Mês</div></div>
    </div>
    <div class="card">
      <div class="card-titulo">📋 OPs Pendentes</div>
      <div class="tabela-wrap">
        <table>
          <thead><tr><th>Nº OP</th><th>Produto Master</th><th>Data</th><th>Qtde (kg)</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            ${r.pendentes.map(op=>`<tr>
              <td><strong>${op.numero_op}</strong></td>
              <td>${op.produto_descricao}</td>
              <td>${dataFormatada(op.data_criacao)}</td>
              <td>${op.quantidade_recebida_kg}</td>
              <td>${badgeStatus(op.status)}</td>
              <td><button class="btn btn-sm btn-verde" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">Apontar</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${cardsOPs}
      </div>
    </div>
  `;
}

function renderDashboardAdmin(r, mes, ano) {
  const op = r.operador;
  const fat = r.faturamento;
  const rec = r.recebimento;
  const prod = r.producao;

  return `
    <div class="page-titulo">📊 Dashboard Admin</div>
    <div class="periodo-selector">
      ${seletorMesAno(mes, ano, 'sel-mes', 'sel-ano', '')}
    </div>
    ${renderDashboardOperador(op)}
    <div class="card">
      <div class="card-titulo">💰 Faturamento do Período</div>
      <div style="font-size:28px;font-weight:800;color:var(--verde-light);margin-bottom:16px">${moeda(fat.total)}</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto Final</th><th>Qtde Produzida</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${fat.breakdown.map(b=>`<tr><td>${b.produto}</td><td>${b.qtde}</td><td>${moeda(b.valor_unitario)}</td><td>${moeda(b.subtotal)}</td></tr>`).join('')}</tbody>
      </table>
      ${gerarCardsTabela(fat.breakdown, [
        { label: 'Produto', campo: 'produto' },
        { label: 'Qtde', campo: 'qtde' },
        { label: 'Valor Unit.', render: b => moeda(b.valor_unitario) },
        { label: 'Subtotal', render: b => moeda(b.subtotal) }
      ])}
      </div>
    </div>
    <div class="card">
      <div class="card-titulo">⚖️ Recebimento de Matéria-Prima — Total: <span class="text-verde">${rec.total_kg} kg</span></div>
      <button class="btn btn-secondary btn-sm" onclick="toggleExpansivel('rec-analitico')">Ver analítico</button>
      <div id="rec-analitico" class="expansivel-conteudo mt-16">
        <div class="tabela-wrap"><table>
          <thead><tr><th>Data</th><th>OP</th><th>Produto</th><th>Qtde (kg)</th></tr></thead>
          <tbody>${rec.analitico.map(i=>`<tr><td>${dataFormatada(i.data)}</td><td>${i.numero_op}</td><td>${i.produto}</td><td>${i.qtde_kg}</td></tr>`).join('')}</tbody>
        </table>
        ${gerarCardsTabela(rec.analitico, [
          { label: 'Data', render: i => dataFormatada(i.data) },
          { label: 'OP', campo: 'numero_op' },
          { label: 'Produto', campo: 'produto' },
          { label: 'Qtde (kg)', campo: 'qtde_kg' }
        ])}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-titulo">🏭 Produção por Produto Final</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto Final</th><th>Total Unidades</th></tr></thead>
        <tbody>${prod.map(p=>`<tr><td>${p.produto}</td><td>${p.total_unidades}</td></tr>`).join('')}</tbody>
      </table>
      ${gerarCardsTabela(prod, [
        { label: 'Produto', campo: 'produto' },
        { label: 'Total Unidades', campo: 'total_unidades' }
      ])}
      </div>
    </div>
  `;
}

// ============================================================
// AÇÕES
// ============================================================
const Acoes = {
  async salvarRecebimento() {
    const prodId = Autocomplete._recSelId;
    const qtde = document.getElementById('rec-qtde').value;
    const obs = document.getElementById('rec-obs').value;
    const msg = document.getElementById('rec-msg');

    if (!prodId) { msg.innerHTML = '<span class="msg-erro">Selecione o produto master.</span>'; return; }
    if (!qtde || parseFloat(qtde) <= 0) { msg.innerHTML = '<span class="msg-erro">Informe a quantidade.</span>'; return; }

    const r = await Api.post('registrarEntrada', {
      produto_master_id: prodId,
      quantidade_recebida_kg: qtde,
      observacoes: obs
    });
    if (r.ok) {
      msg.innerHTML = `<span class="msg-ok">✅ Recebimento registrado! OP gerada: <strong>${r.numero_op}</strong></span>`;
      Toast.show('OP ' + r.numero_op + ' criada com sucesso!');
      Autocomplete._recSelId = null;
      document.getElementById('rec-produto-sel').value = '';
      document.getElementById('rec-cod-view').value = '';
      document.getElementById('rec-desc-view').value = '';
      document.getElementById('rec-qtde').value = '';
      document.getElementById('rec-obs').value = '';
    } else {
      msg.innerHTML = `<span class="msg-erro">${r.erro}</span>`;
    }
  },

  selecionarProdutoRec() {
    const sel = document.getElementById('rec-produto-sel');
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('rec-cod-view').value = opt ? opt.getAttribute('data-cod') || '' : '';
    document.getElementById('rec-desc-view').value = opt ? opt.getAttribute('data-desc') || '' : '';
    Autocomplete._recSelId = opt ? opt.value : null;
  },

  filtrarProdutosFinaisSelect() {
    const sel = document.getElementById('ap-op');
    const opt = sel.options[sel.selectedIndex];
    const masterID = opt?.getAttribute('data-master');
    const kg = opt?.getAttribute('data-kg') || '';
    const selProd = document.getElementById('ap-produto-sel');
    const kgInput = document.getElementById('ap-kg-op');

    Autocomplete._apSelId = null;
    Autocomplete._apKgOp = parseFloat(kg) || 0;
    if (kgInput) kgInput.value = kg ? kg + ' kg' : '';

    if (!masterID) {
      selProd.innerHTML = '<option value="">-- Selecione primeiro a OP --</option>';
      return;
    }
    const finais = (Autocomplete._produtosTodos || []).filter(
      p => p.tipo === 'final' && p.produto_master_id === masterID
    );
    Autocomplete._produtosFinaisLista = finais;
    selProd.innerHTML = '<option value="">-- Selecione o produto final --</option>' +
      finais.map(p => `<option value="${p.id}" data-peso="${p.peso_final||0}">${p.codigo} — ${p.descricao}</option>`).join('');
    Acoes.calcularPerdaGanho();
  },

  selecionarProdutoFinal() {
    const sel = document.getElementById('ap-produto-sel');
    Autocomplete._apSelId = sel.value || null;
    const opt = sel.options[sel.selectedIndex];
    Autocomplete._apPesoFinal = opt ? parseFloat(opt.getAttribute('data-peso')) || 0 : 0;
    Acoes.calcularPerdaGanho();
  },

  calcularPerdaGanho() {
    const tipo = document.getElementById('ap-tipo')?.value;
    const qtde = parseFloat(document.getElementById('ap-qtde')?.value) || 0;
    const kgOp = Autocomplete._apKgOp || 0;
    const pesoFinal = Autocomplete._apPesoFinal || 0;
    const resultado = document.getElementById('ap-resultado');

    if (tipo !== 'Final' || !resultado) {
      if (resultado) resultado.style.display = 'none';
      return;
    }
    if (qtde <= 0 || pesoFinal <= 0 || kgOp <= 0) {
      resultado.style.display = 'none';
      return;
    }

    const produzidoKg = qtde * pesoFinal;
    const diff = produzidoKg - kgOp;
    const pct = (diff / kgOp) * 100;
    const isPerda = diff < 0;
    const cor = isPerda ? 'var(--vermelho)' : 'var(--verde-light)';
    const icone = isPerda ? '⚠️ Perda' : '✅ Ganho';

    document.getElementById('ap-res-recebido').textContent = kgOp.toFixed(2) + ' kg';
    document.getElementById('ap-res-produzido').textContent = produzidoKg.toFixed(2) + ' kg';
    document.getElementById('ap-res-diff-label').textContent = icone;
    document.getElementById('ap-res-diff').textContent = (isPerda ? '' : '+') + diff.toFixed(2) + ' kg';
    document.getElementById('ap-res-diff').style.color = cor;
    document.getElementById('ap-res-pct').textContent = (isPerda ? '' : '+') + pct.toFixed(1) + '%';
    document.getElementById('ap-res-pct').style.color = cor;
    resultado.style.display = '';
  },

  async salvarApontamento() {
    const opId = document.getElementById('ap-op').value;
    const tipo = document.getElementById('ap-tipo').value;
    const data = document.getElementById('ap-data').value;
    const prodId = Autocomplete._apSelId;
    const qtde = document.getElementById('ap-qtde').value;
    const msg = document.getElementById('ap-msg');

    if (!opId) { msg.innerHTML = '<span class="msg-erro">Selecione a OP.</span>'; return; }
    if (!prodId) { msg.innerHTML = '<span class="msg-erro">Selecione o produto final.</span>'; return; }
    if (!qtde || parseInt(qtde) <= 0) { msg.innerHTML = '<span class="msg-erro">Informe a quantidade.</span>'; return; }

    const r = await Api.post('registrarApontamento', {
      op_id: opId, tipo_apontamento: tipo, data_apontamento: data,
      produto_final_id: prodId, quantidade_produzida: qtde
    });
    if (r.ok) {
      Toast.show('Apontamento registrado!');
      msg.innerHTML = '<span class="msg-ok">✅ Apontamento registrado com sucesso!</span>';
      Telas.apontamento();
    } else {
      msg.innerHTML = `<span class="msg-erro">${r.erro}</span>`;
    }
  },

  abrirModalProduto(prod, masters) {
    const isNovo = !prod;
    const p = prod || {};
    const tipoSel = p.tipo || 'master';

    const html = `
      <div class="form-grid">
        <div class="form-group"><label>Código <span style="color:var(--text-soft);font-size:11px">(vazio = automático)</span></label>
          <input id="mp-cod" value="${p.codigo||''}" placeholder="Ex: 7891234 ou deixe vazio" /></div>
        <div class="form-group"><label>Descrição</label>
          <input id="mp-desc" value="${p.descricao||''}" /></div>
        <div class="form-group"><label>Tipo</label>
          <select id="mp-tipo" onchange="Acoes._toggleTipoProd()">
            <option value="master" ${tipoSel==='master'?'selected':''}>Master</option>
            <option value="final" ${tipoSel==='final'?'selected':''}>Final</option>
          </select></div>
        <div class="form-group"><label>Ativo</label>
          <select id="mp-ativo">
            <option value="true" ${p.ativo=='true'||p.ativo=='TRUE'?'selected':''}>Sim</option>
            <option value="false" ${p.ativo=='false'||p.ativo=='FALSE'?'selected':''}>Não</option>
          </select></div>
        <div class="form-group" id="mp-g-peso"><label>Peso da Unidade Master (kg)</label>
          <input id="mp-peso-m" type="number" value="${p.peso_master_kg||''}" /></div>
        <div class="form-group" id="mp-g-master"><label>Produto Master vinculado</label>
          <select id="mp-master-id">
            <option value="">-- Selecione --</option>
            ${masters.map(m=>`<option value="${m.id}" ${p.produto_master_id===m.id?'selected':''}>${m.descricao}</option>`).join('')}
          </select></div>
        <div class="form-group" id="mp-g-pesoF"><label>Peso da embalagem final (kg)</label>
          <input id="mp-peso-f" type="number" step="0.001" value="${p.peso_final||''}" placeholder="Ex: 1 ou 0.5" /></div>
        <div class="form-group" id="mp-g-emb"><label>Descrição da embalagem</label>
          <input id="mp-emb" value="${p.embalagem||''}" /></div>
        <div class="form-group" id="mp-g-cemb"><label>Custo embalagem (R$)</label>
          <input id="mp-c-emb" type="number" step=".01" value="${p.custo_embalagem||''}" /></div>
        <div class="form-group" id="mp-g-crot"><label>Custo rótulo (R$)</label>
          <input id="mp-c-rot" type="number" step=".01" value="${p.custo_rotulo||''}" /></div>
        <div class="form-group" id="mp-g-temb"><label>Tipo embalagem</label>
          <select id="mp-t-emb">
            <option value="vacuo" ${p.tipo_embalagem==='vacuo'?'selected':''}>Vácuo</option>
            <option value="almofada" ${p.tipo_embalagem==='almofada'?'selected':''}>Almofada</option>
          </select></div>
        <div class="form-group" id="mp-g-val"><label>Valor cobrado por unidade (R$)</label>
          <input id="mp-val" type="number" step=".01" value="${p.valor_cobrado_unidade||''}" /></div>
      </div>
    `;
    Modal.abrir(isNovo ? 'Novo Produto' : 'Editar Produto', html, async () => {
      const tipo = document.getElementById('mp-tipo').value;
      const dados = {
        id: p.id,
        codigo: document.getElementById('mp-cod').value,
        descricao: document.getElementById('mp-desc').value,
        tipo,
        ativo: document.getElementById('mp-ativo').value
      };
      if (tipo === 'master') {
        dados.peso_master_kg = document.getElementById('mp-peso-m').value;
      } else {
        dados.produto_master_id = document.getElementById('mp-master-id').value;
        dados.peso_final = document.getElementById('mp-peso-f').value;
        dados.embalagem = document.getElementById('mp-emb').value;
        dados.custo_embalagem = document.getElementById('mp-c-emb').value;
        dados.custo_rotulo = document.getElementById('mp-c-rot').value;
        dados.tipo_embalagem = document.getElementById('mp-t-emb').value;
        dados.valor_cobrado_unidade = document.getElementById('mp-val').value;
      }
      const r = await Api.post('salvarProduto', dados);
      if (r.ok) { Toast.show('Produto salvo!'); Modal.fechar(); Telas.produtos(); }
      else Toast.show(r.erro, 'erro');
    });
    Acoes._toggleTipoProd();
  },

  _toggleTipoProd() {
    const tipo = document.getElementById('mp-tipo').value;
    const master = tipo === 'master';
    ['mp-g-peso'].forEach(id => document.getElementById(id).style.display = master ? '' : 'none');
    ['mp-g-master','mp-g-pesoF','mp-g-emb','mp-g-cemb','mp-g-crot','mp-g-temb','mp-g-val'].forEach(id => document.getElementById(id).style.display = master ? 'none' : '');
  },

  abrirModalFuncionario(func) {
    const isNovo = !func;
    const f = func || {};
    const html = `
      <div class="form-grid">
        <div class="form-group"><label>Nome completo</label>
          <input id="mf-nome" value="${f.nome||''}" /></div>
        <div class="form-group"><label>Salário + Encargos (R$/mês)</label>
          <input id="mf-sal" type="number" step=".01" value="${f.salario_encargos||''}" /></div>
        <div class="form-group"><label>Ativo</label>
          <select id="mf-ativo">
            <option value="true" ${f.ativo=='true'||f.ativo=='TRUE'?'selected':''}>Sim</option>
            <option value="false" ${f.ativo=='false'||f.ativo=='FALSE'?'selected':''}>Não</option>
          </select></div>
      </div>
    `;
    Modal.abrir(isNovo ? 'Novo Funcionário' : 'Editar Funcionário', html, async () => {
      const r = await Api.post('salvarFuncionario', {
        id: f.id,
        nome: document.getElementById('mf-nome').value,
        salario_encargos: document.getElementById('mf-sal').value,
        ativo: document.getElementById('mf-ativo').value
      });
      if (r.ok) { Toast.show('Funcionário salvo!'); Modal.fechar(); Telas.funcionarios(); }
      else Toast.show(r.erro, 'erro');
    });
  },

  abrirModalUsuario(usr) {
    const isNovo = !usr;
    const u = usr || {};
    const html = `
      <div class="form-grid">
        <div class="form-group"><label>Nome completo</label>
          <input id="mu-nome" value="${u.nome||''}" /></div>
        <div class="form-group"><label>E-mail</label>
          <input id="mu-email" type="email" value="${u.email||''}" ${!isNovo?'disabled':''} /></div>
        <div class="form-group"><label>Perfil</label>
          <select id="mu-perfil">
            <option value="operador" ${u.perfil==='operador'?'selected':''}>Operador</option>
            <option value="admin" ${u.perfil==='admin'?'selected':''}>Admin</option>
          </select></div>
        <div class="form-group"><label>Ativo</label>
          <select id="mu-ativo">
            <option value="true" ${u.ativo=='true'||u.ativo=='TRUE'?'selected':''}>Sim</option>
            <option value="false" ${u.ativo=='false'||u.ativo=='FALSE'?'selected':''}>Não</option>
          </select></div>
      </div>
      ${isNovo?'<p style="margin-top:12px;font-size:12px;color:var(--text-soft)">Uma senha provisória será enviada por e-mail automaticamente.</p>':''}
    `;
    Modal.abrir(isNovo ? 'Novo Usuário' : 'Editar Usuário', html, async () => {
      const r = await Api.post('salvarUsuario', {
        id: u.id,
        nome: document.getElementById('mu-nome').value,
        email: isNovo ? document.getElementById('mu-email').value : u.email,
        perfil: document.getElementById('mu-perfil').value,
        ativo: document.getElementById('mu-ativo').value
      });
      if (r.ok) { Toast.show('Usuário salvo!'); Modal.fechar(); Telas.usuarios(); }
      else Toast.show(r.erro, 'erro');
    });
  },

  abrirModalDespesa(desp) {
    const isNovo = !desp;
    const d = desp || {};
    const html = `
      <div class="form-grid">
        <div class="form-group"><label>Descrição</label>
          <input id="md-desc" value="${d.descricao||''}" /></div>
        <div class="form-group"><label>Categoria</label>
          <input id="md-cat" value="${d.categoria||''}" placeholder="Ex: Aluguel, Luz, Transporte..." /></div>
        <div class="form-group"><label>Valor (R$)</label>
          <input id="md-val" type="number" step=".01" value="${d.valor||''}" /></div>
        <div class="form-group"><label>Data de Competência</label>
          <input id="md-data" type="date" value="${d.data_competencia?d.data_competencia.split('T')[0]:new Date().toISOString().split('T')[0]}" /></div>
      </div>
    `;
    Modal.abrir(isNovo ? 'Nova Despesa' : 'Editar Despesa', html, async () => {
      const r = await Api.post('salvarDespesa', {
        id: d.id,
        descricao: document.getElementById('md-desc').value,
        categoria: document.getElementById('md-cat').value,
        valor: document.getElementById('md-val').value,
        data_competencia: document.getElementById('md-data').value
      });
      if (r.ok) { Toast.show('Despesa salva!'); Modal.fechar(); Telas.despesas(); }
      else Toast.show(r.erro, 'erro');
    });
  }
};

// ============================================================
// AUTOCOMPLETE
// ============================================================
const Autocomplete = {
  _recSelId: null,
  _apSelId: null,
  _apKgOp: 0,
  _apPesoFinal: 0,
  _produtosRec: [],
  _produtosFinais: [],
  _produtosTodos: [],
  _produtosFinaisLista: []
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (Estado.token && Estado.perfil) {
    App.iniciarApp();
  }
  document.getElementById('login-senha')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') App.login();
  });
});
