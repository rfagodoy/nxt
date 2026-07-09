import { addMesesISO, comp } from './dates'
import { num } from './num'
import { lancPago, lancRef } from './derive'
import { proximaDataReajusteContrato } from './reajuste'
import type { CoreContract, CoreLancamento } from './types'

/* ─── cronograma de parcelas ─────────────────────────────────────────────── */

/** Parcela vigente NUMA competência (yyyy-mm): último reajuste de parcela aplicado
 *  até aquele mês, ou 0 se não houver nenhum. */
export function parcelaNaComp(c: CoreContract, competencia: string): number {
  const cmp = comp(competencia)
  const reajs = (c.reajustesRealizados ?? [])
    .filter(r => num(r.parcelaNova) && comp(String(r.competencia)) <= cmp)
    .sort((a, b) => (String(a.competencia) < String(b.competencia) ? -1 : 1))
  return reajs.length ? num(reajs[reajs.length - 1].parcelaNova) : 0
}

export interface GerarParcelasInput {
  /** data do 1º vencimento (ISO) */
  inicio: string
  qtd: number
  /** valor usado quando não há reajuste conhecido para o mês da parcela */
  valorBase: number
  forma?: string
  status?: string
  /** gerador de id — o front usa uid(), o backend usa outro esquema */
  makeId: (i: number) => string
  /** true = todas as parcelas saem em `valorBase`, ignorando os reajustes já aplicados.
   *  Usado na renovação, onde `valorBase` já é a parcela vigente (que considera aditivos,
   *  os quais `parcelaNaComp` não enxerga). Default: false. */
  ignorarReajustes?: boolean
}

/** Projeta N parcelas mensais a partir de `inicio`. O valor de cada parcela é o
 *  reajuste já conhecido para o mês dela; na ausência, o valor base informado. */
export function gerarParcelas(c: CoreContract, input: GerarParcelasInput): CoreLancamento[] {
  return Array.from({ length: input.qtd }, (_, i) => {
    const vencimento = addMesesISO(input.inicio, i)
    const reaj = input.ignorarReajustes ? 0 : parcelaNaComp(c, vencimento)
    return {
      id: input.makeId(i),
      status: input.status ?? 'previsto',
      vencimento,
      data: '',
      valor: reaj || input.valorBase,
      forma: input.forma ?? '',
      documento: '',
      observacao: '',
    }
  })
}

/* ─── parcela provisória (derivada, nunca gravada) ───────────────────────────
   Uma parcela é provisória quando o seu valor AINDA VAI MUDAR: é previsão (não
   paga) e o próximo reajuste do contrato a alcança. É exatamente o conjunto que
   `parcelasAlvo` reprecifica quando o reajuste for aplicado — por isso a regra é
   derivada e não um flag: um mesmo lançamento deixa de ser provisório e volta a
   ser, a cada reajuste registrado.

   Contrato sem linha de reajuste → nada é provisório: o valor é firme de verdade. */

/** O valor desta parcela ainda vai mudar no próximo reajuste? */
export function parcelaProvisoria(c: CoreContract, l: CoreLancamento): boolean {
  if (lancPago(l)) return false
  const prox = proximaDataReajusteContrato(c)
  if (!prox) return false
  const ref = lancRef(l)
  return !!ref && comp(ref) >= comp(prox)
}

/** Soma dos lançamentos a vencer, separando o que é firme do que é projeção. */
export function totaisAVencer(c: CoreContract, lista: CoreLancamento[], today: string): { firme: number; provisorio: number; vencido: number } {
  let firme = 0
  let provisorio = 0
  let vencido = 0
  for (const l of lista) {
    if (lancPago(l)) continue
    const ref = lancRef(l)
    const v = num(l.valor)
    if (ref && ref < today) vencido += v
    else if (parcelaProvisoria(c, l)) provisorio += v
    else firme += v
  }
  return { firme, provisorio, vencido }
}
