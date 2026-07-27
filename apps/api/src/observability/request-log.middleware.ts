import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { contextoRequisicao } from './structured-logger'
import { nivelPorStatus, rotaGenerica } from './log-format'

/* Log de acesso + id de correlação.
 *
 * Por que existe: sem isto, a única pista de um problema em produção é o relato do
 * usuário. Com isto, o suporte pergunta "qual o código do erro?" e cai direto na linha
 * — e dá para responder quanto tempo cada endpoint leva sem instrumentar nada além.
 *
 * O id vai no cabeçalho da RESPOSTA (`x-request-id`) de propósito: a tela pode mostrá-lo
 * ao usuário, e aí o número que ele lê ao telefone é o mesmo que está no log.
 *
 * Não registra corpo, cabeçalho de autorização nem query com dado pessoal — só método,
 * rota genérica, status, duração e tamanho.
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    /* Reaproveita o id que o proxy mandou, se houver: numa cadeia com Nginx na frente,
       o mesmo id atravessa tudo e o rastro fica contínuo. */
    const doProxy = req.headers['x-request-id']
    const requestId = (typeof doProxy === 'string' && doProxy.length <= 64 ? doProxy : randomUUID().slice(0, 8))

    res.setHeader('x-request-id', requestId)
    const inicio = process.hrtime.bigint()

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6
      const rota = rotaGenerica(req.originalUrl ?? req.url)
      const nivel = nivelPorStatus(res.statusCode)
      const linha = `${req.method} ${rota} ${res.statusCode} ${ms.toFixed(1)}ms`

      /* Health check não polui o log: é chamado a cada poucos segundos pelo
         monitoramento e afogaria tudo o que interessa. Falha nele, sim, aparece. */
      if (rota.endsWith('/health') && res.statusCode < 400) return

      if (nivel === 'error') this.logger.error(linha)
      else if (nivel === 'warn') this.logger.warn(linha)
      else this.logger.log(linha)
    })

    contextoRequisicao.run({ requestId }, () => next())
  }
}
