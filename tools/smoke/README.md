# Smokes de fluxo (workflow)

Roteiros que exercitam o motor **de ponta a ponta contra a API rodando**: iniciar
processo, delegar, cancelar, varrer prazos. Não entram no CI de propósito — exigem
SQL Server e a API de pé, e um pipeline que depende de banco falha por motivo errado
com frequência suficiente para as pessoas pararem de olhar para ele.

O que dá para verificar **sem** banco já é teste automatizado e roda no CI:

| Regra | Onde |
|---|---|
| Quem recebe o aviso, dedup, e-mail sim/não | `apps/api/src/notifications/notification-rules.test.ts` |
| Parâmetros de prazo e reaviso | `apps/api/src/notifications/notification-params.test.ts` |
| Quem pode cancelar uma instância | `apps/api/src/instances/instance-access.test.ts` |
| Tempo útil até o vencimento | `packages/workflow-core/test/business-time.test.ts` |
| Rótulos de pontualidade e histórico | `apps/web/src/lib/processos-ui.test.ts` |

## Como rodar

Com a API em `http://localhost:3001` e o banco no ar:

```bash
# 1) semeia o workflow de teste e um segundo usuário
node tools/smoke/run-with-env.mjs tools/smoke/seed-notificacoes.mjs

# 2) bordas: aviso, delegação, cancelamento com motivo  (20 verificações)
node tools/smoke/smoke-notificacoes.mjs

# 3) prazos: preventivo, vencido, idempotência, parâmetro desligado  (8 verificações)
node tools/smoke/run-with-env.mjs tools/smoke/smoke-prazos.mjs

# 4) ativação exige tipo do workflow  (5 verificações)
node tools/smoke/smoke-ativar-tipo.mjs

# 5) recuperação de senha  (14 verificações)
node tools/smoke/run-with-env.mjs tools/smoke/smoke-reset-senha.mjs

# 6) importação de planilha  (22 verificações)
node tools/smoke/run-with-env.mjs tools/smoke/smoke-import.mjs

# 7) ESCALA — gera massa, mede e limpa (padrão 2000; passe outro número)
node tools/smoke/run-with-env.mjs tools/smoke/smoke-escala.mjs 2000

# 8) auditoria de campos personalizados  (11 verificações)
node tools/smoke/run-with-env.mjs tools/smoke/smoke-auditoria-custom.mjs
```

O smoke 7 é o único que **cria milhares de registros**. Ele limpa tudo ao final (marca
`ESCALA-TESTE`), mas leva alguns minutos e não deve rodar em base real. Medições com
2000 contratos + 2000 parceiros (máquina de desenvolvimento, SQL Server em contêiner):
listagem 1,3s · dashboard 260ms · relatório completo 263ms · import ~40ms por registro.

O smoke 5 cria e **remove** o próprio usuário de teste, e não envia e-mail: insere o
token direto no banco, como o serviço faria. Mandar mensagem de verdade para um
endereço inventado geraria quique e sujaria a reputação do remetente.

`run-with-env.mjs` existe porque o Prisma standalone não enxerga o `.env` do app:
ele carrega o `DATABASE_URL` de `apps/api/.env` antes de chamar o script. Os smokes
que só falam HTTP (2 e 4) dispensam esse embrulho.

A senha do usuário de teste vem de `SMOKE_PASS` (padrão: a do ambiente local de
desenvolvimento). **Não** aponte estes scripts para uma base real: eles criam,
cancelam e apagam registros.

## Limpeza

O seed é idempotente — rodar de novo recria o workflow `ZZ Notificacoes (SMOKE)` e
apaga a execução anterior. O usuário `bruno.teste@nxt.local` permanece; remova-o pela
tela de Usuários quando não precisar mais.
