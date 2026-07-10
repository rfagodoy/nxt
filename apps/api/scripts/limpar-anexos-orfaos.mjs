/* Varredura de anexos órfãos do storage local.
 *
 * O storage não tem integridade referencial: um arquivo só é "usado" porque alguma linha
 * do banco guarda a sua key. Exclusões antigas de contrato apagavam o registro e deixavam
 * o PDF para trás — invisível, sem dono e sem prazo.
 *
 * A partir de agora `ContractsService.remove` apaga os anexos junto. Este script existe
 * para o passivo (e para o dia em que alguém apagar um registro pelo banco).
 *
 *   node scripts/limpar-anexos-orfaos.mjs            → ensaio, não apaga nada
 *   node scripts/limpar-anexos-orfaos.mjs --apply    → apaga
 *
 * Só roda no driver `local`. Em R2, a varredura é outra (listar bucket).
 */
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const ROOT = path.resolve(import.meta.dirname, '..')

/* carrega o .env do apps/api sem depender de dotenv */
for (const l of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase()
if (driver !== 'local') {
  console.error(`STORAGE_DRIVER=${driver}: esta varredura só cobre o disco local.`)
  process.exit(1)
}
const dir = path.resolve(ROOT, process.env.STORAGE_DIR || 'uploads')
if (!existsSync(dir)) { console.log(`pasta ${dir} não existe — nada a fazer.`); process.exit(0) }

const prisma = new PrismaClient()
const J = s => { try { return JSON.parse(s || '[]') } catch { return [] } }

/* TODAS as keys referenciadas. Acrescentar aqui quando um novo tipo de anexo surgir. */
const referenciadas = new Set()
for (const c of await prisma.contract.findMany({ select: { documentos: true, aditivos: true, pagamentos: true, recebimentos: true } })) {
  for (const d of J(c.documentos))   if (d.arquivo_key)     referenciadas.add(d.arquivo_key)
  for (const a of J(c.aditivos))     if (a.arquivo_key)     referenciadas.add(a.arquivo_key)
  for (const l of J(c.pagamentos))   if (l.comprovante_key) referenciadas.add(l.comprovante_key)
  for (const l of J(c.recebimentos)) if (l.comprovante_key) referenciadas.add(l.comprovante_key)
}
await prisma.$disconnect()

/* o sidecar `<key>.meta.json` não é um arquivo próprio: é metadado do blob */
const blobs = readdirSync(dir).filter(f => !f.endsWith('.meta.json'))
const orfaos = blobs.filter(k => !referenciadas.has(k))

console.log(`storage ....... ${dir}`)
console.log(`blobs ......... ${blobs.length}`)
console.log(`referenciados . ${referenciadas.size}`)
console.log(`ÓRFÃOS ........ ${orfaos.length}`)

/* uma key referenciada sem blob é o inverso do órfão: um ponteiro para o vazio. Pior, e
   silencioso — o usuário clica no anexo e recebe um erro. Só reporta; não há o que apagar. */
const quebradas = [...referenciadas].filter(k => !existsSync(path.join(dir, k)))
if (quebradas.length) {
  console.log(`\n⚠ ${quebradas.length} referência(s) SEM arquivo no storage:`)
  for (const k of quebradas) console.log(`   ${k}`)
}

if (!orfaos.length) { console.log('\nnada a apagar.'); process.exit(0) }
for (const k of orfaos) console.log(`   ${k}`)

if (!APPLY) { console.log('\n>>> ENSAIO. Rode com --apply para apagar.'); process.exit(0) }

let n = 0
for (const k of orfaos) {
  for (const p of [path.join(dir, k), path.join(dir, `${k}.meta.json`)]) {
    if (existsSync(p)) { rmSync(p); n++ }
  }
}
console.log(`\n>>> APLICADO. ${n} arquivo(s) removido(s) (blobs + sidecars).`)
