#!/usr/bin/env bash
# Registra no cron o backup diário e o restore de teste mensal.
#
# O backup existia, era verificado e tinha restore provado — e não rodava sozinho.
# Nenhum instalador criava agendamento: as linhas de cron ficavam num README, e
# backup que depende de alguém lembrar não é backup, é intenção.
#
# Cria /etc/cron.d/nxt-backup com duas entradas, como root:
#   · backup       — todo dia (padrão 02:00)
#   · restore-teste — todo dia 1º (padrão 03:00): restaura a cópia mais recente num
#                     banco paralelo e confere. É a única prova de que o arquivo presta.
#
# IDEMPOTENTE: reescreve o arquivo inteiro a cada execução.
#
# Uso:
#   sudo ./agendar-backup.sh
#   sudo COPIA_PARA=/mnt/nas/nxt ./agendar-backup.sh
#   sudo ./agendar-backup.sh --remover
#
# COPIA_PARA manda a cópia para FORA da máquina. Sem isso, o backup fica no mesmo
# disco que ele protege. O ponto de montagem precisa existir no boot (fstab), senão
# a tarefa grava num diretório vazio local achando que escreveu na rede.

set -euo pipefail

RAIZ=${RAIZ:-/opt/nxt}
CONFIG=${CONFIG:-/etc/nxt/api.env}
DESTINO=${DESTINO:-$RAIZ/backup}
STORAGE=${STORAGE:-$RAIZ/storage}
COPIA_PARA=${COPIA_PARA:-}
DIAS=${DIAS:-14}
HORA_BACKUP=${HORA_BACKUP:-2}       # hora do backup diário (0-23)
HORA_RESTORE=${HORA_RESTORE:-3}     # hora do restore de teste
DIA_DO_MES=${DIA_DO_MES:-1}
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON=/etc/cron.d/nxt-backup
LOGS=${LOGS:-$RAIZ/logs}

ok()    { printf '  OK  %s\n' "$1"; }
aviso() { printf '  !   %s\n' "$1"; }
erro()  { printf '\nFALHOU: %s\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || erro 'Rode como root (escrever em /etc/cron.d exige).'

if [[ "${1:-}" == "--remover" ]]; then
  rm -f "$CRON" && ok "cron removido: $CRON"
  exit 0
fi

[[ -f "$AQUI/backup-nxt.sh"   ]] || erro "Script não encontrado: $AQUI/backup-nxt.sh"
[[ -f "$AQUI/test-restore.sh" ]] || erro "Script não encontrado: $AQUI/test-restore.sh"
# O repositório vive num Windows: os .sh chegam sem bit de execução, e o cron não
# reclama — apenas não roda. Garantir aqui é mais barato que descobrir depois.
chmod +x "$AQUI/backup-nxt.sh" "$AQUI/test-restore.sh"
[[ -f "$CONFIG" ]] || aviso "$CONFIG ainda não existe — a tarefa vai falhar até o Nxt ser instalado."

mkdir -p "$LOGS" "$DESTINO"

# Variáveis vão no PRÓPRIO arquivo de cron: o cron não herda o ambiente de quem
# instalou, e uma tarefa que depende de export no .bashrc funciona no teste e falha
# na madrugada.
{
  echo "# Backup do Nxt — gerado por deploy/backup/agendar-backup.sh (não editar à mão)"
  echo 'SHELL=/bin/bash'
  echo 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/mssql-tools18/bin'
  echo "CONFIG=$CONFIG"
  echo "DESTINO=$DESTINO"
  echo "STORAGE=$STORAGE"
  echo "DIAS=$DIAS"
  [[ -n "$COPIA_PARA" ]] && echo "COPIA_PARA=$COPIA_PARA"
  echo ""
  echo "0 $HORA_BACKUP * * * root $AQUI/backup-nxt.sh >> $LOGS/backup.log 2>&1"
  echo "0 $HORA_RESTORE $DIA_DO_MES * * root $AQUI/test-restore.sh >> $LOGS/restore-teste.log 2>&1"
} > "$CRON"

chmod 644 "$CRON"   # o cron IGNORA arquivo com permissão frouxa, sem avisar
ok "cron escrito: $CRON"
ok "backup diário às ${HORA_BACKUP}:00 · restore de teste dia $DIA_DO_MES às ${HORA_RESTORE}:00"

if [[ -z "$COPIA_PARA" ]]; then
  aviso 'Sem COPIA_PARA: o backup fica na MESMA máquina que ele protege. Aponte para um NAS montado ou disco externo.'
fi

echo ''
echo '  Prove agora, sem esperar o horário:'
echo "    CONFIG=$CONFIG DESTINO=$DESTINO ${COPIA_PARA:+COPIA_PARA=$COPIA_PARA }$AQUI/backup-nxt.sh"
echo "    tail -30 $LOGS/backup.log"
