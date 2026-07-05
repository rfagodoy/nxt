import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'

/* Motor de datas do contrato: roda diariamente (agendador in-process, sem dependência
   externa) e também via POST /api/notifications/run. Duas tarefas:
   1) AÇÃO no término: renovação automática (cláusula → renovacoes[], NÃO gera aditivo) e
      encerramento automático — tudo logado na auditoria como usuário "Sistema".
   2) AVISO: gera/atualiza notificações de Vigência, Reajuste e Consumo conforme os
      parâmetros (AppSetting), com dedup; resolve (remove) as que não valem mais. */

export const NOTIF_PARAMS_KEY = 'nxt:settings:notificacoes'

interface Params {
  vigencia: { enabled: boolean; dias: number[] }        // faixas de antecedência (ex.: [60,30,7])
  reajuste: { enabled: boolean; dias: number }          // antecedência única (dias)
  consumo:  { enabled: boolean; percentuais: number[] } // limites (ex.: [80,100])
  renovacaoAutomatica: boolean                          // liga/desliga a renovação global
}
export const DEFAULT_PARAMS: Params = {
  vigencia: { enabled: true, dias: [60, 30, 7] },
  reajuste: { enabled: true, dias: 15 },
  consumo:  { enabled: true, percentuais: [80, 100] },
  renovacaoAutomatica: true,
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const pad = (n: number) => String(n).padStart(2, '0')
function todayISO(): string { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function addToDate(iso: string, anos: number, meses: number, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCFullYear(dt.getUTCFullYear() + anos)
  dt.setUTCMonth(dt.getUTCMonth() + meses)
  dt.setUTCDate(dt.getUTCDate() + dias)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(toISO.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}
const fmtBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const fmtMesAno = (iso: string) => (iso ? iso.slice(0, 7).split('-').reverse().join('/') : '') // mm/aaaa (data base de reajuste)
const label = (c: any) => c.titulo || `Contrato ${c.numero}`

interface Upsert { dedupKey: string; contractId: string; tipo: string; severidade: string; titulo: string; mensagem: string }

@Injectable()
export class ContractSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('ContractScheduler')
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  onModuleInit() {
    /* agendador in-process: dispara ~3h da manhã, todo dia (sem @nestjs/schedule) */
    const scheduleNext = () => {
      const now = new Date()
      const next = new Date(now)
      next.setHours(3, 0, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      setTimeout(() => { void this.runAll().finally(scheduleNext) }, next.getTime() - now.getTime())
    }
    scheduleNext()
    /* varredura no boot (com atraso) para não deixar pendências acumuladas */
    setTimeout(() => { void this.runAll() }, 20_000)
  }

  private async runAll() {
    try {
      const orgs = await this.prisma.contract.findMany({ distinct: ['organizationId'], select: { organizationId: true } })
      for (const { organizationId } of orgs) await this.runForOrg(organizationId)
    } catch (e) { this.logger.error(`runAll falhou: ${String(e)}`) }
  }

  /** Executa o motor para UMA organização. Retorna um resumo (usado pelo endpoint /run). */
  async runForOrg(organizationId: string) {
    const params = await this.loadParams(organizationId)
    const today = todayISO()
    const contracts = await this.prisma.contract.findMany({ where: { organizationId } }) as any[]
    let renovados = 0, encerrados = 0
    const activeKeys: string[] = []
    const upserts: Upsert[] = []

    for (const c of contracts) {
      /* 1) AÇÃO no término */
      if (c.situacao === 'VIGENTE' && !c.prazoIndeterminado) {
        let termino = this.terminoVigente(c)
        if (termino && termino < today) {
          if (c.acaoTermino === 'RENOVAR' && params.renovacaoAutomatica) {
            const anos = Number(c.renovacaoAnos) || 0, meses = Number(c.renovacaoMeses) || 0, dias = Number(c.renovacaoDias) || 0
            if (anos || meses || dias) {
              const renos = [...((c.renovacoes as any[]) ?? [])]
              let guard = 0
              while (termino && termino < today && guard++ < 120) {
                const novo = addToDate(termino, anos, meses, dias)
                if (novo <= termino) break // prazo inválido → evita loop infinito
                renos.push({ id: `${Date.now()}_${guard}`, data: today, terminoAnterior: termino, novoTermino: novo, automatica: true })
                termino = novo; renovados++
              }
              await this.prisma.contract.update({ where: { id: c.id }, data: { renovacoes: renos as never } })
              c.renovacoes = renos
              await this.audit(c.id, 'RENOVADO', [{ field: 'renovacao', label: 'Renovação automática', before: '—', after: `vigência estendida até ${fmtBR(termino)}` }])
            }
          } else if (c.acaoTermino === 'ENCERRAR') {
            await this.prisma.contract.update({ where: { id: c.id }, data: { situacao: 'ENCERRADO' } })
            c.situacao = 'ENCERRADO'; encerrados++
            await this.audit(c.id, 'ENCERRADO', [{ field: 'situacao', label: 'Situação', before: 'Vigente', after: 'Encerrado' }])
          }
          /* MANUAL: não age — entra na notificação de vigência abaixo */
        }
      }

      /* 2) AVISOS */
      const termino = this.terminoVigente(c)

      // Vigência
      if (params.vigencia.enabled && c.situacao === 'VIGENTE' && !c.prazoIndeterminado && termino) {
        const dl = daysBetween(today, termino)
        const dias = [...params.vigencia.dias].sort((a, b) => a - b)
        const maxT = dias[dias.length - 1] ?? 0
        if (dl >= 0 && dl <= maxT) {
          const sev = dl <= (dias[0] ?? 0) ? 'CRITICO' : dl <= (dias[1] ?? dias[0] ?? 0) ? 'ALERTA' : 'INFO'
          const key = `vigencia:${c.id}`; activeKeys.push(key)
          upserts.push({ dedupKey: key, contractId: c.id, tipo: 'VIGENCIA', severidade: sev,
            titulo: `Vigência: vence em ${dl} dia(s)`, mensagem: `${label(c)} vence em ${fmtBR(termino)} (${dl} dia(s)).` })
        }
      }

      // Reajuste (só contrato vigente; a próxima data é DERIVADA, ancorada no último reajuste aplicado)
      if (params.reajuste.enabled && c.situacao === 'VIGENTE') {
        const realizados = (c.reajustesRealizados as any[]) ?? []
        for (const r of ((c.reajustes as any[]) ?? [])) {
          if (!r.data || !r.indice) continue
          /* âncora = última competência já aplicada desta linha; sem nenhuma, a data base do cadastro */
          const comps = realizados.filter(x => x.reajusteId === r.id).map(x => String(x.competencia || '').slice(0, 7)).filter(Boolean).sort()
          const anchor = (comps.length ? comps[comps.length - 1] : String(r.data).slice(0, 7)) + '-01'
          const nextDue = addToDate(anchor, 0, this.stepMeses(r.periodicidade), 0)  // uma periodicidade após a âncora
          const key = `reajuste:${c.id}:${r.id}`
          if (nextDue <= today) {
            /* Fase 2: a data já passou e não há reajuste aplicado para ela → pendente (crítico) */
            activeKeys.push(key)
            upserts.push({ dedupKey: key, contractId: c.id, tipo: 'REAJUSTE', severidade: 'CRITICO',
              titulo: 'Reajuste pendente de aplicação', mensagem: `${label(c)}: reajuste pendente de aplicação desde ${fmtMesAno(nextDue)}.` })
          } else {
            const dl = daysBetween(today, nextDue)
            if (dl >= 0 && dl <= params.reajuste.dias) {
              activeKeys.push(key)
              upserts.push({ dedupKey: key, contractId: c.id, tipo: 'REAJUSTE', severidade: dl <= 3 ? 'ALERTA' : 'INFO',
                titulo: `Reajuste em ${dl} dia(s)`, mensagem: `${label(c)}: reajuste previsto para ${fmtMesAno(nextDue)}.` })
            }
          }
        }
      }

      // Consumo
      if (params.consumo.enabled) {
        const valor = this.valorVigente(c)
        if (valor > 0) {
          const pct = Math.round((this.consumo(c) / valor) * 100)
          const limites = [...params.consumo.percentuais].sort((a, b) => a - b)
          const crossed = limites.filter(l => pct >= l)
          if (crossed.length) {
            const maior = crossed[crossed.length - 1]
            const key = `consumo:${c.id}`; activeKeys.push(key)
            upserts.push({ dedupKey: key, contractId: c.id, tipo: 'CONSUMO', severidade: pct >= 100 ? 'CRITICO' : 'ALERTA',
              titulo: `Consumo em ${pct}%`, mensagem: `${label(c)}: ${pct}% do valor consumido (limite ${maior}%).` })
          }
        }
      }
    }

    /* grava/atualiza notificações ativas */
    for (const u of upserts) {
      await this.prisma.notification.upsert({
        where:  { organizationId_dedupKey: { organizationId, dedupKey: u.dedupKey } },
        create: { organizationId, contractId: u.contractId, tipo: u.tipo, severidade: u.severidade, titulo: u.titulo, mensagem: u.mensagem, dedupKey: u.dedupKey },
        update: { contractId: u.contractId, tipo: u.tipo, severidade: u.severidade, titulo: u.titulo, mensagem: u.mensagem },
      })
    }
    /* resolve (remove) as que não valem mais */
    const resolved = await this.prisma.notification.deleteMany({
      where: activeKeys.length ? { organizationId, dedupKey: { notIn: activeKeys } } : { organizationId },
    })
    return { renovados, encerrados, notificacoes: activeKeys.length, resolvidas: resolved.count }
  }

  /* ── helpers de derivação (espelham contract-options do front) ── */
  private terminoVigente(c: any): string {
    let t = c.terminoVigencia ?? ''
    for (const a of ((c.aditivos as any[]) ?? [])) if (a.situacao !== 'RASCUNHO' && a.alteraTermino && a.novoTermino) t = a.novoTermino
    for (const r of ((c.renovacoes as any[]) ?? [])) if (r.novoTermino && r.novoTermino > t) t = r.novoTermino
    return t
  }
  private valorVigente(c: any): number {
    let v = Number(c.valorTotal) || 0
    for (const a of ((c.aditivos as any[]) ?? [])) if (a.situacao !== 'RASCUNHO' && a.alteraValor && a.novoValor != null) v += Number(a.novoValor) || 0
    for (const r of ((c.reajustesRealizados as any[]) ?? [])) v += (Number(r.valorNovo) || 0) - (Number(r.valorAnterior) || 0)
    return v
  }
  private consumo(c: any): number {
    const arr = (c.natureza === 'RECEITA' ? c.recebimentos : c.pagamentos) as any[]
    return (arr ?? []).reduce((s, l) => s + (Number(l.valor) || 0), 0)
  }
  private stepMeses(periodicidade: string): number {
    const meses: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, QUADRIMESTRAL: 4, SEMESTRAL: 6, ANUAL: 12 }
    return meses[String(periodicidade || '').toUpperCase()] ?? 12
  }
  private async audit(contractId: string, event: string, changes: any[]) {
    await this.prisma.contractAuditLog.create({ data: { contractId, user: 'Sistema', event, changes: changes as never } })
  }
  private async loadParams(organizationId: string): Promise<Params> {
    try {
      const row = await this.settings.get(organizationId, NOTIF_PARAMS_KEY)
      const v = row.value as Partial<Params> | null
      if (!v) return DEFAULT_PARAMS
      return {
        renovacaoAutomatica: v.renovacaoAutomatica ?? DEFAULT_PARAMS.renovacaoAutomatica,
        vigencia: { ...DEFAULT_PARAMS.vigencia, ...v.vigencia },
        reajuste: { ...DEFAULT_PARAMS.reajuste, ...v.reajuste },
        consumo:  { ...DEFAULT_PARAMS.consumo,  ...v.consumo },
      }
    } catch { return DEFAULT_PARAMS }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
