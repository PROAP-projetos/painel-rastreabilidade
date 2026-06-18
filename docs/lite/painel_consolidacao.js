// ── Versão Lite rev2 — INEP/iESGo inline, input de número, sem select ─────
const DATA_URL = 'json_teste/base_painel_atualizada.json';
const HTML_FILE = (typeof window !== 'undefined' && window.location && window.location.pathname)
    ? (window.location.pathname.split('/').pop() || 'index_lite.html')
    : 'index_lite.html';

let dados = [];
let dadosFiltrados = [];
let termoBuscaAtual = '';
let dadosCarregados = false;
let metaDados = null;
let numeroInputTimer = null; // debounce
let inlineTextScale = 1;
let inlineTextSectionIdAtiva = null;
const INLINE_TEXT_SCALE_MIN = 0.9;
const INLINE_TEXT_SCALE_MAX = 1.35;
const INLINE_TEXT_SCALE_STEP = 0.05;

// ── Filtro por URL (?ug=PROEST) ────────────────────────────────────────────

function getUgDaUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const ug = (params.get('ug') || '').trim();
    return ug || null;
}

function aplicarFiltroDeUrl() {
    const ugUrl = getUgDaUrl();
    if (!ugUrl) return;

    const ugNorm = normalizarChave(ugUrl);
    const ugReal = [...new Set(
        dados.flatMap(c => getResponsaveisConsolidada(c))
    )].find(ug => normalizarChave(ug).includes(ugNorm) || ugNorm.includes(normalizarChave(ug)));

    const ugFinal = ugReal || ugUrl;

    const panel = document.getElementById('ugDropdownPanel');
    if (panel) {
        panel.querySelectorAll('input[type=checkbox]').forEach(chk => {
            if (normalizarChave(chk.value).includes(ugNorm) || ugNorm.includes(normalizarChave(chk.value))) {
                chk.checked = true;
            }
        });
    }

    const selectUg = getFiltroUgEl();
    if (selectUg) {
        Array.from(selectUg.options).forEach(opt => {
            if (normalizarChave(opt.value).includes(ugNorm) || ugNorm.includes(normalizarChave(opt.value))) {
                opt.selected = true;
            }
        });
    }

    atualizarUGBtn();
    mostrarBannerUgUrl(ugFinal);
}

