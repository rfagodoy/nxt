<#
.SYNOPSIS
  Instala o Nxt numa máquina Windows: estrutura, segredos, banco, serviços.

.DESCRIPTION
  Um caminho de instalação reproduzível. Antes disto, instalar significava copiar
  pastas à mão e lembrar de cada passo — o que funciona uma vez, com quem escreveu o
  sistema na sala, e falha na segunda.

  O script é IDEMPOTENTE: rodar de novo atualiza a aplicação sem recriar segredos nem
  reprovisionar o administrador. É assim que ele serve também para ATUALIZAR.

  O que ele NÃO faz, de propósito:
   · não instala Node, SQL Server nem Nginx (política de infraestrutura é do cliente);
   · não emite certificado TLS (ver deploy/nginx/nxt.conf);
   · não abre porta em firewall.

.PARAMETER Origem
  Pasta com a aplicação JÁ CONSTRUÍDA (`npm run build` na origem). Padrão: o repositório
  de onde este script está sendo executado.

.PARAMETER Root
  Onde instalar. Padrão C:\nxt.

.PARAMETER DatabaseUrl
  Cadeia de conexão do SQL Server. Obrigatória na primeira instalação.

.PARAMETER AdminEmail
  E-mail do administrador inicial. Obrigatório na primeira instalação — e precisa ser
  um endereço REAL: o seed recusa domínio que não existe fora da máquina.

.PARAMETER AdminPassword
  Senha do administrador inicial. Obrigatória na primeira instalação.

.PARAMETER OrgName
  Nome da organização (aparece no sistema). Padrão: Nxt.

.PARAMETER PularServicos
  Não registra os serviços do Windows (útil para preparar a máquina e subir depois).

.EXAMPLE
  # Como Administrador, primeira instalação:
  .\install-nxt.ps1 -DatabaseUrl "sqlserver://SRVSQL:1433;database=nxt;user=nxt_app;password=***;encrypt=true" `
                    -AdminEmail "ti@empresa.com.br" -AdminPassword "<senha forte>" -OrgName "Empresa LTDA" `
                    -WinSwPath C:\nxt\tools\WinSW.exe

.EXAMPLE
  # Atualização (a aplicação muda; segredos, banco e admin ficam):
  .\install-nxt.ps1 -Origem C:\entrega\nxt
#>
[CmdletBinding()]
param(
  [string]$Origem,
  [string]$Root = 'C:\nxt',
  [string]$DatabaseUrl,
  [string]$AdminEmail,
  [string]$AdminPassword,
  [string]$OrgName = 'Nxt',
  [string]$WebUrl = 'http://localhost:3000',
  [string]$WinSwPath,
  [switch]$PularServicos
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Passo($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Ok($t)    { Write-Host "  OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  !   $t" -ForegroundColor Yellow }

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Rode como Administrador (registrar serviço e ajustar permissão de arquivo exigem elevação).'
  }
}

# Segredo forte o suficiente para assinar JWT. `New-Guid` NÃO serve: é previsível
# demais para material criptográfico.
function Novo-Segredo {
  $bytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes)
}

# Lê um .env já existente para preservar o que não deve mudar numa atualização.
function Ler-Env($caminho) {
  $mapa = @{}
  if (Test-Path $caminho) {
    foreach ($linha in Get-Content $caminho) {
      if ($linha -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $mapa[$Matches[1]] = $Matches[2].Trim('"')
      }
    }
  }
  return $mapa
}

function Escrever-Env($caminho, $mapa) {
  $linhas = $mapa.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }
  Set-Content -Path $caminho -Value $linhas -Encoding UTF8
  # Só SYSTEM e Administradores. O arquivo tem a senha do banco e o segredo de
  # assinatura dos tokens: herdar a permissão da pasta deixaria qualquer usuário lendo.
  icacls $caminho /inheritance:r /grant:r "SYSTEM:(R,W)" "BUILTIN\Administradores:(R,W)" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { icacls $caminho /inheritance:r /grant:r "SYSTEM:(R,W)" "BUILTIN\Administrators:(R,W)" | Out-Null }
}

Assert-Admin

if (-not $Origem) { $Origem = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
if (-not (Test-Path $Origem)) { throw "Pasta de origem não encontrada: $Origem" }

Passo 'Pré-requisitos'
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'Node.js não encontrado no PATH. Instale a versão 20 ou superior antes de continuar.' }
$versao = (& node -v).TrimStart('v')
if ([int]($versao.Split('.')[0]) -lt 20) { throw "Node.js $versao é antigo demais; o Nxt exige 20 ou superior." }
Ok "Node.js $versao"

if (-not (Test-Path (Join-Path $Origem 'apps\api\dist'))) {
  throw "A origem não tem build da API ($Origem\apps\api\dist). Rode 'npm run build' antes de instalar."
}
if (-not (Test-Path (Join-Path $Origem 'apps\web\.next'))) {
  throw "A origem não tem build da web ($Origem\apps\web\.next). Rode 'npm run build' antes de instalar."
}
Ok 'Aplicação construída encontrada na origem'

Passo 'Estrutura'
foreach ($d in @($Root, "$Root\config", "$Root\logs", "$Root\storage", "$Root\services", "$Root\backup")) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
Ok "Estrutura em $Root"

