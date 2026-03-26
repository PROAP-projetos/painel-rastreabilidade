    // Caminho padrão do JSON (HTML fica em /ui e o JSON em /json).
    // const DATA_URL = '../json/acoes_consolidadas_com_propostas.json';
    const DATA_URL = '../json_teste/acoes_consolidadas_v19.json';
    const HTML_FILE = (typeof window !== 'undefined' && window.location && window.location.pathname)
        ? (window.location.pathname.split('/').pop() || 'painel_consolidacao_final_arrumado.html')
        : 'painel_consolidacao_final_arrumado.html';

    let dados = [];
    let dadosFiltrados = [];
    let termoBuscaAtual = '';
    let dadosCarregados = false;
    let modoVisualizacao = 'acoes'; // 'acoes' | 'propostas'
    let todasPropostas = []; // visão unificada para transparência
    let metaDados = null;

    function renderizarLoading(mensagem = 'Carregando dados...') {
        const container = document.getElementById('consolidadas-container');
        if (!container) return;
        container.innerHTML = `<div class="loading">${escapeHtml(mensagem)}</div>`;
    }

    function renderizarErroCarregamento(erro) {
        const container = document.getElementById('consolidadas-container');
        if (!container) return;

        const detalhe = (erro && (erro.message || String(erro))) ? String(erro.message || erro) : '';
        const detalheHtml = detalhe ? `<div style="margin-top:10px;color:#64748b;font-size:13px;word-break:break-word;"><strong>Detalhe:</strong> ${escapeHtml(detalhe)}</div>` : '';

        container.innerHTML = `
            <div class="no-results" style="text-align:left;">
                <div class="no-results-icon"><i class="bi bi-exclamation-triangle"></i></div>
                <h3>Não foi possível carregar o arquivo JSON</h3>
                    <p>O painel agora lê os dados de <strong>${escapeHtml(DATA_URL.replace('./', ''))}</strong>. Se você abriu este HTML diretamente (endereço começando com <code>file://</code>), o navegador pode bloquear o carregamento do JSON.</p>
                    <p style="margin-top:10px;">Opções:</p>
                    <ol style="margin:8px 0 0 18px;color:#475569;line-height:1.6;">
                    <li>Abra via servidor local (ex.: <code>python -m http.server 8000</code>) e acesse <code>http://localhost:8000/${escapeHtml(HTML_FILE)}</code></li>
                    <li>Ou selecione o JSON manualmente abaixo.</li>
                    </ol>

                <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <input id="json-file-input" type="file" accept="application/json" style="max-width: 420px;" />
                    <button class="clear-filters" type="button" onclick="carregarJsonSelecionado()">Carregar JSON</button>
                </div>
                ${detalheHtml}
            </div>
        `;

        const input = document.getElementById('json-file-input');
        if (input) {
            input.addEventListener('change', () => {
                // Não carrega automaticamente para evitar carregamentos acidentais; o botão confirma a ação.
            });
        }
    }

    function extrairListaDoJson(json) {
        metaDados = (json && typeof json === 'object' && !Array.isArray(json) && json.meta && typeof json.meta === 'object')
            ? json.meta
            : null;
        if (Array.isArray(json)) return json;
        if (json && Array.isArray(json.acoes)) return json.acoes;
        if (json && Array.isArray(json.dados)) return json.dados;
        if (json && Array.isArray(json.data)) return json.data;
        throw new Error('Estrutura de JSON inesperada (esperado: array na raiz).');
    }

    async function carregarDadosViaFetch() {
        const resp = await fetch(DATA_URL, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar ${DATA_URL}`);
        const json = await resp.json();
        return extrairListaDoJson(json);
    }

    async function carregarDadosViaArquivo(file) {
        const texto = await file.text();
        const json = JSON.parse(texto);
        return extrairListaDoJson(json);
    }

    async function carregarJsonSelecionado() {
        const input = document.getElementById('json-file-input');
        const file = input && input.files && input.files[0];
        if (!file) return;

        try {
            renderizarLoading('Lendo JSON selecionado...');
            const lista = await carregarDadosViaArquivo(file);
            setDados(lista);
        } catch (e) {
            renderizarErroCarregamento(e);
        }
    }

    function setDados(lista) {
        const base = Array.isArray(lista) ? lista : [];

        // Compatibilidade: se o JSON vier como lista "plana" de propostas, reconstruímos a base do painel.
        if (pareceListaDePropostasPlanas(base)) {
            const propostasNorm = base.map(normalizarPropostaPlana);

            // Deduplica por texto dentro do mesmo vínculo (ação/status), agregando origens/responsáveis.
            todasPropostas = deduplicarPropostasPorTexto(
                propostasNorm,
                (p) => `acao:${toNumberOrNull(p && p.acao_consolidada_id) ?? 'null'}|status:${String((p && p.status) || '')}`
            );

            dados = construirConsolidadasDePropostas(todasPropostas);
        } else {
            // A visão "Todas as propostas" deve refletir a base bruta (sem deduplicação por ação).
            todasPropostas = extrairTodasPropostasDaBase(base);

            const dadosDeduplicados = deduplicarConsolidadas(base);
            // Remover propostas duplicadas dentro de cada item, mantendo rastreabilidade (origens/responsáveis agregados).
            dadosDeduplicados.forEach(c => {
                c.propostas = deduplicarPropostasPorTexto(c.propostas);
            });
            dados = dadosDeduplicados.filter(c => !isBancoPropostasRegistradas(c));
        }

        dadosFiltrados = [...dados];
        termoBuscaAtual = '';
        dadosCarregados = true;

        popularFiltros();
        aplicarFiltros();
    }

    

    function setModo(modo) {
        modoVisualizacao = (modo === 'propostas') ? 'propostas' : 'acoes';

        const pillAcoes = document.getElementById('pill-acoes');
        const pillPropostas = document.getElementById('pill-propostas');
        if (pillAcoes) {
            const active = (modoVisualizacao === 'acoes');
            pillAcoes.classList.toggle('active', active);
            pillAcoes.setAttribute('aria-pressed', String(active));
        }
        if (pillPropostas) {
            const active = (modoVisualizacao === 'propostas');
            pillPropostas.classList.toggle('active', active);
            pillPropostas.setAttribute('aria-pressed', String(active));
        }

        aplicarFiltros();
    }

    function extrairTodasPropostasDaBase(baseConsolidadas) {
        // Junta propostas vinculadas + propostas registradas (quando existirem no JSON) em uma lista única.
        // Compatível com variações de schema:
        // - consolidada.propostas (vinculadas)
        // - consolidada.propostas_removidas (registradas sem vínculo direto)
        // - consolidada.propostas_registradas_sem_vinculo (registradas)
        const mapa = new Map();

        const addProposta = (p, unidadesConsolidada, acaoId, acaoTexto, status) => {
            if (!p || !p.texto) return;

            const textoLimpo = textoSemTarefaNoFim(p.texto);
            const textoKey = normalizarChave(textoLimpo);
            if (!textoKey) return;

            // Prioriza o ID da proposta para não colapsar propostas distintas com mesmo texto/origem/responsável.
            // Fallback para chave textual quando o ID não existir.
            const idPropostaKey = normalizarChave((p && (p.id_proposta ?? p.idProposta)) || '');
            const key = idPropostaKey
                ? `id:${idPropostaKey}`
                : `${textoKey}|${normalizarChave(p.origem)}|${normalizarChave(p.responsavel)}`;

            if (!mapa.has(key)) {
                mapa.set(key, {
                    ...p,
                    texto: textoLimpo,
                    status: status || 'vinculada', // 'vinculada' | 'registrada'
                    acao_consolidada_id: (status === 'vinculada') ? acaoId : null,
                    acao_consolidada: (status === 'vinculada') ? acaoTexto : null,
                    unidades: Array.isArray(unidadesConsolidada) ? [...unidadesConsolidada] : [],
                    categoriaTarefa: Boolean(p.categoriaTarefa) || isTarefaNoFimTexto(p.texto)
                });
                return;
            }

            const existente = mapa.get(key);

            // Se em algum lugar apareceu como vinculada, prevalece.
            if (status === 'vinculada') {
                existente.status = 'vinculada';
                existente.acao_consolidada_id = acaoId;
                existente.acao_consolidada = acaoTexto;
            }

            // Agrega origens/responsáveis (se houver divergência)
            if (p.origem) {
                if (!Array.isArray(existente.origens)) existente.origens = getOrigensProposta(existente);
                getOrigensProposta({ origens: existente.origens, origem: existente.origem }).forEach(()=>{});
                if (!existente.origens.includes(p.origem)) existente.origens.push(p.origem);
            }
            if (p.responsavel) {
                if (!Array.isArray(existente.responsaveis)) existente.responsaveis = getResponsaveisProposta(existente);
                if (!existente.responsaveis.includes(p.responsavel)) existente.responsaveis.push(p.responsavel);
            }
            if (Array.isArray(unidadesConsolidada)) {
                if (!Array.isArray(existente.unidades)) existente.unidades = [];
                unidadesConsolidada.forEach(u => {
                    if (u && !existente.unidades.includes(u)) existente.unidades.push(u);
                });
            }
        };

        const listaConsolidadas = Array.isArray(baseConsolidadas) ? baseConsolidadas : (Array.isArray(dados) ? dados : []);
        listaConsolidadas.forEach(c => {
            const unidades = (Array.isArray(c.unidades) && c.unidades.length) ? c.unidades : (c.unidade ? [c.unidade] : []);
            (Array.isArray(c.propostas) ? c.propostas : []).forEach(p => {
                const registradaSemVinculo = propostaEhRegistradaSemVinculo(c, p);
                addProposta(
                    p,
                    unidades,
                    registradaSemVinculo ? null : c.id,
                    registradaSemVinculo ? null : c.acao,
                    registradaSemVinculo ? 'registrada' : 'vinculada'
                );
            });

            const reg1 = Array.isArray(c.propostas_removidas) ? c.propostas_removidas : [];
            const reg2 = Array.isArray(c.propostas_registradas_sem_vinculo) ? c.propostas_registradas_sem_vinculo : [];
            [...reg1, ...reg2].forEach(p => addProposta(p, unidades, c.id, c.acao, 'registrada'));
        });

        return Array.from(mapa.values());
    }
function normalizarChave(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[.\s]+$/g, '');
    }

    function normalizarAcaoTexto(texto) {
        let s = normalizarChave(texto);
        // Remove marcador "TAREFA" somente quando estiver no final (evita remover usos no meio do texto)
        s = s.replace(/[.\s]*\(?\s*tarefa\s*\)?\s*$/g, '').trim().replace(/\s+/g, ' ');
        return s;
    }

    function chaveConsolidada(item) {
        const acaoKey = normalizarAcaoTexto(item && item.acao);
        return acaoKey || `id:${normalizarChave(item && item.id)}`;
    }

    function isBancoPropostasRegistradas(consolidada) {
        const id = toNumberOrNull(consolidada && consolidada.id);
        const acao = normalizarChave(consolidada && consolidada.acao);
        return id === 999 || acao.includes('banco de propostas registradas');
    }

    function propostaEhRegistradaSemVinculo(consolidada, proposta) {
        const status = normalizarChave(proposta && proposta.status);
        const acaoId = toNumberOrNull(proposta && proposta.acao_consolidada_id);
        return status === 'registrada' || acaoId === 999 || isBancoPropostasRegistradas(consolidada);
    }

    function chaveProposta(proposta) {
        return `${normalizarChave(proposta && proposta.texto)}|${normalizarChave(proposta && proposta.origem)}|${normalizarChave(proposta && proposta.responsavel)}`;
    }

    function extrairUnidadesResponsaveis(valor) {
        const raw = String(valor || '').trim();
        if (!raw) return [];

        // Normaliza separadores típicos ("/", ",", ";") usados para listar responsáveis/unidades.
        const partes = raw
            .split(/[\/;,]+/g)
            .map(s => String(s || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean);

        const vistos = Object.create(null);
        const out = [];
        partes.forEach(p => {
            const k = normalizarChave(p);
            if (!k || vistos[k]) return;
            vistos[k] = true;
            out.push(p);
        });
        return out;
    }

    function scoreResponsavelDisplay(valor) {
        const s = String(valor || '').trim().replace(/\s+/g, ' ');
        if (!s) return -1;

        const hasLetter = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(s);
        const isAllUpper = hasLetter && s === s.toUpperCase();
        const isAllLower = hasLetter && s === s.toLowerCase();

        let score = 0;
        if (isAllUpper) score += 100;
        if (isAllLower) score -= 20;
        score += Math.min(30, s.length / 2);
        return score;
    }

    function adicionarResponsavelDedupe(mapa, raw) {
        const texto = String(raw || '').trim().replace(/\s+/g, ' ');
        if (!texto) return;
        const key = normalizarChave(texto);
        if (!key) return;

        const atual = mapa.get(key);
        if (!atual) {
            mapa.set(key, texto);
            return;
        }

        if (scoreResponsavelDisplay(texto) > scoreResponsavelDisplay(atual)) {
            mapa.set(key, texto);
        }
    }

    function deduplicarPropostasPorTexto(propostas) {
        const mapa = new Map();
        const keyExtraFn = (arguments.length >= 2) ? arguments[1] : null;

        function adicionarOrigem(existente, origem) {
            const raw = String(origem || '').trim();
            if (!raw) return;
            const norm = normalizarChave(raw);
            if (!norm) return;

            if (!existente.__origensNorm) existente.__origensNorm = Object.create(null);
            if (existente.__origensNorm[norm]) return;

            existente.__origensNorm[norm] = true;
            if (!Array.isArray(existente.origens)) existente.origens = [];
            existente.origens.push(raw);
            existente.ocorrencias = existente.origens.length || 1;
            if (!existente.origem) existente.origem = raw;
        }

        function adicionarUnidades(existente, unidades) {
            const lista = Array.isArray(unidades) ? unidades : [];
            if (lista.length === 0) return;

            if (!Array.isArray(existente.unidades)) existente.unidades = [];
            const vistos = new Set(existente.unidades.map(u => normalizarChave(u)));
            lista.forEach(u => {
                const raw = String(u || '').trim();
                if (!raw) return;
                const norm = normalizarChave(raw);
                if (!norm || vistos.has(norm)) return;
                existente.unidades.push(raw);
                vistos.add(norm);
            });
        }

        function adicionarResponsavel(existente, responsavel) {
            if (!existente.__responsaveisNorm) existente.__responsaveisNorm = Object.create(null);
            if (!Array.isArray(existente.responsaveis)) existente.responsaveis = [];

            const partes = extrairUnidadesResponsaveis(responsavel);
            partes.forEach(raw => {
                const norm = normalizarChave(raw);
                if (!norm) return;
                if (existente.__responsaveisNorm[norm]) return;
                existente.__responsaveisNorm[norm] = true;
                existente.responsaveis.push(raw);
                if (!existente.responsavel) existente.responsavel = raw;
            });
        }

        (Array.isArray(propostas) ? propostas : []).forEach(p => {
            const textoLimpo = textoSemTarefaNoFim(p && p.texto);
            const textoKey = normalizarChave(textoLimpo);
            const extra = (typeof keyExtraFn === 'function') ? String(keyExtraFn(p) || '') : '';
            const key = extra ? `${textoKey}|${extra}` : `${textoKey}`;

            if (!textoKey) return;

            if (!mapa.has(key)) {
                const registro = {
                    ...p,
                    texto: textoLimpo,
                    // "Ocorrências" passa a refletir a quantidade de origens distintas agregadas.
                    ocorrencias: 1,
                    origens: [],
                    responsaveis: [],
                    unidades: Array.isArray(p && p.unidades) ? [...p.unidades] : [],
                    categoriaTarefa: isTarefaNoFimTexto(p && p.texto)
                };

                adicionarOrigem(registro, p && p.origem);
                adicionarResponsavel(registro, p && p.responsavel);
                adicionarUnidades(registro, p && p.unidades);

                mapa.set(key, registro);
                return;
            }

            const existente = mapa.get(key);
            existente.categoriaTarefa = Boolean(existente.categoriaTarefa) || isTarefaNoFimTexto(p && p.texto);

            // Se for duplicado com a MESMA origem, não conta como nova ocorrência; só agrega responsável se for diferente.
            adicionarResponsavel(existente, p && p.responsavel);
            adicionarOrigem(existente, p && p.origem);
            adicionarUnidades(existente, p && p.unidades);
        });

        return Array.from(mapa.values());
    }

    function toNumberOrNull(valor) {
        if (valor === null || valor === undefined) return null;
        const raw = String(valor).trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    function pareceListaDePropostasPlanas(lista) {
        if (!Array.isArray(lista) || lista.length === 0) return false;
        const sample = lista.find(x => x && typeof x === 'object') || null;
        if (!sample) return false;
        return ('texto' in sample) && (('id_proposta' in sample) || ('idProposta' in sample)) && !('propostas' in sample) && !('acao' in sample);
    }

    function normalizarPropostaPlana(p) {
        const acaoId = toNumberOrNull(p && (p.acao_consolidada_id ?? p.acaoConsolidadaId ?? p.acao_id ?? p.acaoId));
        const status = (normalizarChave(p && p.status) === 'registrada' || acaoId === 999 || acaoId == null) ? 'registrada' : 'vinculada';
        const texto = String((p && p.texto) || '').trim();
        const unidadesCampo = Array.isArray(p && p.unidades)
            ? p.unidades.filter(Boolean)
            : (p && p.unidade ? [p.unidade] : []);
        const unidadesResponsavel = extrairUnidadesResponsaveis(p && p.responsavel);
        const unidades = [...unidadesCampo, ...unidadesResponsavel].filter(Boolean);

        return {
            ...p,
            texto,
            origem: (p && p.origem) ?? '',
            responsavel: (p && p.responsavel) ?? '',
            status,
            acao_consolidada_id: (status === 'vinculada') ? acaoId : null,
            acao_consolidada: (status === 'vinculada') ? ((p && (p.acao_consolidada ?? p.acaoConsolidada)) ?? null) : null,
            unidades,
            categoriaTarefa: Boolean(p && p.categoriaTarefa) || isTarefaNoFimTexto(texto)
        };
    }

    function construirConsolidadasDePropostas(propostas) {
        const mapa = new Map();

        (Array.isArray(propostas) ? propostas : []).forEach(p => {
            const id = toNumberOrNull(p && p.acao_consolidada_id);
            if (id == null) return;

            const key = String(id);
            const acaoFallback = `Ação consolidada (ID ${id})`;
            const acaoTexto = String((p && p.acao_consolidada) || acaoFallback);

            if (!mapa.has(key)) {
                mapa.set(key, {
                    id,
                    acao: acaoTexto,
                    unidade: '',
                    unidades: [],
                    propostas: []
                });
            }

            const consolidada = mapa.get(key);

            // Se em algum registro vier o texto da ação, ele substitui o fallback.
            if (p && p.acao_consolidada && consolidada.acao === acaoFallback) {
                consolidada.acao = String(p.acao_consolidada);
            }

            const listaUnidades = Array.isArray(p && p.unidades) ? p.unidades : [];
            listaUnidades.forEach(u => {
                if (u && !consolidada.unidades.includes(u)) consolidada.unidades.push(u);
            });

            consolidada.propostas.push({
                ...p,
                status: 'vinculada',
                acao_consolidada_id: id,
                acao_consolidada: consolidada.acao
            });
        });

        const lista = Array.from(mapa.values());
        lista.forEach(c => {
            if (Array.isArray(c.unidades) && c.unidades.length > 1) c.unidade = 'Múltiplas unidades';
            else if (Array.isArray(c.unidades) && c.unidades.length === 1) c.unidade = c.unidades[0];
        });

        lista.sort((a, b) => a.id - b.id);
        return lista;
    }

    function deduplicarConsolidadas(lista) {
        const mapa = new Map();

        (lista || []).forEach(item => {
            const key = chaveConsolidada(item);

            if (!mapa.has(key)) {
                const unidades = [];
                if (item && item.unidade) unidades.push(item.unidade);

                mapa.set(key, {
                    ...item,
                    unidades,
                    propostas: Array.isArray(item.propostas) ? [...item.propostas] : []
                });
                return;
            }

            const existente = mapa.get(key);

            if ((!existente.responsavel || !String(existente.responsavel).trim()) && item && item.responsavel) {
                existente.responsavel = item.responsavel;
            }

            if (typeof existente.id === 'number' && typeof item.id === 'number') {
                existente.id = Math.min(existente.id, item.id);
            } else if (existente.id == null && item.id != null) {
                existente.id = item.id;
            }

            // Unidades: preservar todas que aparecerem, para manter rastreabilidade
            if (!Array.isArray(existente.unidades)) existente.unidades = [];
            if (item && item.unidade && !existente.unidades.includes(item.unidade)) {
                existente.unidades.push(item.unidade);
            }

            const vistos = new Set(existente.propostas.map(chaveProposta));
            (Array.isArray(item.propostas) ? item.propostas : []).forEach(p => {
                const pk = chaveProposta(p);
                if (!vistos.has(pk)) {
                    existente.propostas.push(p);
                    vistos.add(pk);
                }
            });

            // Se houver mais de uma unidade relacionada, mostrar como "Múltiplas unidades" no card
            if (Array.isArray(existente.unidades) && existente.unidades.length > 1) {
                existente.unidade = 'Múltiplas unidades';
            } else if (Array.isArray(existente.unidades) && existente.unidades.length === 1) {
                existente.unidade = existente.unidades[0];
            }
        });

        return Array.from(mapa.values());
    }

    async function inicializar() {
        renderizarLoading();
        dadosCarregados = false;

        try {
            const lista = await carregarDadosViaFetch();
            setDados(lista);
        } catch (e) {
            // Mantém o painel operável via upload do arquivo.
            renderizarErroCarregamento(e);
        }
    }

    function popularFiltros() {
        // Extrair todas as origens únicas
        const origens = new Set();
        const responsaveis = new Map();
        
        dados.forEach(consolidada => {
            consolidada.propostas.forEach(prop => {
                getOrigensProposta(prop).forEach(o => { if (o) origens.add(o); });
                getResponsaveisProposta(prop).forEach(r => adicionarResponsavelDedupe(responsaveis, r));
            });
            getResponsaveisConsolidada(consolidada).forEach(r => adicionarResponsavelDedupe(responsaveis, r));
        });

        // Incluir origens presentes na visão unificada de propostas (quando houver propostas registradas sem vínculo)
        (Array.isArray(todasPropostas) ? todasPropostas : []).forEach(p => {
            getOrigensProposta(p).forEach(o => { if (o) origens.add(o); });
            getResponsaveisProposta(p).forEach(r => adicionarResponsavelDedupe(responsaveis, r));
        });
            
        // Popular select de origens
        const selectOrigem = document.getElementById('filter-origem');
        if (selectOrigem) selectOrigem.options.length = 1;
        Array.from(origens).sort().forEach(origem => {
            const option = document.createElement('option');
            option.value = origem;
            option.textContent = origem;
            selectOrigem.appendChild(option);
        });
        
        // Popular select de responsáveis
        const selectResponsavel = getFiltroResponsavelEl();
        if (selectResponsavel) selectResponsavel.options.length = 1;
        if (selectResponsavel && selectResponsavel.id === 'filter-unidade' && selectResponsavel.options && selectResponsavel.options[0]) {
            // HTML antigo: reaproveita o seletor, mas ajusta o placeholder para não confundir.
            selectResponsavel.options[0].textContent = 'Todos os Responsáveis';
        }
        Array.from(responsaveis.values())
            .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }))
            .forEach(responsavel => {
            const option = document.createElement('option');
            option.value = responsavel;
            option.textContent = responsavel;
            selectResponsavel.appendChild(option);
        });
    }
    
    function atualizarEstatisticas() {
        const totalConsolidadas = (modoVisualizacao === 'acoes') ? dadosFiltrados.length : dados.length;
        const totalPropostasVinculadas = dados.reduce((sum, c) => sum + (Array.isArray(c.propostas) ? c.propostas.length : 0), 0);
        const totalPropostasVinculadasBrutas = (metaDados && typeof metaDados.total_propostas_vinculadas === 'number')
            ? metaDados.total_propostas_vinculadas
            : totalPropostasVinculadas;
        const totalPropostasRegistradas = (metaDados && typeof metaDados.total_propostas === 'number')
            ? metaDados.total_propostas
            : (Array.isArray(todasPropostas) ? todasPropostas.length : 0);
        const totalPropostasVisiveis = (modoVisualizacao === 'acoes')
            ? dadosFiltrados.reduce((sum, c) => sum + c.propostas.length, 0)
            : (Array.isArray(dadosFiltrados) ? dadosFiltrados.length : 0);
        // O card principal representa o total bruto de propostas vinculadas (sem deduplicação visual).
        const totalPropostasCard = totalPropostasVinculadasBrutas;
        const mediaPropostas = (modoVisualizacao === 'acoes' && totalConsolidadas > 0)
            ? (totalPropostasVisiveis / totalConsolidadas).toFixed(1)
            : (dados.length > 0 ? (totalPropostasVinculadas / dados.length).toFixed(1) : 0);

        document.getElementById('total-propostas').textContent = totalPropostasCard;
        const elReg = document.getElementById('total-propostas-registradas');
        if (elReg) elReg.textContent = totalPropostasRegistradas;
        document.getElementById('total-consolidadas').textContent = totalConsolidadas;
        document.getElementById('media-propostas').textContent = mediaPropostas;

        const itensEncontradosEl = document.getElementById('itens-encontrados');
        if (itensEncontradosEl) itensEncontradosEl.textContent = (modoVisualizacao === 'acoes') ? totalConsolidadas : totalPropostasVisiveis;

        const propostasEncontradasEl = document.getElementById('propostas-encontradas');
        if (propostasEncontradasEl) {
            const searchValue = (document.getElementById('search')?.value || '').trim();
            const origemFiltro = document.getElementById('filter-origem')?.value || '';
            const responsavelFiltro = getFiltroResponsavelEl()?.value || '';
            const tarefaFiltro = getFiltroTarefaEl()?.value || '';
            const temFiltrosAtivos = Boolean(searchValue || origemFiltro || responsavelFiltro || tarefaFiltro);

            // Em modo "propostas", este chip representa a base de ações (535), não as propostas filtradas.
            propostasEncontradasEl.textContent = (modoVisualizacao === 'propostas')
                ? String(dados.length)
                : String(temFiltrosAtivos ? totalPropostasVisiveis : totalPropostasCard);
        }

        atualizarIndicadoresUI();
    }

    function atualizarIndicadoresUI() {
        const filtrosAtivosEl = document.getElementById('filtros-ativos');
        const clearBtn = document.querySelector('.search-clear');

        // Ajusta rótulos conforme o modo de visualização
        try {
            const chips = document.querySelectorAll('.results-left .results-chip');
            if (chips && chips.length >= 2) {
                const chip1 = chips[0];
                const chip2 = chips[1];
                if (modoVisualizacao === 'propostas') {
                    chip1.innerHTML = `<i class="bi bi-journal-text"></i> Propostas encontradas: <strong id="itens-encontrados">${document.getElementById('itens-encontrados')?.textContent || '0'}</strong>`;
                    chip2.innerHTML = `<i class="bi bi-diagram-3"></i> Ações consolidadas: <strong id="propostas-encontradas">${document.getElementById('propostas-encontradas')?.textContent || '0'}</strong>`;
                } else {
                    chip1.innerHTML = `<i class="bi bi-diagram-3"></i> Ações consolidadas: <strong id="itens-encontrados">${document.getElementById('itens-encontrados')?.textContent || '0'}</strong>`;
                    chip2.innerHTML = `<i class="bi bi-journal-text"></i> Propostas: <strong id="propostas-encontradas">${document.getElementById('propostas-encontradas')?.textContent || '0'}</strong>`;
                }
            }
        } catch (e) {}


        const searchValue = (document.getElementById('search')?.value || '').trim();
        const origemFiltro = document.getElementById('filter-origem')?.value || '';
        const responsavelFiltro = getFiltroResponsavelEl()?.value || '';
        const tarefaFiltro = getFiltroTarefaEl()?.value || '';

        if (clearBtn) {
            const ativo = Boolean(searchValue);
            clearBtn.style.opacity = ativo ? '1' : '0.35';
            clearBtn.style.pointerEvents = ativo ? 'auto' : 'none';
        }

        if (!filtrosAtivosEl) return;

        const partes = [];
        if (searchValue) partes.push(`<strong>Busca:</strong> “${escapeHtml(searchValue)}”`);
        if (origemFiltro) partes.push(`<strong>Origem:</strong> ${escapeHtml(origemFiltro)}`);
        if (responsavelFiltro) partes.push(`<strong>Responsável:</strong> ${escapeHtml(responsavelFiltro)}`);
        if (tarefaFiltro) partes.push(`<strong>Tipo:</strong> ${tarefaFiltro === 'tarefa' ? 'Somente tarefas' : 'Somente ações'}`);

        filtrosAtivosEl.innerHTML = partes.length ? `Filtros ativos: ${partes.join(' · ')}` : 'Sem filtros ativos.';
    }

    function limparBusca() {
        const input = document.getElementById('search');
        if (!input) return;
        input.value = '';
        input.focus();
        aplicarFiltros();
    }

    function escapeHtml(str) {
        return String(str || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function escapeRegExp(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlight(texto, termo) {
        const t = String(termo || '').trim();
        const safe = escapeHtml(texto);
        if (!t) return safe;
        const re = new RegExp(escapeRegExp(t), 'gi');
        return safe.replace(re, match => `<mark class="hl">${match}</mark>`);
    }

    function isTarefaTexto(texto) {
        return /\bTAREFA\b/i.test(String(texto || ''));
    }

    function isTarefaNoFimTexto(texto) {
        const s = String(texto || '').trim();
        return /(?:[.\s]*\(?\s*TAREFA\s*\)?\s*)$/i.test(s);
    }

    function textoSemTarefaNoFim(texto) {
        const s = String(texto || '');
        return s.replace(/[.\s]*\(?\s*TAREFA\s*\)?\s*$/i, '').trim();
    }

    function isTarefa(consolidada) {
        if (!consolidada) return false;
        // Um item consolidado só é "tarefa" quando a marcação estiver no final do próprio título do item.
        return isTarefaNoFimTexto(consolidada.acao);
    }

    function getTipoRegistro(consolidada) {
        return isTarefa(consolidada) ? 'tarefa' : 'acao';
    }

    function getLabelRegistro(consolidada) {
        return isTarefa(consolidada) ? 'tarefa' : 'ação';
    }

    function formatarLista(valores, maxItens = 3) {
        const lista = (Array.isArray(valores) ? valores : []).filter(Boolean);
        if (lista.length === 0) return '';
        if (lista.length <= maxItens) return lista.join(', ');
        return `${lista.slice(0, maxItens).join(', ')} +${lista.length - maxItens}`;
    }

    function getOrigensProposta(proposta) {
        if (Array.isArray(proposta && proposta.origens) && proposta.origens.length > 0) return proposta.origens;
        return proposta && proposta.origem ? [proposta.origem] : [];
    }

    function getResponsaveisProposta(proposta) {
        if (Array.isArray(proposta && proposta.responsaveis) && proposta.responsaveis.length > 0) return proposta.responsaveis;
        return proposta && proposta.responsavel ? extrairUnidadesResponsaveis(proposta.responsavel) : [];
    }

    function getResponsaveisConsolidada(consolidada) {
        if (!consolidada) return [];

        const diretos = extrairUnidadesResponsaveis(consolidada.responsavel);
        if (diretos.length) return diretos;

        const mapa = new Map();
        (Array.isArray(consolidada.propostas) ? consolidada.propostas : []).forEach(p => {
            getResponsaveisProposta(p).forEach(r => adicionarResponsavelDedupe(mapa, r));
        });
        return Array.from(mapa.values());
    }

    // Compatibilidade: versões antigas do HTML usavam `filter-unidade`.
    function getFiltroResponsavelEl() {
        return document.getElementById('filter-responsavel') || document.getElementById('filter-unidade');
    }

    function getFiltroTarefaEl() {
        return document.getElementById('filter-tarefa');
    }

    function getOcorrenciasProposta(proposta) {
        return (proposta && Number.isFinite(proposta.ocorrencias) && proposta.ocorrencias > 0) ? proposta.ocorrencias : 1;
    }
    
    

    function renderizarTodasPropostas() {
        const container = document.getElementById('consolidadas-container');

        if (!Array.isArray(dadosFiltrados) || dadosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon"><i class="bi bi-journal-text"></i></div>
                    <h3>Nenhuma proposta encontrada</h3>
                    <p>Tente ajustar os filtros ou realizar uma nova busca</p>
                </div>
            `;
            atualizarEstatisticas();
            return;
        }

        container.innerHTML = `
            <div class="filters-section" style="margin-bottom: 18px;">
                <div class="filters-header" style="margin-bottom: 0;">
                    <h3 style="display:flex; gap:10px; align-items:center;">
                        <i class="bi bi-archive"></i>
                        Todas as propostas registradas
                    </h3>
                    <div style="color:#475569;font-size:13px;">
                        <strong>Legenda:</strong> <span style="margin-left:6px;"><i class="bi bi-check-circle-fill" style="color:#16a34a;"></i> Contribuiu para ação</span>
                        <span style="margin-left:10px;"><i class="bi bi-circle" style="color:#f59e0b;"></i> Registrada</span>
                    </div>
                </div>
            </div>

            <div class="propostas-grid">
                ${dadosFiltrados.map(p => `
                    <div class="proposta-card">
                        <div class="proposta-header" style="margin-bottom:10px;">
                            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                                <span style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#64748b; text-transform:uppercase;">Proposta</span>
                                ${(p && p.categoriaTarefa) ? '<span class="tipo-registro-badge tarefa"><i class="bi bi-check2-square"></i> Categoria: Tarefa</span>' : ''}
                            </div>
                            <span class="tipo-registro-badge ${p.status === 'vinculada' ? 'acao' : 'tarefa'}"
                                    title="${p.status === 'vinculada' ? 'Esta proposta contribuiu diretamente para uma ação consolidada.' : 'Esta proposta foi registrada e preservada, sem vinculação direta nesta etapa.'}">
                                ${p.status === 'vinculada'
                                    ? '<i class="bi bi-check-circle-fill"></i> Contribuiu para ação'
                                    : '<i class="bi bi-circle"></i> Registrada'}
                            </span>
                        </div>

                        <div class="proposta-texto">${highlight(textoSemTarefaNoFim(p.texto), termoBuscaAtual)}</div>

                        <div class="proposta-footer">
                            ${getResponsaveisProposta(p).length ? `
                                <div class="footer-item">
                                    <i class="bi bi-person"></i>
                                    <strong>Responsável:</strong>
                                    <span>${highlight(formatarLista(getResponsaveisProposta(p)), termoBuscaAtual)}</span>
                                </div>
                            ` : ''}
                            ${getOrigensProposta(p).length ? `
                                <div class="footer-item">
                                    <i class="bi bi-geo-alt"></i>
                                    <strong>Origem:</strong>
                                    <span>${highlight(formatarLista(getOrigensProposta(p)), termoBuscaAtual)}</span>
                                </div>
                            ` : ''}
                            ${(p.status === 'vinculada' && p.acao_consolidada_id != null) ? `
                                <div class="footer-item" title="${escapeHtml(String(p.acao_consolidada || ''))}">
                                    <i class="bi bi-link-45deg"></i>
                                    <strong>Ação:</strong>
                                    <span>${highlight(String(p.acao_consolidada || ('ID ' + String(p.acao_consolidada_id))), termoBuscaAtual)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        atualizarEstatisticas();
        // Em modo propostas, não faz sentido abrir por hash de item de ação.
    }

    // ── Helpers de marcadores ────────────────────────────────────────────────
    function renderMarcadoresPopup(consolidada) {
        const temInep  = consolidada.inep_detalhes  && consolidada.inep_detalhes.length  > 0;
        const temIesgo = consolidada.iesgo_detalhes && consolidada.iesgo_detalhes.length > 0;
        const temMarc  = consolidada.marcadores;
        if (!temInep && !temIesgo && !temMarc) return '';

        const inepHtml = temInep ? `
            <div class="marc-popup-section">
                <div class="marc-popup-section-title marc-title-inep">
                    <i class="bi bi-mortarboard-fill"></i> INEP — Indicadores de Qualidade
                </div>
                ${consolidada.inep_detalhes.map(d => `
                    <div class="marc-popup-item">
                        <div class="marc-popup-item-code">Indicador ${escapeHtml(d.codigo)}</div>
                        <div class="marc-popup-item-name">${escapeHtml(d.indicador)}</div>
                        <div class="marc-popup-item-text">${escapeHtml(d.criterio)}</div>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const iesgoHtml = temIesgo ? `
            <div class="marc-popup-section">
                <div class="marc-popup-section-title marc-title-iesgo">
                    <i class="bi bi-clipboard-check-fill"></i> iESGo — Questões do Questionário
                </div>
                ${consolidada.iesgo_detalhes.map(q => `
                    <div class="marc-popup-item">
                        <div class="marc-popup-item-code">Questão ${escapeHtml(q.codigo)}</div>
                        <div class="marc-popup-item-itens">
                            ${q.itens.map(it => `
                                <div class="marc-popup-subitem">
                                    <span class="marc-popup-subitem-letra">${escapeHtml(it.item)}</span>
                                    <span class="marc-popup-subitem-texto">${escapeHtml(it.texto)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const marcHtml = temMarc ? `
            <div class="marc-popup-section">
                <div class="marc-popup-section-title marc-title-extra">
                    <i class="bi bi-bookmark-fill"></i> Marcadores
                </div>
                <div class="marc-popup-item">
                    <div class="marc-popup-item-text">${escapeHtml(consolidada.marcadores)}</div>
                </div>
            </div>
        ` : '';

        return `
            <div class="marc-badges-row" onclick="event.stopPropagation()">
                ${temInep  ? `<div class="marc-badge marc-badge-inep" onclick="toggleMarcPopup(event, ${consolidada.id})"><i class="bi bi-mortarboard"></i> INEP</div>`   : ''}
                ${temIesgo ? `<div class="marc-badge marc-badge-iesgo" onclick="toggleMarcPopup(event, ${consolidada.id})"><i class="bi bi-clipboard-check"></i> iESGo</div>` : ''}
                ${temMarc  ? `<div class="marc-badge marc-badge-extra"><i class="bi bi-bookmark"></i> ${escapeHtml(consolidada.marcadores)}</div>` : ''}
                <div class="marc-popup" id="marc-popup-${consolidada.id}">
                    <div class="marc-popup-inner">
                        <button class="marc-popup-close" onclick="fecharMarcPopup(event, ${consolidada.id})" title="Fechar">
                            <i class="bi bi-x-lg"></i>
                        </button>
                        ${inepHtml}${iesgoHtml}${marcHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function fecharMarcPopup(event, id) {
        event.stopPropagation();
        const popup = document.getElementById('marc-popup-' + id);
        if (popup) popup.classList.remove('marc-popup-open');
    }

    function toggleMarcPopup(event, id) {
        event.stopPropagation();
        // fecha todos os outros primeiro
        document.querySelectorAll('.marc-popup-open').forEach(p => {
            if (p.id !== 'marc-popup-' + id) p.classList.remove('marc-popup-open');
        });
        const popup = document.getElementById('marc-popup-' + id);
        if (popup) popup.classList.toggle('marc-popup-open');
    }

function renderizarConsolidadas() {
        const container = document.getElementById('consolidadas-container');
        
        if (dadosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon"><i class="bi bi-search"></i></div>
                    <h3>Nenhum resultado encontrado</h3>
                    <p>Tente ajustar os filtros ou realizar uma nova busca</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = dadosFiltrados.map((consolidada, index) => `
            <div class="consolidada-card" id="item-${consolidada.id}" data-item-id="${consolidada.id}">
                <div class="consolidada-header" onclick="toggleCard(${index}, ${consolidada.id})">
                    <div class="consolidada-id-badge" onclick="copiarLink(event, ${consolidada.id})" title="Clique para copiar o link desta ação consolidada">ID ${consolidada.id}</div>
                    <div class="tipo-registro-badge ${getTipoRegistro(consolidada)}">
                        ${isTarefa(consolidada) ? '<i class="bi bi-check2-square"></i> Tarefa' : '<i class="bi bi-flag"></i> Ação'}
                    </div>
                    <div class="consolidada-info">
                        <div class="consolidada-title">${highlight(textoSemTarefaNoFim(consolidada.acao), termoBuscaAtual)}</div>
                        <div class="consolidada-meta">
                            ${getResponsaveisConsolidada(consolidada).length ? `
                                <div class="meta-item" title="${escapeHtml(getResponsaveisConsolidada(consolidada).join(', '))}">
                                    <i class="bi bi-person"></i>
                                    <span><strong>Responsável:</strong> ${highlight(formatarLista(getResponsaveisConsolidada(consolidada), 3), termoBuscaAtual)}</span>
                                </div>
                            ` : ''}
                            ${renderMarcadoresPopup(consolidada)}
                        </div>
                    </div>
                    <div class="propostas-badge">
                        <i class="bi bi-journal-text"></i>
                        <span>${consolidada.propostas.length} proposta${consolidada.propostas.length !== 1 ? 's' : ''}</span>
                    </div>
                    <span class="expand-icon" id="icon-${index}"><i class="bi bi-chevron-down"></i></span>
                </div>
                <div class="consolidada-body" id="body-${index}">
                    <div class="section-title">
                        <i class="bi bi-list-check"></i>
                        <span>Propostas vinculadas a esta ${getLabelRegistro(consolidada)} consolidada:</span>
                    </div>
                    ${(getResponsaveisConsolidada(consolidada).length > 1) ? `
                        <div style="margin: 0 0 12px 0; color: #475569; font-size: 13px;">
                            <i class="bi bi-people"></i>
                            <strong>Responsáveis relacionados:</strong>
                            <span>${escapeHtml(getResponsaveisConsolidada(consolidada).join(', '))}</span>
                        </div>
                    ` : ''}
                    ${consolidada.propostas.length === 0 ? `
                        <div class="no-results" style="text-align:left;margin:12px 0 0;">
                            <div class="no-results-icon"><i class="bi bi-inbox"></i></div>
                            <h3>Sem propostas vinculadas</h3>
                            <p>Esta ${getLabelRegistro(consolidada)} está na base, mas não possui propostas vinculadas no arquivo.</p>
                        </div>
                    ` : `
                    <div class="propostas-grid">
                        ${consolidada.propostas.map(proposta => `
                            <div class="proposta-card">
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
                                    <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#64748b; text-transform:uppercase;">Proposta</div>
                                    ${(proposta && proposta.categoriaTarefa) ? '<span class="tipo-registro-badge tarefa"><i class="bi bi-check2-square"></i> Categoria: Tarefa</span>' : ''}
                                </div>
                                <div class="proposta-texto">${highlight(textoSemTarefaNoFim(proposta.texto), termoBuscaAtual)}</div>
                                <div class="proposta-footer">
                                    ${getOcorrenciasProposta(proposta) > 1 ? `
                                        <div class="footer-item">
                                            <i class="bi bi-layers"></i>
                                            <strong>Ocorrências:</strong>
                                            <span>${getOcorrenciasProposta(proposta)}</span>
                                        </div>
                                    ` : ''}
                                    ${getResponsaveisProposta(proposta).length ? `
                                        <div class="footer-item">
                                            <i class="bi bi-person"></i>
                                            <strong>Responsável:</strong>
                                            <span>${highlight(formatarLista(getResponsaveisProposta(proposta)), termoBuscaAtual)}</span>
                                        </div>
                                    ` : ''}
                                    ${getOrigensProposta(proposta).length ? `
                                        <div class="footer-item">
                                            <i class="bi bi-geo-alt"></i>
                                            <strong>Origem:</strong>
                                            <span>${highlight(formatarLista(getOrigensProposta(proposta)), termoBuscaAtual)}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    `}
                </div>
            </div>
        `).join('');
        
        atualizarEstatisticas();
        abrirPorHash();
    }
    
    function toggleCard(index, itemId, skipHashUpdate = false) {
        const body = document.getElementById(`body-${index}`);
        const icon = document.getElementById(`icon-${index}`);
        
        body.classList.toggle('active');
        icon.classList.toggle('active');

        const abriu = body.classList.contains('active');
        if (!skipHashUpdate && abriu && itemId != null) {
            try {
                history.replaceState(null, '', `#item-${itemId}`);
            } catch (e) {}
        }
    }

    function abrirPorHash() {
        const hash = String(location.hash || '');
        const match = hash.match(/^#item-(\d+)/);
        if (!match) return;

        const id = Number(match[1]);
        const index = dadosFiltrados.findIndex(c => Number(c && c.id) === id);
        if (index < 0) return;

        const body = document.getElementById(`body-${index}`);
        if (body && !body.classList.contains('active')) {
            toggleCard(index, id, true);
        }
    }

    async function copiarLink(event, itemId) {
        event.stopPropagation();
        const base = String(location.href || '').split('#')[0];
        const link = `${base}#item-${itemId}`;

        const target = event.currentTarget;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(link);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = link;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            if (target) {
                const oldTitle = target.getAttribute('title') || '';
                target.setAttribute('title', 'Link copiado');
                target.style.boxShadow = '0 0 0 3px rgba(0, 133, 119, 0.25)';
                setTimeout(() => {
                    target.setAttribute('title', oldTitle);
                    target.style.boxShadow = '';
                }, 900);
            }
        } catch (e) {}
    }
    
    function aplicarFiltros() {
        if (!dadosCarregados) return;
        const searchRaw = (document.getElementById('search').value || '').trim();
        termoBuscaAtual = searchRaw;
        const searchTerm = searchRaw.toLowerCase();
        const origemFiltro = document.getElementById('filter-origem').value;
        const responsavelFiltro = getFiltroResponsavelEl()?.value || '';
        const tarefaFiltro = getFiltroTarefaEl()?.value || '';
        const sortBy = document.getElementById('sort-by').value;
        const responsavelFiltroKey = responsavelFiltro ? normalizarChave(responsavelFiltro) : '';
        
        // Modo "Todas as propostas": aplica filtros diretamente na lista unificada.
        if (modoVisualizacao === 'propostas') {
            let lista = Array.isArray(todasPropostas) ? [...todasPropostas] : [];

            if (origemFiltro) {
                lista = lista.filter(p => getOrigensProposta(p).includes(origemFiltro));
            }

            if (responsavelFiltro) {
                lista = lista.filter(p => getResponsaveisProposta(p).some(r => normalizarChave(r) === responsavelFiltroKey));
            }
            if (tarefaFiltro === 'tarefa') {
                lista = lista.filter(p => Boolean(p && p.categoriaTarefa));
            } else if (tarefaFiltro === 'acao') {
                lista = lista.filter(p => !Boolean(p && p.categoriaTarefa));
            }

            if (searchTerm) {
                lista = lista.filter(p =>
                    (p.texto && p.texto.toLowerCase().includes(searchTerm)) ||
                    (p.responsavel && String(p.responsavel).toLowerCase().includes(searchTerm)) ||
                    getOrigensProposta(p).some(o => String(o).toLowerCase().includes(searchTerm)) ||
                    (p.acao_consolidada && String(p.acao_consolidada).toLowerCase().includes(searchTerm))
                );
            }

            // Ordenação (reutiliza o seletor existente)
            switch(sortBy) {
                case 'propostas-asc':
                    lista.sort((a, b) => String(a.texto || '').localeCompare(String(b.texto || ''), 'pt-BR'));
                    break;
                case 'id-asc':
                    // mostra primeiro as vinculadas (com ID) e depois as registradas
                    lista.sort((a, b) => (Number(a.acao_consolidada_id || 1e12) - Number(b.acao_consolidada_id || 1e12)));
                    break;
                case 'propostas-desc':
                default:
                    // vinculadas primeiro
                    lista.sort((a, b) => (a.status === b.status) ? 0 : (a.status === 'vinculada' ? -1 : 1));
                    break;
            }

            dadosFiltrados = lista;
            if (modoVisualizacao === 'acoes') {
                renderizarConsolidadas();
            } else {
                renderizarTodasPropostas();
            }
            return;
        }

        dadosFiltrados = dados.map(consolidada => {
            let propostas = [...consolidada.propostas];
            const acaoMatches = Boolean(searchTerm) && (
                (consolidada.acao && consolidada.acao.toLowerCase().includes(searchTerm)) ||
                (consolidada.responsavel && String(consolidada.responsavel).toLowerCase().includes(searchTerm))
            );
            
            // Filtro de origem
            if (origemFiltro) {
                propostas = propostas.filter(p => getOrigensProposta(p).includes(origemFiltro));
            }
            
            // Filtro de busca
            if (searchTerm && !acaoMatches) {
                propostas = propostas.filter(p => 
                    p.texto.toLowerCase().includes(searchTerm) ||
                    consolidada.acao.toLowerCase().includes(searchTerm) ||
                    (consolidada.responsavel && String(consolidada.responsavel).toLowerCase().includes(searchTerm)) ||
                    (p.responsavel && p.responsavel.toLowerCase().includes(searchTerm)) ||
                    getOrigensProposta(p).some(o => String(o).toLowerCase().includes(searchTerm))
                );
            }

            // Filtro por categoria da proposta (não pelo tipo da ação consolidada)
            if (tarefaFiltro === 'tarefa') {
                propostas = propostas.filter(p => Boolean(p && p.categoriaTarefa));
            } else if (tarefaFiltro === 'acao') {
                propostas = propostas.filter(p => !Boolean(p && p.categoriaTarefa));
            }
            
            return {
                ...consolidada,
                propostas: propostas,
                __acaoMatch: acaoMatches
            };
        });
        
        // Se houver filtro por origem, só faz sentido manter consolidadas que têm propostas após o filtro.
        if (origemFiltro) {
            dadosFiltrados = dadosFiltrados.filter(c => c.propostas.length > 0);
        } else if (searchTerm) {
            // Busca: mantém consolidadas sem propostas quando a própria ação/responsável casar.
            dadosFiltrados = dadosFiltrados.filter(c => c.__acaoMatch || c.propostas.length > 0);
        }
        
        // Filtro de responsável (aplicado depois para manter consolidadas sem propostas se necessário)
        if (responsavelFiltro) {
            dadosFiltrados = dadosFiltrados.filter(c => {
                return getResponsaveisConsolidada(c).some(r => normalizarChave(r) === responsavelFiltroKey);
            });
        }
        if (tarefaFiltro) {
            // Com filtro de categoria ativo, mantém apenas ações que ainda têm propostas visíveis.
            dadosFiltrados = dadosFiltrados.filter(c => c.propostas.length > 0);
        }
        
        // Ordenação
        switch(sortBy) {
            case 'propostas-desc':
                dadosFiltrados.sort((a, b) => b.propostas.length - a.propostas.length);
                break;
            case 'propostas-asc':
                dadosFiltrados.sort((a, b) => a.propostas.length - b.propostas.length);
                break;
            case 'id-asc':
                dadosFiltrados.sort((a, b) => a.id - b.id);
                break;
        }
        
        if (modoVisualizacao === 'acoes') {
            renderizarConsolidadas();
        } else {
            renderizarTodasPropostas();
        }
    }
    
    function limparFiltros() {
        document.getElementById('search').value = '';
        document.getElementById('filter-origem').value = '';
        const filtroResponsavelEl = getFiltroResponsavelEl();
        if (filtroResponsavelEl) filtroResponsavelEl.value = '';
        const filtroTarefaEl = getFiltroTarefaEl();
        if (filtroTarefaEl) filtroTarefaEl.value = '';
        document.getElementById('sort-by').value = 'propostas-desc';
        aplicarFiltros();
    }
    
    // Event listeners
    document.getElementById('search').addEventListener('input', aplicarFiltros);
    document.getElementById('filter-origem').addEventListener('change', aplicarFiltros);
    const filtroResponsavelEl = getFiltroResponsavelEl();
    if (filtroResponsavelEl) filtroResponsavelEl.addEventListener('change', aplicarFiltros);
    const filtroTarefaEl = getFiltroTarefaEl();
    if (filtroTarefaEl) filtroTarefaEl.addEventListener('change', aplicarFiltros);
    document.getElementById('sort-by').addEventListener('change', aplicarFiltros);

    // Fechar popups de marcadores ao clicar fora
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.marc-badges-row')) {
            document.querySelectorAll('.marc-popup-open').forEach(p => p.classList.remove('marc-popup-open'));
        }
    });
    
    // Inicializar
    inicializar();
