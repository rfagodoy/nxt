/* Smoke da recuperação de senha, direto na API (produção local).
 *
 * O que precisa ser verdade neste fluxo, em ordem de gravidade:
 *  1. a resposta do pedido é IDÊNTICA para conta existente e inexistente (senão o
 *     endpoint público vira detector de quem tem conta aqui);
 *  2. o token é de uso ÚNICO e vence;
 *  3. redefinir DESBLOQUEIA a conta (quem esqueceu a senha costuma estar travado por
 *     tentativas — trocar a senha e continuar trancado do lado de fora não resolve nada);
 *  4. redefinir DERRUBA as sessões antigas (se a troca foi por suspeita de invasão,
 *     deixar a sessão do invasor viva anula a troca).
 *
 * Cria e remove o próprio usuário de teste. Não envia e-mail: o token é inserido
 * direto no banco, como o serviço faria — mandar mensagem de verdade para um endereço
 * inventado geraria quique e sujaria a reputação do remetente.
 *
 * Uso: node tools/smoke/run-with-env.mjs tools/smoke/smoke-reset-senha.mjs
 */
import { PrismaClient } from '@prisma/client'
import { createHash, randomBytes } from 'crypto'

const API = 'http://localhost:3001/api'
const prisma = new PrismaClient()

const EMAIL = 'smoke-reset@nxt-smoke.com.br'
const SENHA_ANTIGA = 'SenhaAntiga@2026'
const SENHA_NOVA = 'SenhaNova@2026xyz'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) }
  else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

const post = async (rota, body) => {
  const r = await fetch(`${API}${rota}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const hash = (t) => createHash('sha256').update(t).digest('hex')

// Mesmo formato de apps/api/src/auth/password.ts (scrypt$salt$hash).
const { scryptSync } = await import('crypto')
const hashSenha = (plain) => {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(plain, salt, 64).toString('hex')}`
}

const criarToken = async (userId, { minutos = 60, usado = false } = {}) => {
  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + minutos * 60_000),
      usedAt: usado ? new Date() : null,
    },
  })
  return token
}

async function main() {
  const org = await prisma.organization.findFirst()
  if (!org) throw new Error('nenhuma organização no banco')

  await prisma.user.deleteMany({ where: { email: EMAIL } })
  const user = await prisma.user.create({
    data: {
      organizationId: org.id, email: EMAIL, name: 'Smoke Reset',
      role: 'user', status: 'ATIVO', passwordHash: hashSenha(SENHA_ANTIGA),
    },
  })

  console.log('\n1) Pedido de link não revela quem tem conta')
  const inexistente = await post('/auth/forgot-password', { email: 'nao-existe-mesmo@nxt-smoke.com.br' })
  const existente = await post('/auth/forgot-password', { email: EMAIL })
  check(inexistente.status === existente.status, 'mesmo código HTTP', `${inexistente.status} vs ${existente.status}`)
  check(
    JSON.stringify(inexistente.body) === JSON.stringify(existente.body),
    'mesma resposta',
    `${JSON.stringify(inexistente.body)} vs ${JSON.stringify(existente.body)}`,
  )
  check(existente.status === 200, 'responde 200')

  console.log('\n2) Token inválido, usado e vencido são indistinguíveis')
  const inventado = await post('/auth/reset-password', { token: randomBytes(32).toString('hex'), newPassword: SENHA_NOVA })
  const vencido = await post('/auth/reset-password', { token: await criarToken(user.id, { minutos: -1 }), newPassword: SENHA_NOVA })
  const jaUsado = await post('/auth/reset-password', { token: await criarToken(user.id, { usado: true }), newPassword: SENHA_NOVA })
  check(inventado.status === 400 && vencido.status === 400 && jaUsado.status === 400, 'os três recusam com 400')
  check(
    inventado.body?.message === vencido.body?.message && vencido.body?.message === jaUsado.body?.message,
    'os três dão a MESMA mensagem',
    `${inventado.body?.message} | ${vencido.body?.message} | ${jaUsado.body?.message}`,
  )

  console.log('\n3) Senha fraca é recusada mesmo com token bom')
  const tokenFraca = await criarToken(user.id)
  const fraca = await post('/auth/reset-password', { token: tokenFraca, newPassword: 'curta' })
  check(fraca.status === 400, 'recusa senha curta', String(fraca.status))
  const aindaVale = await prisma.passwordResetToken.findFirst({ where: { tokenHash: hash(tokenFraca) } })
  check(aindaVale?.usedAt === null, 'token NÃO é gasto quando a senha é recusada')

  console.log('\n4) Conta bloqueada por tentativas é liberada ao redefinir')
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 30 * 60_000) },
  })
  // sessão viva antes da troca, para conferir a revogação depois
  const login1 = await post('/auth/login', { email: EMAIL, password: SENHA_ANTIGA })
  check(login1.status === 423, 'login recusado enquanto bloqueado', String(login1.status))

  const bom = await criarToken(user.id)
  const trocou = await post('/auth/reset-password', { token: bom, newPassword: SENHA_NOVA })
  check(trocou.status === 200, 'redefinição aceita', JSON.stringify(trocou.body))

  const depois = await prisma.user.findUnique({ where: { id: user.id } })
  check(depois.lockedUntil === null && depois.failedLoginAttempts === 0, 'conta desbloqueada')

  console.log('\n5) A nova senha entra e a antiga não')
  const comNova = await post('/auth/login', { email: EMAIL, password: SENHA_NOVA })
  check(comNova.status === 200, 'entra com a nova senha', String(comNova.status))
  const comAntiga = await post('/auth/login', { email: EMAIL, password: SENHA_ANTIGA })
  check(comAntiga.status === 401, 'senha antiga não serve mais', String(comAntiga.status))

  console.log('\n6) Token é de uso único')
  const reuso = await post('/auth/reset-password', { token: bom, newPassword: 'OutraSenha@2026' })
  check(reuso.status === 400, 'o mesmo token não serve duas vezes', String(reuso.status))

  console.log('\n7) Sessões anteriores foram revogadas')
  const refreshAntigo = comNova.body?.refreshToken
  const tokenMaisAntigo = await criarToken(user.id)
  await post('/auth/reset-password', { token: tokenMaisAntigo, newPassword: 'TerceiraSenha@2026' })
  const usandoRefresh = await post('/auth/refresh', { refreshToken: refreshAntigo })
  check(usandoRefresh.status === 401, 'refresh emitido antes da troca deixou de valer', String(usandoRefresh.status))

  await prisma.user.deleteMany({ where: { email: EMAIL } })
  console.log(`\nResultado: ${pass} OK, ${fail} falha(s)`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
  .catch(async (e) => {
    console.error(e)
    await prisma.user.deleteMany({ where: { email: EMAIL } }).catch(() => {})
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
