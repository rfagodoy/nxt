import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma.service'
import { verifyPassword } from './password'
import { JWT_ISSUER, JWT_TTL } from './jwt.constants'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  organizationId: string
}

/** Normaliza e-mail para chave de login estável (sempre minúsculo, sem espaços). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida credenciais. Mensagem genérica em qualquer falha (e-mail inexistente,
   * senha errada ou usuário inativo) para não vazar quais e-mails existem.
   */
  async validateUser(email: string, password: string): Promise<AuthUser> {
    const invalid = new UnauthorizedException('Credenciais inválidas')
    const user = await this.prisma.user.findFirst({ where: { email: normalizeEmail(email) } })
    if (!user) throw invalid
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok || user.status !== 'ATIVO') throw invalid
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    }
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password)
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return { token: this.sign(user), user }
  }

  /** Emite o nosso access token (HS256). Mantém o formato de claims do legado OIDC. */
  sign(user: AuthUser): string {
    const options: jwt.SignOptions = {
      algorithm: 'HS256',
      subject: user.id,
      issuer: JWT_ISSUER,
      expiresIn: JWT_TTL as jwt.SignOptions['expiresIn'],
    }
    return jwt.sign(
      {
        email: user.email,
        preferred_username: user.email,
        name: user.name,
        org_id: user.organizationId,
        role: user.role,
        realm_access: { roles: [user.role] },
      },
      process.env.AUTH_JWT_SECRET as string,
      options,
    )
  }
}
