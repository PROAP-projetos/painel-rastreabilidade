import json
import pandas as pd

# 1. Carregar o JSON v18
with open('./json_teste/acoes_consolidadas_v18.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

rows = []

# 2. Processar Ações Consolidadas (Vinculadas)
for acao in data.get('acoes_consolidadas', []):
    id_acao = acao.get('id_acao')
    titulo_acao = acao.get('acao') # Título da ação consolidada
    resp_acao = acao.get('responsavel')
    
    for prop in acao.get('propostas', []):
        rows.append({
            'Status': 'Vinculada',
            'ID Ação Consolidada': id_acao,
            'Título da Ação': titulo_acao,
            'Responsável Ação': resp_acao,
            'ID Proposta': prop.get('id_proposta'),
            'Texto Proposta': prop.get('texto'),
            'Responsável Proposta': prop.get('responsavel'),
            'Origem Proposta': prop.get('origem'),
            'Observação': prop.get('meta_obs', '')
        })

# 3. Processar Propostas Registradas (Banco / 999)
for prop in data.get('propostas_registradas', []):
    # Tenta pegar o ID para onde ela foi movida (geralmente 999)
    id_dest = prop.get('acao_consolidada_id', 999)
    
    rows.append({
        'Status': 'Registrada (Banco)',
        'ID Ação Consolidada': id_dest,
        'Título da Ação': 'BANCO DE PROPOSTAS (Aguardando Vínculo)',
        'Responsável Ação': 'N/A',
        'ID Proposta': prop.get('id_proposta'),
        'Texto Proposta': prop.get('texto'),
        'Responsável Proposta': prop.get('responsavel'),
        'Origem Proposta': prop.get('origem'),
        'Observação': prop.get('meta_obs', '') # Importante para ver o motivo da remoção
    })

# 4. Criar DataFrame e Salvar
df = pd.DataFrame(rows)
output_file = 'relatorio_geral_propostas_v18.xlsx'
df.to_excel(output_file, index=False)

print(f"Planilha '{output_file}' gerada com sucesso!")