param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Responsavel([object]$value) {
    if ($null -eq $value) { return $null }
    $s = [string]$value
    $s = $s.Trim()
    if ($s.Length -eq 0) { return $s }

    $s = ($s -replace "\s+", " ")
    # Padroniza apenas o caso para remover duplicidades (ex.: "protic" vs "PROTIC").
    # Mantém acentuação.
    return $s.ToUpper([System.Globalization.CultureInfo]::GetCultureInfo("pt-BR"))
}

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "Arquivo não encontrado: $InputPath"
}

$raw = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8
$data = $raw | ConvertFrom-Json -Depth 200

function Normalize-Acao([object]$acao) {
    if ($null -eq $acao) { return }

    if ($acao.PSObject.Properties.Name -contains "responsavel") {
        $acao.responsavel = Normalize-Responsavel $acao.responsavel
    }

    if ($acao.PSObject.Properties.Name -contains "propostas" -and $acao.propostas) {
        foreach ($p in $acao.propostas) {
            if ($null -eq $p) { continue }
            if ($p.PSObject.Properties.Name -contains "responsavel") {
                $p.responsavel = Normalize-Responsavel $p.responsavel
            }
        }
    }
}

if ($data -is [System.Collections.IEnumerable] -and -not ($data -is [string]) -and -not ($data.PSObject.Properties.Name -contains "acoes")) {
    foreach ($a in $data) { Normalize-Acao $a }
} elseif ($data.PSObject.Properties.Name -contains "acoes" -and $data.acoes) {
    foreach ($a in $data.acoes) { Normalize-Acao $a }
} else {
    throw "Estrutura inesperada: esperado array na raiz ou objeto com propriedade 'acoes'."
}

$jsonOut = $data | ConvertTo-Json -Depth 200
$dir = Split-Path -Parent $OutputPath
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
}

Set-Content -LiteralPath $OutputPath -Value $jsonOut -Encoding UTF8
Write-Host "OK: responsáveis normalizados -> $OutputPath"

