import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from './roles.decorator'
import { JwtPayload } from './jwt.strategy'

/**
 * Autorização por papel. Roda depois do JwtAuthGuard global (que já populou
 * request.user a partir do token). Sem @Roles na rota, libera.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required?.length) return true

    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user
    const roles = user?.realm_access?.roles ?? (user?.role ? [user.role] : [])
    if (!required.some((r) => roles.includes(r))) {
      throw new ForbiddenException('Acesso restrito')
    }
    return true
  }
}
