# Implantação do Nxt

O que existe aqui resolve um problema específico e concreto: **o Node encerra o
processo em falhas fatais**. Sem supervisor, a API cai e não volta — o sistema fica
fora do ar até alguém perceber e reiniciar à mão. Serviço do Windows e unit do
systemd fazem o sistema operacional cuidar disso.

## Ordem de instalação

1. Copiar a aplicação já construída para o servidor (`npm run build` na origem).
2. Criar os arquivos de ambiente **fora do repositório** (segredos).
3. **Aplicar as migrações**: `npm run db:deploy`.
4. Registrar e iniciar os serviços (API primeiro, web depois).

O passo 3 não é opcional: a API tem trava de boot e **recusa subir** com migração
pendente, dizendo qual falta e o comando que resolve. É deliberado — sem a trava, ela
subiria e quebraria na primeira consulta que tocasse a coluna nova, em produção.

## Banco de dados

| Comando | Quando usar |
|---|---|
| `npm run db:deploy` | **No servidor**, a cada atualização. Aplica migrações pendentes. |
| `npm run db:status` | Conferir se o banco está na versão do código. |
| `npm run db:migrate` | **Só em desenvolvimento**: cria uma migração nova a partir do schema. |

⚠️ `prisma db push` não deve mais ser usado: ele altera o banco sem registrar
histórico, e foi exatamente o que impedia saber em que versão o banco do cliente
estava.

### Banco vindo de instalação antiga (que usava `db push`)

O schema já está correto, mas o banco não tem o registro das migrações. Marque a
migração inicial como aplicada, **uma única vez**:

```bash
npx prisma migrate resolve --applied 0_init --schema packages/database/prisma/schema.prisma
```

## Windows Server

Usa [WinSW](https://github.com/winsw/winsw) (MIT) — um executável que embrulha um
processo comum num serviço do Windows. Baixe o `WinSW.exe` **antes** e leve para o
servidor: instalação on-premise costuma ser em máquina sem internet.

```powershell
# Como Administrador
.\deploy\windows\install-services.ps1 -WinSwPath C:\nxt\tools\WinSW.exe -Root C:\nxt

npm run db:deploy
Start-Service nxt-api
Start-Service nxt-web
```

Estrutura esperada:

```
C:\nxt\
  apps\api\        aplicação construída (dist)
  apps\web\        aplicação construída (.next)
  config\api.env   segredos da API   (fora do repositório)
  config\web.env   ambiente da web
  logs\            logs dos serviços, com rotação diária (14 dias)
  services\        WinSW.exe + XML de cada serviço
```

Verificação: `Get-Service nxt-*` · logs em `C:\nxt\logs\nxt-api.out.log`.

## Linux (systemd)

```bash
sudo cp deploy/linux/nxt-*.service /etc/systemd/system/
sudo systemctl daemon-reload
npm run db:deploy
sudo systemctl enable --now nxt-api nxt-web
```

Verificação: `systemctl status nxt-api` · logs em `journalctl -u nxt-api -f`.

## Reinício: o que está configurado e por quê

Nos dois sistemas, o serviço reinicia sozinho em caso de queda, com **espera
crescente** e **teto de tentativas** (5 falhas seguidas param o serviço).

O teto é proposital. Quando a causa é permanente — banco fora, migração pendente,
segredo ausente — reiniciar para sempre não conserta nada e ainda esconde o problema
num log que ninguém lê. Serviço parado aparece no monitoramento; serviço em laço, não.

## Ainda não coberto aqui

Estes pontos continuam abertos no roadmap de implantação e **não** são resolvidos por
estes arquivos: TLS/HTTPS na frente da aplicação, rotina de backup e restore testada,
usuário de banco com privilégio mínimo, e o instalador propriamente dito (hoje a
cópia dos arquivos é manual).
