/* Smoke da auditoria de CAMPOS PERSONALIZADOS (Parceiros — fase 2B).
 *
 * O que precisa ser verdade:
 *  1. mudar um campo personalizado APARECE no histórico do parceiro;
 *  2. o histórico mostra o RÓTULO que a pessoa vê ("Alto"), não o código ("a") —
 *     senão a linha é ilegível para quem não conhece o cadastro por dentro;
 *  3. gravar o mesmo valor NÃO cria registro (histórico não pode encher de ruído);
 *  4. apagar um valor aparece como remoção;
 *  5. o autor do histórico vem do token, não do corpo da requisição.
 *
 * Cria e remove a própria tela, o campo e o parceiro de teste.
 *
 * Uso: node tools/smoke/run-with-env.mjs tools/smoke/smoke-auditoria-custom.mjs
 */
import { PrismaClient } from '@prisma/client'

const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'
const prisma = new PrismaClient()

const MARCA = 'SMOKE-AUDIT-CUSTOM'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) }
  else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

const login = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', status: 'ATIVO' }, select: { email: true, name: true } })
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: PASS }),
  })
  if (!r.ok) throw new Error(`login: ${r.status} — ajuste SMOKE_PASS`)
  return { token: (await r.json()).accessToken, admin }
}

const limpar = async () => {
  const p = await prisma.partner.findFirst({ where: { razaoSocial: { startsWith: MARCA } }, select: { id: true } })
  if (p) {
    await prisma.screenFieldValue.deleteMany({ where: { subjectId: p.id } })
    await prisma.partnerAuditLog.deleteMany({ where: { partnerId: p.id } })
    await prisma.partner.delete({ where: { id: p.id } })
  }
  const s = await prisma.screen.findFirst({ where: { name: { startsWith: MARCA } }, select: { id: true } })
  if (s) await prisma.screen.delete({ where: { id: s.id } })
}

const historico = (partnerId) =>
  prisma.partnerAuditLog.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' } })

const mudancasDe = (log) => (typeof log?.changes === 'string' ? JSON.parse(log.changes) : log?.changes) ?? []

async function main() {
  const { token, admin } = await login()
  await limpar()

  const org = await prisma.organization.findFirst()

  // tela + campo personalizado de teste (select, para provar a tradução do rótulo)
  const screen = await prisma.screen.create({
    data: { organizationId: org.id, name: `${MARCA} Tela`, subjectType: 'PARTNER', status: 'ATIVO', isDefault: false, isSystem: false },
  })
  const campo = await prisma.screenField.create({
    data: {
      screenId: screen.id, name: 'risco', label: 'Classificação de risco', type: 'select',
      source: 'CUSTOM', mode: 'EDIT', required: false, order: 1,
      options: JSON.stringify([{ value: 'a', label: 'Alto' }, { value: 'b', label: 'Baixo' }]),
    },
  })

  const parceiro = await prisma.partner.create({
    data: { organizationId: org.id, categoria: 'PJ_BR', razaoSocial: `${MARCA} Parceiro`, status: 'ATIVO' },
  })

  const gravar = async (value) => {
    const r = await fetch(`${API}/screen-values`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ subjectType: 'PARTNER', subjectId: parceiro.id, values: [{ fieldId: campo.id, value }] }),
    })
    return r.status
  }

  console.log('\n1) Preencher pela primeira vez entra no histórico')
  await gravar('a')
  let logs = await historico(parceiro.id)
  check(logs.length === 1, 'um registro criado', `logs=${logs.length}`)
  let m = mudancasDe(logs[0])
  check(m[0]?.label === 'Classificação de risco', 'usa o rótulo do campo', JSON.stringify(m[0]))
  check(m[0]?.after === 'Alto', 'mostra o RÓTULO da opção, não o código', `after=${m[0]?.after}`)
  check(m[0]?.before === '—', 'antes vazio aparece como —', `before=${m[0]?.before}`)

  console.log('\n2) O autor vem do token')
  check(logs[0].user === (admin.name ?? admin.email), 'autor registrado', `user=${logs[0].user}`)
  check(!!logs[0].userId, 'userId preenchido (nome resolve ao vivo na leitura)')

  console.log('\n3) Gravar o MESMO valor não cria ruído')
  await gravar('a')
  logs = await historico(parceiro.id)
  check(logs.length === 1, 'continua um só registro', `logs=${logs.length}`)

  console.log('\n4) Trocar o valor registra de → para, com rótulos')
  await gravar('b')
  logs = await historico(parceiro.id)
  check(logs.length === 2, 'segundo registro criado', `logs=${logs.length}`)
  m = mudancasDe(logs[0])
  check(m[0]?.before === 'Alto' && m[0]?.after === 'Baixo', 'de "Alto" para "Baixo"', JSON.stringify(m[0]))

  console.log('\n5) Apagar o valor aparece como remoção')
  await gravar('')
  logs = await historico(parceiro.id)
  check(logs.length === 3, 'terceiro registro criado', `logs=${logs.length}`)
  m = mudancasDe(logs[0])
  check(m[0]?.before === 'Baixo' && m[0]?.after === '—', 'de "Baixo" para —', JSON.stringify(m[0]))

  await limpar()
  console.log(`\nResultado: ${pass} OK, ${fail} falha(s)`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
  .catch(async (e) => { console.error(e); await limpar().catch(() => {}); process.exit(1) })
  .finally(() => prisma.$disconnect())
