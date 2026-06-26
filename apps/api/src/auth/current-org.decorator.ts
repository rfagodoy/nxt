import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from './jwt.strategy'

const ORG_CLAIM = process.env.OIDC_ORG_CLAIM || 'org_id'

/**
 * Injeta o organizationId do tenant a partir da claim do token (default `org_id`).
 * Substitui o antigo @Query('organizationId') / 'TODO_GET_FROM_CLERK': a origem
 * passa a ser o token assinado pelo Keycloak, nunca o cliente.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const payload: JwtPayload = ctx.switchToHttp().getRequest().user
    const orgId = payload?.[ORG_CLAIM]
    if (typeof orgId !== 'string' || !orgId) {
      throw new BadRequestException(`Token sem organização (claim "${ORG_CLAIM}" ausente)`)
    }
    return orgId
  },
)
