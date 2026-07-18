import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateWorkflowRoleDto, UpdateWorkflowRoleDto } from './dto/workflow-role.dto'

@Injectable()
export class WorkflowRolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.workflowRole.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    })
  }

  async create(organizationId: string, dto: CreateWorkflowRoleDto) {
    const dup = await this.prisma.workflowRole.findFirst({ where: { organizationId, name: dto.name } })
    if (dup) throw new ConflictException('Já existe um papel com esse nome')
    return this.prisma.workflowRole.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        members: (dto.members ?? []) as never,
      },
    })
  }

  async update(organizationId: string, id: string, dto: UpdateWorkflowRoleDto) {
    const role = await this.prisma.workflowRole.findFirst({ where: { id, organizationId } })
    if (!role) throw new NotFoundException('Papel não encontrado')
    if (dto.name && dto.name !== role.name) {
      const dup = await this.prisma.workflowRole.findFirst({ where: { organizationId, name: dto.name } })
      if (dup) throw new ConflictException('Já existe um papel com esse nome')
    }
    return this.prisma.workflowRole.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        members: dto.members !== undefined ? (dto.members as never) : undefined,
      },
    })
  }

  async remove(organizationId: string, id: string) {
    const role = await this.prisma.workflowRole.findFirst({ where: { id, organizationId } })
    if (!role) throw new NotFoundException('Papel não encontrado')
    await this.prisma.workflowRole.delete({ where: { id } })
    return { ok: true }
  }

  /** Chaves (id E nome) dos papéis de que o usuário participa. Uma atividade
   *  aponta para o papel pelo nome (raia) ou id (nxt:role); casar por ambos torna
   *  o vínculo robusto independentemente de como o diagrama referenciou o papel. */
  async roleKeysForUser(organizationId: string, userId: string): Promise<Set<string>> {
    const roles = await this.prisma.workflowRole.findMany({ where: { organizationId } })
    const keys = new Set<string>()
    for (const r of roles) {
      const members = (r.members as unknown as string[]) ?? []
      if (Array.isArray(members) && members.includes(userId)) {
        keys.add(r.id)
        keys.add(r.name)
      }
    }
    return keys
  }
}
