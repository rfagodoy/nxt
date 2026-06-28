import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { hashPassword } from '../auth/password'
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

  private async getOwned(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return user
  }

  async create(organizationId: string, dto: CreateUserDto) {
    const email = normalizeEmail(dto.email)
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
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: USER_SELECT,
    })
  }

  async changePassword(organizationId: string, id: string, password: string) {
    await this.getOwned(organizationId, id)
    const passwordHash = await hashPassword(password)
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
    return { ok: true }
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
