#!/usr/bin/env node
/* Executa o Prisma CLI com a DATABASE_URL do lugar certo.
 *
 * Por que existe: os scripts db:deploy/db:status/db:migrate usavam `dotenv -e ...`,
 * um binário que NÃO está instalado neste repositório — os três falhavam com
 * "'dotenv' não é reconhecido". Como o deploy/README manda rodar `npm run db:deploy`
 * no servidor do cliente, o defeito apareceria na instalação.
 *
 * Regra de precedência, nesta ordem:
 *   1. DATABASE_URL já no ambiente (é o caso do servidor: o instalador a exporta);
 *   2. apps/api/.env (é o caso da máquina de desenvolvimento).
 *
 * O ambiente vence o arquivo de propósito: no servidor não existe apps/api/.env, e
 * um script que insistisse no arquivo simplesmente não rodaria lá.
 *
 * Uso: node tools/prisma-env.mjs migrate deploy
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA = join(RAIZ, 'packages', 'database', 'prisma', 'schema.prisma')
const require = createRequire(import.meta.url)

function carregarEnv(caminho) {
  if (!existsSync(caminho)) return {}
  const mapa = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let valor = m[2].trim()
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1)
    }
    mapa[m[1]] = valor
  }
  return mapa
}

const doArquivo = carregarEnv(join(RAIZ, 'apps', 'api', '.env'))
const env = { ...doArquivo, ...process.env }

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL não encontrada — nem no ambiente, nem em apps/api/.env.')
  console.error('No servidor, exporte a variável antes de rodar. Em desenvolvimento, crie apps/api/.env.')
  process.exit(1)
}

/* Resolve o Prisma CLI pelo package.json do pacote em vez de chamar `npx prisma`:
   no Windows, o Node 24 recusa executar `.cmd` sem shell, e passar por shell só para
   achar um binário que já está em node_modules é atalho desnecessário. */
const pkgPrisma = require.resolve('prisma/package.json')
const bin = require('prisma/package.json').bin
const relativo = typeof bin === 'string' ? bin : bin.prisma
const cli = join(dirname(pkgPrisma), relativo)

const args = process.argv.slice(2)
const temSchema = args.some((a) => a === '--schema' || a.startsWith('--schema='))
const finais = temSchema ? args : [...args, '--schema', SCHEMA]

const r = spawnSync(process.execPath, [cli, ...finais], { stdio: 'inherit', env, cwd: RAIZ })
process.exit(r.status ?? 1)