Passo 'Aplicação'
$primeiraVez = -not (Test-Path "$Root\config\api.env")
foreach ($parte in @('apps\api', 'apps\web', 'packages', 'node_modules', 'package.json', 'package-lock.json')) {
  $de = Join-Path $Origem $parte
  if (-not (Test-Path $de)) { continue }
  $para = Join-Path $Root $parte
  $paraPai = Split-Path -Parent $para
  if (-not (Test-Path $paraPai)) { New-Item -ItemType Directory -Path $paraPai -Force | Out-Null }
  # /MIR espelha: arquivo que sumiu na origem some no destino. É o que faz a
  # atualização não deixar restos da versão anterior.
  if (Test-Path $de -PathType Container) {
    robocopy $de $para /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Falha ao copiar $parte (robocopy $LASTEXITCODE)" }
  } else {
    Copy-Item $de $para -Force
  }
  Ok "copiado: $parte"
}

Passo 'Configuração e segredos'
$api = Ler-Env "$Root\config\api.env"

if ($DatabaseUrl) { $api['DATABASE_URL'] = $DatabaseUrl }
if (-not $api['DATABASE_URL']) { throw 'DATABASE_URL não informada e não existe configuração anterior. Passe -DatabaseUrl.' }

# Segredos: gerados uma vez e PRESERVADOS. Regerar o AUTH_JWT_SECRET desloga todo
# mundo; regerar o MAIL_ENCRYPTION_KEY torna a senha de e-mail guardada indecifrável.
if (-not $api['AUTH_JWT_SECRET'])     { $api['AUTH_JWT_SECRET'] = Novo-Segredo; Ok 'AUTH_JWT_SECRET gerado' }     else { Ok 'AUTH_JWT_SECRET preservado' }
if (-not $api['MAIL_ENCRYPTION_KEY']) { $api['MAIL_ENCRYPTION_KEY'] = Novo-Segredo; Ok 'MAIL_ENCRYPTION_KEY gerado' } else { Ok 'MAIL_ENCRYPTION_KEY preservado' }

$api['NODE_ENV']    = 'production'
$api['PORT']        = if ($api['PORT']) { $api['PORT'] } else { '3001' }
$api['WEB_URL']     = $WebUrl
$api['STORAGE_DRIVER'] = if ($api['STORAGE_DRIVER']) { $api['STORAGE_DRIVER'] } else { 'local' }
$api['STORAGE_DIR']    = if ($api['STORAGE_DIR']) { $api['STORAGE_DIR'] } else { "$Root\storage" }
Escrever-Env "$Root\config\api.env" $api
Ok 'config\api.env escrito (somente SYSTEM e Administradores)'

$web = Ler-Env "$Root\config\web.env"
$web['NODE_ENV'] = 'production'
$web['PORT'] = if ($web['PORT']) { $web['PORT'] } else { '3000' }
$web['NEXT_PUBLIC_API_URL'] = if ($web['NEXT_PUBLIC_API_URL']) { $web['NEXT_PUBLIC_API_URL'] } else { '/api' }
Escrever-Env "$Root\config\web.env" $web
Ok 'config\web.env escrito'

Passo 'Banco de dados'
$env:DATABASE_URL = $api['DATABASE_URL']
Push-Location $Root
try {
  & npx prisma migrate deploy --schema packages\database\prisma\schema.prisma
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar as migrações. A API não sobe com migração pendente — resolva antes de seguir.' }
  Ok 'Migrações aplicadas'

  if ($primeiraVez) {
    if (-not $AdminEmail -or -not $AdminPassword) {
      throw 'Primeira instalação exige -AdminEmail e -AdminPassword (o seed recusa os valores de exemplo em produção).'
    }
    $env:NODE_ENV = 'production'; $env:ADMIN_EMAIL = $AdminEmail; $env:ADMIN_PASSWORD = $AdminPassword; $env:ORG_NAME = $OrgName
    & node packages\database\prisma\seed.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao provisionar o administrador inicial.' }
    Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Ok "Administrador provisionado: $AdminEmail"
  } else {
    Ok 'Administrador já existia — preservado'
  }
} finally { Pop-Location }

if (-not $PularServicos) {
  Passo 'Serviços do Windows'
  if (-not $WinSwPath) { $WinSwPath = Join-Path $Root 'tools\WinSW.exe' }
  if (-not (Test-Path $WinSwPath)) {
    Aviso "WinSW.exe não encontrado em $WinSwPath — serviços NÃO registrados."
    Aviso 'Baixe o WinSW (github.com/winsw/winsw) e rode: .\install-services.ps1 -WinSwPath <caminho>'
  } else {
    & (Join-Path $PSScriptRoot 'install-services.ps1') -WinSwPath $WinSwPath -Root $Root
    Ok 'Serviços registrados'
  }
}

Passo 'Instalação concluída'
Write-Host @"
  Aplicação:  $Root
  Config:     $Root\config  (contém segredos — não copie para chamado de suporte)
  Logs:       $Root\logs
  Backup:     $Root\backup

  Iniciar:    Start-Service nxt-api; Start-Service nxt-web
  Conferir:   Get-Service nxt-*

  AINDA FALTA, e não é opcional:
   1. TLS na frente (deploy\nginx\nxt.conf) — sem isso, senha trafega em claro.
   2. Backup agendado (deploy\backup\) — e um restore de teste ANTES de virar produção.
   3. Servidor de e-mail em Configurações -> E-mail, se os avisos forem sair por e-mail.
"@ -ForegroundColor Gray
