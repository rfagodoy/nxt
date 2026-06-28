import type { Request } from 'express'

export interface ClientContext {
  ip?: string
  userAgent?: string
}

/**
 * Extrai IP e user-agent do request. Atrás do BFF (web → API), o IP real do
 * cliente vem em X-Forwarded-For (o web encaminha); senão usa req.ip.
 */
export function clientContext(req: Request): ClientContext {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  const ua = req.headers['user-agent'] as string | undefined
  return { ip: fwd || req.ip, userAgent: ua?.slice(0, 300) }
}
