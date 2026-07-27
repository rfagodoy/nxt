<#
.SYNOPSIS
  Registra API e Web do Nxt como serviços do Windows (com reinício automático).

.DESCRIPTION
  Usa o WinSW (github.com/winsw/winsw, MIT): um executável que embrulha um processo
  comum num serviço do Windows. Sem isso, uma falha fatal do Node derruba a API e ela
  não volta sozinha.

  O script NÃO baixa nada da internet: aponte -WinSwPath para o WinSW.exe que você já
  baixou. Instalação on-premise costuma ser em máquina sem saída para a internet, e um
  instalador que depende de download falha justamente onde não pode falhar.

.EXAMPLE
  # Como Administrador:
  .\install-services.ps1 -WinSwPath C:\nxt\tools\WinSW.exe -Root C:\nxt

.NOTES
  Requer PowerShell como Administrador. Para desinstalar:
    C:\nxt\services\nxt-web.exe uninstall
    C:\nxt\services\nxt-api.exe uninstall
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$WinSwPath,
  [string]$Root = 'C:\nxt'
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Rode este script como Administrador (registrar serviço exige elevação).'
  }
}

Assert-Admin

if (-not (Test-Path $WinSwPath)) { throw "WinSW.exe não encontrado em: $WinSwPath" }
if (-not (Test-Path $Root))      { throw "Pasta da aplicação não encontrada em: $Root" }

$servicesDir = Join-Path $Root 'services'
$logsDir     = Join-Path $Root 'logs'
$configDir   = Join-Path $Root 'config'
foreach ($d in @($servicesDir, $logsDir, $configDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}

# O .env com segredos precisa existir ANTES do serviço subir — a API tem fail-fast
# de segredo e de migração, então subiria só para morrer com mensagem.
foreach ($env in @('api.env', 'web.env')) {
  $p = Join-Path $configDir $env
  if (-not (Test-Path $p)) { Write-Warning "Arquivo de ambiente ausente: $p (crie antes de iniciar os serviços)" }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($svc in @('nxt-api', 'nxt-web')) {
  $exe = Join-Path $servicesDir "$svc.exe"
  $xml = Join-Path $servicesDir "$svc.xml"

  Copy-Item $WinSwPath $exe -Force
  Copy-Item (Join-Path $here "$svc.xml") $xml -Force

  # Já instalado? Reinstala para pegar mudanças do XML.
  if (Get-Service -Name $svc -ErrorAction SilentlyContinue) {
    Write-Host "· $svc já existe — parando e reinstalando"
    & $exe stop      | Out-Null
    & $exe uninstall | Out-Null
    Start-Sleep -Seconds 2
  }

  & $exe install | Out-Null
  Write-Host "· $svc registrado"
}

Write-Host ''
Write-Host 'Serviços registrados. Antes de iniciar, aplique as migrações do banco:' -ForegroundColor Yellow
Write-Host '  npm run db:deploy' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Depois inicie na ordem (a web depende da API):'
Write-Host '  Start-Service nxt-api; Start-Service nxt-web'
Write-Host ''
Write-Host 'Estado e logs:'
Write-Host '  Get-Service nxt-*'
Write-Host "  Get-Content $logsDir\nxt-api.out.log -Tail 50 -Wait"
