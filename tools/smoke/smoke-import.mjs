/* Smoke da importação de planilha, direto na API (produção local).
 *
 * O que precisa ser verdade, em ordem de gravidade:
 *  1. CONFERIR não grava NADA — é a promessa da tela; se ela falhar, o usuário perde a
 *     única chance de ver o que vai entrar antes de entrar;
 *  2. reimportar o mesmo arquivo NÃO duplica (chave natural: documento / número);
 *  3. contrato só entra se o parceiro existir — contrato órfão é import inútil;
 *  4. linha com erro é pulada sem derrubar o lote inteiro;
 *  5. o vínculo contrato→parceiro é gravado de verdade.
 *
 * Cria e remove os próprios registros de teste.
 *
 * Uso: node tools/smoke/run-with-env.mjs tools/smoke/smoke-import.mjs
 */
import { PrismaClient } from '@prisma/client'

const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'
const prisma = new PrismaClient()

/* CNPJs válidos (dígito verificador confere) reservados para o teste. */
const DOC_A = '11222333000181'
const DOC_B = '11444777000161'
const NUM_CONTRATO = 'SMOKE-IMP-001'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) }
  else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

const login = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', status: 'ATIVO' }, select: { email: true } })
  if (!admin) throw new Error('nenhum admin ativo no banco')
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: PASS }),
  })
  if (!r.ok) throw new Error(`login ${admin.email}: ${r.status} — ajuste SMOKE_PASS se a senha do admin mudou`)
  return (await r.json()).accessToken
}

