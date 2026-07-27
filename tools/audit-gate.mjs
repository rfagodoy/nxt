#!/usr/bin/env node
/* Portão de auditoria de dependências.
 *
 * Por que não basta `npm audit --audit-level=<x>`: a única forma de não reprovar o CI
 * por um advisory transitivo sem correção é BAIXAR o nível — e aí o nível fica baixo
 * para tudo, inclusive para a falha nova e séria que aparecer amanhã. Foi o que
 * aconteceu aqui: o gate virou `critical` e passou a deixar HIGH entrar em silêncio.
 *
 * Este script inverte: bloqueia TODO high/critical de produção, e só passa o que
 * estiver nomeado em security/audit-allowlist.json com justificativa e data de revisão.
 * Advisory novo reprova; advisory conhecido passa e aparece no relatório.
 *
 * Uso: npm audit --omit=dev --json | node tools/audit-gate.mjs [--nivel=high]
 *      (ou `npm run audit:gate`)
 *
 * Lê o relatório pela ENTRADA PADRÃO em vez de chamar o npm: no Windows o Node 24
 * recusa executar `npm.cmd` sem shell, e passar por shell numa ferramenta de segurança
 * é o tipo de atalho que a ferramenta existe para evitar.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORDEM = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 }
const nivel = (process.argv.find((a) => a.startsWith('--nivel=')) ?? '--nivel=high').split('=')[1]
const corte = ORDEM[nivel] ?? ORDEM.high

async function auditoria() {
  const partes = []
  for await (const p of process.stdin) partes.push(p)
  const txt = Buffer.concat(partes).toString('utf8').trim()
  if (!txt) {
    console.error('Nada na entrada padrão. Use: npm audit --omit=dev --json | node tools/audit-gate.mjs')
    process.exit(2)
  }
  try {
    return JSON.parse(txt)
  } catch {
    console.error('A entrada não é o JSON do npm audit — faltou --json?')
    process.exit(2)
  }
}

const { aceitos = [] } = JSON.parse(readFileSync(join(RAIZ, 'security', 'audit-allowlist.json'), 'utf8'))
const permitidos = new Map(aceitos.map((a) => [a.modulo, a]))
const hoje = new Date().toISOString().slice(0, 10)

const vulns = Object.values((await auditoria()).vulnerabilities ?? {})
const relevantes = vulns.filter((v) => (ORDEM[v.severity] ?? 0) >= corte)
const barrados = relevantes.filter((v) => !permitidos.has(v.name))
const tolerados = relevantes.filter((v) => permitidos.has(v.name))
const vencidos = tolerados.filter((v) => (permitidos.get(v.name).revisar_em ?? '9999-12-31') < hoje)

console.log(`Auditoria de produção — corte: ${nivel}`)
console.log(`  ${relevantes.length} advisory(ies) no nível · ${tolerados.length} aceito(s) na allowlist · ${barrados.length} sem justificativa`)

for (const v of tolerados) {
  const a = permitidos.get(v.name)
  console.log(`  · ${v.name} (${v.severity}) — aceito até ${a.revisar_em}: ${a.porque_aceito?.[0] ?? ''}`)
}

/* Prazo vencido não reprova o build — reprovaria a entrega por causa do calendário, o
   que só ensina a empurrar a data. Mas grita, e no GitHub vira anotação visível. */
if (vencidos.length > 0) {
  console.log('')
  for (const v of vencidos) {
    console.log(`::warning::Allowlist vencida para ${v.name} (revisar_em ${permitidos.get(v.name).revisar_em}). Reavalie ou renove a justificativa.`)
  }
}

if (barrados.length > 0) {
  console.log('')
  console.error(`REPROVADO: ${barrados.length} advisory(ies) ${nivel}+ em produção sem justificativa:`)
  for (const v of barrados) {
    const via = (v.effects ?? []).join(', ')
    console.error(`  ✗ ${v.name} (${v.severity})${via ? ` — afeta ${via}` : ''}`)
  }
  console.error('')
  console.error('Corrija a dependência ou, se não houver correção compatível, acrescente')
  console.error('o módulo a security/audit-allowlist.json com justificativa e data de revisão.')
  process.exit(1)
}

console.log('\nOK — nenhum advisory de produção sem justificativa.')
