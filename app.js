// ============================================================
// PCP — Planejamento e Controle de Produção
// Google Apps Script — Backend completo
// ============================================================

const SPREADSHEET_ID = '1EYsy7s-VkChmFP7b-Coha6KGgWh2kpvOo7qNUxcqtzU';
const SECRET_KEY = 'pcp-secret-2024';

function doGet(e) {
  var result = handleRequest(e);
  var callback = e.parameter && e.parameter.callback ? e.parameter.callback : null;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + result + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(result)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result = handleRequest(e);
  return ContentService
    .createTextOutput(result)
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
  const action = (e.parameter && e.parameter.action) || (e.postData && JSON.parse(e.postData.contents || '{}').action);
  const body = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
  const params = Object.assign({}, e.parameter, body);

  try {
    if (action === 'login') return jsonResponse(login(params));
    if (action === 'resetSenha') return jsonResponse(resetSenha(params));
    if (action === 'confirmarReset') return jsonResponse(confirmarReset(params));

    const token = params.token;
    const sessao = validarToken(token);
    if (!sessao) return jsonResponse({ ok: false, erro: 'Sessão inválida ou expirada.' });

    switch (action) {
      case 'listarProdutos':       return jsonResponse(listarProdutos(params));
      case 'salvarProduto':        return jsonResponse(salvarProduto(params, sessao));
      case 'listarFuncionarios':   return jsonResponse(listarFuncionarios(params));
      case 'salvarFuncionario':    return jsonResponse(salvarFuncionario(params, sessao));
      case 'listarUsuarios':       return jsonResponse(listarUsuarios(params, sessao));
      case 'salvarUsuario':        return jsonResponse(salvarUsuario(params, sessao));
      case 'registrarEntrada':     return jsonResponse(registrarEntrada(params, sessao));
      case 'listarOPs':            return jsonResponse(listarOPs(params));
      case 'listarApontamentos':   return jsonResponse(listarApontamentos(params));
      case 'registrarApontamento': return jsonResponse(registrarApontamento(params, sessao));
      case 'dashboardOperador':    return jsonResponse(dashboardOperador(params));
      case 'dashboardAdmin':       return jsonResponse(dashboardAdmin(params, sessao));
      case 'dre':                  return jsonResponse(dre(params, sessao));
      case 'dreComparativo':       return jsonResponse(dreComparativo(params, sessao));
      case 'listarDespesas':       return jsonResponse(listarDespesas(params, sessao));
      case 'salvarDespesa':        return jsonResponse(salvarDespesa(params, sessao));
      default: return jsonResponse({ ok: false, erro: 'Ação desconhecida: ' + action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, erro: err.message });
  }
}

function jsonResponse(data) {
  return JSON.stringify(data);
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function getSheet(nome) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function gerarId() {
  return Utilities.getUuid();
}

function hashSenha(senha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + SECRET_KEY);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function gerarToken() {
  return Utilities.getUuid().replace(/-/g, '');
}

function validarToken(token) {
  if (!token) return null;
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const user = rows.find(r => r.token_sessao === token && (r.ativo == true || String(r.ativo) === 'true' || r.ativo === 'TRUE'));
  return user || null;
}

function apenaAdmin(sessao) {
  if (sessao.perfil !== 'admin') throw new Error('Acesso restrito a administradores.');
}

// Função auxiliar para extrair mês e ano de uma data
function extrairMesAno(dataVal) {
  if (!dataVal) return null;
  var d;
  if (dataVal instanceof Date) {
    d = dataVal;
  } else {
    var str = dataVal.toString().split('T')[0].split(' ')[0];
    var partes = str.split('-');
    if (partes.length === 3) {
      d = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    } else {
      d = new Date(dataVal);
    }
  }
  return { mes: d.getMonth(), ano: d.getFullYear() };
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

function login(p) {
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const hash = hashSenha(p.senha);
  const user = rows.find(r => r.email === p.email && r.senha_hash === hash);

  if (!user) return { ok: false, erro: 'E-mail ou senha incorretos.' };
  if (String(user.ativo) === 'false' || user.ativo === 'FALSE') return { ok: false, erro: 'Usuário inativo.' };

  const token = gerarToken();
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  let colToken = headers.indexOf('token_sessao');

  if (colToken === -1) {
    sheet.getRange(1, headers.length + 1).setValue('token_sessao');
    colToken = headers.length;
  }

  const rowIdx = rows.findIndex(r => r.email === p.email) + 2;
  sheet.getRange(rowIdx, colToken + 1).setValue(token);

  return { ok: true, token, perfil: user.perfil, nome: user.nome, email: user.email };
}

function resetSenha(p) {
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const idx = rows.findIndex(r => r.email === p.email);
  if (idx === -1) return { ok: false, erro: 'E-mail não encontrado.' };

  const token = gerarToken();
  const expiracao = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const rowNum = idx + 2;
  const colRecup = headers.indexOf('token_recuperacao');
  const colExp = headers.indexOf('token_expiracao');
  if (colRecup !== -1) sheet.getRange(rowNum, colRecup + 1).setValue(token);
  if (colExp !== -1) sheet.getRange(rowNum, colExp + 1).setValue(expiracao.toISOString());

  try {
    MailApp.sendEmail({
      to: p.email,
      subject: 'PCP — Recuperação de Senha',
      body: `Olá,\n\nClique no link abaixo para redefinir sua senha (válido por 2 horas):\nURL_DO_SEU_APP?acao=reset&token=${token}\n\nSe não foi você, ignore este e-mail.`
    });
  } catch (err) {
    return { ok: false, erro: 'Erro ao enviar e-mail: ' + err.message };
  }
  return { ok: true };
}

function confirmarReset(p) {
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const idx = rows.findIndex(r => r.token_recuperacao === p.token);
  if (idx === -1) return { ok: false, erro: 'Token inválido.' };

  const user = rows[idx];
  const exp = new Date(user.token_expiracao);
  if (Date.now() > exp.getTime()) return { ok: false, erro: 'Token expirado.' };

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const rowNum = idx + 2;
  const colHash = headers.indexOf('senha_hash');
  const colRecup = headers.indexOf('token_recuperacao');
  const colExp = headers.indexOf('token_expiracao');
  if (colHash !== -1) sheet.getRange(rowNum, colHash + 1).setValue(hashSenha(p.nova_senha));
  if (colRecup !== -1) sheet.getRange(rowNum, colRecup + 1).setValue('');
  if (colExp !== -1) sheet.getRange(rowNum, colExp + 1).setValue('');
  return { ok: true };
}

// ============================================================
// PRODUTOS
// ============================================================

function listarProdutos(p) {
  const rows = sheetToObjects(getSheet('produtos'));
  let lista = rows.filter(r => r.id);
  if (p.tipo) lista = lista.filter(r => r.tipo === p.tipo);
  if (p.ativo === 'true') lista = lista.filter(r => String(r.ativo) === 'true' || r.ativo === 'TRUE');
  return { ok: true, dados: lista };
}

function salvarProduto(p, sessao) {
  apenaAdmin(sessao);
  const sheet = getSheet('produtos');
  const rows = sheetToObjects(sheet);

  if (!p.codigo || p.codigo.toString().trim() === '') {
    const codigos = rows.map(r => r.codigo).filter(c => c && c.toString().startsWith('PROD'));
    const nums = codigos.map(c => parseInt(c.toString().replace('PROD', '')) || 0);
    const proximo = (Math.max(0, ...nums) + 1).toString().padStart(5, '0');
    p.codigo = 'PROD' + proximo;
  }

  const jaExiste = rows.find(r => r.codigo === p.codigo && r.id !== p.id);
  if (jaExiste) return { ok: false, erro: 'Código de produto já cadastrado.' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (p.id && p.id !== 'undefined' && p.id !== '') {
    const idx = rows.findIndex(r => r.id === p.id);
    if (idx === -1) return { ok: false, erro: 'Produto não encontrado.' };
    const rowNum = idx + 2;
    headers.forEach((h, i) => {
      if (p[h] !== undefined) sheet.getRange(rowNum, i + 1).setValue(p[h]);
    });
  } else {
    p.id = gerarId();
    const newRow = headers.map(h => p[h] !== undefined ? p[h] : '');
    sheet.appendRow(newRow);
  }
  return { ok: true, id: p.id };
}

// ============================================================
// FUNCIONÁRIOS
// ============================================================

function listarFuncionarios(p) {
  const rows = sheetToObjects(getSheet('funcionarios'));
  let lista = rows.filter(r => r.id);
  if (p.ativo === 'true') lista = lista.filter(r => String(r.ativo) === 'true' || r.ativo === 'TRUE');
  return { ok: true, dados: lista };
}

function salvarFuncionario(p, sessao) {
  apenaAdmin(sessao);
  const sheet = getSheet('funcionarios');
  const rows = sheetToObjects(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (p.id && p.id !== 'undefined' && p.id !== '') {
    const idx = rows.findIndex(r => r.id === p.id);
    if (idx === -1) return { ok: false, erro: 'Funcionário não encontrado.' };
    const anterior = rows[idx];
    const rowNum = idx + 2;
    const camposMonitorados = ['salario_encargos', 'ativo'];
    camposMonitorados.forEach(campo => {
      if (p[campo] !== undefined && String(p[campo]) !== String(anterior[campo])) {
        const histSheet = getSheet('historico_funcionarios');
        histSheet.appendRow([gerarId(), p.id, campo, anterior[campo], p[campo], new Date().toISOString()]);
      }
    });
    headers.forEach((h, i) => {
      if (p[h] !== undefined) sheet.getRange(rowNum, i + 1).setValue(p[h]);
    });
  } else {
    const codigos = rows.map(r => r.codigo_sequencial).filter(Boolean);
    const nums = codigos.map(c => parseInt(c.replace('F', '')) || 0);
    const proximo = (Math.max(0, ...nums) + 1).toString().padStart(3, '0');
    p.codigo_sequencial = 'F' + proximo;
    p.id = gerarId();
    p.data_vigencia = new Date().toISOString();
    const newRow = headers.map(h => p[h] !== undefined ? p[h] : '');
    sheet.appendRow(newRow);
  }
  return { ok: true, id: p.id };
}

// ============================================================
// USUÁRIOS
// ============================================================

function listarUsuarios(p, sessao) {
  apenaAdmin(sessao);
  const rows = sheetToObjects(getSheet('usuarios'));
  return { ok: true, dados: rows.map(r => ({ ...r, senha_hash: undefined })) };
}

function salvarUsuario(p, sessao) {
  apenaAdmin(sessao);
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (p.id && p.id !== 'undefined' && p.id !== '') {
    const idx = rows.findIndex(r => r.id === p.id);
    if (idx === -1) return { ok: false, erro: 'Usuário não encontrado.' };
    const rowNum = idx + 2;
    headers.forEach((h, i) => {
      if (p[h] !== undefined && h !== 'senha_hash') sheet.getRange(rowNum, i + 1).setValue(p[h]);
    });
  } else {
    const jaExiste = rows.find(r => r.email === p.email);
    if (jaExiste) return { ok: false, erro: 'E-mail já cadastrado.' };
    p.id = gerarId();
    p.data_criacao = new Date().toISOString();
    const senhaProvisoria = gerarToken().slice(0, 8);
    p.senha_hash = hashSenha(senhaProvisoria);
    const newRow = headers.map(h => p[h] !== undefined ? p[h] : '');
    sheet.appendRow(newRow);
    try {
      MailApp.sendEmail({
        to: p.email,
        subject: 'PCP — Acesso ao Sistema',
        body: `Olá ${p.nome},\n\nSeu acesso ao sistema PCP foi criado.\n\nE-mail: ${p.email}\nSenha provisória: ${senhaProvisoria}\n\nAcesse e altere sua senha no primeiro login.`
      });
    } catch (e) {}
  }
  return { ok: true, id: p.id };
}

// ============================================================
// ORDENS DE PRODUÇÃO
// ============================================================

function registrarEntrada(p, sessao) {
  const sheet = getSheet('ordens_producao');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rowsAtual = sheetToObjects(getSheet('ordens_producao'));
    const nums = rowsAtual.map(r => parseInt((r.numero_op || '').replace('OP-', '')) || 0);
    const proximo = (Math.max(0, ...nums) + 1).toString().padStart(6, '0');
    const numero_op = 'OP-' + proximo;
    const nova = {
      id: gerarId(),
      numero_op,
      data_criacao: p.data || new Date().toISOString(),
      produto_master_id: p.produto_master_id,
      quantidade_recebida_kg: p.quantidade_recebida_kg,
      status: 'Não Iniciado',
      usuario_id: sessao.id || sessao.email,
      observacoes: p.observacoes || ''
    };
    const newRow = headers.map(h => nova[h] !== undefined ? nova[h] : '');
    getSheet('ordens_producao').appendRow(newRow);
    return { ok: true, numero_op };
  } finally {
    lock.releaseLock();
  }
}

function listarOPs(p) {
  const rows = sheetToObjects(getSheet('ordens_producao'));
  let lista = rows.filter(r => r.id);
  if (p.status) {
    const statuses = p.status.split(',');
    lista = lista.filter(r => statuses.includes(r.status));
  }
  return { ok: true, dados: lista };
}

function listarApontamentos(p) {
  const rows = sheetToObjects(getSheet('apontamentos'));
  return { ok: true, dados: rows.filter(r => r.id) };
}

function registrarApontamento(p, sessao) {
  const sheet = getSheet('apontamentos');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const opsSheet = getSheet('ordens_producao');
  const ops = sheetToObjects(opsSheet);
  const opIdx = ops.findIndex(r => r.id === p.op_id);
  if (opIdx === -1) return { ok: false, erro: 'OP não encontrada.' };
  if (ops[opIdx].status === 'Finalizado') return { ok: false, erro: 'OP já finalizada.' };

  const novo = {
    id: gerarId(),
    op_id: p.op_id,
    data_apontamento: p.data_apontamento || new Date().toISOString(),
    produto_final_id: p.produto_final_id,
    quantidade_produzida: p.quantidade_produzida,
    tipo_apontamento: p.tipo_apontamento,
    usuario_id: sessao.id || sessao.email
  };
  const newRow = headers.map(h => novo[h] !== undefined ? novo[h] : '');
  sheet.appendRow(newRow);

  const opsHeaders = opsSheet.getRange(1, 1, 1, opsSheet.getLastColumn()).getValues()[0];
  const colStatus = opsHeaders.indexOf('status');
  const rowNum = opIdx + 2;
  const novoStatus = p.tipo_apontamento === 'Final' ? 'Finalizado' : 'Em Produção';
  opsSheet.getRange(rowNum, colStatus + 1).setValue(novoStatus);
  return { ok: true };
}

// ============================================================
// DASHBOARDS
// ============================================================

function dashboardOperador(p) {
  const ops = sheetToObjects(getSheet('ordens_producao'));
  const produtos = sheetToObjects(getSheet('produtos'));
  const pendentes = ops.filter(r => r.status === 'Não Iniciado' || r.status === 'Em Produção');
  const enriquecidas = pendentes.map(op => {
    const prodMaster = produtos.find(pr => pr.id === op.produto_master_id);
    // Busca produtos finais vinculados a este produto master para exibir info de embalagem
    const produtosFinais = produtos.filter(pr => pr.produto_master_id === op.produto_master_id && pr.tipo !== 'Master');
    const info_embalagem = produtosFinais.map(pf => ({
      descricao: pf.descricao || '',
      peso_final: pf.peso_final || '',
      embalagem: pf.embalagem || '',
      tipo_embalagem: pf.tipo_embalagem || '',
      tipo_rotulo: pf.tipo_rotulo || ''
    }));
    return {
      ...op,
      produto_descricao: prodMaster ? prodMaster.descricao : op.produto_master_id,
      info_embalagem
    };
  });
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const finalizadasMes = ops.filter(r => {
    if (r.status !== 'Finalizado') return false;
    const ma = extrairMesAno(r.data_criacao);
    return ma && ma.mes === mesAtual && ma.ano === anoAtual;
  });
  return {
    ok: true,
    pendentes: enriquecidas,
    resumo: {
      nao_iniciado: ops.filter(r => r.status === 'Não Iniciado').length,
      em_producao: ops.filter(r => r.status === 'Em Produção').length,
      finalizadas_mes: finalizadasMes.length
    }
  };
}

function dashboardAdmin(p, sessao) {
  apenaAdmin(sessao);
  const { mes, ano } = p;
  if (!mes || !ano) return { ok: false, erro: 'Informe mês e ano.' };
  const m = parseInt(mes) - 1;
  const a = parseInt(ano);

  const apontamentos = sheetToObjects(getSheet('apontamentos'));
  const produtos = sheetToObjects(getSheet('produtos'));
  const ops = sheetToObjects(getSheet('ordens_producao'));

  const apont = apontamentos.filter(r => {
    const ma = extrairMesAno(r.data_apontamento);
    return ma && ma.mes === m && ma.ano === a;
  });

  let faturamentoBruto = 0;
  const breakdownMap = {};
  apont.forEach(ap => {
    const prod = produtos.find(pr => pr.id === ap.produto_final_id);
    const valor = parseFloat(prod ? prod.valor_cobrado_unidade : 0) || 0;
    const qtde = parseFloat(ap.quantidade_produzida) || 0;
    const sub = valor * qtde;
    faturamentoBruto += sub;
    const key = ap.produto_final_id;
    if (!breakdownMap[key]) breakdownMap[key] = { produto: prod ? prod.descricao : key, qtde: 0, valor_unitario: valor, subtotal: 0 };
    breakdownMap[key].qtde += qtde;
    breakdownMap[key].subtotal += sub;
  });

  const opsperiodo = ops.filter(r => {
    const ma = extrairMesAno(r.data_criacao);
    return ma && ma.mes === m && ma.ano === a;
  });
  const totalKg = opsperiodo.reduce((acc, r) => acc + (parseFloat(r.quantidade_recebida_kg) || 0), 0);
  const recebimentoAnalitico = opsperiodo.map(op => {
    const prod = produtos.find(pr => pr.id === op.produto_master_id);
    return { data: op.data_criacao, numero_op: op.numero_op, produto: prod ? prod.descricao : op.produto_master_id, qtde_kg: op.quantidade_recebida_kg };
  });

  const resumoProdutos = {};
  apont.forEach(ap => {
    const prod = produtos.find(pr => pr.id === ap.produto_final_id);
    const key = ap.produto_final_id;
    if (!resumoProdutos[key]) resumoProdutos[key] = { produto: prod ? prod.descricao : key, total_unidades: 0 };
    resumoProdutos[key].total_unidades += parseFloat(ap.quantidade_produzida) || 0;
  });

  const opsDash = dashboardOperador({});
  return {
    ok: true,
    faturamento: { total: faturamentoBruto, breakdown: Object.values(breakdownMap) },
    recebimento: { total_kg: totalKg, analitico: recebimentoAnalitico },
    producao: Object.values(resumoProdutos),
    operador: opsDash
  };
}

function dre(p, sessao) {
  apenaAdmin(sessao);
  const { mes, ano } = p;
  if (!mes || !ano) return { ok: false, erro: 'Informe mês e ano.' };
  const m = parseInt(mes) - 1;
  const a = parseInt(ano);

  const apontamentos = sheetToObjects(getSheet('apontamentos'));
  const produtos = sheetToObjects(getSheet('produtos'));
  const apont = apontamentos.filter(r => {
    const ma = extrairMesAno(r.data_apontamento);
    return ma && ma.mes === m && ma.ano === a;
  });
  let receitaBruta = 0;
  apont.forEach(r => {
    const prod = produtos.find(pr => pr.id === r.produto_final_id);
    const v = parseFloat(prod ? prod.valor_cobrado_unidade : 0) || 0;
    receitaBruta += v * (parseFloat(r.quantidade_produzida) || 0);
  });

  const despesas = sheetToObjects(getSheet('despesas_externas'));
  const despPeriodo = despesas.filter(r => {
    if (!r.id) return false;
    const ma = extrairMesAno(r.data_competencia);
    return ma && ma.mes === m && ma.ano === a;
  });
  const totalDespOp = despPeriodo.reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0);

  const funcionarios = sheetToObjects(getSheet('funcionarios'));
  const historico = sheetToObjects(getSheet('historico_funcionarios'));
  let totalPessoas = 0;
  const detalhesPessoas = [];
  const dataFimRef = new Date(a, m + 1, 0, 23, 59, 59);
  funcionarios.filter(f => String(f.ativo) === 'true' || f.ativo === 'TRUE').forEach(func => {
    const hists = historico
      .filter(h => h.funcionario_id === func.id && h.campo_alterado === 'salario_encargos')
      .filter(h => new Date(h.data_alteracao) <= dataFimRef)
      .sort((a, b) => new Date(b.data_alteracao) - new Date(a.data_alteracao));
    const salarioVigente = hists.length > 0 ? parseFloat(hists[0].valor_novo) || 0 : parseFloat(func.salario_encargos) || 0;
    totalPessoas += salarioVigente;
    detalhesPessoas.push({ nome: func.nome, salario: salarioVigente });
  });

  const lucroLiquido = receitaBruta - totalDespOp - totalPessoas;
  const pct = v => receitaBruta > 0 ? ((v / receitaBruta) * 100).toFixed(1) + '%' : '-';

  return {
    ok: true,
    dre: {
      receita_bruta: receitaBruta,
      despesas_operacionais: { total: totalDespOp, itens: despPeriodo },
      despesas_pessoas: { total: totalPessoas, itens: detalhesPessoas },
      lucro_liquido: lucroLiquido,
      percentuais: {
        despesas_operacionais: pct(totalDespOp),
        despesas_pessoas: pct(totalPessoas),
        lucro_liquido: pct(lucroLiquido)
      }
    }
  };
}

function dreComparativo(p, sessao) {
  apenaAdmin(sessao);
  const { mesIni, anoIni, mesFim, anoFim } = p;
  if (!mesIni || !anoIni || !mesFim || !anoFim) return { ok: false, erro: 'Informe o período.' };

  const meses = [];
  let y = parseInt(anoIni), m = parseInt(mesIni);
  const yFim = parseInt(anoFim), mFim = parseInt(mesFim);
  while (y < yFim || (y === yFim && m <= mFim)) {
    meses.push({ y, m });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  const apontamentos = sheetToObjects(getSheet('apontamentos'));
  const produtos = sheetToObjects(getSheet('produtos'));
  const despesas = sheetToObjects(getSheet('despesas_externas'));
  const funcionarios = sheetToObjects(getSheet('funcionarios'));
  const historico = sheetToObjects(getSheet('historico_funcionarios'));
  const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const resultado = meses.map(({ y, m }) => {
    const mIdx = m - 1;
    const dataFimRef = new Date(y, m, 0, 23, 59, 59);

    const apont = apontamentos.filter(r => {
      const ma = extrairMesAno(r.data_apontamento);
      return ma && ma.mes === mIdx && ma.ano === y;
    });
    let receita = 0;
    apont.forEach(r => {
      const prod = produtos.find(pr => pr.id === r.produto_final_id);
      const v = parseFloat(prod ? prod.valor_cobrado_unidade : 0) || 0;
      receita += v * (parseFloat(r.quantidade_produzida) || 0);
    });

    const despPeriodo = despesas.filter(r => {
      if (!r.id) return false;
      const ma = extrairMesAno(r.data_competencia);
      return ma && ma.mes === mIdx && ma.ano === y;
    });
    const totalDespOp = despPeriodo.reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0);

    let totalPessoas = 0;
    funcionarios.filter(f => String(f.ativo) === 'true' || f.ativo === 'TRUE').forEach(func => {
      const hists = historico
        .filter(h => h.funcionario_id === func.id && h.campo_alterado === 'salario_encargos')
        .filter(h => new Date(h.data_alteracao) <= dataFimRef)
        .sort((a, b) => new Date(b.data_alteracao) - new Date(a.data_alteracao));
      const sal = hists.length > 0 ? parseFloat(hists[0].valor_novo) || 0 : parseFloat(func.salario_encargos) || 0;
      totalPessoas += sal;
    });

    return {
      mes: nomesMeses[mIdx] + '/' + y,
      receita,
      despesas_op: totalDespOp,
      despesas_pessoas: totalPessoas,
      lucro: receita - totalDespOp - totalPessoas
    };
  });

  return { ok: true, dados: resultado };
}

// ============================================================
// DESPESAS EXTERNAS
// ============================================================

function listarDespesas(p, sessao) {
  apenaAdmin(sessao);
  const rows = sheetToObjects(getSheet('despesas_externas'));
  let lista = rows.filter(r => r.id);
  if (p.mes && p.ano) {
    const m = parseInt(p.mes) - 1;
    const a = parseInt(p.ano);
    lista = lista.filter(r => {
      const ma = extrairMesAno(r.data_competencia);
      return ma && ma.mes === m && ma.ano === a;
    });
  }
  return { ok: true, dados: lista };
}

function salvarDespesa(p, sessao) {
  apenaAdmin(sessao);
  const sheet = getSheet('despesas_externas');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheetToObjects(sheet);

  if (p.id && p.id !== 'undefined' && p.id !== '') {
    const idx = rows.findIndex(r => r.id === p.id);
    if (idx === -1) return { ok: false, erro: 'Despesa não encontrada.' };
    const rowNum = idx + 2;
    headers.forEach((h, i) => {
      if (p[h] !== undefined) sheet.getRange(rowNum, i + 1).setValue(p[h]);
    });
  } else {
    p.id = gerarId();
    const newRow = headers.map(h => p[h] !== undefined ? p[h] : '');
    sheet.appendRow(newRow);
  }
  return { ok: true, id: p.id };
}

// ============================================================
// INICIALIZAÇÃO DA PLANILHA
// ============================================================

function inicializarPlanilha() {
  const abas = {
    usuarios: ['id','nome','email','senha_hash','perfil','ativo','token_recuperacao','token_expiracao','data_criacao','token_sessao'],
    produtos: ['id','codigo','descricao','tipo','peso_master_kg','produto_master_id','peso_final','embalagem','custo_embalagem','custo_rotulo','tipo_embalagem','valor_cobrado_unidade','ativo','tipo_rotulo'],
    funcionarios: ['id','codigo_sequencial','nome','salario_encargos','ativo','data_vigencia'],
    historico_funcionarios: ['id','funcionario_id','campo_alterado','valor_anterior','valor_novo','data_alteracao'],
    ordens_producao: ['id','numero_op','data_criacao','produto_master_id','quantidade_recebida_kg','status','usuario_id','observacoes'],
    apontamentos: ['id','op_id','data_apontamento','produto_final_id','quantidade_produzida','tipo_apontamento','usuario_id'],
    despesas_externas: ['id','descricao','valor','data_competencia','categoria']
  };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.entries(abas).forEach(([nome, colunas]) => {
    let sheet = ss.getSheetByName(nome);
    if (!sheet) sheet = ss.insertSheet(nome);
    if (sheet.getLastRow() === 0) sheet.appendRow(colunas);
  });

  const usuariosSheet = ss.getSheetByName('usuarios');
  const rows = sheetToObjects(usuariosSheet);
  if (rows.length === 0) {
    const senhaHash = hashSenha('admin123');
    usuariosSheet.appendRow([gerarId(), 'Administrador', 'admin@empresa.com', senhaHash, 'admin', 'true', '', '', new Date().toISOString(), '']);
    Logger.log('Login padrão: admin@empresa.com / admin123');
  }
  Logger.log('Inicialização concluída.');
}

function redefinirSenhaAdmin() {
  const novaSenha = 'Amorix@2024';
  const hash = hashSenha(novaSenha);
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const idx = rows.findIndex(r => r.email === 'gilberto.amorix@gmail.com');
  if (idx === -1) { Logger.log('Usuário não encontrado'); return; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colHash = headers.indexOf('senha_hash');
  sheet.getRange(idx + 2, colHash + 1).setValue(hash);
  Logger.log('Senha do admin redefinida com sucesso!');
}

function redefinirSenhaOperador() {
  const novaSenha = 'Operador@2024';
  const hash = hashSenha(novaSenha);
  const sheet = getSheet('usuarios');
  const rows = sheetToObjects(sheet);
  const idx = rows.findIndex(r => r.perfil === 'operador');
  if (idx === -1) { Logger.log('Operador não encontrado'); return; }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colHash = headers.indexOf('senha_hash');
  sheet.getRange(idx + 2, colHash + 1).setValue(hash);
  Logger.log('Senha do operador redefinida com sucesso!');
}
