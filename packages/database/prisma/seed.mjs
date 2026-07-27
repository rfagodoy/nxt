import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const prisma = new PrismaClient()

/**
 * Provisiona a organização demo do Nxt e seu usuário administrador.
 *
 * Contrato de tenancy: a claim `org_id` do nosso JWT DEVE ser igual ao
 * `Organization.id` interno — é o valor com que todo registro é carimbado.
 * O usuário admin é criado com hash scrypt (mesmo formato de auth/password.ts:
 * `scrypt$<saltHex>$<hashHex>`).
 */
const ORG_ID = 'org_nxt'

/* Padrões de DESENVOLVIMENTO. Em instalação real são substituídos pelo ambiente —
   ver checagem em `exigirProducao()` logo abaixo.

   `admin@nxt.local` existiu por anos e custou caro: o domínio não existe fora da
   máquina, então o sistema tentava entregar aviso ali e a mensagem voltava. Quique
   repetido queima a reputação do remetente e derruba o e-mail de todo mundo. */
const PADRAO_EMAIL = 'admin@nxt.local'
const PADRAO_SENHA = 'Nxt@2026'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? PADRAO_EMAIL).trim()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? PADRAO_SENHA
const ORG_NAME = (process.env.ORG_NAME ?? 'Nxt').trim()
const ORG_SLUG = (process.env.ORG_SLUG ?? 'nxt').trim()

/* Mesma regra de apps/api/src/notifications/email-address.ts, repetida aqui de
   propósito: o seed roda como script solto (.mjs, sem build) e não importa do
   workspace da API. Se um dia a lista mudar lá, muda aqui — são seis linhas. */
const TLDS_MORTOS = new Set(['local', 'localhost', 'internal', 'invalid', 'test', 'example'])
function emailEntregavel(e) {
  const v = String(e ?? '').trim().toLowerCase()
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+$/.test(v)) return false
  return !TLDS_MORTOS.has(v.slice(v.lastIndexOf('.') + 1))
}

/* Em produção, subir com o admin de exemplo é falha de instalação, não descuido
   tolerável: a senha está publicada neste repositório e o e-mail não recebe nada.
   Falhar aqui custa um minuto; descobrir depois custa um incidente. */
function exigirProducao() {
  if (process.env.NODE_ENV !== 'production') return
  const problemas = []
  if (ADMIN_EMAIL === PADRAO_EMAIL) problemas.push('ADMIN_EMAIL não foi definido (o padrão é um endereço de exemplo que não recebe mensagens)')
  else if (!emailEntregavel(ADMIN_EMAIL)) problemas.push(`ADMIN_EMAIL "${ADMIN_EMAIL}" nunca receberia mensagem (endereço inválido ou domínio inexistente fora da máquina)`)
  if (ADMIN_PASSWORD === PADRAO_SENHA) problemas.push('ADMIN_PASSWORD não foi definido (o padrão está publicado no repositório)')
  if (problemas.length === 0) return
  console.error('\nInstalação recusada — o administrador inicial não pode nascer com os valores de exemplo:')
  for (const p of problemas) console.error(`  ✗ ${p}`)
  console.error('\nDefina no ambiente antes de rodar o seed:')
  console.error('  ADMIN_EMAIL="admin@empresa.com.br"  ADMIN_PASSWORD="<senha forte>"')
  console.error('Opcionais: ORG_NAME, ORG_SLUG (nome da organização na instalação).\n')
  process.exit(1)
}

function hashPassword(plain) {
  const salt = randomBytes(16)
  const derived = scryptSync(plain, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

async function main() {
  exigirProducao()

  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME, slug: ORG_SLUG, externalId: ORG_ID },
    create: { id: ORG_ID, externalId: ORG_ID, name: ORG_NAME, slug: ORG_SLUG },
  })
  console.log('Organização provisionada:', org.id, '(', org.name, ')')

  // Não sobrescreve a senha em re-seeds (preserva troca feita pelo admin).
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email: ADMIN_EMAIL } },
    update: { role: 'admin', status: 'ATIVO' },
    create: {
      organizationId: ORG_ID,
      email: ADMIN_EMAIL,
      name: 'Administrador',
      role: 'admin',
      status: 'ATIVO',
      passwordHash: hashPassword(ADMIN_PASSWORD),
    },
  })
  /* A senha só aparece no log quando é a de exemplo (desenvolvimento). Ecoar a senha
     real da instalação deixaria o segredo no log do instalador, que costuma ficar no
     disco do servidor e ser copiado em chamado de suporte. */
  const senhaNoLog = ADMIN_PASSWORD === PADRAO_SENHA ? ` (senha inicial: ${ADMIN_PASSWORD})` : ' (senha definida pelo ambiente)'
  console.log('Admin provisionado:', admin.email + senhaNoLog)

  if (!emailEntregavel(ADMIN_EMAIL)) {
    console.warn(`\n⚠️  "${ADMIN_EMAIL}" nunca receberá e-mail: o domínio não existe fora desta máquina.`)
    console.warn('   O sistema NÃO tentará entregar avisos nesse endereço (evita quique e perda de reputação).')
    console.warn('   Em Configurações → Usuários, troque por um endereço real antes de usar o e-mail para valer.\n')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
