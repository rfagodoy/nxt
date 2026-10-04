import { ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import {
  alteracoesTravadas, faltantesDaGravacao, acaoDaGravacao, fraseDasTravas, fraseDosFaltantes,
  pickDefaultScreen, reconcileNative, screenEntityFromVars, travasDaEtapa,
  type LockContext, type Screen,
} from '@nxt/screens-core'
import { nasceDeContrato, type StepFormSchema } from '@nxt/types'
import { PrismaService } from '../prisma.service'
import { WorkflowRolesService } from '../workflow-roles/workflow-roles.service'
import { canActOnTask } from '../instances/task-access'
import { formSchemaDaInstancia } from '../processes/definicao-congelada'
import type { CurrentUserData } from '../auth/current-user.decorator'
import { RoleAssignmentsService } from '../role-assignments/role-assignments.service'
import { parteForaDaRestricao, restricaoDaInstancia } from '../instances/regras-de-inicio'

type Obj = Record<string, unknown>
export type SujeitoTela = 'CONTRATO' | 'FORNECEDOR'

/** Cabeçalhos com que a tela diz "esta gravação é da tarefa X, pela aba Y". */
export const CABECALHO_TAREFA = 'x-nxt-tarefa'
export const CABECALHO_TELA   = 'x-nxt-tela'

export interface OrigemDaGravacao {
  tarefaId?: string
  telaId?: string
}

/** O subject dos VALORES personalizados tem outro nome que o da tela. */
const SUBJECT_VALOR: Record<SujeitoTela, 'CONTRACT' | 'PARTNER'> = { CONTRATO: 'CONTRACT', FORNECEDOR: 'PARTNER' }
const CONTRACT_NUMBERING_KEY = 'nxt:settings:parametros:contrato-numeracao'

export interface TelaQueVale {
  screen: Screen | null
  lock: LockContext
  /** de onde veio a tela — vai para o log quando a tarefa não pôde ser usada */
  origem: 'padrao' | 'tarefa'
  /** a instância da tarefa (só origem 'tarefa'): regra de quem inicia + variáveis */
  instancia?: { kind: string | null; formSchema: unknown; variables: Obj }
}

/**
 * As Telas valendo NA API. Até aqui a tela dizia quem pode alterar o quê (travas) e o
 * que é exigido (obrigatórios), mas só o navegador obedecia: quem chamasse a API direto
 * gravava campo travado numa boa. A regra é a do @nxt/screens-core — a mesma da tela.
 *
 * QUAL tela vale:
 *  - pelo menu: a tela PADRÃO do tipo, resolvida aqui. O cliente não escolhe.
 *  - numa tarefa: a tela da aba, com as travas da etapa — desde que a tarefa esteja
 *    pendente, a pessoa possa agir nela, o registro seja o do processo e a tela seja
 *    mesmo uma aba daquela etapa. Qualquer coisa fora disso cai na tela padrão: um
 *    cabeçalho forjado só pode apertar, nunca afrouxar.
 *
 * A conferência mora no CONTROLLER (pedido da tela), não no service: importação, rotina
 * automática dos contratos e conectores do workflow não passam por tela nenhuma.
 */
@Injectable()
export class ConferenciaTelaService {
  private readonly logger = new Logger('ConferenciaTela')

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: WorkflowRolesService,
    private readonly roleAssignments: RoleAssignmentsService,
  ) {}

  /** Lê a origem dos cabeçalhos do pedido (Express normaliza para minúsculas). */
  static origemDe(headers: Record<string, unknown> | undefined): OrigemDaGravacao {
    const um = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    return { tarefaId: um(headers?.[CABECALHO_TAREFA]), telaId: um(headers?.[CABECALHO_TELA]) }
  }

  async telaPadrao(organizationId: string, subject: SujeitoTela): Promise<Screen | null> {
    const telas = await this.prisma.screen.findMany({
      where:   { organizationId, subjectType: subject, status: 'ACTIVE', isDefault: true },
      include: { sections: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } },
    })
    return pickDefaultScreen(telas as unknown as Screen[])
  }

  /** A tela que vale para esta gravação, com as camadas de trava da etapa (se houver). */
  async telaQueVale(p: {
    organizationId: string
    subject: SujeitoTela
    actor: CurrentUserData
    origem: OrigemDaGravacao
    /** registro sendo editado; null = criação */
    entidadeId: string | null
  }): Promise<TelaQueVale> {
    if (p.origem.tarefaId && p.origem.telaId) {
      const daTarefa = await this.daTarefa(p).catch(err => {
        this.logger.warn(`Tarefa ${p.origem.tarefaId} não pôde ser lida: ${(err as Error).message}`)
        return null
      })
      if (daTarefa) return daTarefa
      this.logger.warn(`Gravação com tarefa ${p.origem.tarefaId}/tela ${p.origem.telaId} não conferiu — vale a tela padrão`)
    }
    return { screen: await this.telaPadrao(p.organizationId, p.subject), lock: {}, origem: 'padrao' }
  }

  private async daTarefa(p: Parameters<ConferenciaTelaService['telaQueVale']>[0]): Promise<TelaQueVale | null> {
    const task = await this.prisma.workflowTask.findFirst({
      where:   { id: p.origem.tarefaId, instance: { processDefinition: { organizationId: p.organizationId } } },
      include: { instance: { include: { processDefinition: true } } },
    })
    if (!task || task.status !== 'PENDING' || task.instance.status !== 'RUNNING') return null
    const roleKeys = await this.roles.roleKeysForUser(p.organizationId, p.actor.sub)
    if (!canActOnTask(task, p.actor.sub, roleKeys, p.actor.roles?.includes('admin') ?? false)) return null

    const fs = await formSchemaDaInstancia(this.prisma, task.instance)
    const step = fs?.steps?.find(s => s.stepId === task.nodeId) as StepFormSchema | undefined
    if (!step?.screenRef || (step.screenSubject ?? 'FORNECEDOR') !== p.subject) return null

    /* o registro tem de ser o do processo; criação só numa etapa que cria e ainda não criou */
    const vars = ((task.instance.state as { variables?: Obj } | null)?.variables ?? {}) as Obj
    const doProcesso = screenEntityFromVars(step, vars)
    if (p.entidadeId ? doProcesso !== p.entidadeId : (step.entityMode !== 'CREATE' || doProcesso)) return null

    const lock = travasDaEtapa(step, p.origem.telaId!)
    if (!lock) return null
    const tela = await this.prisma.screen.findFirst({
      where:   { id: p.origem.telaId, organizationId: p.organizationId, subjectType: p.subject },
      include: { sections: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } },
    })
    if (!tela) return null
    return {
      screen: reconcileNative(tela as unknown as Screen), lock, origem: 'tarefa',
      instancia: { kind: task.instance.processDefinition.kind ?? null, formSchema: fs, variables: vars },
    }
  }

  async valoresGravados(organizationId: string, subject: SujeitoTela, entidadeId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.screenFieldValue.findMany({
      where:  { organizationId, subjectType: SUBJECT_VALOR[subject], subjectId: entidadeId },
      select: { fieldId: true, value: true },
    })
    return Object.fromEntries(rows.map(r => [r.fieldId, r.value]))
  }

  private async numeracaoAutomatica(organizationId: string): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key: CONTRACT_NUMBERING_KEY } },
    })
    return (row?.value as { modo?: string } | null)?.modo === 'AUTO'
  }

  /**
   * Confere uma gravação de registro (e, junto, dos personalizados que vêm no mesmo pedido).
   * Recusa com 403 `CAMPO_TRAVADO` ou 422 `CAMPOS_OBRIGATORIOS`, mensagem em português e a
   * lista dos campos — nada é gravado antes desta conferência passar.
   */
  async conferir(p: {
    organizationId: string
    subject: SujeitoTela
    actor: CurrentUserData
    origem: OrigemDaGravacao
    entidadeId: string | null
    antes: Obj | null
    depois: Obj
    customDepois?: Record<string, string>
    /** só personalizados (PUT /screen-values): obrigatório não se cobra por ali — quem
     *  ativa é a gravação do registro, que já conferiu tudo junto */
    soPersonalizados?: boolean
  }): Promise<void> {
    const { screen, lock, instancia } = await this.telaQueVale(p)
    const customAntes = p.entidadeId ? await this.valoresGravados(p.organizationId, p.subject, p.entidadeId) : {}

    if (screen) {
      const travas = alteracoesTravadas({
        subject: p.subject, screen, lock, antes: p.antes, depois: p.depois, customAntes, customDepois: p.customDepois,
      })
      if (travas.length)
        throw new ForbiddenException({
          statusCode: 403, error: 'Forbidden', code: 'CAMPO_TRAVADO',
          message: fraseDasTravas(travas), campos: travas,
        })
    }
    if (p.soPersonalizados) return

    /* Contrato NOVO num processo com "Quem inicia" por parte do contrato (PO, 04/10/2026): a
       parte fica restrita às entidades em que quem iniciou ocupa o papel. */
    if (p.subject === 'CONTRATO' && instancia && !nasceDeContrato(instancia.kind)) {
      const r = await restricaoDaInstancia(this.prisma, this.roleAssignments, p.organizationId,
        instancia.formSchema as never, instancia.variables)
      const frase = r && parteForaDaRestricao(r.restricoes, p.depois.partes ?? p.antes?.partes, r.rotulo)
      if (frase) throw new UnprocessableEntityException({ statusCode: 422, error: 'Unprocessable Entity', code: 'PARTE_RESTRITA', message: frase })
    }

    const autoNumero = p.subject === 'CONTRATO' && !p.antes ? await this.numeracaoAutomatica(p.organizationId) : false
    const faltantes = faltantesDaGravacao({
      subject: p.subject, screen, lock, antes: p.antes, depois: p.depois, customAntes, customDepois: p.customDepois, autoNumero,
    })
    if (faltantes.length)
      throw new UnprocessableEntityException({
        statusCode: 422, error: 'Unprocessable Entity', code: 'CAMPOS_OBRIGATORIOS',
        message: fraseDosFaltantes(faltantes, acaoDaGravacao(p.subject, p.antes, p.depois)), campos: faltantes,
      })
  }

  /** Registro gravado, na forma da API — o "antes" da conferência. */
  async registro(organizationId: string, subject: SujeitoTela, id: string): Promise<Obj> {
    const r = subject === 'CONTRATO'
      ? await this.prisma.contract.findFirst({ where: { id, organizationId } })
      : await this.prisma.partner.findFirst({ where: { id, organizationId } })
    if (!r) throw new NotFoundException(subject === 'CONTRATO' ? 'Contrato não encontrado' : 'Parceiro não encontrado')
    return r as unknown as Obj
  }
}
