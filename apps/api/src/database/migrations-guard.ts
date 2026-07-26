import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { Logger } from '@nestjs/common'
import type { PrismaService } from '../prisma.service'

/* Trava de boot: a API não sobe contra um banco com migração pendente.
 *
 * Antes disso, o schema era aplicado com `db push` — sem histórico, sem rollback e
 * sem ninguém saber se o banco do cliente estava na versão do código. O modo de
 * falha era o pior possível: a API subia normalmente e quebrava na PRIMEIRA consulta
 * que tocasse a coluna nova, em produção, na frente do usuário.
 *
 * Aqui a falha acontece no lugar certo — na subida, com a instrução do que fazer. */

const logger = new Logger('Migrations')

/** Onde a pasta de migrações pode estar, a partir do processo em execução. O
 *  monorepo roda de `apps/api` (dist) ou da raiz, conforme quem chamou. */
const CANDIDATOS = [
  join(process.cwd(), 'packages/database/prisma/migrations'),
  join(process.cwd(), '../../packages/database/prisma/migrations'),
  join(__dirname, '../../../../../packages/database/prisma/migrations'),
]

/** Nomes das migrações versionadas no código, em ordem. */
export function migrationsNoDisco(): string[] | null {
  const dir = CANDIDATOS.find((d) => existsSync(d))
  if (!dir) return null
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

/** Compara o que o código traz com o que o banco registra.
 *  `pendentes` = existe no código e não foi aplicada (ou aplicada pela metade).
 *  `desconhecidas` = aplicada no banco e ausente do código (banco à frente). */
export function compararMigrations(
  disco: string[],
  aplicadas: Array<{ migration_name: string; finished_at: Date | null }>,
): { pendentes: string[]; desconhecidas: string[] } {
  const concluidas = new Set(aplicadas.filter((m) => m.finished_at != null).map((m) => m.migration_name))
  const todasNoBanco = new Set(aplicadas.map((m) => m.migration_name))
  return {
    pendentes: disco.filter((m) => !concluidas.has(m)),
    desconhecidas: [...todasNoBanco].filter((m) => !disco.includes(m)),
  }
}

/**
 * Verifica o estado das migrações e LANÇA quando o banco está atrás do código.
 *
 * Não trava quando apenas não consegue saber (pasta de migrações ausente num
 * empacotamento diferente): avisa e segue. Bloquear por não achar um arquivo seria
 * transformar uma incerteza em queda.
 */
export async function assertMigrations(prisma: PrismaService): Promise<void> {
  const disco = migrationsNoDisco()
  if (!disco || disco.length === 0) {
    logger.warn('pasta de migrações não encontrada — checagem de schema ignorada nesta execução')
    return
  }

  let aplicadas: Array<{ migration_name: string; finished_at: Date | null }>
  try {
    aplicadas = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
      'SELECT migration_name, finished_at FROM _prisma_migrations',
    )
  } catch {
    // a tabela só não existe quando o banco nunca passou por `migrate deploy`
    throw new Error(
      'Banco de dados sem controle de migrações. Rode "npm run db:deploy" antes de subir a API.\n' +
      '(Se este banco vem de uma instalação antiga que usava db push, rode antes:\n' +
      ' npx prisma migrate resolve --applied 0_init --schema packages/database/prisma/schema.prisma)',
    )
  }

  const { pendentes, desconhecidas } = compararMigrations(disco, aplicadas)

  if (desconhecidas.length > 0) {
    // banco à frente do código: não impede a subida, mas alguém precisa saber
    logger.warn(`o banco tem migração que este código não conhece: ${desconhecidas.join(', ')} — versão do app pode estar atrasada`)
  }

  if (pendentes.length > 0) {
    throw new Error(
      `Migração pendente no banco: ${pendentes.join(', ')}.\n` +
      'Rode "npm run db:deploy" para aplicar antes de subir a API.',
    )
  }

  logger.log(`schema em dia (${disco.length} migração(ões) aplicada(s))`)
}
