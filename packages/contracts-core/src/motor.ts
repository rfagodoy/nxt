import { terminoVigente } from './derive'
import { planejarReajuste, aplicarReajuste } from './reajuste'
import { renovarPeriodo } from './renovacao'
import type { CoreContract, CoreLancamento, CoreRenovacao, CoreReajuste, CoreReajusteRealizado, LancField } from './types'

/* ─── motor de datas: intercala reajuste e renovação ─────────────────────────
   Reajustar tudo antes de renovar tudo produziria um contrato inteiro no preço de
   hoje — as parcelas dos períodos futuros nem existem quando os reajustes rodam.
   A regra é INTERCALAR: aplica o reajuste cuja competência cabe na vigência corrente
   e só então renova; o período seguinte nasce na parcela já reajustada.

   Antes deste arquivo a intercalação vivia copiada em três lugares (o scheduler do
   backend, o botão "Renovar período" do front e o teste do motor) e já tinha divergido:
   o botão manual renovava SEM aplicar o reajuste. Agora é implementação ÚNICA e pura —
   quem chama injeta a série, o "hoje" e os geradores de id. */

export interface AvancarOpts {
  /** série mensal do índice (yyyy-mm → % do mês); recebe o id do índice da linha */
  serie: (indiceId: string) => Record<string, number> | undefined
  /** data de referência ('yyyy-mm-dd'): define o que já venceu */
  today: string
  /** freio de emergência global: com true, nenhum reajuste é aplicado (só o motor consulta) */
  reajustePausado?: boolean
  /** lado da natureza onde nascem as parcelas da renovação */
  campo: LancField
  /** prazo de cada renovação (anos/meses/dias) */
  prazo: { anos: number; meses: number; dias: number }
  /** rótulo do índice para o snapshot do reajuste (ex.: "IGPM") */
  indiceSnapshot?: (indiceId: string) => string
  /** autor dos fatos gerados (default '') */
  user?: string
  /** observação gravada em cada reajuste aplicado */
  observacao?: string
  /** data de registro dos fatos ('yyyy-mm-dd'); default = today. Alimenta
   *  renovacao.data e reajuste.dataAplicacao. */
  dataRegistro?: string
  /** carimbo de criação (ISO completo) dos reajustes; default = today */
  createdAt?: string
  /** ids injetados por quem chama (front usa uid(); backend, um esquema com timestamp) */
  makeReajusteId: (seq: number) => string
  makeRenovacaoId: (seq: number) => string
  makeParcelaId: (seq: number, i: number) => string
}

export interface AvancarResultado {
  /** reajustes aplicados, em ordem cronológica de competência */
  reajustes: CoreReajusteRealizado[]
  /** renovações realizadas */
  renovacoes: CoreRenovacao[]
  /** alguma renovação gerou parcelas (contrato com cronograma) */
  gerouParcelas: boolean
}

/** Contador de sequência compartilhado entre as várias aplicações de uma chamada,
 *  para que os ids gerados não colidam. */
interface Seq { n: number }

/** Aplica, em ordem cronológica de competência, os reajustes AUTOMÁTICOS já vencidos
 *  cuja competência não passa de `ateInclusive` ('yyyy-mm-01'). MUTA o contrato
 *  (reajustesRealizados/pagamentos/recebimentos). Devolve os fatos aplicados.
 *
 *  Só `planejarReajuste` decide o que aplica: linha AUTOMATICA, vencida, com a janela
 *  do índice completa. Linha MANUAL, janela incompleta ou índice sem série ficam de fora
 *  (o motor as reporta como pendentes noutra camada; aqui apenas não as aplicamos). */
function drenarReajustes(c: CoreContract, opts: AvancarOpts, ateInclusive: string, seq: Seq): CoreReajusteRealizado[] {
  const aplicados: CoreReajusteRealizado[] = []
  if (opts.reajustePausado) return aplicados

  let guard = 0
  while (guard++ < 200) {
    /* o mais antigo primeiro: reprecificar em ordem faz cada competência ancorar na anterior */
    let alvo: { r: CoreReajuste; competencia: string; percentual: number; base: 'total' | 'parcela' } | null = null
    for (const r of c.reajustes ?? []) {
      const plano = planejarReajuste(c, r, opts.serie(r.indice), opts.today)
      if (plano.aplicar && plano.competencia <= ateInclusive && (!alvo || plano.competencia < alvo.competencia)) {
        alvo = { r, competencia: plano.competencia, percentual: plano.percentual, base: plano.base }
      }
    }
    if (!alvo) break

    seq.n++
    const res = aplicarReajuste(c, {
      id: opts.makeReajusteId(seq.n),
      reajusteId: alvo.r.id,
      competencia: alvo.competencia,
      percentual: alvo.percentual,
      base: alvo.base,
      indiceSnapshot: opts.indiceSnapshot?.(alvo.r.indice) ?? '',
      observacao: opts.observacao ?? '',
      user: opts.user ?? '',
      dataAplicacao: opts.dataRegistro ?? opts.today,
      createdAt: opts.createdAt ?? opts.today,
    })
    c.reajustesRealizados = [...(c.reajustesRealizados ?? []), res.reajuste]
    c.pagamentos = res.pagamentos
    c.recebimentos = res.recebimentos
    aplicados.push(res.reajuste)
  }
  return aplicados
}

