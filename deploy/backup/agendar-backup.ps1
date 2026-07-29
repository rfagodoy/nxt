<#
.SYNOPSIS
  Registra no Agendador de Tarefas o backup diário e o restore de teste mensal.

.DESCRIPTION
  O backup existia, era verificado e tinha restore provado — e não rodava sozinho.
  Nenhum instalador criava agendamento: a linha de comando ficava num README, e
  backup que depende de alguém lembrar não é backup, é intenção.

  Cria duas tarefas, como SYSTEM:
   · nxt-backup         — todo dia (padrão 02:00)
   · nxt-restore-teste  — todo dia 1º (padrão 03:00), restaura a cópia mais recente
                          num banco paralelo e confere. É a única prova de que o
                          arquivo presta; sem ela, "temos backup" é uma suposição.

  IDEMPOTENTE: rodar de novo recria as tarefas com os parâmetros novos.

  Cada tarefa chama um .cmd gerado em <Root>\services, que por sua vez chama o
  PowerShell e desvia a saída para <Root>\logs. O atalho evita a briga de aspas do
  schtasks — e deixa o comando legível para quem for auditar a máquina depois.

.PARAMETER CopiaPara
  Destino da cópia FORA da máquina (\\servidor\share\nxt). Sem isto, o backup fica
  no mesmo disco que ele protege. A conta que roda a tarefa é SYSTEM: na rede ela
  aparece como a conta de máquina (DOMINIO\SERVIDOR$), que precisa ter permissão
  de escrita no compartilhamento.

.EXAMPLE
  # Como Administrador:
  .\agendar-backup.ps1 -CopiaPara \\nas01\backups\nxt

.EXAMPLE
  # Conferir e rodar na hora (não espere até as 2h para descobrir que falha):
  schtasks /Query /TN nxt-backup /V /FO LIST
  schtasks /Run   /TN nxt-backup
  Get-Content C:\nxt\logs\backup.log -Tail 30

.EXAMPLE
  # Remover as tarefas:
  .\agendar-backup.ps1 -Remover
#>
[CmdletBinding()]
param(
  [string]$Root = 'C:\nxt',
  [string]$Destino,
  [string]$Storage,
  [string]$CopiaPara = '',
  [int]$Dias = 14,
  [string]$HoraBackup = '02:00',
  [string]$HoraRestore = '03:00',
  [int]$DiaDoMes = 1,
  [switch]$Remover
)

$ErrorActionPreference = 'Stop'

function Ok($t)    { Write-Host "  OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  !   $t" -ForegroundColor Yellow }

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Rode como Administrador (registrar tarefa agendada como SYSTEM exige elevação).'
  }
}

Assert-Admin

$TAREFA_BACKUP  = 'nxt-backup'
$TAREFA_RESTORE = 'nxt-restore-teste'

if ($Remover) {
  foreach ($t in @($TAREFA_BACKUP, $TAREFA_RESTORE)) {
    & schtasks.exe /Delete /TN $t /F 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok "tarefa removida: $t" } else { Aviso "tarefa não existia: $t" }
  }
  return
}

if (-not $Destino) { $Destino = Join-Path $Root 'backup' }
if (-not $Storage) { $Storage = Join-Path $Root 'storage' }

$aqui     = Split-Path -Parent $MyInvocation.MyCommand.Path
$scripts  = Join-Path $Root 'services'
$logs     = Join-Path $Root 'logs'
$config   = Join-Path $Root 'config\api.env'
foreach ($d in @($scripts, $logs, $Destino)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

if (-not (Test-Path $config)) {
  Aviso "config\api.env ainda não existe em $config — a tarefa vai falhar até o Nxt ser instalado."
}

# Gera o .cmd que a tarefa executa. Um arquivo por tarefa, com o comando inteiro
# visível: quem abrir a máquina daqui a um ano entende o que está agendado sem
# precisar decifrar a linha do schtasks.
function Escrever-Wrapper($caminho, $linha) {
  $conteudo = @(
    '@echo off',
    'rem Gerado por deploy\backup\agendar-backup.ps1 — editar aqui não sobrevive a uma reinstalação.',
    $linha
  )
  Set-Content -Path $caminho -Value $conteudo -Encoding ASCII
}

$backupPs1  = Join-Path $aqui 'backup-nxt.ps1'
$restorePs1 = Join-Path $aqui 'test-restore.ps1'
foreach ($s in @($backupPs1, $restorePs1)) {
  if (-not (Test-Path $s)) { throw "Script não encontrado: $s" }
}

$argsBackup = "-Config `"$config`" -Destino `"$Destino`" -Storage `"$Storage`" -Dias $Dias"
if ($CopiaPara) { $argsBackup += " -CopiaPara `"$CopiaPara`"" }

$cmdBackup  = Join-Path $scripts 'nxt-backup.cmd'
$cmdRestore = Join-Path $scripts 'nxt-restore-teste.cmd'

Escrever-Wrapper $cmdBackup  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$backupPs1`" $argsBackup >> `"$logs\backup.log`" 2>&1"
Escrever-Wrapper $cmdRestore "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$restorePs1`" -Config `"$config`" -Destino `"$Destino`" >> `"$logs\restore-teste.log`" 2>&1"
Ok "comandos gerados em $scripts"

# /F recria a tarefa se já existir — é o que torna este script repetível.
& schtasks.exe /Create /TN $TAREFA_BACKUP /TR "`"$cmdBackup`"" /SC DAILY /ST $HoraBackup /RU SYSTEM /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar a tarefa $TAREFA_BACKUP (schtasks $LASTEXITCODE)." }
Ok "$TAREFA_BACKUP — diária às $HoraBackup"

& schtasks.exe /Create /TN $TAREFA_RESTORE /TR "`"$cmdRestore`"" /SC MONTHLY /D $DiaDoMes /ST $HoraRestore /RU SYSTEM /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar a tarefa $TAREFA_RESTORE (schtasks $LASTEXITCODE)." }
Ok "$TAREFA_RESTORE — dia $DiaDoMes de cada mês, às $HoraRestore"

if (-not $CopiaPara) {
  Aviso 'Sem -CopiaPara: o backup fica na MESMA máquina que ele protege. Aponte para um compartilhamento de rede ou disco externo.'
}

Write-Host ''
Write-Host '  Prove agora, sem esperar o horário:' -ForegroundColor Gray
Write-Host "    schtasks /Run /TN $TAREFA_BACKUP" -ForegroundColor Gray
Write-Host "    Get-Content $logs\backup.log -Tail 30" -ForegroundColor Gray
