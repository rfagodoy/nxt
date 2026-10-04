import { contractFromApi, isContratoEncerrado, partesVigentes } from '@nxt/contracts-core'
import { nasceDeContrato, VAR_INICIADO_POR, type QuemInicia, type RegraDeInicio } from '@nxt/types'
import type { PrismaService } from '../prisma.service'
import type { RoleAssignmentsService } from '../role-assignments/role-assignments.service'
import type { CurrentUserData } from '../auth/current-user.decorator'
import { entidadesDoStakeholder } from './executor-resolver'

type Obj = Record<string, unknown>
export type Restricao = { papelId: string; stakeholder: string; ids: string[] }
type Atribuicao = { papelId: string; entityType: string; entityId: string | null }

/** Pura: a pessoa (pelas atribuições dela) atende à regra? `contrato` só conta em regra por
 *  stakeholder num workflow que nasce de contrato; sem ele, basta ocupar o papel em algum lugar. */
export function atendeRegra(
  r: RegraDeInicio,
  minhas: readonly Atribuicao[],
  opts: { contrato?: Obj | null; nasceDeContrato?: boolean; rotulo?: (id: string) => string } = {},
): boolean {
  const doPapel = minhas.filter((a) => a.papelId === r.papelId && (a.entityType === r.entityType || r.entityType === 'ORG'))
  if (!doPapel.length) return false
  if (r.entityId) return doPapel.some((a) => a.entityId === r.entityId)
  if (!r.stakeholder) return true
  if (!opts.nasceDeContrato || !opts.contrato) return true // contrato novo (ou ainda não escolhido)
  const { entidades } = entidadesDoStakeholder({ entityType: r.entityType, stakeholder: r.stakeholder }, opts.contrato, opts.rotulo ?? (() => 'parte'))
  return entidades.some((e) => doPapel.some((a) => a.entityId === e.id))
}

/** Restrição da parte no contrato NOVO (PO, 04/10/2026): as entidades em que quem iniciou ocupa
 *  o papel, por stakeholder. `null` = sem restrição (regra sem stakeholder atendida, admin, aberto). */
export function restricaoDeParte(cfg: QuemInicia | undefined, minhas: readonly Atribuicao[]): Restricao[] | null {
  if (!cfg || cfg.modo !== 'PAPEIS') return null
  const atendidas = cfg.regras.filter((r) => atendeRegra(r, minhas))
  if (!atendidas.length || atendidas.some((r) => !r.stakeholder)) return null
  return atendidas.map((r) => ({
    papelId: r.papelId,
    stakeholder: r.stakeholder!,
    ids: [...new Set(minhas.filter((a) => a.papelId === r.papelId && a.entityType === r.entityType && a.entityId).map((a) => a.entityId!))],
  }))
}

/**
 * QUEM PODE INICIAR um workflow (PO, 04/10/2026). Uma regra só, usada na partida (API recusa),
 * na lista do "Novo processo", no "Qual contrato?" e na restrição da parte do contrato novo.
 * Administrador sempre pode (socorro).
 */
