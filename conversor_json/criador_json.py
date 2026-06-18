import os
import json
import pandas as pd
import re
from datetime import datetime

# 1. Função de Extração Múltipla e Estrita
def extrair_ugs(depto_raw):
    ugs = set()
    d = str(depto_raw).upper()
    
    if 'AUDIN' in d or 'AUDITORIA' in d: ugs.add('AUDIN')
    if 'CESAU' in d: ugs.add('CESAU')
    if 'COPESE' in d: ugs.add('COPESE')
    if 'CPA' in d and 'AVALIAÇÃO' in d: ugs.add('CPA')
    if 'EDITORA' in d: ugs.add('EDITORA')
    if 'GOVERNANÇA' in d: ugs.add('Governança')
    if 'INOVATO' in d: ugs.add('INOVATO')
    if 'OUVIDORIA' in d: ugs.add('OUVIDORIA')
    if 'PREFEITURA' in d: ugs.add('PREFEITURA UNIVERSITÁRIA')
    if 'PROAD' in d: ugs.add('PROAD')
    if 'PROAP' in d: ugs.add('PROAP')
    if 'PROCURADORIA' in d or 'PROJUR' in d: ugs.add('Procuradoria')
    if 'PROEST' in d: ugs.add('PROEST')
    if 'PROEX' in d: ugs.add('PROEX')
    if 'PROGEDEP' in d: ugs.add('PROGEDEP')
    if 'PROGRAD' in d: ugs.add('PROGRAD')
    if 'PROPESQ' in d: ugs.add('PROPESQ')
    if 'PROTIC' in d: ugs.add('PROTIC')
    if 'RÁDIO' in d or 'TV' in d: ugs.add('RÁDIO')
    if 'RELINTER' in d or 'INTERNACIONAIS' in d: ugs.add('RELINTER')
    if 'SAAID' in d: ugs.add('SAAID')
    if 'SUCOM' in d: ugs.add('SUCOM')
    
    # A REGRA ABSOLUTA: Sitai e Chefia viram apenas e unicamente CHEFIA DE GABINETE
    if 'CHEFIA DE GABINETE' in d or 'SITAI' in d: 
        ugs.add('CHEFIA DE GABINETE')
        
    if 'GABINETE DO REITOR' in d or ('REITORIA' in d and 'PRÓ' not in d and 'PRO-' not in d): 
        ugs.add('REITORIA')
        
    if 'COORD' in d or 'CURSO' in d or 'BACHARELADO' in d or 'LICENCIATURA' in d:
        if 'PÓS' in d or 'POS' in d or 'MESTRADO' in d or 'DOUTORADO' in d or 'ESPECIALIZAÇÃO' in d:
            ugs.add('COORDENAÇÃO DE CURSO DE PÓS-GRADUAÇÃO')
        else:
            ugs.add('COORDENAÇÃO DE CURSO DE GRADUAÇÃO')
            
    return list(ugs)

# 2. Descobre a pasta atual
pasta_atual = os.path.dirname(os.path.abspath(__file__))

caminho_csv = os.path.join(pasta_atual, 'export_todasAsAcoes.csv')
caminho_json_base = os.path.join(pasta_atual, 'acoes_consolidadas_v25.json')
caminho_json_saida = os.path.join(pasta_atual, 'base_painel_atualizada.json')

# 3. Carrega o CSV e remove as ações (GERAL)
print("Lendo e limpando o arquivo CSV...")
df_csv = pd.read_csv(caminho_csv, encoding='latin1')
df_filtrado = df_csv[~df_csv['Título'].str.contains(r'\(GERAL\)', case=False, na=False)]

# 4. Agrupa e NORMALIZA os departamentos para cada Ação
mapa_departamentos = {}
for idx, row in df_filtrado.iterrows():
    titulo = str(row['Título'])
    depto = str(row['Departamento'])
    match = re.match(r'^U\s+([\d\.]+)\s+-', titulo)
    
    if match:
        num = match.group(1)
        nomes_normalizados = extrair_ugs(depto)
        
        for nome in nomes_normalizados:
            if num not in mapa_departamentos:
                mapa_departamentos[num] = set()
            mapa_departamentos[num].add(nome)

# 5. Carrega as 541 ações estruturais (NÃO DELETAR NADA DAQUI!)
print("Aplicando regras estritas de nomenclatura...")
with open(caminho_json_base, 'r', encoding='utf-8') as f:
    base_json = json.load(f)

# 6. Atualiza o JSON
for acao in base_json.get('acoes', []):
    num = acao.get('numero_acao')
    
    if num in mapa_departamentos:
        deptos_validos = sorted(list(mapa_departamentos[num]))
        # Usa a barra simples sem espaços em volta (ex: PROGRAD/PROTIC)
        acao['responsavel'] = "/".join(deptos_validos)
    else:
        mask = df_csv['Título'].str.contains(f"^U {num} -", regex=True, na=False)
        subset = df_csv[mask]
        
        if len(subset) > 0 and subset['Título'].str.contains(r'\(GERAL\)', case=False).all():
            acao['responsavel'] = "TODAS AS UGs" 
        else:
            acao['responsavel'] = None 

# 7. Salva a Base intacta
base_json['meta']['gerado_em'] = datetime.now().isoformat()
base_json['meta']['observacao'] = "Mantidas 541 ações. Nomes inúteis ajustados para NULL para limpar os filtros."

with open(caminho_json_saida, 'w', encoding='utf-8') as f:
    json.dump(base_json, f, ensure_ascii=False, indent=2)

print(f"Pode respirar! Arquivo gerado em {caminho_json_saida} com as suas sagradas {len(base_json['acoes'])} ações devolvidas.")