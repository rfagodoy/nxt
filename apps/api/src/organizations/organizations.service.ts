import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByExternalId(externalId: string) {
    return this.prisma.organization.findUnique({ where: { externalId } })
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } })
    if (!org) throw new NotFoundException('Organização não encontrada')
    return org
  }

  async upsert(externalId: string, name: string, slug: string) {
    return this.prisma.organization.upsert({
      where: { externalId },
      update: { name, slug },
      create: { externalId, name, slug },
    })
  }
}
