# Implantação do Nxt

Como o Nxt chega numa máquina que não é a de quem o escreveu — e sobrevive lá.

| Pasta | O que é |
|---|---|
| `windows/` | Instalador PowerShell + serviços via WinSW |
| `linux/` | Instalador shell + units do systemd |
| `nginx/` | Proxy reverso com TLS (serve aos dois sistemas) |
| `backup/` | Backup do banco e dos anexos + **teste de restore** |

## Instalação em um comando

Os instaladores são **idempotentes**: rodar de novo **atualiza** a aplicação sem
recriar segredo, sem reprovisionar o administrador e sem tocar no banco além das
migrações pendentes. É o mesmo comando para instalar e para atualizar.

**Windows** (como Administrador):

```powershell
.\deploy\windows\install-nxt.ps1 `
   -DatabaseUrl "sqlserver://SRVSQL:1433;database=nxt;user=nxt_app;password=***;encrypt=true" `
   -AdminEmail "ti@empresa.com.br" -AdminPassword "<senha forte>" -OrgName "Empresa LTDA" `
   -WinSwPath C:\nxt\tools\WinSW.exe
```

**Linux** (como root):

```bash
sudo ./deploy/linux/install-nxt.sh \
   --database-url 'sqlserver://SRVSQL:1433;database=nxt;user=nxt_app;password=***;encrypt=true' \
   --admin-email ti@empresa.com.br --admin-password '<senha forte>' --org-name 'Empresa LTDA'
```

O que o instalador faz: confere pré-requisitos → cria a estrutura → copia a aplicação
(espelhando, para não deixar restos da versão anterior) → **gera os segredos e os
preserva** → aplica as migrações → provisiona o administrador → registra os serviços.

O que ele **não** faz, de propósito: instalar Node, SQL Server ou Nginx; emitir
certificado; mexer em firewall. Política de infraestrutura é do cliente.

### Antes de rodar

1. `npm run build` na origem — o instalador recusa origem sem build.
2. Node 20+ instalado na máquina de destino.
3. Banco criado e alcançável, com **usuário de aplicação** — ver abaixo.

### Usuário de banco (não use `sa`)

```bash
sqlcmd -S SERVIDOR -U sa -P *** -C -i deploy/sql/criar-usuario-aplicacao.sql \
       -v BANCO="nxt" LOGIN="nxt_app" SENHA="<senha forte e única>"
