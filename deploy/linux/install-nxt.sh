#!/usr/bin/env bash
# Instala o Nxt numa máquina Linux: estrutura, segredos, banco, serviços.
#
# Equivalente ao deploy/windows/install-nxt.ps1 e com as mesmas garantias:
# IDEMPOTENTE (rodar de novo ATUALIZA sem recriar segredo nem reprovisionar admin) e
# fail-fast (falha cedo, com mensagem que diz o que fazer).
#
# O que NÃO faz, de propósito: instalar Node/SQL Server/Nginx, emitir certificado TLS
# ou mexer em firewall — política de infraestrutura é do cliente.
#
# Uso (primeira instalação):
#   sudo ./install-nxt.sh --origem /entrega/nxt \
#        --database-url 'sqlserver://SRVSQL:1433;database=nxt;user=nxt_app;password=***;encrypt=true' \
#        --admin-email ti@empresa.com.br --admin-password '<senha forte>' --org-name 'Empresa LTDA'
#
# Uso (atualização):
#   sudo ./install-nxt.sh --origem /entrega/nxt

set -euo pipefail

ROOT=/opt/nxt
CONFIG_DIR=/etc/nxt
ORIGEM=""
DATABASE_URL_ARG=""
ADMIN_EMAIL_ARG=""
ADMIN_PASSWORD_ARG=""
ORG_NAME_ARG="Nxt"
WEB_URL_ARG="http://localhost:3000"
USUARIO=nxt
PULAR_SERVICOS=0

passo() { printf '\n=== %s\n' "$1"; }
ok()    { printf '  OK  %s\n' "$1"; }
aviso() { printf '  !   %s\n' "$1" >&2; }
erro()  { printf '\nFALHOU: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origem)         ORIGEM="$2"; shift 2 ;;
    --root)           ROOT="$2"; shift 2 ;;
    --database-url)   DATABASE_URL_ARG="$2"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL_ARG="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD_ARG="$2"; shift 2 ;;
    --org-name)       ORG_NAME_ARG="$2"; shift 2 ;;
    --web-url)        WEB_URL_ARG="$2"; shift 2 ;;
    --usuario)        USUARIO="$2"; shift 2 ;;
    --pular-servicos) PULAR_SERVICOS=1; shift ;;
    -h|--help)        sed -n '2,20p' "$0"; exit 0 ;;
    *) erro "Opção desconhecida: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || erro 'Rode como root (systemd e /etc/nxt exigem privilégio).'

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -n "$ORIGEM" ]] || ORIGEM="$(cd "$AQUI/../.." && pwd)"
[[ -d "$ORIGEM" ]] || erro "Pasta de origem não encontrada: $ORIGEM"

passo 'Pré-requisitos'
command -v node >/dev/null || erro 'Node.js não encontrado no PATH. Instale a versão 20 ou superior.'
NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
[[ "$NODE_MAJOR" -ge 20 ]] || erro "Node.js $(node -v) é antigo demais; o Nxt exige 20 ou superior."
ok "Node.js $(node -v)"

[[ -d "$ORIGEM/apps/api/dist" ]] || erro "A origem não tem build da API. Rode 'npm run build' antes de instalar."
[[ -d "$ORIGEM/apps/web/.next" ]] || erro "A origem não tem build da web. Rode 'npm run build' antes de instalar."
ok 'Aplicação construída encontrada na origem'

# Usuário de serviço sem shell: se a aplicação for comprometida, o atacante não
# ganha um login utilizável junto.
if ! id -u "$USUARIO" >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$ROOT" "$USUARIO"
  ok "usuário de serviço criado: $USUARIO"
else
  ok "usuário de serviço já existe: $USUARIO"
fi

passo 'Estrutura'
mkdir -p "$ROOT" "$CONFIG_DIR" "$ROOT/logs" "$ROOT/storage" "$ROOT/backup"
ok "estrutura em $ROOT (config em $CONFIG_DIR)"

PRIMEIRA_VEZ=0
[[ -f "$CONFIG_DIR/api.env" ]] || PRIMEIRA_VEZ=1

passo 'Aplicação'
command -v rsync >/dev/null || erro 'rsync não encontrado — necessário para copiar a aplicação sem deixar restos da versão anterior.'
for parte in apps/api apps/web packages node_modules package.json package-lock.json; do
  [[ -e "$ORIGEM/$parte" ]] || continue
  mkdir -p "$(dirname "$ROOT/$parte")"
  # --delete espelha: arquivo que sumiu na origem some no destino, senão a
  # atualização deixa restos da versão anterior convivendo com a nova.
  rsync -a --delete "$ORIGEM/$parte" "$(dirname "$ROOT/$parte")/"
  ok "copiado: $parte"
