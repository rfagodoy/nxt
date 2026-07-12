import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from './jwt.strategy'

export interface CurrentUserData {
  sub: string
  email?: string
  username?: string
  /** rótulo humano do autor para a auditoria (nome; cai para username/e-mail/sub) */
  name: string
  roles: string[]
}

/**
 * Injeta os dados do usuário autenticado a partir das claims do token. A origem é
 * SEMPRE o JWT assinado pela API, nunca o corpo da requisição — por isso `name` serve
 * de "autor" confiável na auditoria: um cliente não consegue forjar quem fez a ação.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const payload: JwtPayload = ctx.switchToHttp().getRequest().user
    return {
      sub: payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      name: payload.name || payload.preferred_username || payload.email || payload.sub || 'Usuário',
      roles: payload.realm_access?.roles ?? [],
    }
  },
)
