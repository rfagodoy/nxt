import { Injectable } from '@nestjs/common'
import { IP_MAX_HITS, IP_WINDOW_MS } from './jwt.constants'

/**
 * Throttle por IP em memória (janela deslizante). Barra força bruta distribuída
 * por vários e-mails a partir de um mesmo IP. Para múltiplas instâncias, trocar
 * por um store compartilhado (Redis); para o cenário on-prem (VM única) basta.
 */
@Injectable()
export class IpThrottleService {
  private readonly hits = new Map<string, number[]>()

  /** Registra a tentativa e retorna `true` se ainda está dentro do limite. */
  check(ip: string, max = IP_MAX_HITS, windowMs = IP_WINDOW_MS): boolean {
    const now = Date.now()
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < windowMs)
    recent.push(now)
    this.hits.set(ip, recent)
    if (this.hits.size > 5000) this.cleanup(now, windowMs)
    return recent.length <= max
  }

  private cleanup(now: number, windowMs: number): void {
    for (const [ip, times] of this.hits) {
      const fresh = times.filter((t) => now - t < windowMs)
      if (fresh.length) this.hits.set(ip, fresh)
      else this.hits.delete(ip)
    }
  }
}