export class RegrasDeInicio {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignments: RoleAssignmentsService,
  ) {}

  async atribuicoes(organizationId: string, userId: string): Promise<Atribuicao[]> {
    return this.prisma.roleAssignment.findMany({
      where: { organizationId, userId },
      select: { papelId: true, entityType: true, entityId: true },
    })
  }

  /** Pode iniciar? `contratoId` presente = já escolheu o contrato (Aditivo/Encerramento). */
  async avaliar(
    organizationId: string,
    actor: CurrentUserData | undefined,
    proc: { formSchema: unknown; kind?: string | null },
    contratoId?: string | null,
  ): Promise<{ pode: boolean; motivo?: string; porContrato: boolean }> {
    const cfg = (proc.formSchema as { quemInicia?: QuemInicia } | null)?.quemInicia
    const porContrato = nasceDeContrato(proc.kind) && !!cfg && cfg.modo === 'PAPEIS' && cfg.regras.some((r) => r.stakeholder)
    if (!cfg || cfg.modo !== 'PAPEIS' || actor?.roles?.includes('admin')) return { pode: true, porContrato: false }
    if (!actor?.sub) return { pode: false, porContrato, motivo: 'Faça login para iniciar o processo.' }
    const [minhas, rotulos] = await Promise.all([this.atribuicoes(organizationId, actor.sub), this.roleAssignments.papelLabels(organizationId)])
    const contrato = contratoId ? await this.prisma.contract.findFirst({ where: { id: contratoId, organizationId } }) : null
    const rotulo = (id: string) => rotulos.get(id) ?? 'parte'
    const ok = cfg.regras.some((r) => atendeRegra(r, minhas, { contrato: contrato as Obj | null, nasceDeContrato: nasceDeContrato(proc.kind), rotulo }))
    if (ok) return { pode: true, porContrato }
    const quem = cfg.regras.map((r) => `${rotulo(r.papelId)}${r.stakeholder ? ` da ${rotulo(r.stakeholder)}${nasceDeContrato(proc.kind) ? ' do contrato' : ''}` : ''}`)
    return {
      pode: false, porContrato,
      motivo: `Este workflow só pode ser iniciado por: ${quem.join('; ')}${contratoId ? ' — e você não ocupa esse papel neste contrato' : ''}. Se você deveria poder, peça ao administrador para cadastrá-lo em Responsáveis.`,
    }
  }

  /** "Qual contrato?" de quem tem regra por stakeholder: só os contratos em que a pessoa se qualifica. */
  async contratosPermitidos(organizationId: string, actor: CurrentUserData | undefined, proc: { formSchema: unknown; kind?: string | null }) {
    const todos = await this.prisma.contract.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' } })
    const vivos = todos.filter((c) => !isContratoEncerrado(c.situacao))
    const linha = (c: (typeof todos)[number]) => ({
      id: c.id, numero: c.numero, titulo: c.titulo, situacao: c.situacao,
      parte_principal: partesVigentes(contractFromApi(c as unknown as Obj))[0]?.nome ?? null,
    })
    const cfg = (proc.formSchema as { quemInicia?: QuemInicia } | null)?.quemInicia
    if (!cfg || cfg.modo !== 'PAPEIS' || actor?.roles?.includes('admin') || !actor?.sub) return vivos.map(linha)
    const [minhas, rotulos] = await Promise.all([this.atribuicoes(organizationId, actor.sub), this.roleAssignments.papelLabels(organizationId)])
    const rotulo = (id: string) => rotulos.get(id) ?? 'parte'
    return vivos.filter((c) => cfg.regras.some((r) => atendeRegra(r, minhas, { contrato: c as unknown as Obj, nasceDeContrato: true, rotulo }))).map(linha)
  }
}

/** Pura: as partes do contrato respeitam a restrição? Basta UMA regra atendida servir: toda parte
 *  no stakeholder dela é uma das entidades de quem iniciou. Parte ainda vazia não é assunto daqui
 *  (obrigatório é da tela). Devolve a frase da recusa, ou null. */
export function parteForaDaRestricao(
  restricoes: Restricao[],
  partes: unknown,
  rotulo: (id: string) => string,
): string | null {
  const lista = (Array.isArray(partes) ? partes : []) as Array<{ papel?: string; ref_id?: string; nome?: string }>
  const fora = restricoes.map((r) => lista.filter((p) => p.papel === r.stakeholder && p.ref_id && !r.ids.includes(p.ref_id)))
  if (fora.some((f) => !f.length)) return null
  const r = restricoes[0]
  const nomes = fora[0].map((p) => p.nome || 'a entidade escolhida').join(', ')
  return `Neste processo, “${rotulo(r.stakeholder)}” só pode ser onde quem iniciou o processo é ${rotulo(r.papelId)} — ${nomes} não é.`
}

/** Restrição da parte para uma instância: lê quem iniciou (`__iniciadoPor`) e a regra congelada. */
export async function restricaoDaInstancia(
  prisma: PrismaService,
  roleAssignments: RoleAssignmentsService,
  organizationId: string,
  formSchema: { quemInicia?: QuemInicia } | null | undefined,
  variables: Obj,
): Promise<{ restricoes: Restricao[]; rotulo: (id: string) => string } | null> {
  const cfg = formSchema?.quemInicia
  const iniciador = typeof variables[VAR_INICIADO_POR] === 'string' ? (variables[VAR_INICIADO_POR] as string) : ''
  if (!cfg || cfg.modo !== 'PAPEIS' || !iniciador) return null
  const u = await prisma.user.findFirst({ where: { id: iniciador, organizationId }, select: { role: true } })
  if (!u || u.role === 'admin') return null
  const minhas = await prisma.roleAssignment.findMany({
    where: { organizationId, userId: iniciador }, select: { papelId: true, entityType: true, entityId: true },
  })
  const restricoes = restricaoDeParte(cfg, minhas)
  if (!restricoes) return null
  const rotulos = await roleAssignments.papelLabels(organizationId)
  return { restricoes, rotulo: (id) => rotulos.get(id) ?? 'parte' }
}
