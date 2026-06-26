import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'

/**
 * Claims do access token emitido pelo Keycloak.
 * `org_id` é injetado por um protocol mapper do realm (atributo do usuário/organização)
 * e identifica o tenant (organizationId).
 */
export interface JwtPayload {
  sub: string
  email?: string
  preferred_username?: string
  realm_access?: { roles: string[] }
  resource_access?: Record<string, { roles: string[] }>
  [claim: string]: unknown
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const issuer = process.env.OIDC_ISSUER_URL
    if (!issuer) {
      throw new Error('OIDC_ISSUER_URL não configurado — auth não pode inicializar')
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer,
      // Só valida audience se OIDC_AUDIENCE estiver definido (mapper de audience no realm).
      ...(process.env.OIDC_AUDIENCE ? { audience: process.env.OIDC_AUDIENCE } : {}),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`,
      }),
    })
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.sub) throw new UnauthorizedException('Token sem subject')
    return payload
  }
}
