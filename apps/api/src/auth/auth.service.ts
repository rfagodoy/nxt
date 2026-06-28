import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma.service'
import { hashPassword, verifyPassword } from './password'
import { assertStrongPassword } from './password-policy'
import { generateRefreshToken, hashToken } from './token.util'
import { IpThrottleService } from './ip-throttle.service'
import { ClientContext } from './request-context'
import {
  ACCESS_TTL,
  JWT_ISSUER,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  REFRESH_TTL_DAYS,
} from './jwt.constants'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  organizationId: string
}

interface UserRow extends AuthUser {
  passwordHash: string
  status: string
  failedLoginAttempts: number
  lockedUntil: Date | null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function publicUser(u: UserRow | AuthUser): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organizationId }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ipThrottle: IpThrottleService,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(email: string, password: string, ctx: ClientContext = {}) {
    const norm = normalizeEmail(email)

    // Throttle por IP (defesa adicional contra força bruta distribuída).
    if (ctx.ip && !this.ipThrottle.check(ctx.ip)) {
      await this.audit(norm, false, 'ip_throttled', ctx)
      throw new HttpException('Muitas tentativas. Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS)
    }

    const invalid = new UnauthorizedException('Credenciais inválidas')
    const user = (await this.prisma.user.findFirst({ where: { email: norm } })) as UserRow | null
    if (!user) {
      await this.audit(norm, false, 'user_not_found', ctx)
      throw invalid
    }

    // Conta bloqueada por tentativas?
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit(norm, false, 'locked', ctx, user)
      throw new HttpException(
        'Conta temporariamente bloqueada por tentativas. Tente novamente mais tarde.',
        423, // Locked
      )
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok || user.status !== 'ATIVO') {
      await this.registerFailure(user)
      await this.audit(norm, false, ok ? 'inactive' : 'bad_password', ctx, user)
      throw invalid
    }

    // Sucesso: zera contador, marca último acesso.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    })
    await this.audit(norm, true, null, ctx, user)
    const tokens = await this.issueTokens(user, ctx)
    return { ...tokens, user: publicUser(user) }
  }

  private async registerFailure(user: UserRow): Promise<void> {
    const attempts = user.failedLoginAttempts + 1
    const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts }
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000)
      data.failedLoginAttempts = 0 // reinicia o contador ao aplicar o bloqueio
    }
    await this.prisma.user.update({ where: { id: user.id }, data })
  }

  // ── Refresh (rotação + detecção de reuso) ────────────────────────────────────
  async refresh(refreshToken: string, ctx: ClientContext = {}) {
    const invalid = new UnauthorizedException('Sessão inválida')
    if (!refreshToken) throw invalid

    const rec = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } })
    if (!rec) throw invalid

    // Token já revogado sendo reutilizado → possível roubo: revoga a família toda.
    if (rec.revokedAt) {
      await this.revokeAllForUser(rec.userId)
      throw invalid
    }
    if (rec.expiresAt < new Date()) throw invalid

    const user = (await this.prisma.user.findFirst({ where: { id: rec.userId } })) as UserRow | null
    if (!user || user.status !== 'ATIVO') throw invalid

    // Rotação: revoga o atual e emite um novo par.
    await this.prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } })
    const tokens = await this.issueTokens(user, ctx)
    return { ...tokens, user: publicUser(user) }
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    return { ok: true }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // ── Troca de senha pelo próprio usuário ──────────────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = (await this.prisma.user.findFirst({ where: { id: userId } })) as UserRow | null
    if (!user) throw new UnauthorizedException()
    const ok = await verifyPassword(currentPassword, user.passwordHash)
    if (!ok) throw new BadRequestException('Senha atual incorreta.')
    assertStrongPassword(newPassword, user.email)
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    })
    // Invalida sessões em outros dispositivos.
    await this.revokeAllForUser(userId)
    return { ok: true }
  }

  // ── Emissão de tokens ────────────────────────────────────────────────────────
  private async issueTokens(user: UserRow | AuthUser, ctx: ClientContext) {
    const accessToken = this.signAccess(user)
    const refreshToken = generateRefreshToken()
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
        userAgent: ctx.userAgent,
        ipAddress: ctx.ip,
      },
    })
    return { accessToken, refreshToken }
  }

  /** Access token (HS256, curto). Mantém o formato de claims do legado OIDC. */
  signAccess(user: UserRow | AuthUser): string {
    const options: jwt.SignOptions = {
      algorithm: 'HS256',
      subject: user.id,
      issuer: JWT_ISSUER,
      jwtid: randomUUID(), // torna cada token único (e habilita revogação por jti no futuro)
      expiresIn: ACCESS_TTL as jwt.SignOptions['expiresIn'],
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

  private async audit(
    email: string,
    success: boolean,
    reason: string | null,
    ctx: ClientContext,
    user?: UserRow,
  ): Promise<void> {
    await this.prisma.loginEvent.create({
      data: {
        email,
        success,
        reason: reason ?? undefined,
        organizationId: user?.organizationId,
        userId: user?.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      },
    })
  }
}