function mostrarBannerUgUrl(ugNome) {
    if (document.getElementById('url-ug-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'url-ug-banner';
    banner.className = 'url-ug-banner';
    banner.innerHTML = `
        <i class="bi bi-funnel-fill"></i>
        Exibindo apenas ações de: <strong>${escapeHtml(ugNome)}</strong>
        <a href="${escapeHtml(window.location.pathname)}" class="url-ug-banner-clear" title="Ver todas as UGs">
            <i class="bi bi-x-circle"></i> Ver todas
        </a>`;
    const container = document.querySelector('.container');
    const filtersSection = document.querySelector('.filters-section');
    if (container && filtersSection) {
        container.insertBefore(banner, filtersSection);
    }
}

// ── Utilitários ────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
        .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function escapeRegExp(str) { return String(str||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function highlight(texto, termo) {
    const t = String(termo||'').trim(), safe = escapeHtml(texto);
    if (!t) return safe;
    return safe.replace(new RegExp(escapeRegExp(t),'gi'), m=>`<mark class="hl">${m}</mark>`);
}
function normalizarChave(v) {
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .trim().toLowerCase().replace(/\s+/g,' ').replace(/[.\s]+$/g,'');
}
function normalizarTextoBusca(v) {
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function textoContemBusca(valor, norm, compacto) {
    const t = normalizarTextoBusca(valor);
    if (!t || !norm) return false;
    if (t.includes(norm)) return true;
    if (!compacto || compacto.length < 3) return false;
    return t.replace(/\s+/g,'').includes(compacto);
}
function isTarefaNoFimTexto(texto) { return /(?:[.\s]*\(?\s*TAREFA\s*\)?\s*)$/i.test(String(texto||'').trim()); }
function textoSemTarefaNoFim(texto) { return String(texto||'').replace(/[.\s]*\(?\s*TAREFA\s*\)?\s*$/i,'').trim(); }
function isTarefa(c) { return c ? isTarefaNoFimTexto(c.acao) : false; }
function getTipoRegistro(c) { return isTarefa(c) ? 'tarefa' : 'acao'; }
function toNumberOrNull(v) { const n=Number(v); return Number.isFinite(n)?n:null; }
function normalizarAcaoTexto(t) {
    return normalizarChave(t).replace(/[.\s]*\(?\s*tarefa\s*\)?\s*$/g,'').trim().replace(/\s+/g,' ');
}
function chaveConsolidada(item) {
    const k = normalizarAcaoTexto(item&&item.acao);
    return k || `id:${normalizarChave(item&&item.id)}`;
}
function isBancoPropostasRegistradas(c) {
    const id = toNumberOrNull(c&&c.id), acao = normalizarChave(c&&c.acao);
    return id===999 || acao.includes('banco de propostas registradas');
}
function extrairUnidadesResponsaveis(valor) {
    const raw = String(valor||'').trim(); if (!raw) return [];
    const vistos=Object.create(null), out=[];
    raw.split(/[\/;,]+/g).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean).forEach(p=>{
        const k=normalizarChave(p); if (!k||vistos[k]) return; vistos[k]=true; out.push(p);
    });
    return out;
}
function getResponsaveisConsolidada(c) { return c ? extrairUnidadesResponsaveis(c.responsavel) : []; }
function formatarLista(valores, max=3) {
    const l=(Array.isArray(valores)?valores:[]).filter(Boolean);
    if (!l.length) return '';
    if (l.length<=max) return l.join(', ');
    return `${l.slice(0,max).join(', ')} +${l.length-max}`;
}

function getFiltroUgEl() {
    return document.getElementById('filter-ug');
}

function getUgsSelecionadas() {
    const select = getFiltroUgEl();
    if (!select) return [];
    return Array.from(select.selectedOptions || [])
        .map(option => option.value)
        .filter(Boolean);
}

function sanitizarNomeArquivo(texto) {
    return String(texto || 'planilha')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'planilha';
}

function htmlTabelaCelula(valor) {
    return escapeHtml(String(valor == null ? '' : valor)).replace(/\r?\n/g, '<br>');
}

function toggleUGDropdown() {
    const btn = document.getElementById('ugDropdownBtn');
    const panel = document.getElementById('ugDropdownPanel');
    if (!btn || !panel) return;
    btn.classList.toggle('open');
    panel.classList.toggle('open');
}

function toggleUGAll(chk) {
    const panel = document.getElementById('ugDropdownPanel');
    if (!panel) return;
    panel.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = chk.checked);
    syncUGSelect();
    aplicarFiltros();
}

function syncUGSelect() {
    const panel = document.getElementById('ugDropdownPanel');
    const select = getFiltroUgEl();
    const chkAll = document.getElementById('ugChkAll');
    if (!panel || !select) return;

    const checkboxes = Array.from(panel.querySelectorAll('input[type=checkbox]')).filter(c => c !== chkAll);
    const marcadas = checkboxes.filter(c => c.checked);

    Array.from(select.options).forEach(opt => {
        opt.selected = marcadas.some(c => c.value === opt.value);
    });

    if (chkAll) chkAll.checked = marcadas.length === checkboxes.length && checkboxes.length > 0;
    atualizarUGBtn();
}

function atualizarUGBtn() {
    const panel = document.getElementById('ugDropdownPanel');
    const btn = document.getElementById('ugDropdownBtn');
    const chkAll = document.getElementById('ugChkAll');
    if (!panel || !btn) return;

    const checkboxes = Array.from(panel.querySelectorAll('input[type=checkbox]')).filter(c => c !== chkAll);
    const marcadas = checkboxes.filter(c => c.checked);

    if (marcadas.length === 0) {
        btn.textContent = 'Todas as UGs';
    } else if (marcadas.length === 1) {
        btn.textContent = marcadas[0].value;
    } else {
        btn.textContent = `${marcadas.length} UGs selecionadas`;
    }
}

function formatarInepParaExportacao(consolidada) {
    const detalhes = Array.isArray(consolidada && consolidada.inep_detalhes) ? consolidada.inep_detalhes : [];
    const linhas = [];
    const titulo = String(consolidada && consolidatedInepLabel(consolidada) ? consolidatedInepLabel(consolidada) : (consolidada && consolidada.inep ? consolidada.inep : '')).trim();
    if (titulo) linhas.push(titulo);

    const detalhesLinhas = detalhes.map(d => {
        const numero = String(d && d.codigo ? d.codigo : '').trim();
        const indicador = String(d && d.indicador ? d.indicador : '').trim();
        const criterio = String(d && d.criterio ? d.criterio : '').trim();
        return [numero, indicador, criterio].filter(Boolean).join(' - ');
    }).filter(Boolean);

    return linhas.concat(detalhesLinhas).join('\n');
}

function consolidatedInepLabel(consolidada) {
    return consolidada && consolidada.inep ? String(consolidada.inep) : '';
}

function formatarIesgoParaExportacao(consolidada) {
    const detalhes = Array.isArray(consolidada && consolidada.iesgo_detalhes) ? consolidada.iesgo_detalhes : [];
    if (!detalhes.length) return String(consolidada && consolidada.iesgo ? consolidada.iesgo : '');

    return detalhes.map(q => {
        const numero = String(q && q.codigo ? q.codigo : '').trim();
        const descricao = (Array.isArray(q && q.itens) ? q.itens : [])
            .map(it => {
                const letra = String(it && it.item ? it.item : '').trim();
                const texto = String(it && it.texto ? it.texto : '').trim();
                return [letra, texto].filter(Boolean).join(': ');
            })
            .filter(Boolean)
            .join(' | ');
        return [numero, descricao].filter(Boolean).join(' - ');
    }).filter(Boolean).join('\n');
}

function popularFiltros() {
    const selectUg = getFiltroUgEl();
    if (!selectUg) return;

    const valoresAnteriores = new Set(getUgsSelecionadas());
    const ugs = new Map();

    dados.forEach(consolidada => {
        getResponsaveisConsolidada(consolidada).forEach(ug => {
            const chave = normalizarChave(ug);
            if (chave && !ugs.has(chave)) ugs.set(chave, ug);
        });
    });

    const panel = document.getElementById('ugDropdownPanel');
    while (panel && panel.children.length > 1) panel.removeChild(panel.lastChild);

    selectUg.options.length = 1;
    if (selectUg.options[0]) selectUg.options[0].textContent = 'Todas as UGs';
    if (selectUg.options[0]) selectUg.options[0].selected = valoresAnteriores.size === 0;

    Array.from(ugs.values())
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }))
        .forEach(ug => {
            const label = document.createElement('label');
            label.className = 'ug-option';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.value = ug;
            chk.checked = valoresAnteriores.has(ug);
            chk.addEventListener('change', () => { syncUGSelect(); aplicarFiltros(); });
            label.appendChild(chk);
            label.appendChild(document.createTextNode(ug));
            if (panel) panel.appendChild(label);

            const option = document.createElement('option');
            option.value = ug;
            option.textContent = ug;
            option.selected = valoresAnteriores.has(ug);
            selectUg.appendChild(option);
        });

    atualizarUGBtn();
}

