import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

/**
 * Catálogos de referência nacionais (CNAE, Natureza Jurídica). São GLOBAIS — os
 * mesmos para todas as organizações — então não há filtro por tenant aqui. Só
 * leitura; a semeadura é feita pelo script prisma/seed-catalogs.mjs.
 */
@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca CNAE por código ou descrição (parcial). Limitada — o catálogo tem ~1.332. */
  async searchCnae(search: string, limit: number) {
    const q = (search ?? '').trim()
    const take = Math.min(Math.max(1, limit || 30), 100)
    const where = q
      ? { OR: [{ code: { contains: q } }, { descricao: { contains: q } }] }
      : undefined
    return this.prisma.cnae.findMany({ where, orderBy: { code: 'asc' }, take })
  }

  /** Resolve descrição de CNAEs específicos (para exibir os já selecionados no parceiro). */
  async cnaeByCodes(codes: string[]) {
    if (!codes.length) return []
    return this.prisma.cnae.findMany({ where: { code: { in: codes } }, orderBy: { code: 'asc' } })
  }

  /** Todas as naturezas jurídicas obrigadas ao QSA (~dezenas — retorna tudo). */
  async naturezas() {
    return this.prisma.naturezaJuridica.findMany({ orderBy: { code: 'asc' } })
  }
}
