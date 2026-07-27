#!/usr/bin/env bash
# Backup do Nxt: banco + anexos, com retenção e verificação.
#
# Agendar (todo dia às 2h, como root):
#   0 2 * * * /opt/nxt/deploy/backup/backup-nxt.sh >> /opt/nxt/logs/backup.log 2>&1
#
# ATENÇÃO: este script grava na máquina. Backup que não sai da máquina não protege
# contra a perda da máquina — copie $DESTINO para fora (fita, NAS, objeto) por conta
# da rotina de infraestrutura do cliente.

set -euo pipefail

CONFIG=${CONFIG:-/etc/nxt/api.env}
DESTINO=${DESTINO:-/opt/nxt/backup}
STORAGE=${STORAGE:-/opt/nxt/storage}
DIAS=${DIAS:-14}                    # retenção local
SQLCMD=${SQLCMD:-sqlcmd}
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTULO=$(date +%Y%m%d-%H%M)

erro() { printf '\n[%s] FALHOU: %s\n' "$(date '+%F %T')" "$1" >&2; exit 1; }
log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$1"; }

[[ -f "$CONFIG" ]] || erro "Configuração não encontrada: $CONFIG"

# Lê a conexão do mesmo .env que a aplicação usa — duas fontes de verdade para a
# senha do banco garantem que uma delas fique desatualizada.
URL=$(grep -E '^DATABASE_URL=' "$CONFIG" | tail -1 | cut -d= -f2-)
[[ -n "$URL" ]] || erro "DATABASE_URL ausente em $CONFIG"

campo() { echo "$URL" | tr ';' '\n' | grep -E "^$1=" | head -1 | cut -d= -f2-; }
SERVIDOR=$(echo "$URL" | cut -d';' -f1 | sed 's|sqlserver://||')
BANCO=$(campo database); USUARIO=$(campo user); SENHA=$(campo password)
[[ -n "$BANCO" ]] || erro 'Não consegui extrair o nome do banco da DATABASE_URL.'

mkdir -p "$DESTINO"

log "Backup do banco $BANCO em $SERVIDOR"
# -C aceita o certificado do servidor (SQL Server em container/rede interna costuma
# ter certificado autoassinado); em servidor com certificado válido, pode sair.
"$SQLCMD" -S "$SERVIDOR" -U "$USUARIO" -P "$SENHA" -C -b \
  -i "$AQUI/backup-sqlserver.sql" \
  -v BANCO="$BANCO" DESTINO="$DESTINO/" ROTULO="$ROTULO" \
  || erro 'BACKUP DATABASE falhou (veja a mensagem do SQL Server acima).'

ARQUIVO="$DESTINO/$BANCO-$ROTULO.bak"
[[ -s "$ARQUIVO" ]] || erro "O SQL Server disse que gravou, mas $ARQUIVO não existe ou está vazio. Se o SQL Server for remoto ou estiver em container, DESTINO precisa ser um caminho que ELE enxergue."
log "Banco: $(du -h "$ARQUIVO" | cut -f1) em $ARQUIVO"

# Anexos: ficam FORA do banco. Restaurar só o banco devolve um sistema com documentos
# quebrados — link apontando para arquivo que não existe mais.
if [[ -d "$STORAGE" ]]; then
  tar -czf "$DESTINO/storage-$ROTULO.tar.gz" -C "$(dirname "$STORAGE")" "$(basename "$STORAGE")"
  log "Anexos: $(du -h "$DESTINO/storage-$ROTULO.tar.gz" | cut -f1)"
else
  log "AVISO: pasta de anexos não encontrada ($STORAGE) — nada a arquivar"
fi

# Retenção: só apaga DEPOIS de o backup novo estar no disco e verificado. Apagar antes
# deixaria uma janela sem nenhum backup válido.
APAGADOS=$(find "$DESTINO" -maxdepth 1 -type f \( -name '*.bak' -o -name 'storage-*.tar.gz' \) -mtime "+$DIAS" -print -delete | wc -l)
log "Retenção: $APAGADOS arquivo(s) com mais de $DIAS dias removido(s)"
log 'Backup concluído.'
