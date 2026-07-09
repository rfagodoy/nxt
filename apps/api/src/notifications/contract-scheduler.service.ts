import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import {
  daysBetween, todayISO,
  terminoVigente, valorVigente, consumo,
  proximaDataReajuste, planejarReajuste, aplicarReajuste, pagasAlcancadas,
  renovarPeriodo, campoRenovacao,
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
  /* `automatico` liga o motor de reajuste. Nasce DESLIGADO de propósito: aplicar reajuste
     automático sobre uma base histórica é operação de mão única. Mesmo ligado, só age nas
     linhas com aplicacao=AUTOMATICA. */
  reajuste: { enabled: boolean; dias: number; automatico: boolean }
  consumo:  { enabled: boolean; percentuais: number[] } // limites (ex.: [80,100])
  renovacaoAutomatica: boolean                          // liga/desliga a renovação global
  indicesAutoImport: boolean                            // import diário dos valores de índice do BCB
}
export const DEFAULT_PARAMS: Params = {
  vigencia: { enabled: true, dias: [60, 30, 7] },
  reajuste: { enabled: true, dias: 15, automatico: false },
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

const aMoney = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Upsert { dedupKey: string; contractId: string; tipo: string; severidade: string; titulo: string; mensagem: string }

/** O que o motor fez (ou, no dry-run, faria) com UM contrato. */
interface Evolucao {
  reajustes: ReajusteAplicado[]
  renovados: number
  encerrados: number
  campoLanc: 'pagamentos' | 'recebimentos'
  gerouParcelas: boolean
}

/** Um reajuste que o motor aplicou (ou, no dry-run, aplicaria). */
export interface ReajusteAplicado {
  contratoId: string; numero: string; reajusteId: string; indice: string
  competencia: string; percentual: number; base: 'total' | 'parcela'
  valorAnterior: number; valorNovo: number
  parcelaAnterior: number; parcelaNova: number; parcelasReajustadas: number
  /** parcelas já pagas alcançadas pela competência — o motor NÃO as reprecifica */
  pagasAlcancadas: number
  /** quanto deixaria de ser cobrado nessas parcelas; decisão humana, não do motor */
  diferencaNaoCobrada: number
}

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
   *  `dryRun` calcula tudo e não grava NADA — serve para conferir o que o motor faria
   *  antes de deixá-lo aplicar reajustes sobre uma base histórica. */
  async runNow(organizationId: string, dryRun = false) {
    const indices = dryRun ? { atualizados: 0, ignorado: true } : await this.importIndices(organizationId)
    const engine = await this.runForOrg(organizationId, dryRun)
    return { dryRun, indices: indices.ignorado ? 0 : indices.atualizados, ...engine }
  }

  /** Executa o motor para UMA organização. Retorna um resumo (usado pelo endpoint /run). */
  async runForOrg(organizationId: string, dryRun = false) {
    const params = await this.loadParams(organizationId)
    const today = todayISO()
    const contracts = await this.prisma.contract.findMany({ where: { organizationId } }) as any[]
    const series = ((await this.settings.get(organizationId, INDICE_VALORES_KEY)).value as Record<string, Record<string, number>> | null) ?? {}
    const rotuloIndice = await this.loadIndiceLabels(organizationId)
    let renovados = 0, encerrados = 0
    const activeKeys: string[] = []
    const upserts: Upsert[] = []
    const reajustesAplicados: ReajusteAplicado[] = []

    for (const c of contracts) {
      /* 0+1) AVANÇA A LINHA DO TEMPO do contrato: reajuste e renovação INTERCALADOS por data.
         Não basta reajustar tudo e depois renovar tudo: num contrato com períodos represados
         as parcelas dos períodos futuros ainda não existem quando os reajustes rodam, e as
         parcelas criadas depois nasceriam todas no preço de hoje. A cada volta aplicamos o
         evento MAIS ANTIGO — reajuste cuja competência cabe na vigência atual, senão renovação. */
      const evolucao = this.avancarContrato(c, params, series, rotuloIndice, today)
      renovados += evolucao.renovados
      encerrados += evolucao.encerrados
      reajustesAplicados.push(...evolucao.reajustes)

      if (!dryRun && (evolucao.reajustes.length || evolucao.renovados || evolucao.encerrados)) {
        await this.persistirEvolucao(c, evolucao)
      }
      /* diferença que ficou de fora por já estar paga: o motor NÃO cobra, mas conta */
      for (const a of evolucao.reajustes) {
        if (!a.pagasAlcancadas) continue
        const key = `reajuste-diferenca:${c.id}:${a.reajusteId}:${a.competencia.slice(0, 7)}`
        activeKeys.push(key)
        upserts.push({ dedupKey: key, contractId: c.id, tipo: 'REAJUSTE', severidade: 'ALERTA',
          titulo: 'Diferença de reajuste não cobrada',
          mensagem: `${label(c)}: o reajuste de ${fmtMesAno(a.competencia)} alcançou ${a.pagasAlcancadas} parcela(s) já paga(s). Diferença não cobrada: ${aMoney(a.diferencaNaoCobrada)}.` })
      }

      /* acaoTermino MANUAL não age aqui — entra na notificação de vigência abaixo */

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

    if (dryRun) {
      return { renovados, encerrados, notificacoes: activeKeys.length, resolvidas: 0, reajustes: reajustesAplicados.length, detalhe: reajustesAplicados }
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
    return { renovados, encerrados, notificacoes: activeKeys.length, resolvidas: resolved.count, reajustes: reajustesAplicados.length, detalhe: reajustesAplicados }
  }

  /** Avança a linha do tempo do contrato até hoje, EM MEMÓRIA. Devolve o que fez; quem chama
   *  decide persistir (ou não, no dry-run).
   *
   *  A cada volta escolhe o evento MAIS ANTIGO ainda pendente:
   *   - reajuste vencido cuja competência cabe na vigência atual → aplica e reprecifica;
   *   - senão, se o término já passou → renova UM período (as parcelas novas já nascem
   *     na parcela vigente, que acabou de ser reajustada).
   *  Assim um contrato de 2019 chega a 2026 com cada período no preço do seu ano, em vez de
   *  todos no preço de hoje.
   *
   *  Idempotência: `proximaDataReajuste` ancora na última competência já aplicada, e
   *  `terminoVigente` na última renovação. Rodar duas vezes no mesmo dia não repete nada.
   *  É a guarda mais importante daqui — um erro nela compõe juros diários sobre o contrato. */
  private avancarContrato(c: any, params: Params, series: Record<string, Record<string, number>>, rotulo: Map<string, string>, today: string): Evolucao {
    const ev: Evolucao = { reajustes: [], renovados: 0, encerrados: 0, campoLanc: campoRenovacao(c.natureza), gerouParcelas: false }
    if (c.situacao !== 'VIGENTE') return ev

    const anos = Number(c.renovacaoAnos) || 0, meses = Number(c.renovacaoMeses) || 0, dias = Number(c.renovacaoDias) || 0
    const podeRenovarSempre = !c.prazoIndeterminado && c.acaoTermino === 'RENOVAR' && params.renovacaoAutomatica && (anos || meses || dias)

    let guard = 0
    while (guard++ < 200) {
      const termino = terminoVigente(c)
      const venceu = !c.prazoIndeterminado && !!termino && termino < today

      /* reajuste pendente mais antigo (só linhas AUTOMATICA com índice publicado) */
      let alvo: { r: any; plano: ReturnType<typeof planejarReajuste> } | null = null
      if (params.reajuste.automatico) {
        for (const r of ((c.reajustes as any[]) ?? [])) {
          const plano = planejarReajuste(c, r, series[r.indice], today)
          if (plano.aplicar && (!alvo || plano.competencia < alvo.plano.competencia)) alvo = { r, plano }
        }
      }

      const renovar = podeRenovarSempre && venceu
      /* o reajuste vem primeiro quando sua competência ainda cabe na vigência corrente */
      if (alvo && (!renovar || alvo.plano.competencia <= termino)) {
        ev.reajustes.push(this.aplicarUm(c, alvo.r, alvo.plano, rotulo, today, guard))
        continue
      }
      if (renovar) {
        const r = renovarPeriodo(c, {
          campo: ev.campoLanc, anos, meses, dias, data: today, automatica: true,
          id: `${Date.now()}_${guard}`, makeId: i => `l_${Date.now()}_${guard}_${i + 1}`,
        })
        if (!r) break // prazo inválido → evita laço infinito
        c.renovacoes = [...((c.renovacoes as any[]) ?? []), r.renovacao]
        if (r.lancamentos.length) { c[ev.campoLanc] = [...((c[ev.campoLanc] as any[]) ?? []), ...r.lancamentos]; ev.gerouParcelas = true }
        ev.renovados++
        continue
      }
      break
    }

    /* encerramento automático: só depois de esgotados reajuste e renovação */
    if (!c.prazoIndeterminado && c.acaoTermino === 'ENCERRAR') {
      const t = terminoVigente(c)
      if (t && t < today) { c.situacao = 'ENCERRADO'; ev.encerrados++ }
    }
    return ev
  }

  /** Aplica UM reajuste no registro em memória e devolve o registro do que foi feito. */
  private aplicarUm(c: any, r: any, plano: ReturnType<typeof planejarReajuste>, rotulo: Map<string, string>, today: string, seq: number): ReajusteAplicado {
    const indice = rotulo.get(r.indice) ?? r.indice
    const res = aplicarReajuste(c, {
      id: `rr_${Date.now()}_${seq}_${r.id}`,
      reajusteId: r.id, competencia: plano.competencia, percentual: plano.percentual, base: plano.base,
      indiceSnapshot: indice,
      observacao: 'Aplicado automaticamente pelo motor de datas.',
      user: 'Sistema', dataAplicacao: today, createdAt: new Date().toISOString(),
    })
    /* o percentual (não a parcela nova) é o que mede a diferença: cada parcela paga
       teria subido o seu próprio valor × % */
    const pagas = pagasAlcancadas(c, plano.competencia, plano.percentual)

    c.reajustesRealizados = [...((c.reajustesRealizados as any[]) ?? []), res.reajuste]
    c.pagamentos = res.pagamentos
    c.recebimentos = res.recebimentos

    return {
      contratoId: c.id, numero: c.numero, reajusteId: r.id, indice,
      competencia: plano.competencia, percentual: plano.percentual, base: plano.base,
      valorAnterior: Number(res.reajuste.valorAnterior) || 0, valorNovo: Number(res.reajuste.valorNovo) || 0,
      parcelaAnterior: Number(res.reajuste.parcelaAnterior) || 0, parcelaNova: Number(res.reajuste.parcelaNova) || 0,
      parcelasReajustadas: Number(res.reajuste.parcelasReajustadas) || 0,
      pagasAlcancadas: pagas.quantidade, diferencaNaoCobrada: pagas.diferenca,
    }
  }

  /** Grava o estado já evoluído em memória + os logs de auditoria correspondentes. */
  private async persistirEvolucao(c: any, ev: Evolucao) {
    const data: any = {}
    if (ev.reajustes.length) { data.reajustesRealizados = c.reajustesRealizados; data.pagamentos = c.pagamentos; data.recebimentos = c.recebimentos }
    if (ev.renovados) { data.renovacoes = c.renovacoes; if (ev.gerouParcelas) data[ev.campoLanc] = c[ev.campoLanc] }
    if (ev.encerrados) data.situacao = 'ENCERRADO'
    await this.prisma.contract.update({ where: { id: c.id }, data: data as never })

    if (ev.reajustes.length) {
      await this.audit(c.id, 'REAJUSTE', ev.reajustes.map(a => ({
        field: `reajuste.${a.reajusteId}`, label: 'Reajuste aplicado automaticamente',
        before: a.base === 'parcela' ? aMoney(a.parcelaAnterior) : aMoney(a.valorAnterior),
        after: `${a.base === 'parcela' ? aMoney(a.parcelaNova) : aMoney(a.valorNovo)} · ${a.indice} ${a.percentual.toFixed(2)}% · ${fmtMesAno(a.competencia)}`,
      })))
    }
    if (ev.renovados) {
      await this.audit(c.id, 'RENOVADO', [{ field: 'renovacao', label: 'Renovação automática', before: '—',
        after: `vigência estendida até ${fmtBR(terminoVigente(c))}${ev.gerouParcelas ? ' + parcelas do período geradas' : ''}` }])
    }
    if (ev.encerrados) {
      await this.audit(c.id, 'ENCERRADO', [{ field: 'situacao', label: 'Situação', before: 'Vigente', after: 'Encerrado' }])
    }
  }

  /** Catálogo de índices da org como mapa id → rótulo (p/ o indiceSnapshot do reajuste). */
  private async loadIndiceLabels(organizationId: string): Promise<Map<string, string>> {
    const entries = ((await this.settings.get(organizationId, INDICES_KEY)).value as Array<{ id: string; label: string }> | null) ?? []
    return new Map(entries.map(e => [e.id, e.label]))
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
