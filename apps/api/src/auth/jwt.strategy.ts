import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JWT_ISSUER } from './jwt.constants'

/**
 * Claims do access token emitido pela própria aplicação (HS256, assinado com
 * `AUTH_JWT_SECRET`). `org_id` identifica o tenant (organizationId) e
 * `realm_access.roles` carrega o papel do usuário — formato mantido para que
 * CurrentOrg/CurrentUser continuem funcionando sem mudança.
 */
export interface JwtPayload {
  sub: string
  email?: string
  preferred_username?: string
  org_id?: string
  role?: string
  realm_access?: { roles: string[] }
  [claim: string]: unknown
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.AUTH_JWT_SECRET
    if (!secret) {
      throw new Error('AUTH_JWT_SECRET não configurado — auth não pode inicializar')
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      secretOrKey: secret,
    })
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload?.sub) throw new UnauthorizedException('Token sem subject')
    return payload
  }
}
