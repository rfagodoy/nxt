#!/usr/bin/env node
/* Rotaciona a chave que cifra a senha do servidor de e-mail.
 *
 * Por que existe: a senha do SMTP é cifrada com `MAIL_ENCRYPTION_KEY` ou, na falta
 * dela, com o `AUTH_JWT_SECRET`. Trocar a chave — inclusive PASSAR a ter uma dedicada,
 * que é o caminho recomendado — torna a senha já gravada ilegível, e alguém tem de
 * reconfigurar o e-mail à mão. Em provedor com senha de aplicativo isso é pior do que
 * parece: o Google mostra a senha UMA vez, então "só reconfigurar" pode significar
 * gerar outra credencial.
 *
 * Este script decifra com a chave antiga e regrava com a nova, sem que ninguém precise
 * saber a senha. Serve tanto para adotar a chave dedicada quanto para rotacionar o
 * segredo depois — que é operação normal de segurança, e não deveria custar um incidente.
 *
 * Uso (com a API PARADA, para ninguém gravar no meio):
 *   node tools/rotate-mail-key.mjs --nova "<chave nova>"
 *   node tools/rotate-mail-key.mjs --nova "<nova>" --antiga "<antiga>"   (se não for a do .env)
 *   node tools/rotate-mail-key.mjs --gerar                               (gera e mostra uma chave forte)
 *
 * A chave antiga sai do ambiente (MAIL_ENCRYPTION_KEY, senão AUTH_JWT_SECRET), lido de
 * apps/api/.env como o resto das ferramentas.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

/* A criptografia vem do MESMO módulo que a API usa (compilado em dist), nunca de uma
   cópia: duas implementações de cripto divergem em silêncio, e o sintoma só aparece no
   dia em que a senha não decifra. */
const CAMINHO_CRIPTO = join(RAIZ, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'notifications', 'secret-box.js')
if (!existsSync(CAMINHO_CRIPTO)) {
  console.error('Build da API não encontrado. Rode "npm run build --workspace=@nxt/api" antes.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opcao = (nome) => {
  const i = args.indexOf(`--${nome}`)
  return i >= 0 ? args[i + 1] : undefined
}

if (args.includes('--gerar')) {
  console.log(randomBytes(48).toString('base64'))
  console.log('\nCopie para apps/api/.env como MAIL_ENCRYPTION_KEY e rode este script com --nova.')
  process.exit(0)
}

function carregarEnv() {
  const caminho = join(RAIZ, 'apps', 'api', '.env')
  const mapa = {}
  if (!existsSync(caminho)) return mapa
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m) mapa[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return mapa
}

const env = { ...carregarEnv(), ...process.env }
const nova = opcao('nova')
const antiga = opcao('antiga') ?? env.MAIL_ENCRYPTION_KEY ?? env.AUTH_JWT_SECRET

if (!nova) {
  console.error('Informe a chave nova: --nova "<chave>"  (ou --gerar para criar uma)')
  process.exit(1)
}
if (!antiga) {
  console.error('Não achei a chave ATUAL (MAIL_ENCRYPTION_KEY ou AUTH_JWT_SECRET em apps/api/.env). Use --antiga.')
  process.exit(1)
}
if (nova.trim().length < 16) {
  console.error('A chave nova precisa ter ao menos 16 caracteres.')
  process.exit(1)
}
if (nova === antiga) {
  console.error('A chave nova é igual à atual — nada a fazer.')
  process.exit(1)
}

const { PrismaClient } = require(join(RAIZ, 'node_modules', '@prisma', 'client'))
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })

/* Decifrar e cifrar dependem de process.env, então a chave é trocada em volta de cada
   chamada. Feio, mas é o preço de reusar exatamente o módulo da API em vez de copiar. */
const cripto = require(CAMINHO_CRIPTO)
const comChave = (chave, fn) => {
  const antes = process.env.MAIL_ENCRYPTION_KEY
  process.env.MAIL_ENCRYPTION_KEY = chave
  try { return fn() } finally {
    if (antes === undefined) delete process.env.MAIL_ENCRYPTION_KEY
    else process.env.MAIL_ENCRYPTION_KEY = antes
  }
}

const MAIL_SETTINGS_KEY = 'nxt:settings:smtp'

async function main() {
  const linhas = await prisma.appSetting.findMany({ where: { key: MAIL_SETTINGS_KEY } })
  if (linhas.length === 0) {
    console.log('Nenhuma configuração de e-mail gravada — nada a rotacionar.')
    console.log('Pode definir MAIL_ENCRYPTION_KEY no ambiente à vontade.')
    return
  }

  let trocadas = 0, semSenha = 0, falhas = 0

  for (const linha of linhas) {
    const cfg = typeof linha.value === 'string' ? JSON.parse(linha.value) : linha.value
    if (!cfg?.passwordEnc) { semSenha++; continue }

    let senha
    try {
      senha = comChave(antiga, () => cripto.decryptSecret(cfg.passwordEnc))
    } catch (e) {
      falhas++
      console.error(`  ✗ org ${linha.organizationId}: não decifrou com a chave atual (${e instanceof Error ? e.message : e})`)
      continue
    }
    if (senha === null || senha === undefined) {
      falhas++
      console.error(`  ✗ org ${linha.organizationId}: a chave atual não abre esta senha.`)
      continue
    }

    const novoEnc = comChave(nova, () => cripto.encryptSecret(senha))
    // conferência antes de gravar: recifrou e volta a abrir com a chave nova?
    const conferido = comChave(nova, () => cripto.decryptSecret(novoEnc))
    if (conferido !== senha) {
      falhas++
      console.error(`  ✗ org ${linha.organizationId}: a senha recifrada não confere. NADA foi gravado.`)
      continue
    }

    await prisma.appSetting.update({
      where: { id: linha.id },
      data: { value: JSON.stringify({ ...cfg, passwordEnc: novoEnc }) },
    })
    trocadas++
    console.log(`  ✓ org ${linha.organizationId}: senha do SMTP recifrada com a chave nova.`)
  }

  console.log(`\n${trocadas} recifrada(s) · ${semSenha} sem senha guardada · ${falhas} falha(s)`)
  if (trocadas > 0) {
    console.log('\nAgora defina no ambiente e reinicie a API:')
    console.log('  MAIL_ENCRYPTION_KEY=<a chave nova>')
    console.log('Depois, em Configurações → E-mail, use "Testar conexão" para confirmar.')
  }
  if (falhas > 0) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
