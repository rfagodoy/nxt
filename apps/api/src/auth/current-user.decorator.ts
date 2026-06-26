import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from './jwt.strategy'

export interface CurrentUserData {
  sub: string
  email?: string
  username?: string
  roles: string[]
}

/** Injeta os dados do usuário autenticado a partir das claims do token. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const payload: JwtPayload = ctx.switchToHttp().getRequest().user
    return {
      sub: payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      roles: payload.realm_access?.roles ?? [],
    }
  },
)
