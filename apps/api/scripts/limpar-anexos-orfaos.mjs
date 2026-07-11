/* Varredura de anexos órfãos do storage.
 *
 * O storage não tem integridade referencial: um arquivo só é "usado" porque alguma linha do
 * banco guarda a sua key. Exclusões antigas de contrato apagavam o registro e deixavam o PDF
 * para trás — invisível, sem dono e sem prazo. Além disso, por design, remover/substituir um
 * anexo na UI e SALVAR deixa o blob antigo órfão (recolhido aqui, nunca apagado no clique).
 *
 * `ContractsService.remove` já apaga os anexos do contrato excluído, e o `update` apaga o que
 * for removido/substituído no salvar. A varredura AGENDADA (ContractScheduler.sweepOrphans)
 * roda isto todo dia. Este script é o modo MANUAL — para o passivo, exclusões feitas direto
 * no banco, on-prem offline, ou auditoria (ensaio).
 *
 *   node scripts/limpar-anexos-orfaos.mjs                 → ensaio, não apaga nada
 *   node scripts/limpar-anexos-orfaos.mjs --apply         → apaga (respeita a janela de graça)
 *   node scripts/limpar-anexos-orfaos.mjs --apply --grace-hours=0  → sem graça (só sem usuários)
 *
 * Cobre os dois drivers (STORAGE_DRIVER): `local` (disco) e `r2`/`s3` (lista o bucket).
 *
 * JANELA DE GRAÇA (default 48h): um blob recém-enviado cujo contrato ainda não foi salvo NÃO
 * é reapado — senão a limpeza vira perda de arquivo. Idade desconhecida também é protegida.
 *
 * SEGURANÇA — reconhecimento por SHAPE da key, não por lista de campos. Toda key tem o
 * formato `<orgId>__<uuid-v4>__<nome>` (files.controller.ts). A varredura extrai TODA key
 * key-shaped de CADA linha de contrato (campo a campo, serializado ou não). Assim é
 * impossível tratar um anexo real como órfão só porque o campo dele não está numa lista — que
 * seria apagar um arquivo vivo. Espelha collectAttachmentKeys() em src/files/attachment-keys.ts.
 */
import { readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
/* Janela de graça: não reapa blob recém-enviado cujo contrato ainda não foi salvo (mesma
   guarda da varredura agendada). `--grace-hours=0` desliga — use só sem usuários ativos. */
const graceArg = process.argv.find(a => a.startsWith('--grace-hours='))
const GRACE_H = graceArg ? Math.max(0, Number(graceArg.split('=')[1]) || 0) : 48
const ROOT = path.resolve(import.meta.dirname, '..')

/* carrega o .env do apps/api sem depender de dotenv */
for (const l of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(l.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

/* Mesma assinatura de src/files/attachment-keys.ts — mantê-las iguais. */
const KEY_G = /[\w.-]+__[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__[\w.-]*/gi

/* ── conjunto de keys REFERENCIADAS: varre a linha inteira de cada contrato, sem depender de
   quais campos guardam anexo (documentos, aditivos, comprovantes de parcela, ou o que vier) */
const prisma = new PrismaClient()
const contratos = await prisma.contract.findMany()
const referenciadas = new Set()
for (const row of contratos)
  for (const k of JSON.stringify(row).match(KEY_G) ?? []) referenciadas.add(k)
await prisma.$disconnect()

/* ── driver de storage: como LISTAR as keys existentes e como APAGAR uma ────────────────── */
const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase()
let listar, apagar, onde

if (driver === 'local') {
  const dir = path.resolve(ROOT, process.env.STORAGE_DIR || 'uploads')
  onde = dir
  if (!existsSync(dir)) { console.log(`pasta ${dir} não existe — nada a fazer.`); process.exit(0) }
  /* o sidecar `<key>.meta.json` não é um arquivo próprio: é metadado do blob */
  listar = () => readdirSync(dir).filter(f => !f.endsWith('.meta.json')).map(k => {
    let mtime; try { mtime = statSync(path.join(dir, k)).mtime } catch { /* idade desconhecida */ }
    return { key: k, mtime }
  })
  apagar = (k) => { for (const p of [path.join(dir, k), path.join(dir, `${k}.meta.json`)]) if (existsSync(p)) rmSync(p) }
} else if (driver === 'r2' || driver === 's3') {
  const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const bucket = process.env.R2_BUCKET
  const accountId = process.env.R2_ACCOUNT_ID
  onde = `${driver}://${bucket}`
  const client = new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
  listar = async () => {
    const objs = []
    let token
    do {
      const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
      for (const o of out.Contents ?? []) if (o.Key) objs.push({ key: o.Key, mtime: o.LastModified })
      token = out.IsTruncated ? out.NextContinuationToken : undefined
    } while (token)
    return objs
  }
  apagar = (k) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }))
} else {
  console.error(`STORAGE_DRIVER=${driver} desconhecido (esperado: local | r2 | s3).`)
  process.exit(1)
}

const blobs = await listar()
const naoRef = blobs.filter(b => !referenciadas.has(b.key))
/* só apaga o que SABIDAMENTE passou da janela de graça; idade desconhecida = protege */
const limite = Date.now() - GRACE_H * 3_600_000
const orfaos    = naoRef.filter(b => b.mtime instanceof Date && b.mtime.getTime() <= limite).map(b => b.key)
const protegidos = naoRef.filter(b => !(b.mtime instanceof Date && b.mtime.getTime() <= limite)).map(b => b.key)

console.log(`storage ....... ${onde}`)
console.log(`contratos ..... ${contratos.length}`)
console.log(`blobs ......... ${blobs.length}`)
console.log(`referenciados . ${referenciadas.size}`)
console.log(`ÓRFÃOS ........ ${orfaos.length}${protegidos.length ? ` (+${protegidos.length} na janela de graça de ${GRACE_H}h)` : ''}`)

/* uma key referenciada sem blob é o inverso do órfão: um ponteiro para o vazio. Pior, e
   silencioso — o usuário clica no anexo e recebe um erro. Só reporta; não há o que apagar. */
const existentes = new Set(blobs.map(b => b.key))
const quebradas = [...referenciadas].filter(k => !existentes.has(k))
if (quebradas.length) {
  console.log(`\n⚠ ${quebradas.length} referência(s) SEM arquivo no storage:`)
  for (const k of quebradas) console.log(`   ${k}`)
}

/* TRAVA anti-destruição: se há contratos mas NENHUMA referência foi reconhecida, o scan está
   quebrado (formato de key mudou? banco vazio por engano?). Apagar aqui trataria TODO blob
   como órfão e limparia o storage inteiro. Recusa o --apply — na dúvida, não apaga. */
if (APPLY && contratos.length > 0 && referenciadas.size === 0) {
  console.error('\n⛔ ABORTADO: há contratos mas nenhuma referência de anexo foi reconhecida.')
  console.error('   Indício de scan quebrado (formato de key mudou?). Nada foi apagado.')
  process.exit(2)
}

if (!orfaos.length) { console.log('\nnada a apagar.'); process.exit(0) }
for (const k of orfaos) console.log(`   ${k}`)

if (!APPLY) { console.log('\n>>> ENSAIO. Rode com --apply para apagar.'); process.exit(0) }

let n = 0
for (const k of orfaos) {
  try { await apagar(k); n++ }
  catch (e) { console.error(`   falha ao apagar ${k}: ${String(e)}`) }
}
console.log(`\n>>> APLICADO. ${n} órfão(s) removido(s).`)
