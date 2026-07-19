import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { hashPassword } from '../auth/password'
import { assertStrongPassword } from '../auth/password-policy'
import { normalizeEmail } from '../auth/auth.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

// Nunca expõe passwordHash.
const USER_SELECT = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: USER_SELECT,
    })
  }

  /** Lista mínima para SELETORES (qualquer autenticado): usuários ATIVOS, só id/nome/email.
   *  Não expõe papel de acesso, datas nem nada sensível — é só para escolher uma pessoa. */
  selectable(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, status: 'ATIVO' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    })
  }

  private async getOwned(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return user
  }

  async create(organizationId: string, dto: CreateUserDto) {
    const email = normalizeEmail(dto.email)
    assertStrongPassword(dto.password, email)
    const exists = await this.prisma.user.findFirst({ where: { organizationId, email } })
    if (exists) throw new ConflictException('Já existe um usuário com esse e-mail')
    const passwordHash = await hashPassword(dto.password)
    return this.prisma.user.create({
      data: {
        organizationId,
        email,
        name: dto.name.trim(),
        role: dto.role ?? 'user',
        passwordHash,
      },
      select: USER_SELECT,
    })
  }

  async update(organizationId: string, id: string, dto: UpdateUserDto) {
    const target = await this.getOwned(organizationId, id)
    await this.assertNotLastAdmin(organizationId, target, dto)
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: USER_SELECT,
    })
    // Desativar o usuário derruba as sessões abertas dele na hora.
    if (dto.status === 'INATIVO') await this.revokeSessions(id)
    return updated
  }

  async changePassword(organizationId: string, id: string, password: string) {
    const target = await this.getOwned(organizationId, id)
    assertStrongPassword(password, target.email)
    const passwordHash = await hashPassword(password)
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
    // Reset de senha pelo admin revoga as sessões do usuário.
    await this.revokeSessions(id)
    return { ok: true }
  }

  /** Revoga todos os refresh tokens ativos do usuário (logout forçado). */
  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Impede deixar o tenant sem nenhum administrador ativo. */
  private async assertNotLastAdmin(
    organizationId: string,
    target: { id: string; role: string; status: string },
    dto: UpdateUserDto,
  ) {
    const losesAdmin =
      target.role === 'admin' &&
      target.status === 'ATIVO' &&
      ((dto.role !== undefined && dto.role !== 'admin') || dto.status === 'INATIVO')
    if (!losesAdmin) return
    const others = await this.prisma.user.count({
      where: { organizationId, role: 'admin', status: 'ATIVO', id: { not: target.id } },
    })
    if (others === 0) {
      throw new BadRequestException('Não é possível remover o último administrador ativo')
    }
  }
}
