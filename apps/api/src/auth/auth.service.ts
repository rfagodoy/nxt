import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
import {
  RESET_TTL_MINUTES,
  RESPOSTA_NEUTRA,
  expiraEm,
  linkDeReset,
  podePedirDeNovo,
  tokenUtilizavel,
  type MotivoNaoEnviado,
} from './password-reset'
import { MailerService, layout, escapeHtml } from '../notifications/mailer.service'
import { isDeliverableEmail } from '../notifications/email-address'

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
  private readonly logger = new Logger('Auth')

  constructor(
    private readonly prisma: PrismaService,
    private readonly ipThrottle: IpThrottleService,
    private readonly mailer: MailerService,
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

  // ── Recuperação de senha ─────────────────────────────────────────────────────

  /** Pede o link. Responde SEMPRE a mesma coisa: sucesso, falha, e-mail inexistente,
   *  usuário inativo, canal de e-mail desligado. Qualquer diferença — inclusive no
   *  tempo de resposta ou no código HTTP — transformaria este endpoint público num
   *  detector de "quem tem conta aqui". */
  async requestPasswordReset(email: string, ctx: ClientContext = {}) {
    const norm = normalizeEmail(email)

    if (ctx.ip && !this.ipThrottle.check(ctx.ip)) {
      // Mesmo o excesso de tentativas responde neutro: um 429 seletivo também conta
      // algo a quem está sondando.
      this.logger.warn(`pedido de redefinição barrado por throttle de IP (${ctx.ip})`)
      return RESPOSTA_NEUTRA
    }

    try {
      const user = (await this.prisma.user.findFirst({ where: { email: norm } })) as UserRow | null
      const motivo = await this.motivoParaNaoEnviar(user)
      if (motivo) {
        // Só no log do servidor. O administrador precisa conseguir descobrir por que
        // "não chegou nada"; quem está do lado de fora, não.
        this.logger.log(`redefinição não enviada para ${norm}: ${motivo}`)
        await this.audit(norm, false, `reset_nao_enviado:${motivo}`, ctx, user ?? undefined)
        return RESPOSTA_NEUTRA
      }

      const alvo = user as UserRow
      // Pedido novo invalida os anteriores: dois links vivos ao mesmo tempo dobram a
      // janela de exposição sem dar nada em troca.
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: alvo.id, usedAt: null },
        data: { usedAt: new Date() },
      })

      const token = generateRefreshToken()
      await this.prisma.passwordResetToken.create({
        data: {
          userId: alvo.id,
          tokenHash: hashToken(token),
          expiresAt: expiraEm(),
          ipAddress: ctx.ip,
        },
      })

      const link = linkDeReset(process.env.WEB_URL ?? '', token)
      await this.mailer.send(alvo.organizationId, {
        to: alvo.email,
        subject: 'Nxt — redefinição de senha',
        text: `Para definir uma nova senha, abra: ${link}\n\nO link vale por ${RESET_TTL_MINUTES} minutos e só pode ser usado uma vez. Se não foi você que pediu, ignore esta mensagem — sua senha continua a mesma.`,
        html: layout(
          'Redefinição de senha',
          `<p>Recebemos um pedido para redefinir a senha de <strong>${escapeHtml(alvo.name)}</strong>.</p>
           <p style="margin:20px 0"><a href="${link}" style="background:#18C07A;color:#0C1410;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Definir nova senha</a></p>
           <p style="font-size:12px;color:#5B6B63">O link vale por ${RESET_TTL_MINUTES} minutos e só pode ser usado uma vez.</p>
           <p style="font-size:12px;color:#5B6B63">Se não foi você que pediu, ignore esta mensagem: sua senha continua a mesma.</p>`,
        ),
      })
      await this.audit(norm, true, 'reset_solicitado', ctx, alvo)
    } catch (e) {
      // Falha interna também responde neutro — e fica no log, que é onde importa.
      this.logger.error(`falha ao processar pedido de redefinição de ${norm}: ${String(e)}`)
    }
    return RESPOSTA_NEUTRA
  }

  private async motivoParaNaoEnviar(user: UserRow | null): Promise<MotivoNaoEnviado | null> {
    if (!user) return 'usuario-inexistente'
    if (user.status !== 'ATIVO') return 'usuario-inativo'
    if (!isDeliverableEmail(user.email)) return 'email-inentregavel'
    if (!(await this.mailer.enabled(user.organizationId))) return 'sem-canal-de-email'
    const ultimo = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (!podePedirDeNovo(ultimo?.createdAt)) return 'muito-recente'
    return null
  }

  /** Aplica a nova senha. O link é de uso único e some depois. */
  async resetPassword(token: string, novaSenha: string, ctx: ClientContext = {}) {
    const invalido = new BadRequestException('Link inválido ou expirado. Peça um novo.')
    if (!token) throw invalido

    const rec = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    })
    if (!tokenUtilizavel(rec)) throw invalido

    const user = (await this.prisma.user.findFirst({ where: { id: rec!.userId } })) as UserRow | null
    if (!user || user.status !== 'ATIVO') throw invalido

    assertStrongPassword(novaSenha, user.email)

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(novaSenha),
        // Quem esqueceu a senha muito provavelmente errou várias vezes antes e está
        // com a conta bloqueada. Redefinir e continuar trancado do lado de fora seria
        // resolver o problema e não deixar entrar.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    })
    await this.prisma.passwordResetToken.update({ where: { id: rec!.id }, data: { usedAt: new Date() } })

    // Se a senha foi trocada porque a conta pode ter sido comprometida, deixar as
    // sessões antigas vivas anularia a troca.
    await this.revokeAllForUser(user.id)
    await this.audit(user.email, true, 'reset_concluido', ctx, user)
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
