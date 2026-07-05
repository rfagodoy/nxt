import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

const DAY = 86_400_000

/* ── rótulos ── */
const PARTNER_EVENT_LABEL: Record<string, string> = {
  EM_CADASTRAMENTO: 'cadastrou',
  ATIVADO:          'ativou',
  INATIVADO:        'inativou',
  REATIVADO:        'reativou',
  ALTERADO:         'atualizou',
}

/**
 * Distribui datas em N baldes mensais terminando no mês atual e calcula o
 * delta % do mês corrente vs. o anterior. Alimenta as sparklines do dashboard.
 */
function buildSeries(dates: Date[], months = 6): { series: number[]; deltaPct: number | null } {
  const now = new Date()
  const currentKey = now.getFullYear() * 12 + now.getMonth()
  const buckets = new Array(months).fill(0) as number[]
  for (const d of dates) {
    const key = d.getFullYear() * 12 + d.getMonth()
    const idx = months - 1 - (currentKey - key)
    if (idx >= 0 && idx < months) buckets[idx]++
  }
  const cur = buckets[months - 1]
  const prev = buckets[months - 2] ?? 0
  const deltaPct = prev === 0 ? (cur > 0 ? 100 : null) : Math.round(((cur - prev) / prev) * 100)
  return { series: buckets, deltaPct }
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const stuckThreshold = new Date(Date.now() - 3 * DAY)

    const [
      contracts,
      partners,
      processTotal,
      processActive,
      runningCount,
      recordsTotal,
      stuckRaw,
      auditLogs,
      recentContracts,
    ] = await Promise.all([
      this.prisma.contract.findMany({
        where:  { organizationId },
        select: {
          id: true, numero: true, titulo: true, situacao: true,
          terminoVigencia: true, prazoIndeterminado: true, valorTotal: true, createdAt: true, aditivos: true,
        },
      }),
      this.prisma.partner.findMany({
        where:  { organizationId },
        select: { id: true, status: true, createdAt: true },
      }),
      this.prisma.processDefinition.count({ where: { organizationId } }),
      this.prisma.processDefinition.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.processInstance.count({ where: { status: 'RUNNING', processDefinition: { organizationId } } }),
      this.prisma.moduleRecord.count({ where: { module: { organizationId } } }),
      this.prisma.processInstance.findMany({
        where:   { status: 'RUNNING', processDefinition: { organizationId }, updatedAt: { lt: stuckThreshold } },
        include: { processDefinition: { select: { name: true } } },
        orderBy: { updatedAt: 'asc' },
        take:    6,
      }),
      this.prisma.partnerAuditLog.findMany({
        where:   { partner: { organizationId } },
        include: { partner: { select: { razaoSocial: true } } },
        orderBy: { createdAt: 'desc' },
        take:    10,
      }),
      this.prisma.contract.findMany({
        where:   { organizationId },
        select:  { id: true, numero: true, titulo: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    6,
      }),
    ])

    /* ── Contratos ── (situação/término/valor VIGENTES: aplica aditivos ATIVOS e deriva VENCIDO) ── */
    const pad = (n: number) => String(n).padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const derivar = (c: (typeof contracts)[number]) => {
      let termino = c.terminoVigencia
      let valor = c.valorTotal ?? 0
      for (const a of ((c.aditivos as unknown as Array<Record<string, unknown>>) ?? [])) {
        if (a.situacao === 'RASCUNHO') continue  // só aditivo ATIVO aplica (legado sem situacao = ativo)
        if (a.alteraTermino && a.novoTermino) termino = a.novoTermino as string
        if (a.alteraValor && a.novoValor != null) valor += Number(a.novoValor) || 0
      }
      let situacao = c.situacao
      if (situacao === 'VIGENTE' && !c.prazoIndeterminado && termino && termino < todayStr) situacao = 'VENCIDO'
      return { termino, valor, situacao }
    }

    const contractsByStatus: Record<string, number> = {}
    let valorAtivos = 0
    for (const c of contracts) {
      const d = derivar(c)
      contractsByStatus[d.situacao] = (contractsByStatus[d.situacao] ?? 0) + 1
      if (d.situacao === 'VIGENTE') valorAtivos += d.valor
    }
    const contractSeries = buildSeries(contracts.map(c => c.createdAt))

    const expiring = contracts
      .map(c => ({ c, d: derivar(c) }))
      .filter(({ c, d }) => d.termino && !c.prazoIndeterminado && d.situacao === 'VIGENTE')
      .map(({ c, d }) => {
        const t = new Date(d.termino + 'T00:00:00')
        const daysLeft = Math.round((t.getTime() - today.getTime()) / DAY)
        return { id: c.id, numero: c.numero, titulo: c.titulo, terminoVigencia: d.termino as string, daysLeft }
      })
      .filter(e => e.daysLeft >= 0 && e.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6)

    /* ── Parceiros ── */
    const partnersByStatus: Record<string, number> = {}
    for (const p of partners) partnersByStatus[p.status] = (partnersByStatus[p.status] ?? 0) + 1
    const partnerSeries = buildSeries(partners.map(p => p.createdAt))

    /* ── Instâncias paradas ── */
    const stuck = stuckRaw.map(i => ({
      id:          i.id,
      processName: i.processDefinition.name,
      currentStep: i.currentStep,
      daysStuck:   Math.floor((Date.now() - i.updatedAt.getTime()) / DAY),
    }))

    /* ── Atividade recente (parceiros + contratos), unificada por data ── */
    type Activity = { id: string; kind: 'partner' | 'contract'; title: string; detail: string; user: string | null; at: string }
    const activity: Activity[] = [
      ...auditLogs.map(l => ({
        id:     l.id,
        kind:   'partner' as const,
        title:  l.partner?.razaoSocial ?? 'Parceiro',
        detail: PARTNER_EVENT_LABEL[l.event] ?? 'atualizou',
        user:   l.user,
        at:     l.createdAt.toISOString(),
      })),
      ...recentContracts.map(c => ({
        id:     c.id,
        kind:   'contract' as const,
        title:  c.titulo || `Contrato ${c.numero}`,
        detail: 'criado',
        user:   null,
        at:     c.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 8)

    const attentionCount = expiring.length + stuck.length

    return {
      contracts: {
        total:        contracts.length,
        byStatus:     contractsByStatus,
        valorAtivos,
        series:       contractSeries.series,
        deltaPct:     contractSeries.deltaPct,
        expiring,
      },
      partners: {
        total:    partners.length,
        byStatus: partnersByStatus,
        series:   partnerSeries.series,
        deltaPct: partnerSeries.deltaPct,
      },
      processes: { total: processTotal, active: processActive },
      instances: { running: runningCount, stuck },
      records:   { total: recordsTotal },
      activity,
      attentionCount,
    }
  }
}
