import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  daysBetween, todayISO,
  terminoVigente, valorVigente, consumo,
  proximaDataReajuste, renovarPeriodo, campoRenovacao,
} from '@nxt/contracts-core'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { ContractsService } from '../contracts/contracts.service'

const INDICES_KEY = 'nxt:settings:contratos:indices'
const INDICE_VALORES_KEY = 'nxt:settings:contratos:indice-valores'

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
  indicesAutoImport: boolean                            // import diário dos valores de índice do BCB
}
export const DEFAULT_PARAMS: Params = {
  vigencia: { enabled: true, dias: [60, 30, 7] },
  reajuste: { enabled: true, dias: 15 },
  consumo:  { enabled: true, percentuais: [80, 100] },
  renovacaoAutomatica: true,
  indicesAutoImport: true,
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/* Datas e derivações do contrato vêm de @nxt/contracts-core — implementação única,
   compartilhada com o front. Aqui ficam só formatação e regra de notificação. */
const fmtBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const fmtMesAno = (iso: string) => (iso ? iso.slice(0, 7).split('-').reverse().join('/') : '') // mm/aaaa (data base de reajuste)
const label = (c: any) => c.titulo || `Contrato ${c.numero}`

interface Upsert { dedupKey: string; contractId: string; tipo: string; severidade: string; titulo: string; mensagem: string }

@Injectable()
export class ContractSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('ContractScheduler')
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly contracts: ContractsService) {}

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
      for (const { organizationId } of orgs) {
        await this.importIndices(organizationId)  // atualiza valores de índice (BCB) antes das notificações
        await this.runForOrg(organizationId)
      }
    } catch (e) { this.logger.error(`runAll falhou: ${String(e)}`) }
  }

  /* Import diário dos valores de índice do BCB (Fase 3). Lê o catálogo de índices da org
     (com Código SGS) e mescla a série na tabela de valores. Primeira vez de um índice =
     série completa; depois, janela recente. Falha graciosa (offline/on-prem = no-op). */
  async importIndices(organizationId: string): Promise<{ atualizados: number; ignorado?: boolean }> {
    try {
      const params = await this.loadParams(organizationId)
      if (!params.indicesAutoImport) return { atualizados: 0, ignorado: true }
      const catalogo = ((await this.settings.get(organizationId, INDICES_KEY)).value as Array<{ id: string; label: string; code?: string }> | null) ?? []
      const comSgs = catalogo.filter(i => i.code && /^\d+$/.test(i.code))
      if (!comSgs.length) return { atualizados: 0 }
      const valores = ((await this.settings.get(organizationId, INDICE_VALORES_KEY)).value as Record<string, Record<string, number>> | null) ?? {}
      let atualizados = 0
      for (const idx of comSgs) {
        try {
          const existente = valores[idx.id] ?? {}
          const primeira = Object.keys(existente).length === 0
          const dados = await this.contracts.importBcb(idx.code as string, undefined, undefined, primeira)
          if (!dados.length) continue
          const merged = { ...existente }
          for (const d of dados) merged[d.competencia] = d.valor
          valores[idx.id] = merged
          atualizados++
        } catch (e) { this.logger.warn(`importIndices ${idx.label} (${idx.code}) falhou: ${String(e)}`) }
      }
      if (atualizados) await this.settings.put(organizationId, INDICE_VALORES_KEY, valores)
      return { atualizados }
    } catch (e) { this.logger.warn(`importIndices org ${organizationId} falhou: ${String(e)}`); return { atualizados: 0 } }
  }

  /** Execução sob demanda (endpoint /run, admin): espelha a rotina diária para UMA org —
   *  importa os índices do BCB (se habilitado) e roda o motor de datas/notificações.
   *  Retorna o resumo combinado. */
  async runNow(organizationId: string) {
    const indices = await this.importIndices(organizationId)
    const engine = await this.runForOrg(organizationId)
    return { indices: indices.ignorado ? 0 : indices.atualizados, ...engine }
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
        const termino = terminoVigente(c)
        if (termino && termino < today) {
          if (c.acaoTermino === 'RENOVAR' && params.renovacaoAutomatica) {
            const anos = Number(c.renovacaoAnos) || 0, meses = Number(c.renovacaoMeses) || 0, dias = Number(c.renovacaoDias) || 0
            if (anos || meses || dias) {
              const renos = [...((c.renovacoes as any[]) ?? [])]
              /* cada período renovado estende a vigência pelo PRAZO de renovação e, se o contrato
                 tem cronograma, GERA suas parcelas na parcela vigente (+ valorPeriodo, que soma ao
                 total). `renovarPeriodo` é a mesma função do botão "Gerar próximo período". */
              const campo = campoRenovacao(c.natureza)
              const lancs = [...((c[campo] as any[]) ?? [])]
              let geradas = false
              let guard = 0
              let cur: any = c
              while (guard++ < 120) {
                const t = terminoVigente(cur)
                if (!t || t >= today) break
                const r = renovarPeriodo(cur, {
                  campo, anos, meses, dias, data: today, automatica: true,
                  id: `${Date.now()}_${guard}`,
                  makeId: i => `l_${Date.now()}_${guard}_${i + 1}`,
                })
                if (!r) break  // prazo inválido → evita laço infinito
                renos.push(r.renovacao)
                if (r.lancamentos.length) { lancs.push(...r.lancamentos); geradas = true }
                cur = { ...cur, renovacoes: renos, [campo]: lancs }
                renovados++
              }
              const upd: any = { renovacoes: renos }
              if (geradas) upd[campo] = lancs
              await this.prisma.contract.update({ where: { id: c.id }, data: upd as never })
              c.renovacoes = renos; if (geradas) c[campo] = lancs
              await this.audit(c.id, 'RENOVADO', [{ field: 'renovacao', label: 'Renovação automática', before: '—', after: `vigência estendida até ${fmtBR(terminoVigente(c))}${geradas ? ' + parcelas do período geradas' : ''}` }])
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
      const termino = terminoVigente(c)

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
        for (const r of ((c.reajustes as any[]) ?? [])) {
          if (!r.indice) continue                     // linha incompleta: não há o que notificar
          const nextDue = proximaDataReajuste(c, r)   // uma periodicidade após a última competência aplicada
          if (!nextDue) continue
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
        const valor = valorVigente(c)
        if (valor > 0) {
          const pct = Math.round((consumo(c) / valor) * 100)
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
        indicesAutoImport:   v.indicesAutoImport ?? DEFAULT_PARAMS.indicesAutoImport,
        vigencia: { ...DEFAULT_PARAMS.vigencia, ...v.vigencia },
        reajuste: { ...DEFAULT_PARAMS.reajuste, ...v.reajuste },
        consumo:  { ...DEFAULT_PARAMS.consumo,  ...v.consumo },
      }
    } catch { return DEFAULT_PARAMS }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
