import json

# Carregar o ficheiro V17 (a versão mais atual)
file_path = './json_teste/acoes_consolidadas_v17.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# MAPA DE LIMPEZA ADICIONAL (Ações 147 e 353)
# Chave: ID da Ação Consolidada
# Valor: Lista de IDs de propostas para remover
limpeza_por_id = {
    # Ação 147: Formação TAEs -> Removemos Recrutamento, Docentes, Saúde e Carreira
    147: [
        "P-0669", "P-1211", "P-1228", "P-1236", "P-1238", "P-1300", "P-1314", 
        "P-1381", "P-1405", "P-1434", "P-1581", "P-2255", "P-2567", "P-2609", # Recrutamento
        "P-0783", "P-0951", "P-0998", "P-1091", "P-1806", # Formação Docente/Tutores
        "P-0745", "P-0932", "P-1619", "P-2572", "P-2603", # Saúde/Bem-estar
        "P-1118", "P-1256", "P-2561" # Carreira/Avaliação
    ],
    
    # Ação 353: Formação Docente -> Removemos Infra, Recrutamento e Assédio
    353: [
        "P-1188", "P-1203", # Infraestrutura/TI
        "P-1233", "P-1257", "P-1278", "P-1285", "P-1275", "P-1218", # Recrutamento/Gestão
        "P-1549", "P-1552" # Ética/Assédio
    ]
}

def executar_limpeza_segura(data, mapeamento):
    count_removidas = 0
    
    # Percorre todas as ações
    for acao in data.get('acoes_consolidadas', []):
        acao_id = acao.get('id_acao')
        
        # Se a ação estiver no nosso mapa de limpeza
        if acao_id in mapeamento:
            ids_para_remover = mapeamento[acao_id]
            propostas_originais = acao.get('propostas', [])
            propostas_mantidas = []
            
            for prop in propostas_originais:
                id_prop = prop.get('id_proposta')
                
                if id_prop in ids_para_remover:
                    # Move para a Ação 999 (Banco de Propostas)
                    prop['acao_consolidada_id'] = 999
                    # Regista o motivo para rastreabilidade
                    prop['meta_obs'] = f"Removido da Ação {acao_id} por falta de aderência (Revisão Técnica V18)"
                    
                    # Adiciona à lista geral de propostas registadas
                    if 'propostas_registradas' not in data:
                        data['propostas_registradas'] = []
                    data['propostas_registradas'].append(prop)
                    count_removidas += 1
                else:
                    # Mantém na ação original
                    propostas_mantidas.append(prop)
            
            # Atualiza a lista de propostas da ação
            acao['propostas'] = propostas_mantidas

    print(f"Limpeza concluída. {count_removidas} propostas foram movidas para a Ação 999.")
    return data

# Executa a limpeza
data_v18 = executar_limpeza_segura(data, limpeza_por_id)

# Atualiza os metadados da versão
if 'meta' in data_v18:
    data_v18['meta']['observacao'] += " | V18: Limpeza manual das Ações 147 (TAEs) e 353 (Docentes)."

# Salva o novo ficheiro V18
output_file = 'acoes_consolidadas_v18.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(data_v18, f, indent=2, ensure_ascii=False)

print(f"Arquivo '{output_file}' gerado com sucesso.")