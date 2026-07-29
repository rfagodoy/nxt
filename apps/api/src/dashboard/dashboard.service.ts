import { Injectable } from '@nestjs/common'
import { effectiveSituacao, terminoVigente, todayISO, valorVigente, type CoreContract } from '@nxt/contracts-core'
import { PrismaService } from '../prisma.service'
import { InstancesService } from '../instances/instances.service'

const DAY = 86_400_000

/* ── rótulos ── */
/* Ação no padrão "Usuário + Ação + Descrição": o verbo termina em "o parceiro", logo antes
   do nome (title), simétrico a "cadastrou o contrato". */
const PARTNER_EVENT_LABEL: Record<string, string> = {
  EM_CADASTRAMENTO: 'cadastrou o parceiro',
  EM_REVISAO:       'habilitou para alteração o parceiro',
  ATIVADO:          'ativou o parceiro',
  INATIVADO:        'inativou o parceiro',
  REATIVADO:        'reativou o parceiro',
  ALTERADO:         'atualizou o parceiro',
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

/** Em curso = ainda pode andar. ERROR entra: a instância dá retry e o prazo segue
 *  correndo — é assim que a tela de Processos também a trata. */
const emCurso = (i: { status: string }) => i.status === 'RUNNING' || i.status === 'ERROR'

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instances: InstancesService,
  ) {}

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
      instanciasDerivadas,
      stuckRaw,
      auditLogs,
      recentContractLogs,
      orgUsers,
    ] = await Promise.all([
      this.prisma.contract.findMany({
        where:  { organizationId },
        select: {
          id: true, numero: true, titulo: true, situacao: true,
          terminoVigencia: true, prazoIndeterminado: true, valorTotal: true, createdAt: true,
          /* `valorVigente` soma os deltas dos reajustes e o valorPeriodo das renovações —
             sem estes campos o dashboard mostrava o valor ORIGINAL do contrato. */
          aditivos: true, renovacoes: true, reajustesRealizados: true,
        },
      }),
      this.prisma.partner.findMany({
        where:  { organizationId },
        select: { id: true, status: true, createdAt: true },
      }),
      this.prisma.processDefinition.count({ where: { organizationId } }),
      this.prisma.processDefinition.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.processInstance.count({ where: { status: 'RUNNING', processDefinition: { organizationId } } }),
      /* Instâncias JÁ DERIVADAS (situação efetiva + atraso do processo) — mesma fonte
         que a tela de Processos usa, para os números baterem entre as duas telas. */
      this.instances.listInstances(organizationId),
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
      /* Atividade "cadastrou o contrato": vem da AUDITORIA (evento CRIADO), que carrega o
         autor. Os contratos crus não guardam quem cadastrou — por isso antes vinha sem usuário. */
      this.prisma.contractAuditLog.findMany({
        where:   { event: 'CRIADO', contract: { organizationId } },
        include: { contract: { select: { numero: true, titulo: true } } },
        orderBy: { createdAt: 'desc' },
        take:    6,
      }),
      /* usuários da org → resolve o nome ATUAL do autor pelo userId da auditoria (renome reflete) */
      this.prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    ])

    /* nome vivo do autor: userId → nome atual; cai para o snapshot (`user`) em logs sem id (Sistema/legado) */
    const userName = new Map(orgUsers.map(u => [u.id, u.name]))
    const autor = (userId: string | null | undefined, snapshot: string) => (userId ? userName.get(userId) : undefined) ?? snapshot

    /* ── Contratos ── estado VIGENTE (aditivos ATIVOS + renovações + reajustes aplicados)
       derivado por @nxt/contracts-core, a mesma implementação da listagem e do detalhe. */
    const todayStr = todayISO()
    const derivar = (c: (typeof contracts)[number]) => {
      const termino = terminoVigente(c as unknown as CoreContract)
      return {
        termino,
        valor: valorVigente(c as unknown as CoreContract),
        situacao: effectiveSituacao(c.situacao, c.prazoIndeterminado ? '' : termino, todayStr),
      }
    }

    /* CANCELADO fica FORA de tudo que o dashboard resume — decisão do PO em 28/07.
       O cancelado é o contrato que NUNCA chegou a valer (o processo que o criou foi
       cancelado), então contá-lo inflava um número lido como carteira real. Ele não
       some do sistema: a listagem de Contratos continua mostrando e filtrando por ele,
       porque lá a pergunta é "o que existe cadastrado", não "o que eu tenho em mãos". */
    const carteira = contracts
      .map(c => ({ c, d: derivar(c) }))
      .filter(({ d }) => d.situacao !== 'CANCELADO')

    const contractsByStatus: Record<string, number> = {}
    let valorAtivos = 0
    for (const { d } of carteira) {
      contractsByStatus[d.situacao] = (contractsByStatus[d.situacao] ?? 0) + 1
      /* VENCIDO é um VIGENTE cujo término passou (derivado, nunca gravado). No somatório do
         card ele conta como vigente: o contrato segue em vigor até ser renovado/encerrado. */
      if (d.situacao === 'VIGENTE' || d.situacao === 'VENCIDO') valorAtivos += d.valor
    }
    const contractSeries = buildSeries(carteira.map(({ c }) => c.createdAt))

    const expiring = carteira
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
        detail: PARTNER_EVENT_LABEL[l.event] ?? 'atualizou o parceiro',
        user:   autor(l.userId, l.user),
        at:     l.createdAt.toISOString(),
      })),
      ...recentContractLogs.map(l => ({
        id:     l.id,
        kind:   'contract' as const,
        /* descrição = Número + Título do contrato */
        title:  [l.contract?.numero, l.contract?.titulo].filter(Boolean).join(' — ') || 'contrato',
        detail: 'cadastrou o contrato',
        user:   autor(l.userId, l.user),
        at:     l.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 8)

    const attentionCount = expiring.length + stuck.length

    return {
      contracts: {
        /* Total da CARTEIRA (sem cancelados) — casa com a soma das barras do card. */
        total:        carteira.length,
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
      instances: {
        running: runningCount,
        stuck,
        /* Composição do que EXISTE de execução, para o gráfico: em andamento (no prazo
           e atrasadas), concluídas, canceladas e com erro. "Atrasado" aqui é o MESMO
           conceito da tela de Processos — nunca um segundo cálculo. */
        total: instanciasDerivadas.length,
        emAndamentoNoPrazo: instanciasDerivadas.filter((i) => emCurso(i) && !i.processOverdue).length,
        emAndamentoAtrasadas: instanciasDerivadas.filter((i) => emCurso(i) && i.processOverdue).length,
        concluidas: instanciasDerivadas.filter((i) => i.status === 'COMPLETED').length,
        canceladas: instanciasDerivadas.filter((i) => i.status === 'CANCELLED').length,
        comErro: instanciasDerivadas.filter((i) => i.status === 'ERROR').length,
      },
      activity,
      attentionCount,
    }
  }
}
