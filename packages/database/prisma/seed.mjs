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
const ADMIN_EMAIL = 'admin@nxt.local'
const ADMIN_PASSWORD = 'Nxt@2026'

function hashPassword(plain) {
  const salt = randomBytes(16)
  const derived = scryptSync(plain, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'Nxt', slug: 'nxt', externalId: ORG_ID },
    create: { id: ORG_ID, externalId: ORG_ID, name: 'Nxt', slug: 'nxt' },
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
  console.log('Admin provisionado:', admin.email, '(senha inicial:', ADMIN_PASSWORD, ')')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
