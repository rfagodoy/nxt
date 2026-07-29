#!/usr/bin/env bash
# Backup do Nxt: banco + anexos, com retenção e verificação.
#
# Agendar (todo dia às 2h, como root):
#   0 2 * * * /opt/nxt/deploy/backup/backup-nxt.sh >> /opt/nxt/logs/backup.log 2>&1
#
# O destino primário fica na máquina — e backup que não sai da máquina não protege
# contra a perda dela. COPIA_PARA manda a cópia para fora (NAS montado, ponto de
# montagem de rede, disco removível). Se a cópia externa falhar, o script termina com
# erro mesmo com o backup local íntegro: é justamente dela que se depende.
#
#   COPIA_PARA=/mnt/nas/nxt /opt/nxt/deploy/backup/backup-nxt.sh

set -euo pipefail

CONFIG=${CONFIG:-/etc/nxt/api.env}
DESTINO=${DESTINO:-/opt/nxt/backup}
STORAGE=${STORAGE:-/opt/nxt/storage}
COPIA_PARA=${COPIA_PARA:-}          # cópia FORA da máquina; vazio = não copia
DIAS=${DIAS:-14}                    # retenção (vale para as duas cópias)
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
ANEXOS=""
if [[ -d "$STORAGE" ]]; then
  ANEXOS="$DESTINO/storage-$ROTULO.tar.gz"
  tar -czf "$ANEXOS" -C "$(dirname "$STORAGE")" "$(basename "$STORAGE")"
  log "Anexos: $(du -h "$ANEXOS" | cut -f1)"
else
  log "AVISO: pasta de anexos não encontrada ($STORAGE) — nada a arquivar"
fi

# Só o que ESTE backup gera: apagar por extensão levaria junto qualquer .bak alheio
# largado na pasta — risco real quando o destino é um compartilhamento de rede.
expurgar() {
  find "$1" -maxdepth 1 -type f \( -name "$BANCO-*.bak" -o -name 'storage-*.tar.gz' \) -mtime "+$DIAS" -print -delete | wc -l
}

# Cópia FORA da máquina: é o que separa "tenho backup" de "sobrevivo a perder o
# servidor". Disco, fonte e sala são pontos únicos de falha do destino primário.
if [[ -n "$COPIA_PARA" ]]; then
  mkdir -p "$COPIA_PARA" || erro "Destino externo inacessível ($COPIA_PARA). O backup LOCAL está íntegro em $DESTINO."
  COPIADOS=0
  for ORIGEM in "$ARQUIVO" "$ANEXOS"; do
    [[ -n "$ORIGEM" && -f "$ORIGEM" ]] || continue
    ALVO="$COPIA_PARA/$(basename "$ORIGEM")"
    cp -f "$ORIGEM" "$ALVO" || erro "Falha ao copiar para $COPIA_PARA. O backup LOCAL está íntegro em $DESTINO."
    # Tamanho conferido: cópia truncada por queda de rede é falha SILENCIOSA — o
    # arquivo existe, tem o nome certo, e só se descobre que não presta na restauração.
    [[ "$(stat -c%s "$ALVO")" == "$(stat -c%s "$ORIGEM")" ]] || erro "Cópia externa incompleta: $ALVO. Não confie nela."
    COPIADOS=$((COPIADOS + 1))
  done
  log "Cópia externa: $COPIADOS arquivo(s) em $COPIA_PARA"
  log "Retenção externa: $(expurgar "$COPIA_PARA") arquivo(s) com mais de $DIAS dias removido(s)"
else
  log 'AVISO: sem cópia externa (COPIA_PARA). O backup está na mesma máquina que ele protege.'
fi

# Retenção: só apaga DEPOIS de o backup novo estar no disco, verificado e copiado para
# fora. Apagar antes deixaria uma janela sem nenhum backup válido.
log "Retenção: $(expurgar "$DESTINO") arquivo(s) com mais de $DIAS dias removido(s)"
log 'Backup concluído.'