function obterAcoesParaExportacao() {
    return Array.isArray(dadosFiltrados) ? [...dadosFiltrados] : [];
}

function exportarPlanilha() {
    const acoes = obterAcoesParaExportacao();
    if (!acoes.length) {
        alert('Nenhuma ação disponível para exportação com os filtros atuais.');
        return;
    }

    const ugFiltro = getUgsSelecionadas();
    const titulo = `Exportação de ações${ugFiltro.length ? ` - ${ugFiltro.join(', ')}` : ''}`;
    const linhas = acoes.map((c, indice) => ({
        id: c.id || indice + 1,
        numero: getNumeroAcao(c),
        acao: textoSemTarefaNoFim(c.acao),
        ug: getResponsaveisConsolidada(c).join(', '),
        inep: formatarInepParaExportacao(c),
        iesgo: formatarIesgoParaExportacao(c),
        eixo: c.eixo_pdi || ''
    }));

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>${escapeHtml(titulo)}</title>
    <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #000000; }
        h1 { font-size: 20px; margin: 0 0 6px; }
        .meta { color: #000000; margin: 0 0 18px; font-size: 12px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; text-align: left; word-wrap: break-word; color: #000000; }
        td { font-weight: 400; }
        th { background: #0f766e; color: #fff; font-weight: 700; }
        tbody tr:nth-child(even) td { background: #f8fafc; }
    </style>
</head>
<body>
    <h1>${escapeHtml(titulo)}</h1>
    <p class="meta">Total de ações exportadas: ${acoes.length}${ugFiltro.length ? ` | Filtro de UG: ${escapeHtml(ugFiltro.join(', '))}` : ''}</p>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Número</th>
                <th>Ação</th>
                <th>UG</th>
                <th>INEP - número e descrição</th>
                <th>IESGO - número e descrição</th>
                <th>Eixo do PDI</th>
            </tr>
        </thead>
        <tbody>
            ${linhas.map(linha => `
                <tr>
                    <td>${htmlTabelaCelula(linha.id)}</td>
                    <td>${htmlTabelaCelula(linha.numero)}</td>
                    <td>${htmlTabelaCelula(linha.acao)}</td>
                    <td>${htmlTabelaCelula(linha.ug)}</td>
                    <td>${htmlTabelaCelula(linha.inep)}</td>
                    <td>${htmlTabelaCelula(linha.iesgo)}</td>
                    <td>${htmlTabelaCelula(linha.eixo)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizarNomeArquivo(`acoes_ug_${ugFiltro.length ? ugFiltro.join('_') : 'todas'}`)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Número da ação ─────────────────────────────────────────────────────────

function getNumeroAcao(c) {
    if (c.numero_acao) return String(c.numero_acao).trim();
    if (c.numero)      return String(c.numero).trim();
    const m = String(c.acao||'').match(/^(\d+(?:\.\d+){1,4})/);
    return m ? m[1] : '';
}

// ── Carregamento ───────────────────────────────────────────────────────────

function renderizarLoading(msg='Carregando dados...') {
    const el=document.getElementById('consolidadas-container');
    if (el) el.innerHTML=`<div class="loading">${escapeHtml(msg)}</div>`;
}
function renderizarErroCarregamento(erro) {
    const el=document.getElementById('consolidadas-container'); if (!el) return;
    const det=erro?String(erro.message||erro):'';
    el.innerHTML=`
        <div class="no-results" style="text-align:left;">
            <div class="no-results-icon"><i class="bi bi-exclamation-triangle"></i></div>
            <h3>Não foi possível carregar o arquivo JSON</h3>
            <p>Lê os dados de <strong>${escapeHtml(DATA_URL)}</strong>. Se abriu via <code>file://</code>, o navegador pode bloquear.</p>
            <p style="margin-top:10px;">Opções:</p>
            <ol style="margin:8px 0 0 18px;color:#475569;line-height:1.6;">
                <li>Servidor local: <code>python -m http.server 8000</code></li>
                <li>Ou selecione o JSON abaixo.</li>
            </ol>
            <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <input id="json-file-input" type="file" accept="application/json" style="max-width:420px;"/>
                <button class="clear-filters" type="button" onclick="carregarJsonSelecionado()">Carregar JSON</button>
            </div>
            ${det?`<div style="margin-top:10px;color:#64748b;font-size:13px;"><strong>Detalhe:</strong> ${escapeHtml(det)}</div>`:''}
        </div>`;
}
function extrairListaDoJson(json) {
    metaDados=(json&&!Array.isArray(json)&&json.meta)?json.meta:null;
    if (Array.isArray(json))               return json;
    if (json&&Array.isArray(json.acoes))  return json.acoes;
    if (json&&Array.isArray(json.dados))  return json.dados;
    if (json&&Array.isArray(json.data))   return json.data;
    throw new Error('Estrutura de JSON inesperada.');
}
async function carregarDadosViaFetch() {
    const r=await fetch(DATA_URL,{cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return extrairListaDoJson(await r.json());
}
async function carregarJsonSelecionado() {
    const input=document.getElementById('json-file-input');
    const file=input&&input.files&&input.files[0]; if (!file) return;
    try { renderizarLoading('Lendo JSON...'); setDados(extrairListaDoJson(JSON.parse(await file.text()))); }
    catch(e) { renderizarErroCarregamento(e); }
}
function deduplicarConsolidadas(base) {
    const mapa=new Map();
    (Array.isArray(base)?base:[]).forEach(item=>{
        if (!item||!item.acao) return;
        const k=chaveConsolidada(item);
        if (!mapa.has(k)) mapa.set(k,{...item});
    });
    return Array.from(mapa.values());
}
function setDados(lista) {
    dados=deduplicarConsolidadas(Array.isArray(lista)?lista:[]).filter(c=>!isBancoPropostasRegistradas(c));
    dadosFiltrados=[...dados];
    termoBuscaAtual='';
    dadosCarregados=true;
    atualizarTotalGlobal();
    popularFiltros();
    aplicarFiltroDeUrl();
    aplicarFiltros();
}
async function inicializar() {
    renderizarLoading(); dadosCarregados=false;
    try { setDados(await carregarDadosViaFetch()); }
    catch(e) { renderizarErroCarregamento(e); }
}

// ── Estatísticas ───────────────────────────────────────────────────────────

function atualizarTotalGlobal() {
    const el=document.getElementById('total-consolidadas');
    if (el) el.textContent=dados.length;
}

function atualizarEstatisticas() {
    const elItens=document.getElementById('itens-encontrados');
    if (elItens) elItens.textContent=dadosFiltrados.length;

    const filtrosAtivosEl=document.getElementById('filtros-ativos');
    const searchValue=(document.getElementById('search')?.value||'').trim();
    const numeroValue=(document.getElementById('filter-numero-acao')?.value||'').trim();
    const ugValue=getUgsSelecionadas();
    if (filtrosAtivosEl) {
        const partes=[];
        if (searchValue)  partes.push(`<strong>Busca:</strong> "${escapeHtml(searchValue)}"`);
        if (numeroValue)  partes.push(`<strong>Número:</strong> ${escapeHtml(numeroValue)}`);
        if (ugValue.length)  partes.push(`<strong>UGs:</strong> ${escapeHtml(ugValue.join(', '))}`);
        filtrosAtivosEl.innerHTML=partes.length?`Filtros ativos: ${partes.join(' · ')}`:'Sem filtros ativos.';
    }
}

// ── Filtros ────────────────────────────────────────────────────────────────

function aplicarFiltros() {
    if (!dadosCarregados) return;
    const searchRaw=(document.getElementById('search')?.value||'').trim();
    termoBuscaAtual=searchRaw;
    const searchTerm=normalizarTextoBusca(searchRaw);
    const searchTermCompacto=searchTerm.replace(/\s+/g,'');
    const numeroRaw=(document.getElementById('filter-numero-acao')?.value||'').trim();
    const numeroNorm=normalizarChave(numeroRaw);
    const ugFiltro=getUgsSelecionadas();
    const ugFiltroKeys=ugFiltro.map(ug=>normalizarChave(ug));

    dadosFiltrados=dados.filter(c=>{
        if (numeroNorm) {
            const numC=normalizarChave(getNumeroAcao(c));
            if (!numC.startsWith(numeroNorm) && numC!==numeroNorm) return false;
        }
        if (ugFiltro.length) {
            if (!getResponsaveisConsolidada(c).some(ug=>ugFiltroKeys.includes(normalizarChave(ug)))) return false;
        }
        if (searchTerm) {
            if (!textoContemBusca(c.acao, searchTerm, searchTermCompacto) &&
                !textoContemBusca(c.responsavel, searchTerm, searchTermCompacto) &&
                !textoContemBusca(getNumeroAcao(c), searchTerm, searchTermCompacto)) return false;
        }
        return true;
    });

    renderizarConsolidadas();
}

function limparFiltros() {
    const s=document.getElementById('search'); if(s) s.value='';
    const n=document.getElementById('filter-numero-acao'); if(n) n.value='';
    const panel=document.getElementById('ugDropdownPanel'); if(panel) panel.querySelectorAll('input[type=checkbox]').forEach(c=>{ c.checked=false; });
    const ug=getFiltroUgEl(); if(ug) Array.from(ug.options||[]).forEach(option=>{ option.selected = false; });
    atualizarUGBtn();
    aplicarFiltros();
}
function limparBusca() {
    const input=document.getElementById('search'); if(!input) return;
    input.value=''; input.focus(); aplicarFiltros();
}
function limparNumero() {
    const input=document.getElementById('filter-numero-acao'); if(!input) return;
    input.value=''; input.focus(); aplicarFiltros();
}

// ── Marcadores popup (badges clicáveis no meta) ────────────────────────────

function limparPopupsOrfaos() {
    document.querySelectorAll('body > .marc-popup').forEach(p=>p.remove());
}

function fecharMarcPopup(event, id) {
    event.stopPropagation();
    const popup=document.getElementById('marc-popup-'+id);
    if (popup) popup.classList.remove('marc-popup-open');
}

function toggleMarcPopup(event, id, tipoClicado) {
    event.stopPropagation();
    const badge=event.target.closest('.marc-badge'); if (!badge) return;
    const popup=document.getElementById('marc-popup-'+id); if (!popup) return;
    const jaAberto=popup.classList.contains('marc-popup-open');
    const tipoAtual=popup.getAttribute('data-tipo-aberto');
    document.querySelectorAll('.marc-popup-open').forEach(p=>{
        if (p.id!=='marc-popup-'+id){p.classList.remove('marc-popup-open');p.removeAttribute('data-tipo-aberto');}
    });
    if (jaAberto&&tipoAtual===tipoClicado){popup.classList.remove('marc-popup-open');popup.removeAttribute('data-tipo-aberto');return;}
    if (popup.parentElement!==document.body) document.body.appendChild(popup);
    const sec={
        inep:  popup.querySelector('.marc-title-inep')?.closest('.marc-popup-section'),
        iesgo: popup.querySelector('.marc-title-iesgo')?.closest('.marc-popup-section'),
        extra: popup.querySelector('.marc-title-extra')?.closest('.marc-popup-section')
    };
    Object.entries(sec).forEach(([t,el])=>{ if(el) el.style.display=(t===tipoClicado)?'block':'none'; });
    popup.setAttribute('data-tipo-aberto', tipoClicado);
    popup.style.cssText='position:absolute;display:block;visibility:hidden;';
    const pH=popup.offsetHeight, pW=popup.offsetWidth;
    const rect=badge.getBoundingClientRect();
    const sT=window.scrollY||document.documentElement.scrollTop;
    const sL=window.scrollX||document.documentElement.scrollLeft;
    let left=rect.left+sL+rect.width/2-pW/2;
    if (left+pW>window.innerWidth-8+sL) left=window.innerWidth-pW-8+sL;
    if (left<8+sL) left=8+sL;
    popup.style.setProperty('--seta-pos',(rect.left+sL+rect.width/2-left)+'px');
    const spaceBelow=window.innerHeight-rect.bottom;
    if (spaceBelow<pH+20&&rect.top>spaceBelow){
        popup.style.top=(rect.top+sT-pH-8)+'px'; popup.classList.add('marc-popup-acima');
    } else {
        popup.style.top=(rect.bottom+sT+8)+'px'; popup.classList.remove('marc-popup-acima');
    }
    popup.style.left=left+'px'; popup.style.display=popup.style.visibility='';
    popup.classList.add('marc-popup-open');
}

function mudarTamanhoFontePopup(event, id, dir) {
    event.stopPropagation();
    const container=document.querySelector(`#marc-popup-${id} .marc-popup-inner`); if(!container) return;
    const sel='.marc-popup-section-title,.marc-popup-item-code,.marc-popup-item-name,.marc-popup-item-text,.marc-popup-subitem-letra,.marc-popup-subitem-texto';
    container.querySelectorAll(sel).forEach(el=>{
        const t=parseFloat(window.getComputedStyle(el).fontSize);
        const n=dir>0?t*1.1:t/1.1;
        if(n>=10&&n<=26){el.style.fontSize=n+'px';el.style.lineHeight='1.4';}
    });
}

// ── Render INEP/iESGo popup ────────────────────────────────────────────────

function renderMarcadoresPopup(consolidada) {
    const inepDetalhes = Array.isArray(consolidada.inep_detalhes) ? consolidada.inep_detalhes : [];
    const iesgoDetalhes = Array.isArray(consolidada.iesgo_detalhes) ? consolidada.iesgo_detalhes : [];
    const temInep  = inepDetalhes.length > 0;
    const temIesgo = iesgoDetalhes.length > 0;
    if (!temInep && !temIesgo) return '';

    const inepHtml = temInep ? `
        <div class="marc-popup-section">
            <div class="marc-popup-section-title marc-title-inep">
                <i class="bi bi-mortarboard-fill"></i> INEP — Indicadores de Qualidade
            </div>
            ${inepDetalhes.map(d=>`
                <div class="marc-popup-item">
                    <div class="marc-popup-item-code">Indicador ${escapeHtml(d.codigo)}</div>
                    <div class="marc-popup-item-name">${escapeHtml(d.indicador)}</div>
                    <div class="marc-popup-item-text">${escapeHtml(d.criterio)}</div>
                </div>`).join('')}
        </div>` : '';

    const iesgoHtml = temIesgo ? `
        <div class="marc-popup-section">
            <div class="marc-popup-section-title marc-title-iesgo">
                <i class="bi bi-list-check"></i> iESGo — Questões do Questionário
            </div>
            ${iesgoDetalhes.map(q=>`
                <div class="marc-popup-item">
                    <div class="marc-popup-item-code">Questão ${escapeHtml(q.codigo)}</div>
                    <div class="marc-popup-item-itens">
                        ${(Array.isArray(q.itens) ? q.itens : []).map(it=>`
                            <div class="marc-popup-subitem">
                                <span class="marc-popup-subitem-letra">${escapeHtml(it.item)}</span>
                                <span class="marc-popup-subitem-texto">${escapeHtml(it.texto)}</span>
                            </div>`).join('')}
                    </div>
                </div>`).join('')}
        </div>` : '';

    return `
        <div class="marc-badges-row" onclick="event.stopPropagation()">
            ${temInep  ? `<div class="marc-badge marc-badge-inep"  onclick="toggleMarcPopup(event,${consolidada.id},'inep')"><i class="bi bi-mortarboard"></i> INEP</div>` : ''}
            ${temIesgo ? `<div class="marc-badge marc-badge-iesgo" onclick="toggleMarcPopup(event,${consolidada.id},'iesgo')"><i class="bi bi-list-check"></i> iESGo</div>` : ''}
            <div class="marc-popup" id="marc-popup-${consolidada.id}">
                <div class="marc-popup-inner">
                    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;">
                        <span style="font-size:12px;color:#94a3b8;margin-right:auto;display:inline-flex;align-items:center;gap:6px;"><i class="bi bi-person"></i> Texto</span>
                        <button type="button" onclick="mudarTamanhoFontePopup(event,${consolidada.id},-1)" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;padding:2px 8px;font-weight:bold;color:#475569;font-size:13px;">A-</button>
                        <button type="button" onclick="mudarTamanhoFontePopup(event,${consolidada.id},1)"  style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;padding:2px 8px;font-weight:bold;color:#475569;font-size:14px;">A+</button>
                        <button class="marc-popup-close" onclick="fecharMarcPopup(event,${consolidada.id})" style="margin-left:8px;position:relative;top:0;right:0;"><i class="bi bi-x-lg"></i></button>
                    </div>
                    ${inepHtml}${iesgoHtml}
                </div>
            </div>
        </div>`;
}

// ── Render INEP/iESGo inline ──────────────────────────────────────────────

function renderMarcadoresInline(consolidada) {
    const inepDetalhes = Array.isArray(consolidada.inep_detalhes) ? consolidada.inep_detalhes : [];
    const iesgoDetalhes = Array.isArray(consolidada.iesgo_detalhes) ? consolidada.iesgo_detalhes : [];
    const temInep  = inepDetalhes.length > 0;
    const temIesgo = iesgoDetalhes.length > 0;
    if (!temInep && !temIesgo) return '';

    const inepCards = temInep ? inepDetalhes.map(d => `
        <div class="marc-inline-card inep">
            <div class="marc-inline-card-header">
                <span class="marc-inline-card-label marc-inline-label-inep"><i class="bi bi-mortarboard"></i> INEP</span>
                <span class="marc-inline-code">Indicador ${escapeHtml(d.codigo)}</span>
            </div>
            <div class="marc-inline-name">${escapeHtml(d.indicador)}</div>
            <div class="marc-inline-text">${escapeHtml(d.criterio)}</div>
        </div>`).join('') : '';

    const iesgoCards = temIesgo ? iesgoDetalhes.map(q => `
        <div class="marc-inline-card iesgo">
            <div class="marc-inline-card-header">
                <span class="marc-inline-card-label marc-inline-label-iesgo"><i class="bi bi-list-check"></i> iESGo</span>
                <span class="marc-inline-code">Questão ${escapeHtml(q.codigo)}</span>
            </div>
            <div class="marc-inline-subitem" style="flex-direction:column;gap:4px;">
                ${(Array.isArray(q.itens) ? q.itens : []).map(it=>`
                    <div class="marc-inline-subitem">
                        <span class="marc-inline-subitem-letra">${escapeHtml(it.item)}</span>
                        <span class="marc-inline-text">${escapeHtml(it.texto)}</span>
                    </div>`).join('')}
            </div>
        </div>`).join('') : '';

    return `
        <div class="marc-inline-section" id="marc-inline-${consolidada.id}">
            ${temInep ? `
                <div class="marc-inline-section-title"><i class="bi bi-mortarboard"></i> INEP — Indicadores de Qualidade</div>
                <div class="marc-inline-grid" style="margin-bottom:${temIesgo?'18px':'0'};">${inepCards}</div>
            ` : ''}
            ${temIesgo ? `
                <div class="marc-inline-section-title"><i class="bi bi-list-check"></i> iESGo — Questões do Questionário</div>
                <div class="marc-inline-grid">${iesgoCards}</div>
            ` : ''}
        </div>`;
}

function getInlineTextControlsPopup() {
    let popup = document.getElementById('inline-text-controls-popup');
    if (popup) return popup;

    popup = document.createElement('div');
    popup.id = 'inline-text-controls-popup';
    popup.className = 'inline-text-controls-popup';
    popup.setAttribute('aria-hidden', 'true');
    popup.innerHTML = `
        <div class="inline-text-controls-title">
            <i class="bi bi-fonts"></i>
            <span>Tamanho da letra</span>
        </div>
        <div class="inline-text-controls-actions">
            <button type="button" class="inline-text-controls-btn" data-action="decrease" aria-label="Diminuir letra">A-</button>
            <button type="button" class="inline-text-controls-btn" data-action="increase" aria-label="Aumentar letra">A+</button>
        </div>
    `;

    popup.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        event.stopPropagation();
        const action = button.getAttribute('data-action');
        if (action === 'increase') ajustarTamanhoLetraInline(1);
        if (action === 'decrease') ajustarTamanhoLetraInline(-1);
    });

    document.body.appendChild(popup);
    return popup;
}

function aplicarEscalaTextoInline(sectionId) {
    const section = document.getElementById(`marc-inline-${sectionId}`);
    if (!section) return;
    section.style.setProperty('--inline-text-scale', String(inlineTextScale));
}

function mostrarPopupTamanhoLetra(sectionId) {
    const popup = getInlineTextControlsPopup();
    inlineTextSectionIdAtiva = sectionId;
    popup.classList.remove('is-visible');
    void popup.offsetWidth;
    popup.classList.add('is-visible');
    popup.setAttribute('aria-hidden', 'false');
    aplicarEscalaTextoInline(sectionId);
}

function ocultarPopupTamanhoLetra() {
    const popup = document.getElementById('inline-text-controls-popup');
    if (!popup) return;
    popup.classList.remove('is-visible');
    popup.setAttribute('aria-hidden', 'true');
    inlineTextSectionIdAtiva = null;
}

function ajustarTamanhoLetraInline(direcao) {
    if (!inlineTextSectionIdAtiva) return;
    const proximaEscala = Math.max(
        INLINE_TEXT_SCALE_MIN,
        Math.min(INLINE_TEXT_SCALE_MAX, inlineTextScale + (direcao * INLINE_TEXT_SCALE_STEP))
    );

    if (proximaEscala === inlineTextScale) return;
    inlineTextScale = proximaEscala;
    aplicarEscalaTextoInline(inlineTextSectionIdAtiva);
}

// ── Toggle do painel inline ────────────────────────────────────────────────

function toggleInline(event, id) {
    event.stopPropagation();
    const section = document.getElementById('marc-inline-' + id);
    const icon    = document.getElementById('expand-inline-' + id);
    if (!section) return;
    const abrir = !section.classList.contains('active');

    section.classList.toggle('active', abrir);
    if (icon) icon.classList.toggle('active', abrir);

    if (abrir) {
        mostrarPopupTamanhoLetra(id);
    } else if (inlineTextSectionIdAtiva === id) {
        ocultarPopupTamanhoLetra();
    }
}

// ── Render principal ───────────────────────────────────────────────────────

function renderizarConsolidadas() {
    limparPopupsOrfaos();
    ocultarPopupTamanhoLetra();
    const container = document.getElementById('consolidadas-container');

    if (!dadosFiltrados.length) {
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon"><i class="bi bi-search"></i></div>
                <h3>Nenhum resultado encontrado</h3>
                <p>Tente ajustar os filtros ou realizar uma nova busca</p>
            </div>`;
        atualizarEstatisticas();
        return;
    }

    container.innerHTML = dadosFiltrados.map(c => {
        try {
            const numero = getNumeroAcao(c);
            const responsaveis = getResponsaveisConsolidada(c);
            const temMarcadores = (Array.isArray(c.inep_detalhes) && c.inep_detalhes.length > 0) ||
                                  (Array.isArray(c.iesgo_detalhes) && c.iesgo_detalhes.length > 0);
            const inlineHtml = renderMarcadoresInline(c);
            const popupBadgesHtml = renderMarcadoresPopup(c);

            return `
            <div class="consolidada-card" id="item-${c.id}" data-item-id="${c.id}">
                <div class="consolidada-header ${temMarcadores ? 'consolidada-header-clicavel' : 'consolidada-header-lite'}"
                     ${temMarcadores ? `onclick="toggleInline(event, ${c.id})"` : ''}>
                    ${numero ? `<div class="consolidada-numero-badge">${escapeHtml(numero)}</div>` : ''}
                    <div class="tipo-registro-badge ${getTipoRegistro(c)}">
                        ${isTarefa(c) ? '<i class="bi bi-check2-square"></i> Tarefa' : '<i class="bi bi-flag"></i> Ação'}
                    </div>
                    <div class="consolidada-info">
                        <div class="consolidada-title">${highlight(textoSemTarefaNoFim(c.acao), termoBuscaAtual)}</div>
                        <div class="consolidada-meta">
                            ${responsaveis.length ? `
                                <div class="meta-item" title="${escapeHtml(responsaveis.join(', '))}">
                                    <i class="bi bi-person"></i>
                                    <span><strong>Responsável:</strong> ${highlight(formatarLista(responsaveis, 3), termoBuscaAtual)}</span>
                                </div>` : ''}
                            ${popupBadgesHtml}
                        </div>
                    </div>
                    ${temMarcadores ? `
                        <span class="expand-icon-lite-toggle" id="expand-inline-${c.id}">
                            <i class="bi bi-chevron-down"></i>
                        </span>` : ''}
                </div>
                ${inlineHtml}
            </div>`;
        } catch (error) {
            console.error('Falha ao renderizar ação', c && c.id, error);
            return '';
        }
    }).join('');

    atualizarEstatisticas();
}

// ── Event listeners ────────────────────────────────────────────────────────

document.getElementById('search').addEventListener('input', aplicarFiltros);

document.getElementById('filter-numero-acao').addEventListener('input', () => {
    clearTimeout(numeroInputTimer);
    numeroInputTimer = setTimeout(aplicarFiltros, 300);
});

document.addEventListener('click', e => {
    if (!e.target.closest('.marc-badge') && !e.target.closest('.marc-popup'))
        document.querySelectorAll('.marc-popup-open').forEach(p=>p.classList.remove('marc-popup-open'));
    if (!e.target.closest('#inline-text-controls-popup') && !e.target.closest('.consolidada-header-clicavel') && !e.target.closest('.marc-inline-section')) {
        if (inlineTextSectionIdAtiva) {
            const section = document.getElementById(`marc-inline-${inlineTextSectionIdAtiva}`);
            if (section && !section.classList.contains('active')) {
                ocultarPopupTamanhoLetra();
            }
        }
    }
    const wrap = document.getElementById('ugFilterWrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('ugDropdownBtn')?.classList.remove('open');
        document.getElementById('ugDropdownPanel')?.classList.remove('open');
    }
});

inicializar();