done

passo 'Configuração e segredos'
novo_segredo() { head -c 48 /dev/urandom | base64 | tr -d '\n'; }

ler_env() { [[ -f "$1" ]] && grep -E "^$2=" "$1" | tail -1 | cut -d= -f2- || true; }

API_ENV="$CONFIG_DIR/api.env"
DATABASE_URL_ATUAL="$(ler_env "$API_ENV" DATABASE_URL)"
[[ -n "$DATABASE_URL_ARG" ]] && DATABASE_URL_ATUAL="$DATABASE_URL_ARG"
[[ -n "$DATABASE_URL_ATUAL" ]] || erro 'DATABASE_URL não informada e não existe configuração anterior. Use --database-url.'

# Segredos são gerados UMA vez e preservados: regerar AUTH_JWT_SECRET desloga todo
# mundo, e regerar MAIL_ENCRYPTION_KEY torna a senha de e-mail guardada indecifrável.
JWT="$(ler_env "$API_ENV" AUTH_JWT_SECRET)";     [[ -n "$JWT" ]] || { JWT="$(novo_segredo)"; ok 'AUTH_JWT_SECRET gerado'; }
MAILKEY="$(ler_env "$API_ENV" MAIL_ENCRYPTION_KEY)"; [[ -n "$MAILKEY" ]] || { MAILKEY="$(novo_segredo)"; ok 'MAIL_ENCRYPTION_KEY gerado'; }

umask 077
cat > "$API_ENV" <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=$DATABASE_URL_ATUAL
AUTH_JWT_SECRET=$JWT
MAIL_ENCRYPTION_KEY=$MAILKEY
WEB_URL=$WEB_URL_ARG
STORAGE_DRIVER=local
STORAGE_DIR=$ROOT/storage
EOF
chown root:"$USUARIO" "$API_ENV"; chmod 640 "$API_ENV"
ok 'api.env escrito (leitura só para root e o usuário de serviço)'

cat > "$CONFIG_DIR/web.env" <<EOF
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=/api
EOF
chown root:"$USUARIO" "$CONFIG_DIR/web.env"; chmod 640 "$CONFIG_DIR/web.env"
ok 'web.env escrito'

chown -R "$USUARIO":"$USUARIO" "$ROOT/storage" "$ROOT/logs" "$ROOT/backup"

passo 'Banco de dados'
cd "$ROOT"
DATABASE_URL="$DATABASE_URL_ATUAL" npx prisma migrate deploy --schema packages/database/prisma/schema.prisma \
  || erro 'Falha ao aplicar as migrações. A API não sobe com migração pendente — resolva antes de seguir.'
ok 'migrações aplicadas'

if [[ $PRIMEIRA_VEZ -eq 1 ]]; then
  [[ -n "$ADMIN_EMAIL_ARG" && -n "$ADMIN_PASSWORD_ARG" ]] \
    || erro 'Primeira instalação exige --admin-email e --admin-password (o seed recusa os valores de exemplo em produção).'
  DATABASE_URL="$DATABASE_URL_ATUAL" NODE_ENV=production \
  ADMIN_EMAIL="$ADMIN_EMAIL_ARG" ADMIN_PASSWORD="$ADMIN_PASSWORD_ARG" ORG_NAME="$ORG_NAME_ARG" \
    node packages/database/prisma/seed.mjs || erro 'Falha ao provisionar o administrador inicial.'
  ok "administrador provisionado: $ADMIN_EMAIL_ARG"
else
  ok 'administrador já existia — preservado'
fi

if [[ $PULAR_SERVICOS -eq 0 ]]; then
  passo 'Serviços (systemd)'
  cp "$AQUI"/nxt-api.service "$AQUI"/nxt-web.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable nxt-api nxt-web >/dev/null
  ok 'unidades instaladas e habilitadas (ainda não iniciadas)'
fi

passo 'Instalação concluída'
cat <<EOF
  Aplicação:  $ROOT
  Config:     $CONFIG_DIR  (contém segredos — não anexe em chamado de suporte)
  Logs:       journalctl -u nxt-api -f
  Backup:     $ROOT/backup

  Iniciar:    systemctl start nxt-api nxt-web
  Conferir:   systemctl status nxt-api

  AINDA FALTA, e não é opcional:
   1. TLS na frente (deploy/nginx/nxt.conf) — sem isso, senha trafega em claro.
   2. Backup agendado (deploy/backup/) — e um restore de teste ANTES de virar produção.
   3. Servidor de e-mail em Configurações -> E-mail, se os avisos forem sair por e-mail.
EOF