/** Anexa uma renovação ao contrato (renovacoes[] + parcelas do período no lado certo).
 *  MUTA o contrato. Devolve true se o período gerou parcelas. */
function anexarRenovacao(c: CoreContract, campo: LancField, renovacao: CoreRenovacao, lancamentos: CoreLancamento[]): boolean {
  c.renovacoes = [...(c.renovacoes ?? []), renovacao]
  const gerou = lancamentos.length > 0
  if (gerou) c[campo] = [...((c[campo] as CoreLancamento[]) ?? []), ...lancamentos]
  return gerou
}

/** Tipo local para acessar o campo de forma prazo-indeterminado sem alargar CoreContract. */
type ComPrazo = CoreContract & { prazoIndeterminado?: boolean }

/** Motor de datas: avança o contrato até `today`, intercalando reajuste e renovação.
 *  Cada volta aplica os reajustes cuja competência cabe na vigência corrente e, se o
 *  contrato venceu, renova UM período — cujas parcelas nascem na parcela já reajustada.
 *  Idempotente: `proximaDataReajuste` ancora na última competência aplicada e
 *  `terminoVigente` na última renovação, então rodar de novo no mesmo dia não repete nada.
 *
 *  `permitirRenovar: false` desliga a renovação (ex.: renovação automática global off, ou
 *  ação no término diferente de "Renovar"): o motor só aplica os reajustes já vencidos. */
export function avancarContrato(c: CoreContract, opts: AvancarOpts & { permitirRenovar?: boolean }): AvancarResultado {
  const reajustes: CoreReajusteRealizado[] = []
  const renovacoes: CoreRenovacao[] = []
  const temPrazo = !!(opts.prazo.anos || opts.prazo.meses || opts.prazo.dias)
  const seq: Seq = { n: 0 }
  let gerou = false
  let guard = 0

  while (guard++ < 200) {
    const termino = terminoVigente(c)
    const venceu = !(c as ComPrazo).prazoIndeterminado && !!termino && termino < opts.today
    const renovarAgora = venceu && opts.permitirRenovar !== false && temPrazo

    /* drena os reajustes da vigência corrente: até o TÉRMINO quando vai renovar (o próximo
       período nasce depois dele), até HOJE quando não renova (aplica tudo que já venceu). */
    reajustes.push(...drenarReajustes(c, opts, renovarAgora ? termino : opts.today, seq))

    if (!renovarAgora) break

    const r = renovarPeriodo(c, {
      campo: opts.campo, anos: opts.prazo.anos, meses: opts.prazo.meses, dias: opts.prazo.dias,
      data: opts.dataRegistro ?? opts.today, automatica: true,
      id: opts.makeRenovacaoId(guard), makeId: i => opts.makeParcelaId(guard, i),
    })
    if (!r) break // prazo que não avança a data → evita laço infinito
    if (anexarRenovacao(c, opts.campo, r.renovacao, r.lancamentos)) gerou = true
    renovacoes.push(r.renovacao)
  }

  return { reajustes, renovacoes, gerouParcelas: gerou }
}

export interface RenovarManualResultado extends AvancarResultado {
  /** a renovação criada (conveniência: é o único elemento de `renovacoes`) */
  renovacao: CoreRenovacao
  /** as parcelas do período (vazio quando o contrato não tem cronograma) */
  lancamentos: CoreLancamento[]
}

/** Renovação MANUAL de UM período (antecipar a cláusula), aplicando ANTES os reajustes
 *  automáticos vencidos que pertencem à vigência atual — assim o período nasce no preço
 *  reajustado, exatamente como o motor faria ao renovar esse mesmo período.
 *
 *  MUTA o contrato. Devolve null quando não há como renovar (sem término ou prazo que
 *  não avança a data). É a função que o botão "Renovar período" do front usa. */
export function renovarUmPeriodoComReajuste(c: CoreContract, opts: AvancarOpts): RenovarManualResultado | null {
  const termino = terminoVigente(c)
  if (!termino) return null

  const seq: Seq = { n: 0 }
  /* reajustes da vigência ATUAL (competência <= término): o período que estamos renovando
     começa depois do término, então tudo o que venceu até ele entra na parcela vigente. */
  const reajustes = drenarReajustes(c, opts, termino, seq)

  const r = renovarPeriodo(c, {
    campo: opts.campo, anos: opts.prazo.anos, meses: opts.prazo.meses, dias: opts.prazo.dias,
    data: opts.dataRegistro ?? opts.today, automatica: false,
    id: opts.makeRenovacaoId(1), makeId: i => opts.makeParcelaId(1, i),
  })
  if (!r) return null

  const gerou = anexarRenovacao(c, opts.campo, r.renovacao, r.lancamentos)
  return { reajustes, renovacoes: [r.renovacao], gerouParcelas: gerou, renovacao: r.renovacao, lancamentos: r.lancamentos }
}
