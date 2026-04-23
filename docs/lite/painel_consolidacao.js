// ── Versão Lite rev2 — INEP/iESGo inline, input de número, sem select ─────
const DATA_URL = 'json_teste/acoes_consolidadas_v21.json';
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
const TOUR_STORAGE_KEY = 'painel-lite-tour-v1';
const TOUR_STEP_DURATION = 4500;
const TOUR_FORCE_QUERY_PARAM = 'tour';

let tourPrimeiraEntradaTimer = null;
let tourPrimeiraEntradaIndex = -1;
let tourPrimeiraEntradaOverlay = null;
let tourPrimeiraEntradaPendente = false;

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
    aplicarFiltros();
    if (tourPrimeiraEntradaPendente) {
        tourPrimeiraEntradaPendente = false;
        setTimeout(() => iniciarTourPrimeiraEntrada(true), 0);
    }
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
    if (filtrosAtivosEl) {
        const partes=[];
        if (searchValue)  partes.push(`<strong>Busca:</strong> "${escapeHtml(searchValue)}"`);
        if (numeroValue)  partes.push(`<strong>Número:</strong> ${escapeHtml(numeroValue)}`);
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

    dadosFiltrados=dados.filter(c=>{
        if (numeroNorm) {
            const numC=normalizarChave(getNumeroAcao(c));
            // match exato ou prefixo (ex: "1.1" casa "1.1.2")
            if (!numC.startsWith(numeroNorm) && numC!==numeroNorm) return false;
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

// ── Marcadores popup (mantido para os badges clicáveis no meta) ───────────

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

// ── Render INEP/iESGo popup (para o badge no meta) ────────────────────────

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
                <i class="bi bi-clipboard-check-fill"></i> iESGo — Questões do Questionário
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
            ${temIesgo ? `<div class="marc-badge marc-badge-iesgo" onclick="toggleMarcPopup(event,${consolidada.id},'iesgo')"><i class="bi bi-clipboard-check"></i> iESGo</div>` : ''}
            <div class="marc-popup" id="marc-popup-${consolidada.id}">
                <div class="marc-popup-inner">
                    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;">
                        <span style="font-size:12px;color:#94a3b8;margin-right:auto;"><i class="bi bi-universal-access-circle"></i> Texto</span>
                        <button type="button" onclick="mudarTamanhoFontePopup(event,${consolidada.id},-1)" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;padding:2px 8px;font-weight:bold;color:#475569;font-size:13px;">A-</button>
                        <button type="button" onclick="mudarTamanhoFontePopup(event,${consolidada.id},1)"  style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;padding:2px 8px;font-weight:bold;color:#475569;font-size:14px;">A+</button>
                        <button class="marc-popup-close" onclick="fecharMarcPopup(event,${consolidada.id})" style="margin-left:8px;position:relative;top:0;right:0;"><i class="bi bi-x-lg"></i></button>
                    </div>
                    ${inepHtml}${iesgoHtml}
                </div>
            </div>
        </div>`;
}

// ── Render INEP/iESGo inline (dentro do card, como era proposta) ──────────

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
                <span class="marc-inline-card-label marc-inline-label-iesgo"><i class="bi bi-clipboard-check"></i> iESGo</span>
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
                <div class="marc-inline-section-title"><i class="bi bi-clipboard-check"></i> iESGo — Questões do Questionário</div>
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
            <i class="bi bi-type"></i>
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

// ── Tour de primeira entrada ──────────────────────────────────────────────

function tourPrimeiraEntradaJaVisto() {
    try {
        return localStorage.getItem(TOUR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function tourPrimeiraEntradaForcado() {
    try {
        return new URLSearchParams(window.location.search).get(TOUR_FORCE_QUERY_PARAM) === '1';
    } catch {
        return false;
    }
}

function marcarTourPrimeiraEntradaComoVisto() {
    try {
        localStorage.setItem(TOUR_STORAGE_KEY, '1');
    } catch {
        // Ignora quando o navegador bloqueia armazenamento persistente.
    }
}

function encerrarTourPrimeiraEntrada(marcarVisto = true) {
    _tourClearType();
    ['search', 'filter-numero-acao'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });

    if (tourPrimeiraEntradaTimer) {
        clearTimeout(tourPrimeiraEntradaTimer);
        tourPrimeiraEntradaTimer = null;
    }

    if (marcarVisto) {
        marcarTourPrimeiraEntradaComoVisto();
    }

    document.body.classList.remove('lite-tour-open');
    document.querySelectorAll('.lite-tour-target-active').forEach(el => el.classList.remove('lite-tour-target-active'));

    if (tourPrimeiraEntradaOverlay) {
        tourPrimeiraEntradaOverlay.classList.remove('is-visible');
        const overlay = tourPrimeiraEntradaOverlay;
        tourPrimeiraEntradaOverlay = null;
        setTimeout(() => overlay.remove(), 260);
    }
    tourPrimeiraEntradaIndex = -1;
}

function criarTourPrimeiraEntrada() {
    if (tourPrimeiraEntradaOverlay) return tourPrimeiraEntradaOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'lite-tour-overlay';
    overlay.className = 'lite-tour-overlay';
    overlay.innerHTML = `
        <div class="lite-tour-spotlight" aria-hidden="true"></div>
        <section class="lite-tour-card" role="dialog" aria-live="polite" aria-label="Tour de primeira entrada">
            <div class="lite-tour-top">
                <span class="lite-tour-badge"><i class="bi bi-stars"></i> Primeira visita</span>
                <button type="button" class="lite-tour-close" data-tour-close aria-label="Pular tour">Pular</button>
            </div>
            <div class="lite-tour-step" data-tour-step>1 de 4</div>
            <h3 data-tour-title>Preparando a visão geral</h3>
            <p data-tour-text></p>
            <div class="lite-tour-progress" aria-hidden="true"><span data-tour-progress></span></div>
            <div class="lite-tour-footer">
                <i class="bi bi-cursor-fill"></i>
                Avança automaticamente • clique em Pular para fechar.
            </div>
        </section>
    `;

    overlay.addEventListener('click', event => {
        if (event.target === overlay) encerrarTourPrimeiraEntrada(true);
    });

    overlay.querySelector('[data-tour-close]')?.addEventListener('click', event => {
        event.stopPropagation();
        encerrarTourPrimeiraEntrada(true);
    });

    document.body.appendChild(overlay);
    tourPrimeiraEntradaOverlay = overlay;
    return overlay;
}

function mostrarTourPreparacao() {
    const overlay = criarTourPrimeiraEntrada();
    const title = overlay.querySelector('[data-tour-title]');
    const text = overlay.querySelector('[data-tour-text]');
    const stepLabel = overlay.querySelector('[data-tour-step]');
    const progress = overlay.querySelector('[data-tour-progress]');

    document.body.classList.add('lite-tour-open');
    overlay.classList.add('is-visible');
    if (stepLabel) stepLabel.textContent = 'Preparando';
    if (title) title.textContent = 'Abrindo o tour';
    if (text) text.textContent = 'Aguarde um instante enquanto a cena é preparada.';
    if (progress) progress.style.width = '5%';
}

function obterAlvoTour(selector) {
    const elemento = document.querySelector(selector);
    if (!elemento) return null;
    const rect = elemento.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { elemento, rect };
}

// ── Tour: digitação animada num input ─────────────────────────────────────
let _tourTypeTimer = null;
function _tourClearType() {
    if (_tourTypeTimer) { clearTimeout(_tourTypeTimer); _tourTypeTimer = null; }
}
function _tourTypeText(input, texto, delay = 80) {
    _tourClearType();
    if (!input) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let i = 0;
    const next = () => {
        if (!tourPrimeiraEntradaOverlay) return; // tour encerrado
        if (i >= texto.length) return;
        input.value = texto.slice(0, ++i);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        _tourTypeTimer = setTimeout(next, delay);
    };
    _tourTypeTimer = setTimeout(next, 420);
}
function _tourClearInputs() {
    _tourClearType();
    ['search', 'filter-numero-acao'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
}

function atualizarTourPrimeiraEntrada(index) {
    if (!tourPrimeiraEntradaOverlay) return;

    const passos = [
        {
            selector: '.lite-stats-row',
            titulo: 'Visão geral do painel',
            texto: 'Aqui você acompanha quantas ações existem no total e quantas aparecem com os filtros ativos — sua régua de navegação.',
            acao: () => { _tourClearInputs(); }
        },
        {
            selector: '#search',
            titulo: 'Busca por descrição',
            texto: 'Digite qualquer palavra da descrição e o painel filtra na hora. Veja como funciona:',
            acao: () => {
                const input = document.getElementById('search');
                if (input) { input.focus(); _tourTypeText(input, 'gestão', 90); }
            }
        },
        {
            selector: '#filter-numero-acao',
            titulo: 'Filtro pelo número da ação',
            texto: 'Se souber o código, vá direto ao ponto. O filtro aceita prefixos — "1.1" já traz todas as ações 1.1.x.',
            acao: () => {
                const s = document.getElementById('search');
                if (s && s.value) { s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); }
                const input = document.getElementById('filter-numero-acao');
                if (input) { input.focus(); _tourTypeText(input, '1.1', 120); }
            }
        },
        {
            selector: '.consolidada-card',
            titulo: 'Cards de ação',
            texto: 'Cada card mostra a ação, seu número e o responsável. Cards com marcadores INEP ou iESGo se expandem ao clicar.',
            acao: () => {
                _tourClearInputs();
                // clica no primeiro card que tenha marcadores (header clicável), se houver
                const clicavel = document.querySelector('.consolidada-header-clicavel');
                if (clicavel) {
                    setTimeout(() => {
                        if (!tourPrimeiraEntradaOverlay) return;
                        clicavel.click();
                    }, 900);
                }
            }
        }
    ];

    // limpar ação anterior
    _tourClearType();

    const passo = passos[index];
    const card = tourPrimeiraEntradaOverlay.querySelector('.lite-tour-card');
    const title = tourPrimeiraEntradaOverlay.querySelector('[data-tour-title]');
    const text = tourPrimeiraEntradaOverlay.querySelector('[data-tour-text]');
    const stepLabel = tourPrimeiraEntradaOverlay.querySelector('[data-tour-step]');
    const progress = tourPrimeiraEntradaOverlay.querySelector('[data-tour-progress]');
    const spotlight = tourPrimeiraEntradaOverlay.querySelector('.lite-tour-spotlight');
    const target = obterAlvoTour(passo.selector);

    if (card) card.classList.remove('is-pulse');
    if (title) title.textContent = passo.titulo;
    if (text) text.textContent = passo.texto;
    if (stepLabel) stepLabel.textContent = `${index + 1} de ${passos.length}`;
    if (progress) progress.style.width = `${((index + 1) / passos.length) * 100}%`;

    document.querySelectorAll('.lite-tour-target-active').forEach(el => el.classList.remove('lite-tour-target-active'));

    if (target) {
        target.elemento.classList.add('lite-tour-target-active');
        target.elemento.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const margem = 14;
        // Recalcular rect após scroll
        setTimeout(() => {
            if (!tourPrimeiraEntradaOverlay) return;
            const r = target.elemento.getBoundingClientRect();
            const left = Math.max(8, r.left - margem);
            const top = Math.max(8, r.top - margem);
            const width = Math.min(window.innerWidth - left - 8, r.width + (margem * 2));
            const height = Math.min(window.innerHeight - top - 8, r.height + (margem * 2));
            spotlight.style.opacity = '1';
            spotlight.style.left = `${left}px`;
            spotlight.style.top = `${top}px`;
            spotlight.style.width = `${Math.max(120, width)}px`;
            spotlight.style.height = `${Math.max(60, height)}px`;
        }, 200);
    } else {
        spotlight.style.opacity = '0';
    }

    if (card) {
        card.classList.add('is-pulse');
        card.style.opacity = '1';
    }

    // executar ação interativa do passo (digitar, clicar, etc.)
    if (passo.acao) passo.acao();
}



function iniciarTourPrimeiraEntrada(forcar = false) {
    if (tourPrimeiraEntradaTimer || tourPrimeiraEntradaIndex >= 0) return;
    if (!forcar && !tourPrimeiraEntradaForcado() && tourPrimeiraEntradaJaVisto()) return;
    if (!dadosFiltrados.length || !document.querySelector('.consolidada-card')) return;

    criarTourPrimeiraEntrada();
    document.body.classList.add('lite-tour-open');
    tourPrimeiraEntradaOverlay.classList.add('is-visible');
    tourPrimeiraEntradaIndex = 0;
    atualizarTourPrimeiraEntrada(tourPrimeiraEntradaIndex);

    const avancar = () => {
        if (!tourPrimeiraEntradaOverlay) return;
        tourPrimeiraEntradaIndex += 1;
        if (tourPrimeiraEntradaIndex >= 4) {
            encerrarTourPrimeiraEntrada(true);
            return;
        }
        atualizarTourPrimeiraEntrada(tourPrimeiraEntradaIndex);
        tourPrimeiraEntradaTimer = setTimeout(avancar, TOUR_STEP_DURATION);
    };

    tourPrimeiraEntradaTimer = setTimeout(avancar, TOUR_STEP_DURATION);
}

function reposicionarTourPrimeiraEntrada() {
    if (!tourPrimeiraEntradaOverlay || tourPrimeiraEntradaIndex < 0) return;
    atualizarTourPrimeiraEntrada(tourPrimeiraEntradaIndex);
}

function abrirTourPrimeiraEntrada() {
    encerrarTourPrimeiraEntrada(false);

    // 1. Verifica se os dados do JSON foram carregados na memória.
    // Se estiver vazio (ex: erro de CORS rodando local), avisa o usuário e nem abre o overlay.
    if (!dados || dados.length === 0) {
        alert("Para visualizar o tour, os dados das ações precisam ser carregados primeiro.");
        return;
    }

    mostrarTourPreparacao();
    tourPrimeiraEntradaPendente = true;

    // 2. Se a tela estiver vazia por causa de um filtro ativo, nós LIMPAMOS os filtros 
    // para forçar a renderização dos cards (em vez de usar apenas aplicarFiltros()).
    if (!document.querySelector('.consolidada-card')) {
        limparFiltros(); 
    }

    // 3. Trava de segurança final: se mesmo limpando não houver card, 
    // fecha o overlay para não travar a tela e aborta a função.
    if (!document.querySelector('.consolidada-card')) {
        encerrarTourPrimeiraEntrada(false);
        return;
    }

    tourPrimeiraEntradaPendente = false;
    iniciarTourPrimeiraEntrada(true);
}

if (typeof window !== 'undefined') {
    window.abrirTourPrimeiraEntrada = abrirTourPrimeiraEntrada;
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
            // Os badges popup ficam no meta para o hover; o inline expande dentro do card
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
    if (tourPrimeiraEntradaPendente && document.querySelector('.consolidada-card')) {
        tourPrimeiraEntradaPendente = false;
        setTimeout(() => iniciarTourPrimeiraEntrada(true), 0);
    }
    iniciarTourPrimeiraEntrada();
}

// ── Event listeners ────────────────────────────────────────────────────────

document.getElementById('search').addEventListener('input', aplicarFiltros);

// debounce no input de número para não filtrar a cada letra
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
});

window.addEventListener('resize', reposicionarTourPrimeiraEntrada, { passive: true });
window.addEventListener('scroll', reposicionarTourPrimeiraEntrada, { passive: true });

inicializar();