<#
.SYNOPSIS
  Backup do Nxt (banco + anexos) com retenção e verificação — versão Windows.

.DESCRIPTION
  Equivalente ao backup-nxt.sh. A lógica de backup em si mora no .sql, para que os dois
  sistemas façam exatamente a mesma coisa e um DBA possa revisar sem ler PowerShell.

  ATENÇÃO: grava na própria máquina. Backup que não sai da máquina não protege contra a
  perda da máquina — leve a pasta de destino para fora por rotina de infraestrutura.

.PARAMETER Config
  Caminho do api.env de onde ler a conexão. Padrão C:\nxt\config\api.env.

.PARAMETER Destino
  Pasta dos arquivos. Precisa ser VISTA PELO SQL SERVER (se o banco estiver noutra
  máquina, use um caminho de rede que o serviço do SQL Server enxergue).

.EXAMPLE
  # Agendar no Agendador de Tarefas, diariamente às 2h, como SYSTEM:
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\nxt\deploy\backup\backup-nxt.ps1
#>
[CmdletBinding()]
param(
  [string]$Config  = 'C:\nxt\config\api.env',
  [string]$Destino = 'C:\nxt\backup',
  [string]$Storage = 'C:\nxt\storage',
  [int]$Dias = 14,
  [string]$SqlCmd = 'sqlcmd'
)

$ErrorActionPreference = 'Stop'
function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
function Erro($m) { Write-Error ("FALHOU: " + $m); exit 1 }

if (-not (Test-Path $Config)) { Erro "Configuração não encontrada: $Config" }

$linha = Select-String -Path $Config -Pattern '^DATABASE_URL=' | Select-Object -Last 1
if (-not $linha) { Erro "DATABASE_URL ausente em $Config" }
$url = ($linha.Line -replace '^DATABASE_URL=', '').Trim('"')

$servidor = ($url -split ';')[0] -replace 'sqlserver://', ''
$campos = @{}
foreach ($p in ($url -split ';' | Select-Object -Skip 1)) {
  $i = $p.IndexOf('='); if ($i -gt 0) { $campos[$p.Substring(0, $i)] = $p.Substring($i + 1) }
}
$banco = $campos['database']; $usuario = $campos['user']; $senha = $campos['password']
if (-not $banco) { Erro 'Não consegui extrair o nome do banco da DATABASE_URL.' }

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }
$rotulo = Get-Date -Format 'yyyyMMdd-HHmm'
$aqui = $PSScriptRoot

Log "Backup do banco $banco em $servidor"
& $SqlCmd -S $servidor -U $usuario -P $senha -C -b `
  -i (Join-Path $aqui 'backup-sqlserver.sql') `
  -v BANCO="$banco" DESTINO="$Destino\" ROTULO="$rotulo"
if ($LASTEXITCODE -ne 0) { Erro 'BACKUP DATABASE falhou (veja a mensagem do SQL Server acima).' }

$arquivo = Join-Path $Destino "$banco-$rotulo.bak"
if (-not (Test-Path $arquivo) -or (Get-Item $arquivo).Length -eq 0) {
  Erro "O SQL Server disse que gravou, mas $arquivo não existe ou está vazio. Se o banco estiver em outra máquina, Destino precisa ser um caminho que O SERVIÇO DO SQL SERVER enxergue."
}
Log ("Banco: {0:N1} MB em {1}" -f ((Get-Item $arquivo).Length / 1MB), $arquivo)

# Anexos ficam FORA do banco: restaurar só o banco devolve um sistema com documentos
# quebrados, apontando para arquivo que não existe mais.
if (Test-Path $Storage) {
  $zip = Join-Path $Destino "storage-$rotulo.zip"
  Compress-Archive -Path (Join-Path $Storage '*') -DestinationPath $zip -CompressionLevel Optimal -Force
  Log ("Anexos: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))
} else {
  Log "AVISO: pasta de anexos não encontrada ($Storage) — nada a arquivar"
}

# Retenção só DEPOIS de o backup novo existir e ter passado na verificação: apagar
# antes deixaria uma janela sem nenhuma cópia válida.
$limite = (Get-Date).AddDays(-$Dias)
$velhos = Get-ChildItem $Destino -File | Where-Object { ($_.Extension -in '.bak', '.zip') -and $_.LastWriteTime -lt $limite }
$velhos | Remove-Item -Force
Log "Retenção: $($velhos.Count) arquivo(s) com mais de $Dias dias removido(s)"
Log 'Backup concluído.'
