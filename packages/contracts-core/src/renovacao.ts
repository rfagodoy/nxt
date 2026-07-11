import { addMesesISO, addToDate } from './dates'
import { int } from './num'
import { lancRef, parcelaVigente, terminoVigente } from './derive'
import { gerarParcelas } from './parcelas'
import type { CoreContract, CoreLancamento, CoreRenovacao, LancField } from './types'

/* ─── renovação de UM período ────────────────────────────────────────────────
   Renovação é cláusula, não aditamento: estende a vigência pelo PRAZO DE RENOVAÇÃO
   do contrato (anos/meses/dias) e, se já houver cronograma, projeta as parcelas do
   novo período na parcela vigente.

   Esta função é a implementação única usada pelo motor de datas (renovação
   automática) e pelo botão "Gerar próximo período" (renovação manual). Antes elas
   eram duas: a manual definia o novo término como a data do ÚLTIMO VENCIMENTO
   gerado — o que, num contrato sem cronograma, estendia a vigência por um único dia. */

export interface RenovarPeriodoInput {
  /** lado do contrato onde as parcelas são lançadas */
  campo: LancField
  anos: number
  meses: number
  dias: number
  /** data do registro da renovação (ISO) */
  data: string
  automatica: boolean
  /** id do registro de renovação */
  id: string
  /** gerador de id das parcelas do período */
  makeId: (i: number) => string
}

export interface RenovarPeriodoResult {
  renovacao: CoreRenovacao
  /** parcelas do novo período; vazio quando o contrato não tem cronograma */
  lancamentos: CoreLancamento[]
}

/** Renova UM período. Devolve null quando não há como renovar (sem prazo, sem
 *  término, ou prazo que não avança a data — o que evitaria um laço infinito). */
export function renovarPeriodo(c: CoreContract, input: RenovarPeriodoInput): RenovarPeriodoResult | null {
  if (!(input.anos || input.meses || input.dias)) return null
  const terminoAnterior = terminoVigente(c)
  if (!terminoAnterior) return null
  const novoTermino = addToDate(terminoAnterior, input.anos, input.meses, input.dias)
  if (!novoTermino || novoTermino <= terminoAnterior) return null

  /* parcelas só quando JÁ existe cronograma: sem ele, a renovação apenas estende a
     vigência (não há de onde continuar a série, e o motor sempre agiu assim) */
  const lista = c[input.campo] ?? []
  const qtd = int(c.qtdParcelas)
  const parcelaVig = parcelaVigente(c)
  const ultimoVenc = lista.map(l => lancRef(l)).filter(Boolean).sort().pop() ?? ''

  let lancamentos: CoreLancamento[] = []
  let valorPeriodo = 0
  if (lista.length && qtd > 0 && parcelaVig > 0 && ultimoVenc) {
    lancamentos = gerarParcelas(c, {
      inicio: addMesesISO(ultimoVenc.slice(0, 10), 1),
      qtd,
      valorBase: parcelaVig,
      /* forma vem do CAMPO do contrato (fonte única, padronizada). Contrato sem o campo
         gera sem forma — decisão do PO: nada de inferir da última parcela. */
      forma: c.formaPagamento ?? '',
      ignorarReajustes: true, // a parcela vigente já considera aditivos e reajustes
      makeId: input.makeId,
    })
    valorPeriodo = qtd * parcelaVig
  }

  return {
    renovacao: { id: input.id, data: input.data, terminoAnterior, novoTermino, automatica: input.automatica, valorPeriodo },
    lancamentos,
  }
}

/** Lado do contrato que a renovação automática alimenta. */
export const campoRenovacao = (natureza?: string | null): LancField =>
  natureza === 'RECEITA' ? 'recebimentos' : 'pagamentos'
