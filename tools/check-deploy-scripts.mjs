#!/usr/bin/env node
/* Confere os scripts de implantação — as duas coisas que só quebram na máquina do
 * cliente, onde não há ninguém para depurar.
 *
 * 1. Todo .ps1 precisa de BOM UTF-8.
 *    O Windows Server traz PowerShell 5.1, que lê arquivo sem BOM como ANSI. Um
 *    "ç" vira dois bytes soltos e o PARSER QUEBRA — o instalador nem chega a rodar.
 *    Isso passou despercebido aqui porque o pwsh 7 (o desta máquina) assume UTF-8 e
 *    aceita o arquivo sem BOM: o script parece correto até chegar no servidor.
 *
 * 2. Todo .sh precisa de fim de linha LF.
 *    Com CRLF, o shell tenta executar "/bin/bash\r" e devolve "bad interpreter".
 *
 * Uso: node tools/check-deploy-scripts.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALVO = join(RAIZ, 'deploy')

function arquivos(dir) {
  const saida = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else saida.push(caminho)
  }
  return saida
}

const problemas = []
let conferidos = 0

for (const caminho of arquivos(ALVO)) {
  const ext = extname(caminho).toLowerCase()
  if (ext !== '.ps1' && ext !== '.sh') continue
  conferidos++
  const bytes = readFileSync(caminho)
  const rel = relative(RAIZ, caminho).replace(/\\/g, '/')

  if (ext === '.ps1') {
    const temBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    const temAcento = /[^\x00-\x7f]/.test(bytes.toString('utf8'))
    if (!temBom && temAcento) {
      problemas.push(`${rel}: .ps1 com caractere acentuado e SEM BOM UTF-8 — o PowerShell 5.1 do Windows Server não vai conseguir nem interpretar o arquivo.`)
    }
  }

  if (ext === '.sh' && bytes.includes('\r\n')) {
    problemas.push(`${rel}: .sh com fim de linha CRLF — no Linux isso vira "bad interpreter: /bin/bash^M".`)
  }
}

console.log(`Scripts de implantação conferidos: ${conferidos}`)
if (problemas.length > 0) {
  console.error('\nREPROVADO:')
  for (const p of problemas) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('OK — todos legíveis no sistema de destino.')
