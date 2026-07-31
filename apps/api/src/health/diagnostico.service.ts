import { Injectable, Logger } from '@nestjs/common'
import { existsSync, readFileSync, statfsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { getHeapStatistics } from 'node:v8'
import { PrismaService } from '../prisma.service'
import { MailSettingsService } from '../notifications/mail-settings.service'
import { compararMigrations, migrationsNoDisco } from '../database/migrations-guard'

/* Diagnóstico da instalação: o que responder quando alguém diz "o sistema está
 * estranho" e ninguém tem acesso à máquina.
 *
 * O `/health` responde se o processo está VIVO — é o que o supervisor precisa saber, e
 * por isso continua trivial e aberto. Só que "vivo" não é "funcionando": a API sobe
 * perfeitamente com o banco lento, o disco cheio, o e-mail desconfigurado e o
 * agendador parado. Este endpoint olha para cada uma dessas coisas e diz qual está
 * ruim, para o suporte não depender de adivinhação nem de acesso remoto.
 */

export type Estado = 'ok' | 'atencao' | 'falha'

export interface ItemDiagnostico {
  item: string
  estado: Estado
  detalhe: string
  /** Só quando há o que fazer. */
  acao?: string
}

@Injectable()
export class DiagnosticoService {
  private readonly logger = new Logger('Diagnostico')
  private readonly iniciadoEm = Date.now()

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSettings: MailSettingsService,
  ) {}

  async completo(organizationId: string) {
    const itens: ItemDiagnostico[] = []
    itens.push(await this.banco())
    itens.push(await this.migracoes())
    itens.push(await this.email(organizationId))
    itens.push(this.disco())
    itens.push(this.memoria())
    itens.push(await this.agendador())

    const pior: Estado = itens.some((i) => i.estado === 'falha')
      ? 'falha'
      : itens.some((i) => i.estado === 'atencao')
        ? 'atencao'
        : 'ok'

    return {
      estado: pior,
      versao: this.versao(),
      ambiente: process.env.NODE_ENV ?? 'development',
      node: process.version,
      noArDesde: new Date(this.iniciadoEm).toISOString(),
      uptimeSegundos: Math.floor((Date.now() - this.iniciadoEm) / 1000),
      itens,
    }
  }

  private versao(): string {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }
      return pkg.version ?? 'desconhecida'
    } catch {
      return 'desconhecida'
    }
  }

  private async banco(): Promise<ItemDiagnostico> {
    const t0 = Date.now()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      const ms = Date.now() - t0
      /* 500ms num SELECT 1 não é "lento": é sinal de rede ou instância sofrendo, e
         costuma ser a causa real de "o sistema está travando". */
      if (ms > 500) return { item: 'Banco de dados', estado: 'atencao', detalhe: `Respondeu em ${ms}ms — acima do esperado.`, acao: 'Verifique a rede até o SQL Server e a carga da instância.' }
      return { item: 'Banco de dados', estado: 'ok', detalhe: `Respondeu em ${ms}ms.` }
    } catch (e) {
      return { item: 'Banco de dados', estado: 'falha', detalhe: `Sem resposta: ${e instanceof Error ? e.message : String(e)}`, acao: 'Confira a DATABASE_URL e se a instância está no ar.' }
    }
  }

  private async migracoes(): Promise<ItemDiagnostico> {
    try {
      const disco = migrationsNoDisco()
      if (!disco) return { item: 'Migrações', estado: 'atencao', detalhe: 'Pasta de migrações não encontrada neste empacotamento.' }
      const aplicadas = await this.prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
        SELECT migration_name, finished_at FROM _prisma_migrations`
      const { pendentes } = compararMigrations(disco, aplicadas)
      if (pendentes.length > 0) {
        return {
          item: 'Migrações',
          estado: 'falha',
          detalhe: `${pendentes.length} pendente(s): ${pendentes.join(', ')}`,
          acao: 'Rode "npm run db:deploy". (A API não sobe assim — se você está lendo isto, o banco mudou depois do boot.)',
        }
      }
      return { item: 'Migrações', estado: 'ok', detalhe: `${disco.length} aplicada(s), banco na versão do código.` }
    } catch (e) {
      return { item: 'Migrações', estado: 'atencao', detalhe: `Não foi possível conferir: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  private async email(organizationId: string): Promise<ItemDiagnostico> {
    try {
      const cfg = await this.mailSettings.resolve(organizationId)
      if (!cfg) {
        return {
          item: 'Envio de e-mail',
          estado: 'atencao',
          detalhe: 'Sem servidor configurado — os avisos ficam só no sininho.',
          acao: 'Configure em Configurações → E-mail, se os avisos devem sair por e-mail.',
        }
      }
      return { item: 'Envio de e-mail', estado: 'ok', detalhe: `Configurado (${cfg.host}:${cfg.port}).` }
    } catch (e) {
      return { item: 'Envio de e-mail', estado: 'atencao', detalhe: `Configuração ilegível: ${e instanceof Error ? e.message : String(e)}`, acao: 'Reconfigure em Configurações → E-mail.' }
    }
  }

  private disco(): ItemDiagnostico {
    /* A pasta de anexos só nasce no primeiro upload (LocalDiskDriver.save faz o mkdir).
       `statfsSync` recusa caminho inexistente, então medir o STORAGE_DIR direto fazia uma
       instalação recém-feita relatar "não foi possível medir" — um alarme falso bem na
       tela que existe para dizer o que ficou torto. O espaço é do VOLUME, não da pasta:
       subimos até o primeiro diretório que existe e medimos ali. `resolve` também tira a
       ambiguidade de um STORAGE_DIR relativo, que sem isso dependeria do cwd do processo. */
    const alvo = resolve(process.env.STORAGE_DIR || process.cwd())
    let dir = alvo
    while (!existsSync(dir)) {
      const pai = dirname(dir)
      if (pai === dir) break // chegou na raiz do volume; deixa o statfs falar
      dir = pai
    }
    try {
      const fs = statfsSync(dir)
      const livre = fs.bavail * fs.bsize
      const total = fs.blocks * fs.bsize
      const pctLivre = total > 0 ? (livre / total) * 100 : 100
      const gb = (n: number) => (n / 1024 ** 3).toFixed(1)
      /* Anexo é upload de usuário: disco cheio não derruba a API, só faz o próximo
         documento sumir com um erro que ninguém relaciona a espaço. */
      if (pctLivre < 5) return { item: 'Disco (anexos)', estado: 'falha', detalhe: `${gb(livre)} GB livres de ${gb(total)} GB (${pctLivre.toFixed(1)}%).`, acao: 'Libere espaço agora: novos anexos vão falhar.' }
      if (pctLivre < 15) return { item: 'Disco (anexos)', estado: 'atencao', detalhe: `${gb(livre)} GB livres de ${gb(total)} GB (${pctLivre.toFixed(1)}%).`, acao: 'Programe limpeza ou expansão.' }
      return { item: 'Disco (anexos)', estado: 'ok', detalhe: `${gb(livre)} GB livres de ${gb(total)} GB.` }
    } catch {
      return { item: 'Disco (anexos)', estado: 'atencao', detalhe: `Não foi possível medir o espaço em ${alvo}.` }
    }
  }

  private memoria(): ItemDiagnostico {
    const { heapUsed, rss } = process.memoryUsage()
    const mb = (n: number) => Math.round(n / 1024 ** 2)

    /* Comparar heapUsed com heapTotal NÃO serve para alarme: o V8 dimensiona o
       heapTotal pela demanda, então 90%+ é o estado NORMAL de um processo saudável —
       um alarme assim dispara sempre e ensina todo mundo a ignorá-lo.
       O que importa é a distância para o TETO do V8, que é onde o processo morre. */
    const teto = getHeapStatistics().heap_size_limit
    const pct = teto > 0 ? (heapUsed / teto) * 100 : 0

    if (pct > 90) return { item: 'Memória', estado: 'falha', detalhe: `${mb(heapUsed)} MB de ${mb(teto)} MB do limite do Node (${pct.toFixed(0)}%). RSS ${mb(rss)} MB.`, acao: 'Risco de o processo ser encerrado por falta de memória. Reinicie e investigue.' }
    if (pct > 75) return { item: 'Memória', estado: 'atencao', detalhe: `${mb(heapUsed)} MB de ${mb(teto)} MB do limite do Node (${pct.toFixed(0)}%). RSS ${mb(rss)} MB.`, acao: 'Acompanhe: se subir sem voltar, é vazamento.' }
    return { item: 'Memória', estado: 'ok', detalhe: `${mb(heapUsed)} MB em uso, limite do Node ${mb(teto)} MB · RSS ${mb(rss)} MB.` }
  }

  private async agendador(): Promise<ItemDiagnostico> {
    try {
      /* O agendador não deixa rastro próprio, mas deixa CONSEQUÊNCIA: se nenhum aviso
         foi criado nos últimos dias e existem tarefas abertas com prazo, ou não há o
         que avisar, ou o agendador parou. Vale como indício, não como prova. */
      const [ultimoAviso, tarefasAbertas] = await Promise.all([
        this.prisma.notification.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        this.prisma.workflowTask.count({ where: { status: 'PENDING' } }),
      ])
      if (!ultimoAviso) {
        return { item: 'Agendador de avisos', estado: 'ok', detalhe: tarefasAbertas > 0 ? 'Nenhum aviso ainda; há tarefas abertas.' : 'Nenhum aviso e nenhuma tarefa aberta.' }
      }
      const dias = Math.floor((Date.now() - ultimoAviso.createdAt.getTime()) / 86_400_000)
      if (dias > 7 && tarefasAbertas > 0) {
        return { item: 'Agendador de avisos', estado: 'atencao', detalhe: `Último aviso há ${dias} dia(s), com ${tarefasAbertas} tarefa(s) aberta(s).`, acao: 'Confira se o serviço ficou fora do ar ou se os avisos estão desligados.' }
      }
      return { item: 'Agendador de avisos', estado: 'ok', detalhe: `Último aviso há ${dias} dia(s).` }
    } catch (e) {
      return { item: 'Agendador de avisos', estado: 'atencao', detalhe: `Não foi possível conferir: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
}
