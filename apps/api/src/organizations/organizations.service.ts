import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByClerkId(clerkId: string) {
    return this.prisma.organization.findUnique({ where: { clerkId } })
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } })
    if (!org) throw new NotFoundException('Organização não encontrada')
    return org
  }

  async upsert(clerkId: string, name: string, slug: string) {
    return this.prisma.organization.upsert({
      where: { clerkId },
      update: { name, slug },
      create: { clerkId, name, slug },
    })
  }
}
