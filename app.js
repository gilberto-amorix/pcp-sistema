// ============================================================
// PCP — app.js — Lógica completa do frontend
// ============================================================

// ⚠️ EDITE ESTA URL com a URL do seu Google Apps Script publicado:
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
// API — Comunicação com o Apps Script
// ============================================================
const Api = {
  async get(action, params = {}) {
    Spinner.mostrar();
    try {
      const qs = new URLSearchParams({ action, token: Estado.token, ...params }).toString();
      const r = await fetch(`${API_URL}?${qs}`, {
  redirect: 'follow'
});
      return await r.json();
    } catch(e) { return { ok: false, erro: 'Erro de conexão.' }; }
    finally { Spinner.ocultar(); }
  },
  async post(action, body = {}) {
    Spinner.mostrar();
    try {
      const r = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({ action, token: Estado.token, ...body }),
  redirect: 'follow'
});
      return await r.json();
    } catch(e) { return { ok: false, erro: 'Erro de conexão.' }; }
    finally { Spinner.ocultar(); }
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
// APP — Navegação e autenticação
// ============================================================
const App = {
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const msg = document.getElementById('login-msg');
    if (!email || !senha) { msg.innerHTML = '<span class="msg-erro">Preencha e-mail e senha.</span>'; return; }
    msg.innerHTML = '';
    Spinner.mostrar();
    const r = await Api.post('login', { email, senha });
    Spinner.ocultar();
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

    // Mostrar/ocultar itens admin
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = Estado.perfil === 'admin' ? 'flex' : 'none';
    });

    this.navegar('dashboard');
  },

  navegar(tela) {
    // Verificar acesso
    const adminOnly = ['produtos', 'funcionarios', 'usuarios', 'despesas', 'dre'];
    if (adminOnly.includes(tela) && Estado.perfil !== 'admin') {
      Toast.show('Acesso restrito.', 'erro'); return;
    }

    // Esconder todas as telas
    document.querySelectorAll('#main-content > div').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('ativo'));

    const el = document.getElementById('tela-' + tela);
    if (el) el.style.display = '';

    const navEl = document.querySelector(`.nav-item[data-tela="${tela}"]`);
    if (navEl) navEl.classList.add('ativo');

    Estado.telaAtual = tela;

    // Renderizar tela
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
      el.innerHTML = renderDashboardAdmin(r, mes, ano);
      // Listener de período
      document.getElementById('sel-mes').onchange = Telas._atualizarDashAdmin;
      document.getElementById('sel-ano').onchange = Telas._atualizarDashAdmin;
    } else {
      const r = await Api.get('dashboardOperador');
      if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
      el.innerHTML = renderDashboardOperador(r);
    }
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

    el.innerHTML = `
      <div class="page-titulo">📦 Lançamento de Recebimento</div>
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label>Data</label>
            <input type="date" id="rec-data" value="${new Date().toISOString().split('T')[0]}" disabled />
          </div>
          <div class="form-group">
            <label>Produto Master (código)</label>
            <div class="autocomplete-wrap">
              <input type="text" id="rec-prod-cod" placeholder="Buscar por código..." oninput="debounce(()=>Autocomplete.buscar('rec-prod-cod','rec-prod-desc',${JSON.stringify(produtos)},'codigo','descricao'),'rec-cod')" />
              <div class="autocomplete-lista" id="auto-rec-prod-cod"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Produto Master (descrição)</label>
            <div class="autocomplete-wrap">
              <input type="text" id="rec-prod-desc" placeholder="Buscar por descrição..." oninput="debounce(()=>Autocomplete.buscar('rec-prod-desc','rec-prod-cod',${JSON.stringify(produtos)},'descricao','codigo'),'rec-desc')" />
              <div class="autocomplete-lista" id="auto-rec-prod-desc"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Quantidade Recebida (kg)</label>
            <input type="number" id="rec-qtde" min="0.01" step="0.01" placeholder="Ex: 25" />
          </div>
          <div class="form-group" style="grid-column: 1/-1">
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
    Autocomplete._produtosRec = produtos;
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
    const produtosFinais = produtos.filter(p => p.tipo === 'final');

    const opOpts = ops.map(op => {
      const prod = produtos.find(p => p.id === op.produto_master_id);
      return `<option value="${op.id}" data-master="${op.produto_master_id}" ${opPreSelecionada === op.id ? 'selected' : ''}>${op.numero_op} — ${prod ? prod.descricao : ''} (${dataFormatada(op.data_criacao)})</option>`;
    }).join('');

    el.innerHTML = `
      <div class="page-titulo">✅ Lançamento de Apontamento</div>
      <div class="card">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Ordem de Produção (OP)</label>
            <select id="ap-op" onchange="Acoes.filtrarProdutosFinais()">
              <option value="">-- Selecione a OP --</option>
              ${opOpts}
            </select>
          </div>
          <div class="form-group">
            <label>Tipo de Apontamento</label>
            <select id="ap-tipo">
              <option value="Parcial">Parcial</option>
              <option value="Final">Final (Encerra a OP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data do Apontamento</label>
            <input type="date" id="ap-data" value="${new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="form-group">
            <label>Produto Final (código)</label>
            <div class="autocomplete-wrap">
              <input type="text" id="ap-prod-cod" placeholder="Buscar por código..." oninput="debounce(()=>Autocomplete.buscarFinais('ap-prod-cod','ap-prod-desc'),'ap-cod')" />
              <div class="autocomplete-lista" id="auto-ap-prod-cod"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Produto Final (descrição)</label>
            <div class="autocomplete-wrap">
              <input type="text" id="ap-prod-desc" placeholder="Buscar por descrição..." oninput="debounce(()=>Autocomplete.buscarFinais('ap-prod-desc','ap-prod-cod'),'ap-desc')" />
              <div class="autocomplete-lista" id="auto-ap-prod-desc"></div>
            </div>
          </div>
          <div class="form-group">
            <label>Quantidade Produzida (unidades)</label>
            <input type="number" id="ap-qtde" min="1" placeholder="Ex: 50" />
          </div>
        </div>
        <div class="form-acoes">
          <button class="btn btn-verde" onclick="Acoes.salvarApontamento()">✅ Registrar Apontamento</button>
        </div>
        <div id="ap-msg" style="margin-top:12px;font-size:14px"></div>
      </div>
    `;
    Autocomplete._produtosFinais = produtosFinais;
    Autocomplete._produtosTodos = produtos;
    if (opPreSelecionada) Acoes.filtrarProdutosFinais();
  },

  // ==================== PRODUTOS ====================
  async produtos() {
    const el = document.getElementById('tela-produtos');
    el.innerHTML = '<div class="page-titulo">🏷️ Cadastro de Produtos</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarProdutos');
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;
    const masters = lista.filter(p => p.tipo === 'master');

    el.innerHTML = `
      <div class="page-titulo">🏷️ Cadastro de Produtos</div>
      <div class="barra-topo">
        <input class="input-busca" id="busca-produtos" placeholder="🔍 Buscar produto..." oninput="filtrarTabela('busca-produtos','tabela-produtos')" />
        <button class="btn btn-verde btn-sm" onclick="Acoes.abrirModalProduto(null,${JSON.stringify(masters).replace(/"/g,'&quot;')})">+ Novo Produto</button>
      </div>
      <div class="card tabela-wrap">
        <table id="tabela-produtos">
          <thead><tr>
            <th>Código</th><th>Descrição</th><th>Tipo</th><th>Peso/Emb</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody>
            ${lista.map(p => `<tr>
              <td>${p.codigo}</td>
              <td>${p.descricao}</td>
              <td><span class="badge ${p.tipo==='master'?'badge-azul':'badge-verde'}">${p.tipo}</span></td>
              <td>${p.tipo==='master'?(p.peso_master_kg+' kg'):(p.peso_final||'-')}</td>
              <td>${p.ativo=='true'||p.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td>
                <button class="btn-icon" title="Editar" onclick='Acoes.abrirModalProduto(${JSON.stringify(p).replace(/'/g,"&#39;")},${JSON.stringify(masters).replace(/'/g,"&#39;")})'>✏️</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
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
              <td>${f.codigo_sequencial}</td>
              <td>${f.nome}</td>
              <td>${moeda(f.salario_encargos)}</td>
              <td>${f.ativo=='true'||f.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalFuncionario(${JSON.stringify(f).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
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
              <td>${u.nome}</td>
              <td>${u.email}</td>
              <td><span class="badge ${u.perfil==='admin'?'badge-vermelho':'badge-azul'}">${u.perfil}</span></td>
              <td>${u.ativo=='true'||u.ativo=='TRUE'?'<span class="badge badge-verde">Ativo</span>':'<span class="badge badge-cinza">Inativo</span>'}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalUsuario(${JSON.stringify(u).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ==================== DESPESAS ====================
  async despesas() {
    const el = document.getElementById('tela-despesas');
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();
    await Telas._carregarDespesas(el, mes, ano);
  },

  async _carregarDespesas(el, mes, ano) {
    el.innerHTML = '<div class="page-titulo">💸 Despesas Operacionais</div><div class="text-soft">Carregando...</div>';
    const r = await Api.get('listarDespesas', { mes, ano });
    if (!r.ok) { el.innerHTML = `<p class="text-vermelho">${r.erro}</p>`; return; }
    const lista = r.dados;

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
              <td>${d.descricao}</td>
              <td>${d.categoria||'-'}</td>
              <td>${dataFormatada(d.data_competencia)}</td>
              <td>${moeda(d.valor)}</td>
              <td><button class="btn-icon" onclick='Acoes.abrirModalDespesa(${JSON.stringify(d).replace(/'/g,"&#39;")})'>✏️</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
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
// RENDERS DO DASHBOARD
// ============================================================
function renderDashboardOperador(r) {
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
      <div class="tabela-wrap">
        <table>
          <thead><tr><th>Produto Final</th><th>Qtde Produzida</th><th>Valor Unit.</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${fat.breakdown.map(b=>`<tr>
              <td>${b.produto}</td><td>${b.qtde}</td><td>${moeda(b.valor_unitario)}</td><td>${moeda(b.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-titulo">⚖️ Recebimento de Matéria-Prima — Total: <span class="text-verde">${rec.total_kg} kg</span></div>
      <div id="rec-analitico-wrap">
        <button class="btn btn-secondary btn-sm" onclick="toggleExpansivel('rec-analitico')">Ver analítico</button>
        <div id="rec-analitico" class="expansivel-conteudo mt-16">
          <div class="tabela-wrap"><table>
            <thead><tr><th>Data</th><th>OP</th><th>Produto</th><th>Qtde (kg)</th></tr></thead>
            <tbody>${rec.analitico.map(i=>`<tr><td>${dataFormatada(i.data)}</td><td>${i.numero_op}</td><td>${i.produto}</td><td>${i.qtde_kg}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-titulo">🏭 Produção por Produto Final</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto Final</th><th>Total Unidades</th></tr></thead>
        <tbody>${prod.map(p=>`<tr><td>${p.produto}</td><td>${p.total_unidades}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
}

// ============================================================
// AÇÕES — Modais e saves
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
      document.getElementById('rec-prod-cod').value = '';
      document.getElementById('rec-prod-desc').value = '';
      document.getElementById('rec-qtde').value = '';
      document.getElementById('rec-obs').value = '';
    } else {
      msg.innerHTML = `<span class="msg-erro">${r.erro}</span>`;
    }
  },

  filtrarProdutosFinais() {
    const sel = document.getElementById('ap-op');
    const masterID = sel.options[sel.selectedIndex]?.getAttribute('data-master');
    if (!masterID || !Autocomplete._produtosTodos) return;
    Autocomplete._produtosFinais = Autocomplete._produtosTodos.filter(
      p => p.tipo === 'final' && p.produto_master_id === masterID
    );
    document.getElementById('ap-prod-cod').value = '';
    document.getElementById('ap-prod-desc').value = '';
    Autocomplete._apSelId = null;
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
        <div class="form-group"><label>Código</label>
          <input id="mp-cod" value="${p.codigo||''}" placeholder="Ex: PROD001" /></div>
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
        <!-- Master -->
        <div class="form-group" id="mp-g-peso"><label>Peso da Unidade Master (kg)</label>
          <input id="mp-peso-m" type="number" value="${p.peso_master_kg||''}" /></div>
        <!-- Final -->
        <div class="form-group" id="mp-g-master"><label>Produto Master vinculado</label>
          <select id="mp-master-id">
            <option value="">-- Selecione --</option>
            ${masters.map(m=>`<option value="${m.id}" ${p.produto_master_id===m.id?'selected':''}>${m.descricao}</option>`).join('')}
          </select></div>
        <div class="form-group" id="mp-g-pesoF"><label>Peso da embalagem final</label>
          <input id="mp-peso-f" value="${p.peso_final||''}" placeholder="Ex: 1kg" /></div>
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
    const ids = ['mp-g-peso'];
    const finais = ['mp-g-master','mp-g-pesoF','mp-g-emb','mp-g-cemb','mp-g-crot','mp-g-temb','mp-g-val'];
    ids.forEach(id => document.getElementById(id).style.display = master ? '' : 'none');
    finais.forEach(id => document.getElementById(id).style.display = master ? 'none' : '');
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
  _produtosRec: [],
  _produtosFinais: [],
  _produtosTodos: [],

  buscar(inputId, outroCampoId, lista, campoPrincipal, campoSecundario) {
    const termo = document.getElementById(inputId).value.toLowerCase();
    const listEl = document.getElementById('auto-' + inputId);
    if (!termo) { listEl.innerHTML = ''; return; }
    const filtrados = lista.filter(p =>
      String(p[campoPrincipal]).toLowerCase().includes(termo)
    ).slice(0, 8);
    listEl.innerHTML = filtrados.map(p =>
      `<div class="autocomplete-item" onclick="Autocomplete._selecionarRec('${p.id}','${p[campoPrincipal].replace(/'/g,"\\'")}','${p[campoSecundario].replace(/'/g,"\\'")}','${inputId}','${outroCampoId}','auto-${inputId}')">${p[campoPrincipal]} — ${p[campoSecundario]}</div>`
    ).join('');
  },

_selecionarRec(id, valPrincipal, valSecundario, inputId, outroCampoId, listId) {
    const inputPrincipal = document.getElementById(inputId);
    const inputSecundario = document.getElementById(outroCampoId);
    const lista = document.getElementById(listId);
    if (inputPrincipal) inputPrincipal.value = valPrincipal;
    if (inputSecundario) inputSecundario.value = valSecundario;
    if (lista) lista.innerHTML = '';
    Autocomplete._recSelId = id;
  },

  buscarFinais(inputId, outroCampoId) {
    const lista = this._produtosFinais;
    const campoPrincipal = inputId.includes('cod') ? 'codigo' : 'descricao';
    const campoSecundario = inputId.includes('cod') ? 'descricao' : 'codigo';
    const termo = document.getElementById(inputId).value.toLowerCase();
    const listEl = document.getElementById('auto-' + inputId);
    if (!termo) { listEl.innerHTML = ''; return; }
    const filtrados = lista.filter(p =>
      String(p[campoPrincipal]).toLowerCase().includes(termo)
    ).slice(0, 8);
    listEl.innerHTML = filtrados.map(p =>
      `<div class="autocomplete-item" onclick="Autocomplete._selecionarAp('${p.id}','${p[campoPrincipal].replace(/'/g,"\\'")}','${p[campoSecundario].replace(/'/g,"\\'")}','${inputId}','${outroCampoId}','auto-${inputId}')">${p[campoPrincipal]} — ${p[campoSecundario]}</div>`
    ).join('');
  },

  _selecionarAp(id, valPrincipal, valSecundario, inputId, outroCampoId, listId) {
    document.getElementById(inputId).value = valPrincipal;
    document.getElementById(outroCampoId).value = valSecundario;
    document.getElementById(listId).innerHTML = '';
    this._apSelId = id;
  }
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (Estado.token && Estado.perfil) {
    App.iniciarApp();
  }

  // Fechar autocomplete ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) {
      document.querySelectorAll('.autocomplete-lista').forEach(l => l.innerHTML = '');
    }
  });

  // Login via Enter
  document.getElementById('login-senha')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') App.login();
  });
});
