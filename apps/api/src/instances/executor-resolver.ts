import { contractFromApi, partesVigentes } from '@nxt/contracts-core'
import { EXECUTOR_CONTRATO_DO_PROCESSO, EXECUTOR_QUEM_INICIOU, VAR_INICIADO_POR } from '@nxt/types'
import type { WfNode } from '@nxt/workflow-core'
import type { PrismaService } from '../prisma.service'
import type { RoleAssignmentsService } from '../role-assignments/role-assignments.service'
import { resolveContractId } from './connector-helpers'

type Obj = Record<string, unknown>
type Executor = NonNullable<WfNode['executor']>

export interface EntidadeAlvo { tipo: string; id: string; nome: string }

/** Rótulo do TIPO da entidade, para a frase de "por que não achou ninguém". */
const TIPO_LABEL: Record<string, string> = {
  UNIDADE: 'uma unidade', EMPRESA: 'uma empresa do grupo', PARCEIRO: 'um parceiro', CONTRATO: 'um contrato',
}

/**
 * PURA: em que entidade(s) procurar o papel de pessoa, a partir do contrato do processo —
 * ou por que não há nenhuma. Vale a parte VIGENTE (cessões de aditivos ativos aplicadas).
 * Duas partes com o mesmo papel = as duas (decisão do PO, 04/10/2026).
 */
export function entidadesDoStakeholder(
  ex: Pick<Executor, 'entityType' | 'stakeholder'>,
  contrato: Obj | null,
  rotulo: (papelId: string) => string,
): { entidades: EntidadeAlvo[]; falta?: string } {
  if (!contrato) return { entidades: [], falta: 'o processo não tem contrato' }
  if (ex.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO)
    return { entidades: [{ tipo: 'CONTRATO', id: String(contrato.id), nome: `contrato ${String(contrato.numero ?? '')}`.trim() }] }

  const st = rotulo(ex.stakeholder ?? '')
  const comPapel = partesVigentes(contractFromApi(contrato)).filter(p => p.papel === ex.stakeholder && p.ref_id)
  if (!comPapel.length) return { entidades: [], falta: `nenhuma parte do contrato está como “${st}”` }
  const certas = comPapel.filter(p => p.ref_tipo === ex.entityType)
  if (!certas.length) {
    const tipo = TIPO_LABEL[comPapel[0].ref_tipo] ?? 'outro tipo de entidade'
    return { entidades: [], falta: `quem está como “${st}” neste contrato é ${tipo}, não ${TIPO_LABEL[ex.entityType] ?? 'o tipo do papel'}` }
  }
  const vistos = new Set<string>()
  const entidades: EntidadeAlvo[] = []
  for (const p of certas) {
    if (vistos.has(p.ref_id)) continue
    vistos.add(p.ref_id)
    entidades.push({ tipo: p.ref_tipo, id: p.ref_id, nome: p.nome || p.ref_id })
  }
  return { entidades }
}

const listaPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

export interface ExecutorResolvido {
  /** quem pode executar (o pool da tarefa) */
  assignees: string[]
  /** por que foi para quem foi — só no executor pelo contrato */
  nota: string | null
  /** ninguém encontrado: o pool são os administradores */
  semExecutor: boolean
  /** detalhe para o "Testar com um contrato" */
  entidades?: EntidadeAlvo[]
}

/**
 * Resolve o executor de uma atividade. Fixa, técnica (variável antiga) e global seguem como
 * sempre foram; a novidade é o executor "Da variável" pelo CONTRATO do processo
 * (`stakeholder`): papel de pessoa + a entidade que está no contrato naquele papel.
 * Nesse modo, quando ninguém é encontrado, a tarefa vai para os ADMINISTRADORES com um aviso
 * — não cai aberta para qualquer um (decisão do PO, 04/10/2026).
 */
