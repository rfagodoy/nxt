<#
.SYNOPSIS
  PROVA que o backup presta: restaura o mais recente num banco paralelo e confere.

.DESCRIPTION
  O script mais importante desta pasta. Backup nunca restaurado é esperança, não
  proteção — e a hora de descobrir que o arquivo está corrompido, truncado ou vazio não
  pode ser a hora do desastre.

  NÃO toca o banco de produção: restaura em <banco>_restore_teste e remove ao final.

.EXAMPLE
  # Agendar mensalmente no Agendador de Tarefas:
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\nxt\deploy\backup\test-restore.ps1
#>
[CmdletBinding()]
param(
  [string]$Config = 'C:\nxt\config\api.env',
  [string]$Destino = 'C:\nxt\backup',
  [string]$PastaDados = 'C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA\',
  [string]$SqlCmd = 'sqlcmd',
  [switch]$Manter
)

$ErrorActionPreference = 'Stop'
function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
function Erro($m) { Write-Error ("FALHOU: " + $m); exit 1 }

if (-not (Test-Path $Config)) { Erro "Configuração não encontrada: $Config" }
$linha = Select-String -Path $Config -Pattern '^DATABASE_URL=' | Select-Object -Last 1
$url = ($linha.Line -replace '^DATABASE_URL=', '').Trim('"')
$servidor = ($url -split ';')[0] -replace 'sqlserver://', ''
$campos = @{}
foreach ($p in ($url -split ';' | Select-Object -Skip 1)) {
  $i = $p.IndexOf('='); if ($i -gt 0) { $campos[$p.Substring(0, $i)] = $p.Substring($i + 1) }
}
$banco = $campos['database']; $usuario = $campos['user']; $senha = $campos['password']
$alvo = "${banco}_restore_teste"

$arquivo = Get-ChildItem $Destino -Filter "$banco-*.bak" -File -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $arquivo) { Erro "Nenhum backup encontrado em $Destino" }
Log ("Backup mais recente: {0} ({1:N1} MB)" -f $arquivo.FullName, ($arquivo.Length / 1MB))

function Sq { param([string[]]$Args) & $SqlCmd -S $servidor -U $usuario -P $senha -C -b @Args }

Log "Restaurando em $alvo (o banco de produção NÃO é tocado)"
Sq @('-i', (Join-Path $PSScriptRoot 'restore-sqlserver.sql'),
     '-v', "ARQUIVO=$($arquivo.FullName)", "ALVO=$alvo", "PASTA=$PastaDados", 'PERMITIR_PRODUCAO=nao')
if ($LASTEXITCODE -ne 0) { Erro 'O restore falhou — o backup NÃO serve. Trate como incidente: hoje você não tem cópia utilizável.' }

# Restore que "funciona" mas devolve banco vazio é o modo de falha mais traiçoeiro,
# porque o comando termina com sucesso.
$consulta = 'SET NOCOUNT ON; SELECT CAST(COUNT(*) AS VARCHAR) FROM users'
$vivo  = (Sq @('-d', $banco, '-h', '-1', '-W', '-Q', $consulta)) -join '' -replace '\s', ''
$copia = (Sq @('-d', $alvo,  '-h', '-1', '-W', '-Q', $consulta)) -join '' -replace '\s', ''
Log "Usuários — produção: $vivo | restaurado: $copia"
if (-not ($copia -match '^\d+$') -or [int]$copia -eq 0) {
  Erro 'O banco restaurado não tem usuários. O arquivo existe mas não serve.'
}

if (-not $Manter) {
  Sq @('-Q', "IF DB_ID('$alvo') IS NOT NULL BEGIN ALTER DATABASE [$alvo] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$alvo]; END") | Out-Null
  Log 'Banco de teste removido'
} else {
  Log "Banco de teste MANTIDO para inspeção: $alvo"
}

Log 'RESTORE VALIDADO — o backup é utilizável.'