const chamar = async (token, rota, corpo) => {
  const r = await fetch(`${API}${rota}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const limpar = async () => {
  await prisma.contract.deleteMany({ where: { numero: NUM_CONTRATO } })
  await prisma.partner.deleteMany({ where: { documento: { in: [DOC_A, DOC_B] } } })
}

async function main() {
  const token = await login()
  await limpar()

  const parceiros = [
    { categoria: 'PJ_BR', razaoSocial: 'Smoke Import A LTDA', documento: '11.222.333/0001-81', status: 'ATIVO', email: 'a@smoke-import.local' },
    { categoria: 'PJ_BR', razaoSocial: 'Smoke Import B LTDA', documento: '11.444.777/0001-61', status: 'ativa' },
    { categoria: 'PJ_BR', razaoSocial: 'Documento errado', documento: '11.222.333/0001-99' },   // DV inválido
    { categoria: '', razaoSocial: '', documento: '' },                                          // linha vazia — ignorada
  ]

  console.log('\n1) Conferir NÃO grava nada')
  const conf = await chamar(token, '/import/parceiros/conferir', { linhas: parceiros, modo: 'CRIAR' })
  check(conf.status === 200 || conf.status === 201, 'conferência responde', String(conf.status))
  check(conf.body?.total === 3, 'linha em branco descartada (3 de 4)', `total=${conf.body?.total}`)
  check(conf.body?.criar === 2 && conf.body?.erro === 1, '2 a criar, 1 com erro', JSON.stringify({ criar: conf.body?.criar, erro: conf.body?.erro }))
  const gravouNaConferencia = await prisma.partner.count({ where: { documento: { in: [DOC_A, DOC_B] } } })
  check(gravouNaConferencia === 0, 'NADA foi gravado ao conferir', `encontrados=${gravouNaConferencia}`)

  const erroDoc = conf.body?.linhas?.find((l) => l.acao === 'ERRO')
  check(/dígito verificador/i.test(erroDoc?.problemas?.[0]?.mensagem ?? ''), 'o erro explica o motivo', erroDoc?.problemas?.[0]?.mensagem)

  console.log('\n2) Importar de verdade')
  const ap = await chamar(token, '/import/parceiros/aplicar', { linhas: parceiros, modo: 'CRIAR' })
  check(ap.body?.aplicado?.criados === 2, '2 parceiros criados', JSON.stringify(ap.body?.aplicado))
  const criados = await prisma.partner.findMany({ where: { documento: { in: [DOC_A, DOC_B] } }, select: { documento: true, status: true, contatos: true } })
  check(criados.length === 2, 'estão no banco')
  check(criados.every((p) => p.status === 'ATIVO'), 'situação "ativa" normalizada para ATIVO')
  const comContato = criados.find((p) => p.documento === DOC_A)
  check(String(comContato?.contatos ?? '').includes('a@smoke-import.local'), 'e-mail virou contato do parceiro')

  console.log('\n3) Reimportar o MESMO arquivo não duplica')
  const denovo = await chamar(token, '/import/parceiros/aplicar', { linhas: parceiros, modo: 'CRIAR' })
  check(denovo.body?.aplicado?.criados === 0, 'nada criado na segunda vez', JSON.stringify(denovo.body?.aplicado))
  check(denovo.body?.ignorar === 2, 'as duas linhas foram reconhecidas como já existentes', `ignorar=${denovo.body?.ignorar}`)
  const total = await prisma.partner.count({ where: { documento: { in: [DOC_A, DOC_B] } } })
  check(total === 2, 'continuam 2 no banco (não duplicou)', `total=${total}`)

  console.log('\n4) Contrato exige parceiro existente')
  const contratos = [
    { numero: NUM_CONTRATO, titulo: 'Contrato do smoke', documentoParceiro: '11.222.333/0001-81', situacao: 'Vigente', inicioVigencia: '01/01/2024', terminoVigencia: '31/12/2026', valorTotal: 'R$ 120.000,00' },
    { numero: 'SMOKE-IMP-ORFAO', titulo: 'Sem parceiro', documentoParceiro: '99.999.999/0001-99', situacao: 'VIGENTE', valorTotal: '1000' },
  ]
  const confC = await chamar(token, '/import/contratos/conferir', { linhas: contratos, modo: 'CRIAR' })
  check(confC.body?.criar === 1 && confC.body?.erro === 1, '1 a criar, 1 órfão barrado', JSON.stringify({ criar: confC.body?.criar, erro: confC.body?.erro }))
  const orfao = confC.body?.linhas?.find((l) => l.acao === 'ERRO')
  check(/Importe os parceiros primeiro/i.test(orfao?.problemas?.[0]?.mensagem ?? ''), 'o erro diz o que fazer', orfao?.problemas?.[0]?.mensagem)

  console.log('\n5) Linha com erro não derruba o lote')
  const apC = await chamar(token, '/import/contratos/aplicar', { linhas: contratos, modo: 'CRIAR' })
  check(apC.body?.aplicado?.criados === 1, 'o contrato bom entrou mesmo com o outro em erro', JSON.stringify(apC.body?.aplicado))

  const contrato = await prisma.contract.findFirst({ where: { numero: NUM_CONTRATO } })
  check(!!contrato, 'contrato no banco')
  check(contrato?.valorTotal === 120000, 'valor "R$ 120.000,00" virou 120000', String(contrato?.valorTotal))
  check(contrato?.terminoVigencia === '2026-12-31', 'data dd/mm/aaaa virou ISO', String(contrato?.terminoVigencia))
  check(contrato?.situacao === 'VIGENTE', '"Vigente" normalizado', String(contrato?.situacao))

  const partes = typeof contrato?.partes === 'string' ? JSON.parse(contrato.partes) : contrato?.partes
  const parceiroA = await prisma.partner.findFirst({ where: { documento: DOC_A }, select: { id: true } })
  check(partes?.[0]?.ref_id === parceiroA?.id, 'o vínculo com o parceiro foi gravado', JSON.stringify(partes?.[0]))

  console.log('\n6) Modo "atualizar" sobrescreve em vez de ignorar')
  const alterado = [{ ...contratos[0], titulo: 'Título alterado pelo import' }]
  const upd = await chamar(token, '/import/contratos/aplicar', { linhas: alterado, modo: 'CRIAR_E_ATUALIZAR' })
  check(upd.body?.aplicado?.atualizados === 1, '1 atualizado', JSON.stringify(upd.body?.aplicado))
  const depois = await prisma.contract.findFirst({ where: { numero: NUM_CONTRATO }, select: { titulo: true } })
  check(depois?.titulo === 'Título alterado pelo import', 'o título mudou no banco', depois?.titulo)

  await limpar()
  console.log(`\nResultado: ${pass} OK, ${fail} falha(s)`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
  .catch(async (e) => { console.error(e); await limpar().catch(() => {}); process.exit(1) })
  .finally(() => prisma.$disconnect())
