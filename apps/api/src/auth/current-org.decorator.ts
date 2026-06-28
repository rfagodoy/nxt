import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from './jwt.strategy'

const ORG_CLAIM = process.env.OIDC_ORG_CLAIM || 'org_id'

/**
 * Injeta o organizationId do tenant a partir da claim do token (default `org_id`).
 * A origem é sempre o token (JWT assinado pela própria API), nunca o cliente.
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
