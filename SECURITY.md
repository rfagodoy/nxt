# Segurança do Nxt

Resumo da postura de segurança e **checklist obrigatório antes de produção**.

## O que já está implementado (no código)

- **Autenticação própria**: access token JWT curto (15 min) + refresh opaco (7 dias) com rotação e **detecção de reuso**; senha em `scrypt` + `timingSafeEqual`; lockout de conta (5 falhas) + throttle por IP no login; auditoria de login e de ações (autor vindo do token, não forjável).
- **BFF**: o browser fala só com `/bff/*` (mesma origem); o access token vive só em cookie `httpOnly` e é anexado no servidor — **fora do alcance do JavaScript**. Refresh com **single-flight**. Mutações exigem **`Origin` same-origin** (CSRF).
- **Isolamento multi-tenant**: toda consulta é escopada por `organizationId` do token; RBAC (`@Roles('admin')`) nas operações administrativas; DTOs com whitelist (`forbidNonWhitelisted`).
- **Headers**: `helmet` na API; CSP + `X-Frame-Options: DENY` + `Referrer-Policy` + `Permissions-Policy` no web; `connect-src 'self'`.
- **Arquivos**: upload sanitiza nome + limite 25 MB; download bloqueia path traversal, valida a org dona da key e serve só `Content-Type` de allow-list segura (anti-XSS armazenado).
- **Rate-limit global** (`@nestjs/throttler`) como rede de segurança.
- **CI**: `.github/workflows/ci.yml` roda build + testes + `npm audit` (falha em HIGH/CRITICAL de runtime).

## ✅ Checklist PRÉ-PRODUÇÃO (itens de deploy — obrigatórios)

### Segredos
- [ ] `AUTH_JWT_SECRET` **único por ambiente**, aleatório 64+ chars (`openssl rand -base64 48`). Nunca reutilizar entre ambientes; nunca commitar.
- [ ] Senha do banco: usuário **least-privilege** (NÃO usar `sa`); rotacionável.
- [ ] Chaves de storage (R2/S3) e demais segredos via **cofre/variáveis de ambiente** do orquestrador — nunca no repositório nem em imagem.

### Transporte
- [ ] **TLS/HTTPS** terminado no reverse proxy; redirect http→https. (O `Strict-Transport-Security` só tem efeito sob HTTPS.)
- [ ] `secure: true` nos cookies (já ligado quando `NODE_ENV=production`).

### Dados
- [ ] **Backup** automatizado do banco + teste de restauração.
- [ ] **Encryption at rest** do banco e do storage de anexos.
- [ ] Retenção/limpeza de PII (LGPD): política para dados de parceiros e logs de auditoria.

### Escala (só se multi-nó)
- [ ] Throttle por IP e o global migram para **storage compartilhado (Redis)** — o atual é in-memory (ok para VM única).

### Operação
- [ ] **Monitoramento/alerta** sobre anomalias de auth: usar `LoginEvent` (falhas, lockouts) e hits de throttle.
- [ ] Rodar o CI (dependency scanning) em todo push/PR; revisar `npm audit` periodicamente.
- [ ] **Pentest formal** antes do GA — a auditoria interna cobriu as classes principais, mas não substitui teste independente.

## Vulnerabilidades de dependência (aceitas conscientemente)
`npm audit` reporta 4 moderadas residuais (`postcss` via `next`, `uuid` via `exceljs`) cujo "fix" do npm é **downgrade destrutivo** (`next`→9, `exceljs`→3). São build-time / baixo risco prático; aguardam patch upstream não-major. **NUNCA rodar `npm audit fix --force`** neste repositório.
