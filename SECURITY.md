# Segurança do Nxt

Resumo da postura de segurança e **checklist obrigatório antes de produção**.

## O que já está implementado (no código)

- **Autenticação própria**: access token JWT curto (15 min) + refresh opaco (7 dias) com rotação e **detecção de reuso**; senha em `scrypt` + `timingSafeEqual`; lockout de conta (5 falhas) + throttle por IP no login; auditoria de login e de ações (autor vindo do token, não forjável).
- **BFF**: o browser fala só com `/bff/*` (mesma origem); o access token vive só em cookie `httpOnly` e é anexado no servidor — **fora do alcance do JavaScript**. Refresh com **single-flight**. Mutações exigem **`Origin` same-origin** (CSRF).
- **Isolamento multi-tenant**: toda consulta é escopada por `organizationId` do token; RBAC (`@Roles('admin')`) nas operações administrativas; DTOs com whitelist (`forbidNonWhitelisted`).
- **Headers**: `helmet` na API; CSP + `X-Frame-Options: DENY` + `Referrer-Policy` + `Permissions-Policy` no web; `connect-src 'self'`.
- **Arquivos**: upload sanitiza nome + limite 25 MB; download bloqueia path traversal, valida a org dona da key e serve só `Content-Type` de allow-list segura (anti-XSS armazenado).
- **Rate-limit global** (`@nestjs/throttler`) como rede de segurança.
- **CI**: `.github/workflows/ci.yml` roda build + testes + portão de auditoria (`npm run audit:gate`). **Falha em qualquer HIGH/CRITICAL de runtime** que não esteja nomeado em `security/audit-allowlist.json` com justificativa e data de revisão — advisory novo reprova, conhecido passa e aparece no relatório. Devdeps ficam de fora do bloqueio (CVE de ferramenta de build não chega ao cliente) e saem no passo informativo.

## ✅ Checklist PRÉ-PRODUÇÃO (itens de deploy — obrigatórios)

### Segredos
- [ ] `AUTH_JWT_SECRET` **único por ambiente**, aleatório 64+ chars (`openssl rand -base64 48`). Nunca reutilizar entre ambientes; nunca commitar.
- [x] Senha do banco: usuário **least-privilege** (NÃO usar `sa`) — script pronto e verificado em `deploy/sql/criar-usuario-aplicacao.sql`. **Falta aplicar** nos ambientes: a criação do usuário é do DBA do cliente.
- [ ] Chaves de storage (R2/S3) e demais segredos via **cofre/variáveis de ambiente** do orquestrador — nunca no repositório nem em imagem.

### Transporte
- [ ] **TLS/HTTPS** terminado no reverse proxy; redirect http→https. (O `Strict-Transport-Security` só tem efeito sob HTTPS.)
- [ ] `secure: true` nos cookies (já ligado quando `NODE_ENV=production`).

### Dados
- [x] **Backup** automatizado do banco + teste de restauração — `deploy/backup/` (backup + `test-restore`, exercitado de verdade). O instalador **agenda** as duas rotinas, e `-CopiaPara`/`COPIA_PARA` leva a cópia para um segundo destino, com conferência de tamanho. **Falta** apontar esse destino para fora do prédio (fita/nuvem) e **cifrar o `.bak`**, que é decisão de infraestrutura do cliente.
- [ ] **Encryption at rest** do banco e do storage de anexos.
- [ ] Retenção/limpeza de PII (LGPD): política para dados de parceiros e logs de auditoria.

### Escala (só se multi-nó)
- [ ] Throttle por IP e o global migram para **storage compartilhado (Redis)** — o atual é in-memory (ok para VM única).

### Operação
- [ ] **Monitoramento/alerta** sobre anomalias de auth: usar `LoginEvent` (falhas, lockouts) e hits de throttle.
- [ ] Rodar o CI (dependency scanning) em todo push/PR; revisar `npm audit` periodicamente.
- [ ] **Pentest formal** antes do GA — a auditoria interna cobriu as classes principais, mas não substitui teste independente.

## Vulnerabilidades de dependência (aceitas conscientemente)
A lista viva, com justificativa e prazo de revisão por item, está em
**`security/audit-allowlist.json`** — é ela que o portão do CI consulta.

**Revisão de 2026-07-27: produção está sem NENHUM advisory `high`.** A lista caiu de 9
itens para 1 (`uuid`, moderate, que não bloqueia o portão).

O que mudou: a cadeia toda vinha de versões antigas que o `exceljs` fixa. Forçar por
`overrides` o `archiver` 8 e o `unzipper` 0.12 — que ele consome — eliminou de uma vez
`archiver`, `archiver-utils`, `zip-stream`, `readdir-glob`, `glob`, `rimraf`,
`minimatch` e `brace-expansion`. Escrita e releitura de `.xlsx` foram verificadas
(valores, números e formatação preservados).

Fica a lição para a próxima revisão: os itens estavam marcados como "sem correção
possível", e a correção existia — só não vinha do mantenedor do `exceljs` (parado na
4.4.0 desde dezembro/2024), e sim de atualizar o que **ele consome**.

⚠️ **NUNCA rodar `npm audit fix --force`** neste repositório: ele propõe downgrade
destrutivo (`next`→9, `exceljs`→3).

⚠️ `overrides` do npm só entram numa árvore realmente nova — é preciso apagar
`node_modules` **e** `package-lock.json` juntos. Com um dos dois no lugar, o npm
reaproveita a resolução antiga **em silêncio**, sem erro nem aviso.
