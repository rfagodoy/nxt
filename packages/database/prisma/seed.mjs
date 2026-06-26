import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Provisiona a organização demo do Nxt.
 *
 * Contrato de tenancy: a claim `org_id` do token (Keycloak) DEVE ser igual ao
 * `Organization.id` interno — é o valor com que todo registro é carimbado.
 * Aqui criamos a org com um id estável e legível para o ambiente de desenvolvimento.
 * `externalId` referencia a identidade da org no IdP (no provisionamento real será
 * o id da Keycloak Organization; em dev usamos o mesmo valor).
 */
const ORG_ID = 'org_nxt'

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: 'Nxt', slug: 'nxt', externalId: ORG_ID },
    create: { id: ORG_ID, externalId: ORG_ID, name: 'Nxt', slug: 'nxt' },
  })
  console.log('Organização provisionada:', org.id, '(', org.name, ')')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
