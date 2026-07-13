import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * Semeia os catálogos de referência NACIONAIS (globais, não por tenant):
 *  - CNAE (subclasses) a partir de data/cnae.json (fonte: API do IBGE).
 *  - Natureza Jurídica das entidades obrigadas ao QSA, de data/natureza-juridica.json
 *    (fonte: Receita Federal). Idempotente: recria a tabela inteira a cada execução.
 */
const prisma = new PrismaClient()
const __dir = dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(join(__dir, 'data', f), 'utf8'))

async function seedTable(nome, model, rows) {
  await model.deleteMany({})
  const size = 500 // lote seguro para o limite de parâmetros do SQL Server
  for (let i = 0; i < rows.length; i += size) {
    await model.createMany({ data: rows.slice(i, i + size) })
  }
  const count = await model.count()
  console.log(`  ${nome}: ${count} registros`)
}

async function main() {
  console.log('Semeando catálogos de referência...')
  await seedTable('CNAE', prisma.cnae, load('cnae.json'))
  await seedTable('Natureza Jurídica (QSA)', prisma.naturezaJuridica, load('natureza-juridica.json'))
  console.log('OK.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
