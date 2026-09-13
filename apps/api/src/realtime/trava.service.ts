import { Injectable, Logger } from '@nestjs/common'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma.service'

/* Trava das rotinas automáticas ENTRE INSTÂNCIAS da API.
 *
 * Motor de datas, varredura de prazos, expurgo e resumo de e-mails rodam dentro do
 * processo, com setTimeout/setInterval. Com uma instância isso basta; com duas, cada
 * rotina rodaria duas vezes — o resumo diário chegaria em dobro e o motor de datas
 * poderia rodar por cima dele mesmo. A trava mora no banco, que é a única coisa que
 * todas as instâncias enxergam.
 *
 * A trava EXPIRA: se a instância que a segurava cair no meio, ela se solta sozinha
 * no fim do prazo, e a rotina não fica presa para sempre.
 *
 * Não é reentrante de propósito: a própria instância que segura a trava também não a
 * pega de novo antes de expirar. É isso que torna "uma vez por dia" verdadeiro. */

/** Identidade desta instância — gravada na trava e útil no log. */
export const ESTA_INSTANCIA = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`

export type ResultadoTrava<T> = { executou: false } | { executou: true; resultado: T }

@Injectable()
export class TravaService {
  private readonly logger = new Logger('Trava')
  /** Não é readonly só para os testes simularem duas instâncias no mesmo processo. */
  dono = ESTA_INSTANCIA

  constructor(private readonly prisma: PrismaService) {}

  /** Pega a trava se ela estiver livre ou vencida. `true` = é desta instância. */
  async adquirir(nome: string, duracaoMs: number): Promise<boolean> {
    const agora = new Date()
    const ate = new Date(agora.getTime() + duracaoMs)
    /* UPDATE condicional numa instrução só: quando duas instâncias chegam juntas, o banco
       serializa — a segunda reavalia a condição depois da primeira e já encontra a trava
       tomada (0 linhas). */
    const r = await this.prisma.schedulerLock.updateMany({
      where: { name: nome, lockedUntil: { lt: agora } },
      data: { holder: this.dono, lockedUntil: ate },
    })
    if (r.count > 0) return true
    try {
      await this.prisma.schedulerLock.create({ data: { name: nome, holder: this.dono, lockedUntil: ate } })
      return true
    } catch (e) {
      // a linha já existe e está válida, ou outra instância a criou neste instante
      if ((e as { code?: string }).code === 'P2002') return false
      throw e
    }
  }

  /** Solta a trava — só se ela ainda for desta instância. */
  async liberar(nome: string): Promise<void> {
    try {
      await this.prisma.schedulerLock.updateMany({
        where: { name: nome, holder: this.dono },
        data: { lockedUntil: new Date(0) },
      })
    } catch (e) {
      // se não soltar, ela expira sozinha no fim do prazo
      this.logger.warn(`não foi possível liberar a trava "${nome}": ${String(e)}`)
    }
  }

  /**
   * Executa `fn` só se esta instância pegar a trava.
   * - `liberarAoFim = true`: evita duas execuções AO MESMO TEMPO (motor de datas).
   * - `liberarAoFim = false`: vira "no máximo uma vez por janela" (rotina periódica,
   *   resumo diário) — a trava fica até expirar.
   * Com erro, a trava é sempre liberada: uma falha não pode bloquear a rotina até o
   * fim do prazo; a próxima tentativa (desta ou de outra instância) pode rodar.
   */
  async executar<T>(nome: string, duracaoMs: number, fn: () => Promise<T>, liberarAoFim = true): Promise<ResultadoTrava<T>> {
    let pegou = false
    try {
      pegou = await this.adquirir(nome, duracaoMs)
    } catch (e) {
      this.logger.warn(`não foi possível obter a trava "${nome}" — rotina não executada: ${String(e)}`)
      return { executou: false }
    }
    if (!pegou) return { executou: false }
    try {
      const resultado = await fn()
      if (liberarAoFim) await this.liberar(nome)
      return { executou: true, resultado }
    } catch (e) {
      await this.liberar(nome)
      throw e
    }
  }
}
