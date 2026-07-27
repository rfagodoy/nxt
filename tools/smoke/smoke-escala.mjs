/* Teste de ESCALA: gera massa de verdade e mede o que o usuário sente.
 *
 * Até aqui o sistema só tinha sido exercitado com um punhado de registros — todos
 * criados por nós dois. "Funciona" com 3 contratos não diz nada sobre 2.000, e as duas
 * suspeitas registradas eram concretas: o limite de ~2100 parâmetros do SQL Server e
 * pontos que ordenam/paginam em memória.
 *
 * Mede: importação em lote, listagem, dashboard, relatório (que deriva TUDO em
 * memória, o candidato natural a sofrer) e a busca.
 *
 * Cria e REMOVE toda a massa. Não aponte para base real.
 *
 * Uso:  node tools/smoke/run-with-env.mjs tools/smoke/smoke-escala.mjs [qtdContratos]
 */
import { PrismaClient } from '@prisma/client'

const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'
const QTD = Number(process.argv[2] ?? 2000)
const LOTE = 500                      // o import tem teto de 5000; 500 por vez para medir o lote também
const prisma = new PrismaClient()

const MARCA = 'ESCALA-TESTE'
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6
const fmt = (n) => `${n.toFixed(0)}ms`

let alertas = 0
const medir = async (label, limiteMs, fn) => {
  const t0 = process.hrtime.bigint()
  const r = await fn()
  const dur = ms(t0)
  const ok = dur <= limiteMs
  if (!ok) alertas++
  console.log(`  ${ok ? 'OK  ' : 'LENTO'} ${label.padEnd(42)} ${fmt(dur).padStart(9)}  (limite ${limiteMs}ms)`)
  return r
}

/* CNPJ válido gerado a partir de um índice: o import valida dígito verificador, então
   não dá para inventar número. */
function cnpjDe(i) {
  const base = String(10000000 + i).padStart(8, '0') + '0001'
  const dv = (nums, pesos) => {
    const s = nums.reduce((acc, n, k) => acc + n * pesos[k], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const n = base.split('').map(Number)
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return base + d1 + d2
}

const login = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', status: 'ATIVO' }, select: { email: true } })
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: PASS }),
  })
  if (!r.ok) throw new Error(`login: ${r.status} — ajuste SMOKE_PASS`)
  return (await r.json()).accessToken
}

const post = async (token, rota, corpo) => {
  const r = await fetch(`${API}${rota}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  })
  return r.json().catch(() => null)
}
const get = async (token, rota) => {
  const r = await fetch(`${API}${rota}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const limpar = async () => {
  const c = await prisma.contract.deleteMany({ where: { titulo: { startsWith: MARCA } } })
  const p = await prisma.partner.deleteMany({ where: { razaoSocial: { startsWith: MARCA } } })
  return { contratos: c.count, parceiros: p.count }
}

async function main() {
  const token = await login()
  console.log(`\nLimpando massa anterior…`, await limpar())

  const parceiros = Array.from({ length: QTD }, (_, i) => ({
    categoria: 'PJ_BR',
    razaoSocial: `${MARCA} Parceiro ${i + 1}`,
    documento: cnpjDe(i),
    status: 'ATIVO',
  }))
  const contratos = Array.from({ length: QTD }, (_, i) => ({
    numero: `${MARCA}-${String(i + 1).padStart(6, '0')}`,
    titulo: `${MARCA} Contrato ${i + 1}`,
    documentoParceiro: cnpjDe(i),
    tipo: ['Serviços', 'Locação', 'Fornecimento'][i % 3],
    natureza: i % 2 === 0 ? 'DESPESA' : 'RECEITA',
    situacao: 'VIGENTE',
    inicioVigencia: '01/01/2024',
    // metade já vencida: é o caso que o relatório precisa DERIVAR
    terminoVigencia: i % 2 === 0 ? '31/12/2025' : '31/12/2028',
    valorTotal: String((i + 1) * 100),
  }))

  console.log(`\n1) Importação de ${QTD} parceiros + ${QTD} contratos (lotes de ${LOTE})`)
  for (let i = 0; i < QTD; i += LOTE) {
    const fatia = parceiros.slice(i, i + LOTE)
    await medir(`parceiros ${i + 1}–${i + fatia.length}`, 60_000, () => post(token, '/import/parceiros/aplicar', { linhas: fatia, modo: 'CRIAR' }))
  }
  for (let i = 0; i < QTD; i += LOTE) {
    const fatia = contratos.slice(i, i + LOTE)
    await medir(`contratos ${i + 1}–${i + fatia.length}`, 90_000, () => post(token, '/import/contratos/aplicar', { linhas: fatia, modo: 'CRIAR' }))
  }

  const totalC = await prisma.contract.count({ where: { titulo: { startsWith: MARCA } } })
  const totalP = await prisma.partner.count({ where: { razaoSocial: { startsWith: MARCA } } })
  console.log(`  → no banco: ${totalP} parceiros, ${totalC} contratos`)

  console.log('\n2) Leituras com a base cheia')
  await medir('listagem de contratos (1ª página)', 3000, () => get(token, '/contracts?take=50'))
  await medir('listagem de parceiros (1ª página)', 3000, () => get(token, '/partners?take=50'))
  await medir('dashboard', 5000, () => get(token, '/dashboard/summary'))
  await medir('busca por texto', 3000, () => get(token, `/contracts?search=${encodeURIComponent(MARCA)}-000123`))

  console.log('\n3) Relatório — deriva TUDO em memória (o candidato a sofrer)')
  const rel = await medir('relatório sem filtro', 10_000, () => post(token, '/reports/contratos', {}))
  await medir('relatório só VENCIDO (derivado)', 10_000, () => post(token, '/reports/contratos', { situacoes: ['VENCIDO'] }))
  await medir('relatório com período + ordenação por valor', 10_000, () =>
    post(token, '/reports/contratos', { de: '2024-01-01', ate: '2026-12-31', ordenarPor: 'valor', desc: true }))

  if (rel && !rel.excedeu) {
    const vencidos = rel.totais?.porSituacao?.find((s) => s.situacao === 'VENCIDO')
    console.log(`  → ${rel.linhas?.length} linha(s); VENCIDO derivado: ${vencidos?.contratos ?? 0} contrato(s)`)
  }

  console.log('\n4) Limpeza')
  const removidos = await limpar()
  console.log('  → removidos:', removidos)

  console.log(`\n${alertas === 0 ? 'Nenhuma medida acima do limite.' : `${alertas} medida(s) ACIMA do limite — ver acima.`}`)
  process.exit(alertas === 0 ? 0 : 1)
}

main()
  .catch(async (e) => { console.error(e); await limpar().catch(() => {}); process.exit(1) })
  .finally(() => prisma.$disconnect())
