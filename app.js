// ============================================================
// PCP — app.js — Lógica completa do frontend
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzlR6Ngvv0uLDsllGlGVme2gQ9lVClxipKr8pFoYncoy_j6zvVloqBvqPWG5q0eEiVR/exec';

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
// CACHE DO DASHBOARD — evita chamadas duplicadas no gráfico
// ============================================================
const Cache = {
  ops: null,
  apontamentos: null,
  produtos: null,
};

// ============================================================
// API — Comunicação com o Apps Script (JSONP)
// ============================================================
const Api = {
  async get(action, params = {}) {
    Spinner.mostrar();
    return new Promise((resolve) => {
      const cbName = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
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
      const cbName = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
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
  _count: 0,
  mostrar() {
    this._count++;
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.className = 'spinner-overlay';
      this._el.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(this._el);
    }
    this._el.style.display = 'flex';
  },
  ocultar() {
    this._count = Math.max(0, this._count - 1);
    if (this._count === 0 && this._el) this._el.style.display = 'none';
  }
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

// ============================================================
// BADGE DE STATUS — inclui "Aguardando Coleta"
// ============================================================
function badgeStatus(status) {
  const mapa = {
    'Não Iniciado':     'badge-cinza',
    'Em Produção':      'badge-azul',
    'Parcial':          'badge-amarelo',
    'Aguardando Coleta':'badge-amarelo-escuro',
    'Finalizado':       'badge-verde'
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
    if (r.ok) { Toast.show('Nova senha enviada para seu e-mail!'); this.mostrarLogin(); }
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

    // Limpa cache a cada abertura do dashboard para dados frescos
    Cache.ops = null;
    Cache.apontamentos = null;
    Cache.produtos = null;

    if (Estado.perfil === 'admin') {
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();

      // Carrega dashboard e dados do gráfico em paralelo
      const [r, rOPs, rApont, rProds] = await Promise.all([
        Api.get('dashboardAdmin', { mes, ano }),
        Api.get('listarOPs', {}),
        Api.get('listarApontamentos', {}),
        Api.get('listarProdutos', { ativo: 'true' })
      ]);

      // Salva no cache global para o gráfico usar sem novas chamadas
      if (rOPs.ok)    Cache.ops          = rOPs.dados;
      if (rApont.ok)  Cache.apontamentos = rApont.dados;
      if (rProds.ok)  Cache.produtos     = rProds.dados;

      if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }

      el.innerHTML = htmlGrafico() + renderDashboardAdmin(r, mes, ano);
      document.getElementById('sel-mes').onchange = Telas._atualizarDashAdmin;
      document.getElementById('sel-ano').onchange = Telas._atualizarDashAdmin;

      // Renderiza gráfico com dados já em cache — sem nova chamada de API
      Telas._atualizarGrafico();

    } else {
      // Operador: carrega dashboard e dados do gráfico em paralelo
      const [r, rOPs, rApont, rProds] = await Promise.all([
        Api.get('dashboardOperador'),
        Api.get('listarOPs', {}),
        Api.get('listarApontamentos', {}),
        Api.get('listarProdutos', { ativo: 'true' })
      ]);

      if (rOPs.ok)    Cache.ops          = rOPs.dados;
      if (rApont.ok)  Cache.apontamentos = rApont.dados;
      if (rProds.ok)  Cache.produtos     = rProds.dados;

      if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }

      el.innerHTML = htmlGrafico() + renderDashboardOperador(r);
      Telas._atualizarGrafico();
    }
  },

  _atualizarGrafico() {
    const mesIni  = document.getElementById('graf-mes-ini')?.value;
    const anoIni  = document.getElementById('graf-ano-ini')?.value;
    const mesFim  = document.getElementById('graf-mes-fim')?.value;
    const anoFim  = document.getElementById('graf-ano-fim')?.value;
    const mostrar = document.getElementById('graf-mostrar')?.value || 'ambos';
    if (!mesIni || !anoIni || !mesFim || !anoFim) return;
    renderGrafico(mesIni, anoIni, mesFim, anoFim, mostrar);
  },

  async _atualizarDashAdmin() {
    const mes = document.getElementById('sel-mes').value;
    const ano = document.getElementById('sel-ano').value;
    const r = await Api.get('dashboardAdmin', { mes, ano });
    if (!r.ok) { Toast.show(r.erro, 'erro'); return; }
    const el = document.getElementById('tela-dashboard');

    // Preserva o bloco do gráfico e substitui só o conteúdo abaixo
    const grafBlock = document.getElementById('bloco-grafico-dashboard');
    const grafHTML = grafBlock ? grafBlock.outerHTML : htmlGrafico();

    el.innerHTML = grafHTML + renderDashboardAdmin(r, mes, ano);
    document.getElementById('sel-mes').value = mes;
    document.getElementById('sel-ano').value = ano;
    document.getElementById('sel-mes').onchange = Telas._atualizarDashAdmin;
    document.getElementById('sel-ano').onchange = Telas._atualizarDashAdmin;

    // Re-renderiza gráfico com cache existente (sem nova chamada)
    Telas._atualizarGrafico();
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
      Api.get('listarOPs', { status: 'Não Iniciado|Em Produção|Aguardando Coleta' }),
      Api.get('listarProdutos', { ativo: 'true' })
    ]);
    const ops = rOPs.ok ? rOPs.dados : [];
    const produtos = rProds.ok ? rProds.dados : [];

    // Filtra no frontend — evita problemas de encoding JSONP com múltiplos status
    const statusPermitidos = ['Não Iniciado', 'Em Produção', 'Aguardando Coleta'];
    const opsFiltradas = ops.filter(op => statusPermitidos.includes(op.status));

    const opOpts = opsFiltradas.map(op => {
      const prod = produtos.find(p => p.id === op.produto_master_id);
      return `<option value="${op.id}" data-master="${op.produto_master_id}" data-kg="${op.quantidade_recebida_kg}" data-status="${op.status}" ${opPreSelecionada === op.id ? 'selected' : ''}>${op.numero_op} — ${prod ? prod.descricao : ''} (${dataFormatada(op.data_criacao)}) [${op.status}]</option>`;
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
              <option value="Parcial">Parcial (continua em produção)</option>
              <option value="Producao_Concluida">Produção Concluída (aguardando coleta)</option>
              <option value="Coleta">Coleta (transportadora buscou — encerra OP)</option>
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

    const hoje = new Date();
    let mIni = hoje.getMonth() - 4; let aIni = hoje.getFullYear();
    if (mIni <= 0) { mIni += 12; aIni--; }
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const anos = [2024,2025,2026,2027];
    const selMes = (id, val) => meses.map((m,i) => `<option value="${i+1}" ${i+1==val?'selected':''}>${m}</option>`).join('');
    const selAno = (id, val) => anos.map(a => `<option value="${a}" ${a==val?'selected':''}>${a}</option>`).join('');

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

      <!-- DRE COMPARATIVA -->
      <div class="card" style="margin-top:24px">
        <div class="card-titulo">📊 DRE Comparativa por Período</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
          <div class="form-group" style="min-width:120px">
            <label>Mês inicial</label>
            <select id="drec-mes-ini">${selMes('drec-mes-ini', mIni)}</select>
          </div>
          <div class="form-group" style="min-width:100px">
            <label>Ano inicial</label>
            <select id="drec-ano-ini">${selAno('drec-ano-ini', aIni)}</select>
          </div>
          <div class="form-group" style="min-width:120px">
            <label>Mês final</label>
            <select id="drec-mes-fim">${selMes('drec-mes-fim', hoje.getMonth()+1)}</select>
          </div>
          <div class="form-group" style="min-width:100px">
            <label>Ano final</label>
            <select id="drec-ano-fim">${selAno('drec-ano-fim', hoje.getFullYear())}</select>
          </div>
          <button class="btn btn-verde btn-sm" onclick="Telas._carregarDREComparativa()" style="margin-bottom:2px">🔄 Atualizar</button>
        </div>
        <div id="drec-container"><div class="text-soft" style="text-align:center;padding:20px">Clique em Atualizar para carregar.</div></div>
      </div>
    `;
  },

  async _carregarDREComparativa() {
    const mesIni = document.getElementById('drec-mes-ini')?.value;
    const anoIni = document.getElementById('drec-ano-ini')?.value;
    const mesFim = document.getElementById('drec-mes-fim')?.value;
    const anoFim = document.getElementById('drec-ano-fim')?.value;
    const el = document.getElementById('drec-container');
    if (!el) return;
    el.innerHTML = '<div class="text-soft" style="text-align:center;padding:20px">Carregando...</div>';

    const r = await Api.get('dreComparativo', { mesIni, anoIni, mesFim, anoFim });
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }

    const dados = r.dados;
    if (!dados || dados.length === 0) {
      el.innerHTML = '<div class="text-soft" style="text-align:center;padding:20px">Nenhum dado no período.</div>';
      return;
    }

    window._dreComparativaDados = dados;

    const linhas = ['receita', 'despesas_op', 'despesas_pessoas', 'lucro'];
    const labels = { receita: '(+) Receita Bruta', despesas_op: '(−) Desp. Operacionais', despesas_pessoas: '(−) Desp. Pessoas', lucro: '(=) Lucro Líquido' };
    const cores = { receita: 'text-verde', despesas_op: 'text-vermelho', despesas_pessoas: 'text-vermelho', lucro: '' };

    const totais = {};
    linhas.forEach(l => { totais[l] = dados.reduce((a,d)=>a+(parseFloat(d[l])||0),0); });

    const tabela = `
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="(function(){if(!window._dreComparativaDados)return;const d=window._dreComparativaDados;const h=['Indicador',...d.map(x=>x.mes)];const l=[['(+) Receita Bruta',...d.map(x=>parseFloat(x.receita||0).toFixed(2))],['(-) Desp. Operacionais',...d.map(x=>parseFloat(x.despesas_op||0).toFixed(2))],['(-) Desp. Pessoas',...d.map(x=>parseFloat(x.despesas_pessoas||0).toFixed(2))],['(=) Lucro Liquido',...d.map(x=>parseFloat(x.lucro||0).toFixed(2))]];Exportar.excel('DRE_Comparativa',h,l)})()">📊 Excel</button>
        <button class="btn btn-secondary btn-sm" onclick="Exportar.pdf('drec-container','DRE Comparativa')">🖨️ PDF</button>
      </div>
      <div style="overflow-x:auto;margin-bottom:20px">
        <table style="min-width:${100 + dados.length * 130}px">
          <thead>
            <tr>
              <th style="text-align:left;min-width:160px">Indicador</th>
              ${dados.map(d => `<th style="text-align:right">${d.mes}</th>`).join('')}
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linhas.map(l => `
              <tr style="${l==='lucro'?'border-top:2px solid var(--border);font-weight:800':''}" >
                <td style="font-size:13px">${labels[l]}</td>
                ${dados.map(d => {
                  const v = d[l];
                  const cls = l === 'lucro' ? (v >= 0 ? 'text-verde' : 'text-vermelho') : cores[l];
                  return `<td style="text-align:right" class="${cls}">${moeda(v)}</td>`;
                }).join('')}
                <td style="text-align:right;font-weight:700" class="${l==='lucro'?(totais[l]>=0?'text-verde':'text-vermelho'):cores[l]}">${moeda(totais[l])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const W = 700;
    const H = 310;
    const padL = 70, padR = 20, padT = 44, padB = 50;
    const gW = W - padL - padR;
    const gH = H - padT - padB;
    const n = dados.length;
    const gap = gW / (n || 1);
    const barW = Math.max(6, Math.min(30, gap * 0.25));

    const allVals = dados.flatMap(d => [d.receita, d.despesas_op + d.despesas_pessoas, Math.abs(d.lucro)]);
    const maxV = Math.max(...allVals, 1);
    const scaleV = v => gH - (Math.abs(v) / maxV) * gH;

    // Formato compacto para labels do DRE: R$12k, R$1.5k, R$800
    function fmtDRE(v) {
      if (v === 0) return '';
      const abs = Math.abs(v);
      if (abs >= 1000) return 'R$' + (abs/1000).toFixed(1).replace('.0','') + 'k';
      return 'R$' + abs.toFixed(0);
    }

    let barsReceita = '', barsDespesas = '', barsLucro = '', xLabels = '', gridLines = '', yAxis = '';

    for (let i = 0; i <= 4; i++) {
      const y = padT + (gH / 4) * i;
      const val = maxV - (maxV / 4) * i;
      gridLines += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#334155" stroke-width="1"/>`;
      yAxis += `<text x="${padL-6}" y="${y+4}" text-anchor="end" fill="#94a3b8" font-size="10">${val>=1000?(val/1000).toFixed(0)+'k':val.toFixed(0)}</text>`;
    }

    dados.forEach((d, i) => {
      const x = padL + gap * i + gap / 2;
      const hRec = (d.receita / maxV) * gH;
      const yRec = padT + scaleV(d.receita);
      barsReceita += `<rect x="${x - barW*1.5 - 2}" y="${yRec}" width="${barW}" height="${hRec}" fill="#3b82f6" rx="2" opacity="0.85"/>`;
      if (d.receita > 0) barsReceita += `<text x="${x - barW*1.5 - 2 + barW/2}" y="${yRec - 3}" text-anchor="middle" fill="#93c5fd" font-size="8" font-weight="600">${fmtDRE(d.receita)}</text>`;

      const totalDesp = d.despesas_op + d.despesas_pessoas;
      const hDesp = (totalDesp / maxV) * gH;
      const yDesp = padT + scaleV(totalDesp);
      barsDespesas += `<rect x="${x - barW/2}" y="${yDesp}" width="${barW}" height="${hDesp}" fill="#f87171" rx="2" opacity="0.85"/>`;
      if (totalDesp > 0) barsDespesas += `<text x="${x}" y="${yDesp - 3}" text-anchor="middle" fill="#fca5a5" font-size="8" font-weight="600">${fmtDRE(totalDesp)}</text>`;

      const hLuc = (Math.abs(d.lucro) / maxV) * gH;
      const corLucro = d.lucro >= 0 ? '#22c55e' : '#ef4444';
      const corLabel = d.lucro >= 0 ? '#86efac' : '#fca5a5';
      const yLuc = padT + scaleV(Math.abs(d.lucro));
      barsLucro += `<rect x="${x + barW/2 + 2}" y="${yLuc}" width="${barW}" height="${hLuc}" fill="${corLucro}" rx="2" opacity="0.85"/>`;
      if (d.lucro !== 0) barsLucro += `<text x="${x + barW + 2}" y="${yLuc - 3}" text-anchor="middle" fill="${corLabel}" font-size="8" font-weight="600">${fmtDRE(d.lucro)}</text>`;

      xLabels += `<text x="${x}" y="${H-8}" text-anchor="middle" fill="#94a3b8" font-size="10">${d.mes}</text>`;
    });

    const grafico = `
      <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${gridLines}${yAxis}
        ${barsReceita}${barsDespesas}${barsLucro}
        ${xLabels}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+gH}" stroke="#475569" stroke-width="1"/>
        <line x1="${padL}" y1="${padT+gH}" x2="${W-padR}" y2="${padT+gH}" stroke="#475569" stroke-width="1"/>
      </svg>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8"><span style="width:12px;height:12px;background:#3b82f6;border-radius:2px;display:inline-block"></span>Receita</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8"><span style="width:12px;height:12px;background:#f87171;border-radius:2px;display:inline-block"></span>Despesas</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8"><span style="width:12px;height:12px;background:#22c55e;border-radius:2px;display:inline-block"></span>Lucro</div>
      </div>
    `;

    el.innerHTML = tabela + grafico;
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

function toggleDrillProd(i) {
  const div = document.getElementById('prod-det-' + i);
  const btn = document.getElementById('prod-det-btn-' + i);
  if (!div) return;
  div.classList.toggle('aberto');
  if (btn) btn.textContent = div.classList.contains('aberto') ? '▼' : '▶';
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
// Usa dados do Cache quando disponíveis — sem chamadas extras de API
// ============================================================
async function renderGrafico(mesIni, anoIni, mesFim, anoFim, mostrar) {
  const el = document.getElementById('grafico-container');
  if (!el) return;
  el.innerHTML = '<div class="text-soft" style="text-align:center;padding:20px">Carregando gráfico...</div>';

  // Usa cache se disponível, caso contrário busca da API
  let ops, apontamentos;

  if (Cache.ops && Cache.apontamentos) {
    ops = Cache.ops;
    apontamentos = Cache.apontamentos;
  } else {
    const [rOPs, rApont] = await Promise.all([
      Api.get('listarOPs', {}),
      Api.get('listarApontamentos', {})
    ]);
    ops = rOPs.ok ? rOPs.dados : [];
    apontamentos = rApont.ok ? rApont.dados : [];
    Cache.ops = ops;
    Cache.apontamentos = apontamentos;
  }

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

  // Calcula totais por mês — robusto a datas no formato Date do Sheets ou ISO
  const recebidoKg = meses.map(({ y, m }) =>
    ops.reduce((acc, op) => {
      if (!op.data_criacao) return acc;
      const d = new Date(op.data_criacao);
      if (isNaN(d)) return acc;
      if (d.getFullYear() === y && d.getMonth() + 1 === m) {
        acc += parseFloat(op.quantidade_recebida_kg) || 0;
      }
      return acc;
    }, 0)
  );

  const produzidoUn = meses.map(({ y, m }) =>
    apontamentos.reduce((acc, ap) => {
      // Só conta apontamentos de Coleta — Parcial e Produção Concluída são
      // controle interno e duplicariam a quantidade real produzida.
      if (ap.tipo_apontamento !== 'Coleta') return acc;
      if (!ap.data_apontamento) return acc;
      const d = new Date(ap.data_apontamento);
      if (isNaN(d)) return acc;
      if (d.getFullYear() === y && d.getMonth() + 1 === m) {
        acc += parseFloat(ap.quantidade_produzida) || 0;
      }
      return acc;
    }, 0)
  );

  // Verifica se há dados reais
  const temDados = recebidoKg.some(v => v > 0) || produzidoUn.some(v => v > 0);

  // Usa viewBox fixo de 700px — evita problema de offsetWidth=0
  const W = 700;
  const H = 290;
  const padL = 60, padR = 20, padT = 44, padB = 50;
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

  // Formata valor para label compacto: 1200 → "1.2k", 500 → "500"
  function fmtLabel(v, decimais = 0) {
    if (v === 0) return '';
    if (v >= 1000) return (v / 1000).toFixed(1).replace('.0','') + 'k';
    return v.toFixed(decimais);
  }

  let barsEnt = '', barsSai = '', linePoints = '', dots = '';
  labels.forEach((lb, i) => {
    const x = padL + gap * i + gap / 2;
    const hKg = (recebidoKg[i] / maxKg) * gH;
    const hUn = (produzidoUn[i] / maxUn) * gH;
    const yBarKg = padT + scaleKg(recebidoKg[i]);
    const yBarUn = padT + scaleUn(produzidoUn[i]);

    if (showEnt) {
      barsEnt += `<rect x="${x - barW - 2}" y="${yBarKg}" width="${barW}" height="${Math.max(hKg,0)}" fill="#3b82f6" rx="3" opacity="0.85">
        <title>Recebido: ${recebidoKg[i].toFixed(1)} kg</title></rect>`;
      // Label acima da barra azul (só se tiver valor)
      if (recebidoKg[i] > 0) {
        barsEnt += `<text x="${x - barW/2 - 2}" y="${yBarKg - 4}" text-anchor="middle" fill="#93c5fd" font-size="9" font-weight="600">${fmtLabel(recebidoKg[i],1)}</text>`;
      }
    }
    if (showSai) {
      barsSai += `<rect x="${x + 2}" y="${yBarUn}" width="${barW}" height="${Math.max(hUn,0)}" fill="#22c55e" rx="3" opacity="0.85">
        <title>Produzido: ${produzidoUn[i]} un</title></rect>`;
      // Label acima da barra verde (só se tiver valor)
      if (produzidoUn[i] > 0) {
        barsSai += `<text x="${x + barW/2 + 2}" y="${yBarUn - 4}" text-anchor="middle" fill="#86efac" font-size="9" font-weight="600">${fmtLabel(produzidoUn[i])}</text>`;
      }
    }
  });

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

  let xLabels = '';
  labels.forEach((lb, i) => {
    const x = padL + gap * i + gap / 2;
    xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="#94a3b8" font-size="11">${lb}</text>`;
  });

  const labelKg = showEnt ? `<text x="14" y="${H/2}" text-anchor="middle" fill="#3b82f6" font-size="11" transform="rotate(-90,14,${H/2})">Recebido (kg)</text>` : '';
  const labelUn = showSai ? `<text x="${W-8}" y="${H/2}" text-anchor="middle" fill="#22c55e" font-size="11" transform="rotate(90,${W-8},${H/2})">Produzido (un)</text>` : '';

  const avisoSemDados = !temDados
    ? `<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#94a3b8" font-size="13">Sem dados no período selecionado</text>`
    : '';

  el.innerHTML = `
    <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${gridLines}
      ${barsEnt}${barsSai}
      ${linePoints}${dots}
      ${yAxisKg}${yAxisUn}
      ${xLabels}
      ${labelKg}${labelUn}
      ${avisoSemDados}
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

  let mIni = mesAtual - 5; let aIni = anoAtual;
  if (mIni <= 0) { mIni += 12; aIni--; }

  return `
    <div class="card" id="bloco-grafico-dashboard" style="margin-bottom:20px">
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
// EXPORTAÇÃO — PDF e Excel
// ============================================================
const Exportar = {
  excel(titulo, headers, linhas) {
    const BOM = '\uFEFF';
    const sep = ';';
    const linhaHeader = headers.join(sep);
    const linhasDados = linhas.map(l => l.map(c => {
      const s = String(c ?? '').replace(/"/g,'""');
      return s.includes(sep) || s.includes('\n') ? `"${s}"` : s;
    }).join(sep));
    const csv = BOM + [linhaHeader, ...linhasDados].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = titulo.replace(/[^a-z0-9]/gi,'_') + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.show('Excel exportado!');
  },

  pdf(idBloco, titulo) {
    const el = document.getElementById(idBloco);
    if (!el) { Toast.show('Bloco não encontrado.', 'erro'); return; }
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:12px; color:#111; padding:24px; background:#fff; }
  h2 { font-size:15px; font-weight:700; margin-bottom:14px; border-bottom:2px solid #333; padding-bottom:6px; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; }
  th { background:#1e293b; color:#fff; padding:7px 10px; text-align:left; font-size:11px; }
  td { padding:6px 10px; border-bottom:1px solid #e2e8f0; font-size:11px; }
  tr:nth-child(even) td { background:#f8fafc; }
  .tfoot-row td { background:#f1f5f9; font-weight:700; border-top:2px solid #334155; }
  .text-verde { color:#16a34a; font-weight:700; }
  .text-vermelho { color:#dc2626; font-weight:700; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; }
  .btn,.btn-icon,button { display:none !important; }
  .expansivel-conteudo { display:block !important; max-height:none !important; overflow:visible !important; }
  .card-lista { display:none !important; }
  @media print { body{padding:10px} @page{margin:1cm;size:A4 landscape} }
</style></head>
<body><h2>${titulo}</h2>${el.innerHTML}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`);
    win.document.close();
  },

  excelProducao() {
    const h = ['Produto Final', 'Nº OP', 'Quantidade'];
    const l = [];
    _dashProd.forEach(p => {
      l.push([p.produto, 'TOTAL PRODUTO', p.total_unidades]);
      (p.detalhe || []).forEach(d => l.push(['', d.numero_op, d.quantidade]));
    });
    l.push(['', 'TOTAL GERAL', _dashProd.reduce((a, p) => a + (parseFloat(p.total_unidades) || 0), 0)]);
    this.excel('Producao_Detalhada', h, l);
  }
};

function btnExport(idPdf, titulo, fnExcel) {
  return `<div style="display:flex;gap:8px;margin-left:auto;align-items:center">
    <button class="btn btn-secondary btn-sm" onclick="${fnExcel}" title="Exportar Excel">📊 Excel</button>
    <button class="btn btn-secondary btn-sm" onclick="Exportar.pdf('${idPdf}','${titulo}')" title="Exportar PDF">🖨️ PDF</button>
  </div>`;
}

// ============================================================
// RENDERS DO DASHBOARD
// ============================================================
function renderDashboardOperador(r) {
  const totalKgPend = r.pendentes.reduce((a,op)=>a+(parseFloat(op.quantidade_recebida_kg)||0),0);

  const cardsOPs = gerarCardsTabela(r.pendentes, [
    { label: 'Nº OP', campo: 'numero_op' },
    { label: 'Produto', campo: 'produto_descricao' },
    { label: 'Data', render: op => dataFormatada(op.data_criacao) },
    { label: 'Qtde (kg)', campo: 'quantidade_recebida_kg' },
    { label: 'Status', render: op => badgeStatus(op.status) },
    { label: 'Dias úteis', render: op => renderDiasUteis(op) }
  ], op => {
    const btnApontar = op.status !== 'Aguardando Coleta'
      ? `<button class="btn btn-sm btn-verde" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">Apontar</button>`
      : `<button class="btn btn-sm btn-amarelo" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">📦 Registrar Coleta</button>`;
    const btnDetalhes = (op.info_embalagem && op.info_embalagem.length)
      ? ` <button class="btn btn-sm btn-secondary" onclick='Acoes.abrirModalEmbalagem(${JSON.stringify(op.info_embalagem).replace(/'/g,"&#39;")}, "${op.numero_op}")'>📦 Detalhes</button>`
      : '';
    return btnApontar + btnDetalhes;
  });

  return `
    <div class="page-titulo">📊 Dashboard</div>
    <div class="resumo-grid">
      <div class="resumo-card"><div class="num num-cinza">${r.resumo.nao_iniciado}</div><div class="label">Não Iniciadas</div></div>
      <div class="resumo-card"><div class="num num-azul">${r.resumo.em_producao}</div><div class="label">Em Produção</div></div>
      <div class="resumo-card"><div class="num num-amarelo">${r.resumo.aguardando_coleta || 0}</div><div class="label">Aguardando Coleta</div></div>
      <div class="resumo-card"><div class="num num-verde">${r.resumo.finalizadas_mes}</div><div class="label">Finalizadas no Mês</div></div>
    </div>
    <div class="card" id="bloco-ops-pendentes">
      <div class="card-titulo" style="display:flex;align-items:center;gap:8px">
        <span>📋 OPs Pendentes</span>
        ${btnExport('bloco-ops-pendentes','OPs Pendentes',`(function(){const h=['Nº OP','Produto Master','Data','Qtde (kg)','Status','Dias Úteis'];const l=_dashPendentes.map(op=>[op.numero_op,op.produto_descricao,dataFormatada(op.data_criacao),op.quantidade_recebida_kg,op.status,op.dias_uteis_aberta||0]);Exportar.excel('OPs_Pendentes',h,l)})()`)}
      </div>
      <div class="tabela-wrap">
        <table>
          <thead><tr><th>Nº OP</th><th>Produto Master</th><th>Data</th><th>Qtde (kg)</th><th>Status</th><th>Dias Úteis</th><th>Ação</th></tr></thead>
          <tbody>
            ${r.pendentes.map(op => {
              const btnApontar = op.status !== 'Aguardando Coleta'
                ? `<button class="btn btn-sm btn-verde" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">Apontar</button>`
                : `<button class="btn btn-sm btn-amarelo" onclick="App.navegar('apontamento');setTimeout(()=>Telas.apontamento('${op.id}'),100)">📦 Registrar Coleta</button>`;
              return `<tr class="${op.status === 'Aguardando Coleta' ? 'linha-aguardando-coleta' : ''}">
                <td><strong>${op.numero_op}</strong></td>
                <td>${op.produto_descricao}</td>
                <td>${dataFormatada(op.data_criacao)}</td>
                <td>${op.quantidade_recebida_kg}</td>
                <td>${badgeStatus(op.status)}</td>
                <td>${renderDiasUteis(op)}</td>
                <td>${btnApontar}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr class="tfoot-row"><td colspan="3"><strong>Total</strong></td><td><strong>${totalKgPend.toFixed(2)} kg</strong></td><td colspan="3"></td></tr></tfoot>
        </table>
        ${cardsOPs}
      </div>
    </div>
  `;
}

function renderDiasUteis(op) {
  const dias = op.dias_uteis_aberta || 0;
  if (op.status === 'Aguardando Coleta') {
    return `<span style="color:#854F0B;font-weight:600">${dias}d <span style="font-size:10px;opacity:.7">(encerrado)</span></span>`;
  }
  const cor = dias > 5 ? '#dc2626' : dias > 2 ? '#d97706' : '#16a34a';
  return `<span style="color:${cor};font-weight:600">${dias}d</span>`;
}

let _dashFat = [], _dashRec = [], _dashProd = [], _dashPendentes = [], _dashFatTotal = 0, _dashRecTotal = 0;

function renderDashboardAdmin(r, mes, ano) {
  const op = r.operador;
  const fat = r.faturamento;
  const rec = r.recebimento;
  const prod = r.producao;

  _dashFat = fat.breakdown || [];
  _dashFatTotal = fat.total || 0;
  _dashRec = rec.analitico || [];
  _dashRecTotal = rec.total_kg || 0;
  _dashProd = prod || [];
  _dashPendentes = op.pendentes || [];

  const totalQtdeFat = fat.breakdown.reduce((a,b)=>a+(parseFloat(b.qtde)||0),0);
  const totalSubtotalFat = fat.breakdown.reduce((a,b)=>a+(parseFloat(b.subtotal)||0),0);
  const totalKgRec = rec.analitico.reduce((a,i)=>a+(parseFloat(i.qtde_kg)||0),0);
  const totalUnProd = prod.reduce((a,p)=>a+(parseFloat(p.total_unidades)||0),0);

  return `
    <div class="page-titulo">📊 Dashboard Admin</div>
    <div class="periodo-selector">
      ${seletorMesAno(mes, ano, 'sel-mes', 'sel-ano', '')}
    </div>
    ${renderDashboardOperador(op)}

    <div class="card" id="bloco-faturamento">
      <div class="card-titulo" style="display:flex;align-items:center;gap:8px">
        <span>💰 Faturamento do Período</span>
        ${btnExport('bloco-faturamento','Faturamento do Periodo',`(function(){const h=['Produto Final','Qtde Produzida','Valor Unit. (R$)','Subtotal (R$)'];const l=_dashFat.map(b=>[b.produto,b.qtde,parseFloat(b.valor_unitario||0).toFixed(2),parseFloat(b.subtotal||0).toFixed(2)]);l.push(['TOTAL',_dashFat.reduce((a,b)=>a+(parseFloat(b.qtde)||0),0),'',parseFloat(_dashFatTotal||0).toFixed(2)]);Exportar.excel('Faturamento',h,l)})()`)}
      </div>
      <div style="font-size:28px;font-weight:800;color:var(--verde-light);margin-bottom:16px">${moeda(fat.total)}</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto Final</th><th>Qtde Produzida</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${fat.breakdown.map(b=>`<tr><td>${b.produto}</td><td>${b.qtde}</td><td>${moeda(b.valor_unitario)}</td><td>${moeda(b.subtotal)}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tfoot-row"><td><strong>Total</strong></td><td><strong>${totalQtdeFat}</strong></td><td></td><td><strong>${moeda(totalSubtotalFat)}</strong></td></tr></tfoot>
      </table>
      ${gerarCardsTabela(fat.breakdown, [
        { label: 'Produto', campo: 'produto' },
        { label: 'Qtde', campo: 'qtde' },
        { label: 'Valor Unit.', render: b => moeda(b.valor_unitario) },
        { label: 'Subtotal', render: b => moeda(b.subtotal) }
      ])}
      </div>
    </div>

    <div class="card" id="bloco-recebimento">
      <div class="card-titulo" style="display:flex;align-items:center;gap:8px">
        <span>⚖️ Recebimento de Matéria-Prima — Total: <span class="text-verde">${rec.total_kg} kg</span></span>
        ${btnExport('bloco-recebimento','Recebimento de Materia-Prima',`(function(){const h=['Data','Nº OP','Produto','Qtde (kg)'];const l=_dashRec.map(i=>[dataFormatada(i.data),i.numero_op,i.produto,parseFloat(i.qtde_kg||0).toFixed(2)]);l.push(['','','TOTAL',parseFloat(_dashRecTotal||0).toFixed(2)]);Exportar.excel('Recebimento',h,l)})()`)}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="toggleExpansivel('rec-analitico')">Ver analítico</button>
      <div id="rec-analitico" class="expansivel-conteudo mt-16">
        <div class="tabela-wrap"><table>
          <thead><tr><th>Data</th><th>OP</th><th>Produto</th><th>Qtde (kg)</th></tr></thead>
          <tbody>${rec.analitico.map(i=>`<tr><td>${dataFormatada(i.data)}</td><td>${i.numero_op}</td><td>${i.produto}</td><td>${i.qtde_kg}</td></tr>`).join('')}</tbody>
          <tfoot><tr class="tfoot-row"><td colspan="3"><strong>Total</strong></td><td><strong>${totalKgRec.toFixed(2)} kg</strong></td></tr></tfoot>
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

    <div class="card" id="bloco-producao">
      <div class="card-titulo" style="display:flex;align-items:center;gap:8px">
        <span>🏭 Produção por Produto Final</span>
        ${btnExport('bloco-producao','Producao por Produto Final',`Exportar.excelProducao()`)}
      </div>
      <div class="tabela-wrap"><table>
        <thead><tr><th style="width:32px"></th><th>Produto Final</th><th>Total Unidades</th></tr></thead>
        <tbody>${prod.map((p,i)=>`
          <tr>
            <td><button class="btn-icon" id="prod-det-btn-${i}" onclick="toggleDrillProd(${i})" title="Detalhar OPs">▶</button></td>
            <td>${p.produto}</td>
            <td>${p.total_unidades}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:0;border:none">
              <div id="prod-det-${i}" class="expansivel-conteudo drilldown-wrap">
                <table class="tabela-drilldown">
                  <thead><tr><th>Nº OP</th><th>Qtde Produzida</th></tr></thead>
                  <tbody>${(p.detalhe||[]).map(d=>`<tr><td>${d.numero_op}</td><td>${d.quantidade}</td></tr>`).join('')}</tbody>
                </table>
              </div>
            </td>
          </tr>`).join('')}</tbody>
        <tfoot><tr class="tfoot-row"><td></td><td><strong>Total</strong></td><td><strong>${totalUnProd}</strong></td></tr></tfoot>
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
    const statusOp = opt?.getAttribute('data-status') || '';
    const selProd = document.getElementById('ap-produto-sel');
    const kgInput = document.getElementById('ap-kg-op');
    const selTipo = document.getElementById('ap-tipo');

    Autocomplete._apSelId = null;
    Autocomplete._apKgOp = parseFloat(kg) || 0;
    if (kgInput) kgInput.value = kg ? kg + ' kg' : '';

    if (statusOp === 'Aguardando Coleta' && selTipo) {
      selTipo.value = 'Coleta';
    }

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

    if (tipo !== 'Producao_Concluida' && tipo !== 'Coleta' && tipo !== 'Final' || !resultado) {
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

  abrirModalEmbalagem(infoEmbalagem, numeroOp) {
    if (!infoEmbalagem || infoEmbalagem.length === 0) {
      Toast.show('Nenhuma informação de embalagem cadastrada para esta OP.', 'erro');
      return;
    }
    const linhas = infoEmbalagem.map(pf => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;background:var(--bg3)">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--azul-light)">📦 ${pf.descricao || '—'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
          <div>
            <div style="color:var(--text-soft);font-size:11px;text-transform:uppercase;margin-bottom:3px">Descrição da Embalagem</div>
            <div style="font-weight:600">${pf.embalagem || '—'}</div>
          </div>
          <div>
            <div style="color:var(--text-soft);font-size:11px;text-transform:uppercase;margin-bottom:3px">Tipo de Embalagem</div>
            <div style="font-weight:600">${pf.tipo_embalagem ? pf.tipo_embalagem.charAt(0).toUpperCase() + pf.tipo_embalagem.slice(1) : '—'}</div>
          </div>
          <div>
            <div style="color:var(--text-soft);font-size:11px;text-transform:uppercase;margin-bottom:3px">Peso da Embalagem Final</div>
            <div style="font-weight:600">${pf.peso_final ? pf.peso_final + ' kg' : '—'}</div>
          </div>
          <div>
            <div style="color:var(--text-soft);font-size:11px;text-transform:uppercase;margin-bottom:3px">Tipo de Rótulo</div>
            <div style="font-weight:600">${pf.tipo_rotulo || '—'}</div>
          </div>
        </div>
      </div>
    `).join('');
    Modal.abrir(`📦 Embalagens — OP ${numeroOp}`, linhas, null, true);
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
        <div class="form-group" id="mp-g-trot"><label>Tipo de Rótulo</label>
          <input id="mp-t-rot" value="${p.tipo_rotulo||''}" placeholder="Ex: Confeitaria, Food-Service..." /></div>
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
        dados.tipo_rotulo = document.getElementById('mp-t-rot').value;
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
    ['mp-g-master','mp-g-pesoF','mp-g-emb','mp-g-cemb','mp-g-crot','mp-g-temb','mp-g-trot','mp-g-val'].forEach(id => document.getElementById(id).style.display = master ? 'none' : '');
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
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .tfoot-row td { background: var(--bg3, #1e293b) !important; font-weight: 700; border-top: 2px solid var(--border, #334155); color: var(--text, #f1f5f9); }
    .card-titulo { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .badge-amarelo-escuro { background: #854F0B; color: #FAEEDA; border: 1px solid #BA7517; }
    .btn-amarelo { background: #854F0B; color: #FAEEDA; border: 1px solid #BA7517; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
    .btn-amarelo:hover { background: #BA7517; }
    .linha-aguardando-coleta td { background: rgba(186,117,23,0.08) !important; }
    .num-cinza { color: var(--text-soft, #94a3b8); }
    .num-amarelo { color: #d97706; }
  `;
  document.head.appendChild(styleEl);
  if (Estado.token && Estado.perfil) {
    App.iniciarApp();
  }
  document.getElementById('login-senha')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') App.login();
  });
});