```

Cria um login sem nenhum papel de servidor e um usuário com o mínimo que o Nxt precisa:
`db_datareader`, `db_datawriter` e `db_ddladmin` (este último porque as migrações rodam
na implantação). **Não** entra em `db_owner`.

Com `sa`, uma falha de injeção ou o vazamento de um único `.env` entrega a **instância
inteira** do SQL Server — outros bancos, logins, jobs —, não só o banco do Nxt.

Verificado em SQL Server 2022: com esse usuário, `CREATE LOGIN`, `CREATE DATABASE` e
`DROP DATABASE` são negados; leitura, gravação e migrações funcionam. Ele ainda enxerga
o **nome** de alguns logins da instância — metadados que o SQL Server expõe por padrão;
nome, nunca senha.

Se a política do cliente exigir separar quem migra de quem opera, o próprio arquivo traz
o bloco pronto no fim, com o custo da escolha.

### Sobre os segredos

`AUTH_JWT_SECRET` e `MAIL_ENCRYPTION_KEY` são gerados na primeira instalação e
**preservados** nas seguintes. Não é detalhe: regerar o primeiro desloga todos os
usuários; regerar o segundo torna a senha de e-mail guardada impossível de decifrar.

Os arquivos de configuração ficam fora da pasta da aplicação, com permissão restrita
(Windows: só SYSTEM e Administradores; Linux: `640 root:nxt`). **Não anexe `api.env` em
chamado de suporte** — ele tem a senha do banco e o segredo de assinatura dos tokens.

### Rotacionar a chave de criptografia do e-mail

A senha do SMTP é cifrada com `MAIL_ENCRYPTION_KEY` ou, na falta dela, com o
`AUTH_JWT_SECRET`. Trocar essa chave — inclusive **passar a ter** uma dedicada — torna a
senha já gravada ilegível.

```bash
node tools/rotate-mail-key.mjs --gerar                 # sugere uma chave forte
node tools/rotate-mail-key.mjs --nova "<chave nova>"   # recifra a senha guardada
# só então: defina MAIL_ENCRYPTION_KEY no ambiente e reinicie a API
```

Com a API **parada**, para ninguém gravar no meio. O script decifra com a chave atual,
recifra com a nova e **confere antes de gravar**; se a conferência falhar, não grava.

Sem ele, "reconfigure o e-mail" pode custar caro: provedor com senha de aplicativo
(Gmail, por exemplo) mostra a senha **uma única vez**, então quem não guardou precisa
gerar outra credencial.

### Administrador inicial

O seed **recusa** subir em produção com os valores de exemplo (`admin@nxt.local` /
senha publicada neste repositório), e também recusa e-mail de domínio que não existe
fora da máquina. Falhar na instalação custa um minuto; descobrir depois custa um
incidente — foi o que aconteceu aqui, com aviso do sistema quicando de volta.

## Banco de dados

| Comando | Quando usar |
|---|---|
| `npm run db:deploy` | **No servidor**, a cada atualização. Aplica migrações pendentes. |
| `npm run db:status` | Conferir se o banco está na versão do código. |
| `npm run db:migrate` | **Só em desenvolvimento**: cria migração nova a partir do schema. |

A API tem trava de boot e **recusa subir** com migração pendente, dizendo qual falta e
o comando que resolve. Sem a trava, ela subiria e quebraria na primeira consulta que
tocasse a coluna nova — em produção.

⚠️ `prisma db push` não deve mais ser usado: altera o banco sem registrar histórico.

**Banco vindo de instalação antiga (que usava `db push`)** — marque a migração inicial
como aplicada, uma única vez:

```bash
npx prisma migrate resolve --applied 0_init --schema packages/database/prisma/schema.prisma
```

## TLS

`nginx/nxt.conf` termina o TLS e distribui entre web (3000) e API (3001). Ajuste
`server_name` e os caminhos do certificado antes de subir.

Sem isso, senha e token trafegam em claro — é o item que reprova homologação de
segurança antes de qualquer conversa sobre funcionalidade.

Dois cuidados registrados no próprio arquivo: o HSTS fica **comentado** até o HTTPS
estar funcionando (ligado cedo com certificado errado, tranca o navegador do cliente
fora do sistema e não há como desfazer do servidor); e os cabeçalhos de segurança
**não** são repetidos no Nginx, porque a aplicação já os emite e duplicar quebraria a CSP.

## Backup — e a prova de que ele presta

```
backup/backup-sqlserver.sql    BACKUP DATABASE + RESTORE VERIFYONLY (a lógica mora aqui)
backup/restore-sqlserver.sql   restore com MOVE lido do próprio backup
backup/backup-nxt.{sh,ps1}     agendável: banco + anexos + retenção
backup/test-restore.{sh,ps1}   restaura num banco paralelo e CONFERE
```

Agendar as duas rotinas:

```bash
# Linux (root)
0 2 * * * /opt/nxt/deploy/backup/backup-nxt.sh    >> /opt/nxt/logs/backup.log 2>&1
0 3 1 * * /opt/nxt/deploy/backup/test-restore.sh  >> /opt/nxt/logs/restore-teste.log 2>&1
```

No Windows, as mesmas duas no Agendador de Tarefas, executando como SYSTEM.

**O `test-restore` não é opcional.** Backup nunca restaurado é esperança, não proteção:
ele restaura em `<banco>_restore_teste`, confere que os dados chegaram lá e remove o
banco de teste. Nunca toca produção — e o `restore-sqlserver.sql` **recusa** ter o banco
de produção como alvo a menos que se passe `PERMITIR_PRODUCAO="sim"`, porque o script
derruba o destino antes de restaurar.

Três coisas que o backup cobre e costumam faltar em rotina caseira:

- **Os anexos vão junto.** Documentos ficam fora do banco; restaurar só o banco devolve
  um sistema com links apontando para arquivos que não existem mais.
- **A retenção só apaga depois** de o backup novo existir e passar na verificação —
  apagar antes deixa uma janela sem nenhuma cópia válida.
- **O arquivo é conferido** (`CHECKSUM` + `RESTORE VERIFYONLY`): corrupção que só
  aparece no restore aparece no pior dia possível.

⚠️ O `DESTINO` precisa ser um caminho que **o serviço do SQL Server** enxergue — quem
grava o `.bak` é ele, não o script. Com o banco em outra máquina, use um caminho de rede
ao qual a conta do serviço tenha acesso. O script detecta esse caso e falha com essa
explicação em vez de dizer que deu certo.

⚠️ E o mais importante: **backup que não sai da máquina não protege contra a perda da
máquina.** Copiar a pasta para fora (fita, NAS, objeto) é rotina de infraestrutura do
cliente e está fora do escopo destes scripts.

## Reinício automático

Nos dois sistemas o serviço volta sozinho após queda, com espera crescente e **teto de
5 tentativas**. O teto é proposital: quando a causa é permanente — banco fora, migração
pendente, segredo ausente — reiniciar para sempre não conserta e ainda esconde o
problema. Serviço parado aparece no monitoramento; serviço em laço, não.

## Verificação depois de instalar

```powershell
Get-Service nxt-*                       # Windows
Get-Content C:\nxt\logs\nxt-api.out.log -Tail 50
```
```bash
systemctl status nxt-api nxt-web        # Linux
journalctl -u nxt-api -f
```

## Ainda não coberto

TLS **emitido** (o `.conf` existe, o certificado é do cliente) · cópia do backup para
fora da máquina · usuário de banco com privilégio mínimo documentado · retenção/LGPD ·
pacote de instalação (hoje se copia a pasta construída) · monitoramento externo.

## Nota para quem for editar estes scripts

`.ps1` **precisa** de BOM UTF-8: o PowerShell 5.1 do Windows Server lê arquivo sem BOM
como ANSI e o parser quebra em qualquer acento — o instalador nem chega a rodar. O
pwsh 7 da máquina de desenvolvimento aceita sem BOM, então o erro só aparece no cliente.
`.sh` precisa de fim de linha LF, senão vira `bad interpreter: /bin/bash^M`.

O CI confere os dois (`tools/check-deploy-scripts.mjs`).