export class ResolvedorDeExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignments: RoleAssignmentsService,
  ) {}

  async resolver(node: Pick<WfNode, 'executor'> | undefined, organizationId: string, variables: Obj): Promise<ExecutorResolvido> {
    const ex = node?.executor
    const nada: ExecutorResolvido = { assignees: [], nota: null, semExecutor: false }
    if (!ex?.papelId) return nada
    if (ex.papelId === EXECUTOR_QUEM_INICIOU) return this.quemIniciou(organizationId, variables)
    if (ex.entityType === 'ORG')
      return { ...nada, assignees: await this.roleAssignments.resolveUsers(organizationId, ex.papelId, 'ORG', undefined) }
    if (ex.mode === 'VARIAVEL' && ex.stakeholder)
      return this.peloContrato(ex, organizationId, resolveContractId(variables) ?? null)
    let entityId: string | undefined
    if (ex.mode === 'VARIAVEL') {
      const v = variables[ex.entityVar ?? '']
      entityId = v == null || v === '' ? undefined : String(v)
    } else entityId = ex.entityId || undefined
    if (!entityId) return nada // comportamento antigo: tarefa aberta
    return { ...nada, assignees: await this.roleAssignments.resolveUsers(organizationId, ex.papelId, ex.entityType, entityId) }
  }

  /** O mesmo cálculo, para o editor mostrar "para quem iria hoje" com um contrato escolhido. */
  async prever(ex: Executor, organizationId: string, contratoId: string): Promise<ExecutorResolvido & { pessoas: string[] }> {
    const r = await this.peloContrato(ex, organizationId, contratoId)
    const pessoas = r.semExecutor || !r.assignees.length ? [] : (await this.prisma.user.findMany({
      where: { organizationId, id: { in: r.assignees } }, select: { name: true }, orderBy: { name: 'asc' },
    })).map(u => u.name)
    return { ...r, pessoas }
  }

  /** Executor "Quem iniciou o processo" (PO, 04/10/2026): a pessoa que clicou em "+ Novo processo",
   *  gravada em `__iniciadoPor` na partida. Inativa (ou instância antiga sem o dado) = administradores
   *  + aviso, a mesma regra do "sem executor". */
  private async quemIniciou(organizationId: string, variables: Obj): Promise<ExecutorResolvido> {
    const id = typeof variables[VAR_INICIADO_POR] === 'string' ? (variables[VAR_INICIADO_POR] as string) : ''
    const u = id ? await this.prisma.user.findFirst({ where: { id, organizationId }, select: { id: true, status: true } }) : null
    if (u?.status === 'ATIVO') return { assignees: [u.id], nota: 'Quem iniciou o processo', semExecutor: false }
    const admins = await this.prisma.user.findMany({ where: { organizationId, role: 'admin', status: 'ATIVO' }, select: { id: true } })
    const motivo = u ? 'quem iniciou o processo está inativo' : 'não se sabe quem iniciou o processo'
    return { assignees: admins.map(a => a.id), nota: `Sem executor: ${motivo}. Encaminhada aos administradores para delegar.`, semExecutor: true }
  }

  private async peloContrato(ex: Executor, organizationId: string, contratoId: string | null): Promise<ExecutorResolvido> {
    const [contrato, catalogo] = await Promise.all([
      contratoId ? this.prisma.contract.findFirst({ where: { id: contratoId, organizationId } }) : Promise.resolve(null),
      this.roleAssignments.papelLabels(organizationId),
    ])
    const rotulo = (id: string) => catalogo.get(id) ?? 'parte'
    const papel = rotulo(ex.papelId)
    const { entidades, falta } = entidadesDoStakeholder(ex, contrato as Obj | null, rotulo)

    const pool = new Set<string>()
    for (const e of entidades)
      for (const u of await this.roleAssignments.resolveUsers(organizationId, ex.papelId, e.tipo, e.id)) pool.add(u)
    if (pool.size) {
      const onde = listaPt(entidades.map(e => e.nome))
      const nota = ex.stakeholder === EXECUTOR_CONTRATO_DO_PROCESSO
        ? `${papel} do ${onde}`
        : `${papel} de ${onde} — está como “${rotulo(ex.stakeholder ?? '')}” no contrato`
      return { assignees: [...pool], nota, semExecutor: false, entidades }
    }

    const motivo = falta ?? `ninguém é ${papel} em ${listaPt(entidades.map(e => e.nome))}`
    const admins = await this.prisma.user.findMany({
      where: { organizationId, role: 'admin', status: 'ATIVO' }, select: { id: true },
    })
    return {
      assignees: admins.map(a => a.id),
      nota: `Sem executor: ${motivo}. Encaminhada aos administradores para delegar.`,
      semExecutor: true,
      entidades,
    }
  }
}
