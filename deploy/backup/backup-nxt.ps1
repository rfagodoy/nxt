<#
.SYNOPSIS
  Backup do Nxt (banco + anexos) com retenção e verificação — versão Windows.

.DESCRIPTION
  Equivalente ao backup-nxt.sh. A lógica de backup em si mora no .sql, para que os dois
  sistemas façam exatamente a mesma coisa e um DBA possa revisar sem ler PowerShell.

  O destino primário fica na própria máquina — e backup que não sai da máquina não
  protege contra a perda dela. Use -CopiaPara para mandar a cópia para fora.

.PARAMETER Config
  Caminho do api.env de onde ler a conexão. Padrão C:\nxt\config\api.env.

.PARAMETER Destino
  Pasta dos arquivos. Precisa ser VISTA PELO SQL SERVER (se o banco estiver noutra
  máquina, use um caminho de rede que o serviço do SQL Server enxergue).

.PARAMETER CopiaPara
  Segunda cópia, FORA desta máquina: compartilhamento de rede (\\servidor\backups),
  disco removível, ponto de montagem de NAS. Vazio = não copia.

  Quem grava aqui é a conta que executa ESTE script (diferente do .bak primário, que
  é gravado pelo serviço do SQL Server). Agendado como SYSTEM, o acesso à rede sai
  como a conta de máquina (DOMINIO\SERVIDOR$) — é ela que precisa ter permissão.

  Se a cópia externa falhar, o script termina com erro mesmo com o backup local
  íntegro: o objetivo do parâmetro é justamente não depender desta máquina.

.EXAMPLE
  # Agendar no Agendador de Tarefas, diariamente às 2h, como SYSTEM:
  powershell -NoProfile -ExecutionPolicy Bypass -File C:\nxt\deploy\backup\backup-nxt.ps1

.EXAMPLE
  # Com cópia para o NAS (use agendar-backup.ps1 para registrar a tarefa):
  .\backup-nxt.ps1 -CopiaPara \\nas01\backups\nxt
#>
[CmdletBinding()]
param(
  [string]$Config  = 'C:\nxt\config\api.env',
  [string]$Destino = 'C:\nxt\backup',
  [string]$Storage = 'C:\nxt\storage',
  [string]$CopiaPara = '',
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
$zip = $null
if (Test-Path $Storage) {
  $zip = Join-Path $Destino "storage-$rotulo.zip"
  Compress-Archive -Path (Join-Path $Storage '*') -DestinationPath $zip -CompressionLevel Optimal -Force
  Log ("Anexos: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))
} else {
  Log "AVISO: pasta de anexos não encontrada ($Storage) — nada a arquivar"
}

# Só o que ESTE backup gera. Filtrar por extensão apagaria qualquer .bak/.zip alheio
# largado na pasta — risco real agora que o destino pode ser um compartilhamento
# de rede usado por mais gente.
function Copias-Antigas($pasta, $limite) {
  Get-ChildItem $pasta -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $limite -and ($_.Name -like "$banco-*.bak" -or $_.Name -like 'storage-*.zip') }
}

$limite = (Get-Date).AddDays(-$Dias)

# Cópia FORA da máquina. É o que separa "tenho backup" de "sobrevivo a perder o
# servidor": disco, fonte e sala são pontos únicos de falha do destino primário.
if ($CopiaPara) {
  if (-not (Test-Path $CopiaPara)) {
    try { New-Item -ItemType Directory -Path $CopiaPara -Force | Out-Null }
    catch { Erro "Destino externo inacessível ($CopiaPara): $($_.Exception.Message). O backup LOCAL está íntegro em $Destino." }
  }
  $copiados = 0
  foreach ($origem in @($arquivo, $zip)) {
    if (-not $origem -or -not (Test-Path $origem)) { continue }
    $alvo = Join-Path $CopiaPara (Split-Path -Leaf $origem)
    try { Copy-Item $origem $alvo -Force }
    catch { Erro "Falha ao copiar para $CopiaPara : $($_.Exception.Message). O backup LOCAL está íntegro em $Destino." }
    # Conferir o TAMANHO: cópia truncada por queda de rede é falha silenciosa — o
    # arquivo existe, tem o nome certo, e só se descobre que não presta na restauração.
    if ((Get-Item $alvo).Length -ne (Get-Item $origem).Length) {
      Erro "Cópia externa incompleta: $alvo tem tamanho diferente do original. Não confie nela."
    }
    $copiados++
  }
  Log "Cópia externa: $copiados arquivo(s) em $CopiaPara"

  $velhosFora = Copias-Antigas $CopiaPara $limite
  $velhosFora | Remove-Item -Force -ErrorAction SilentlyContinue
  Log "Retenção externa: $(@($velhosFora).Count) arquivo(s) com mais de $Dias dias removido(s)"
} else {
  Log 'AVISO: sem cópia externa (-CopiaPara). O backup está na mesma máquina que ele protege.'
}

# Retenção só DEPOIS de o backup novo existir, ter passado na verificação e ter sido
# copiado para fora: apagar antes deixaria uma janela sem nenhuma cópia válida.
$velhos = Copias-Antigas $Destino $limite
$velhos | Remove-Item -Force
Log "Retenção: $(@($velhos).Count) arquivo(s) com mais de $Dias dias removido(s)"
Log 'Backup concluído.'
