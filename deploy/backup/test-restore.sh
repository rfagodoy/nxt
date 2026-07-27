#!/usr/bin/env bash
# PROVA que o backup presta: restaura o arquivo mais recente num banco paralelo e
# confere que os dados chegaram lá.
#
# Este é o script mais importante da pasta. Backup nunca restaurado é esperança, não
# proteção — e a hora de descobrir que o arquivo está corrompido, truncado ou vazio
# não pode ser a hora do desastre.
#
# NÃO toca o banco de produção: restaura em <banco>_restore_teste e o remove ao final.
#
# Agendar (todo dia 1º às 3h):
#   0 3 1 * * /opt/nxt/deploy/backup/test-restore.sh >> /opt/nxt/logs/restore-teste.log 2>&1

set -euo pipefail

CONFIG=${CONFIG:-/etc/nxt/api.env}
DESTINO=${DESTINO:-/opt/nxt/backup}
PASTA_DADOS=${PASTA_DADOS:-/var/opt/mssql/data/}
SQLCMD=${SQLCMD:-sqlcmd}
MANTER=${MANTER:-0}                  # 1 = não remove o banco restaurado (para inspeção)
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

erro() { printf '\n[%s] FALHOU: %s\n' "$(date '+%F %T')" "$1" >&2; exit 1; }
log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$1"; }

[[ -f "$CONFIG" ]] || erro "Configuração não encontrada: $CONFIG"
URL=$(grep -E '^DATABASE_URL=' "$CONFIG" | tail -1 | cut -d= -f2-)
campo() { echo "$URL" | tr ';' '\n' | grep -E "^$1=" | head -1 | cut -d= -f2-; }
SERVIDOR=$(echo "$URL" | cut -d';' -f1 | sed 's|sqlserver://||')
BANCO=$(campo database); USUARIO=$(campo user); SENHA=$(campo password)
ALVO="${BANCO}_restore_teste"

ARQUIVO=$(find "$DESTINO" -maxdepth 1 -name "$BANCO-*.bak" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
[[ -n "$ARQUIVO" ]] || erro "Nenhum backup encontrado em $DESTINO"
log "Backup mais recente: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"

sq() { "$SQLCMD" -S "$SERVIDOR" -U "$USUARIO" -P "$SENHA" -C -b "$@"; }

log "Restaurando em $ALVO (o banco de produção NÃO é tocado)"
sq -i "$AQUI/restore-sqlserver.sql" -v ARQUIVO="$ARQUIVO" ALVO="$ALVO" PASTA="$PASTA_DADOS" PERMITIR_PRODUCAO="nao" \
  || erro 'O restore falhou — o backup NÃO serve. Trate como incidente: hoje você não tem cópia utilizável.'

# Contagem comparada: restore que "funciona" mas devolve banco vazio é o modo de falha
# mais traiçoeiro, porque o comando termina com sucesso.
consulta="SET NOCOUNT ON; SELECT CAST(COUNT(*) AS VARCHAR) FROM users"
VIVO=$(sq -d "$BANCO" -h -1 -W -Q "$consulta" | tr -d '[:space:]')
COPIA=$(sq -d "$ALVO"  -h -1 -W -Q "$consulta" | tr -d '[:space:]')
log "Usuários — produção: $VIVO | restaurado: $COPIA"

[[ "$COPIA" =~ ^[0-9]+$ && "$COPIA" -gt 0 ]] \
  || { erro "O banco restaurado não tem usuários. O arquivo existe mas não serve."; }

MIGR=$(sq -d "$ALVO" -h -1 -W -Q "SET NOCOUNT ON; SELECT CAST(COUNT(*) AS VARCHAR) FROM _prisma_migrations" | tr -d '[:space:]')
log "Migrações registradas no restaurado: $MIGR"

if [[ "$MANTER" -eq 0 ]]; then
  sq -Q "IF DB_ID('$ALVO') IS NOT NULL BEGIN ALTER DATABASE [$ALVO] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$ALVO]; END" >/dev/null
  log "Banco de teste removido"
else
  log "Banco de teste MANTIDO para inspeção: $ALVO"
fi

log 'RESTORE VALIDADO — o backup é utilizável.'
