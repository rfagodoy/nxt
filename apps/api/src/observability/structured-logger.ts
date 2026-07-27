import { ConsoleLogger, type LogLevel } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'
import { formatarJson, formatarTexto, type EventoLog } from './log-format'

/* Contexto por requisição: guarda o id de correlação sem que cada camada precise
 * passá-lo adiante. Sem isso, "me manda o log deste erro" vira "qual das 200 linhas
 * daquele segundo é a sua?". */
export const contextoRequisicao = new AsyncLocalStorage<{ requestId: string }>()

export const requestIdAtual = (): string | undefined => contextoRequisicao.getStore()?.requestId

/** Logger do Nest com saída estruturada em produção.
 *
 *  Estende o ConsoleLogger em vez de substituí-lo para que TODO log do framework —
 *  inclusive o que o Nest emite sozinho no boot e nos erros — passe pelo mesmo formato.
 *  Um logger novo só para o nosso código deixaria metade das linhas no formato antigo,
 *  que é pior do que não ter formato nenhum. */
export class StructuredLogger extends ConsoleLogger {
  private readonly json = process.env.LOG_FORMAT
    ? process.env.LOG_FORMAT === 'json'
    : process.env.NODE_ENV === 'production'

  private emitir(nivel: EventoLog['nivel'], mensagem: unknown, contexto?: string) {
    const evento: EventoLog = {
      nivel,
      contexto: contexto ?? this.context,
      mensagem: typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem),
      requestId: requestIdAtual(),
      timestamp: new Date().toISOString(),
    }
    const linha = this.json ? formatarJson(evento) : formatarTexto(evento)
    // stderr para erro/aviso: quem opera separa os dois fluxos no serviço.
    if (nivel === 'error' || nivel === 'warn') process.stderr.write(linha + '\n')
    else process.stdout.write(linha + '\n')
  }

  log(mensagem: unknown, contexto?: string) { this.emitir('log', mensagem, contexto) }
  warn(mensagem: unknown, contexto?: string) { this.emitir('warn', mensagem, contexto) }
  debug(mensagem: unknown, contexto?: string) { this.emitir('debug', mensagem, contexto) }
  verbose(mensagem: unknown, contexto?: string) { this.emitir('verbose', mensagem, contexto) }

  error(mensagem: unknown, pilha?: string, contexto?: string) {
    this.emitir('error', mensagem, contexto)
    /* A pilha vai numa linha própria e só quando existe: em JSON ela transformaria a
       linha do evento num paredão, e é justamente a linha do evento que o coletor lê. */
    if (pilha) process.stderr.write(pilha + '\n')
  }

  setLogLevels(levels: LogLevel[]) { super.setLogLevels(levels) }
}
