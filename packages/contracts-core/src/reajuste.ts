import { addMesesComp, comp } from './dates'
import { num, int, round2 } from './num'
import { camposDaNatureza, lancPago, lancRef, parcelaVigente, valorVigente } from './derive'
import type { CoreContract, CoreLancamento, CoreReajuste, CoreReajusteRealizado, LancField } from './types'

/* ─── reajuste: agenda, acumulação do índice e aplicação ─────────────────────
   A LINHA de reajuste (CoreReajuste) é a agenda: índice + data base + periodicidade.
   O reajuste REALIZADO (CoreReajusteRealizado) é o fato. A próxima ocorrência é
   sempre derivada da última competência aplicada — nunca gravada. */

const STEP_MESES: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, QUADRIMESTRAL: 4, SEMESTRAL: 6, ANUAL: 12 }

/** Meses de uma periodicidade. Desconhecida/ausente = anual. */
export const stepMeses = (periodicidade: string): number => STEP_MESES[String(periodicidade || '').toUpperCase()] ?? 12

/** Reajustes já aplicados de UMA linha, em ordem cronológica de competência. */
export function realizadosDaLinha(c: CoreContract, reajusteId: string): CoreReajusteRealizado[] {
  return (c.reajustesRealizados ?? [])
    .filter(r => r.reajusteId === reajusteId)
    .sort((a, b) => (String(a.competencia) < String(b.competencia) ? -1 : 1))
}

/** Próxima competência a reajustar desta linha, como 'yyyy-mm-01'.
 *  Âncora = última competência já aplicada; sem nenhuma, a data base do cadastro.
 *  '' quando a linha não tem data base (não há agenda). Não exige índice: uma linha
 *  em preenchimento já tem agenda — quem precisa do índice (notificação, aplicação
 *  automática) filtra por ele. */
export function proximaDataReajuste(c: CoreContract, r: CoreReajuste): string {
  if (!r.data) return ''
  const aplicadas = realizadosDaLinha(c, r.id).map(x => comp(String(x.competencia))).filter(Boolean)
  const anchor = aplicadas.length ? aplicadas[aplicadas.length - 1] : comp(String(r.data))
  if (!anchor) return ''
  const prox = addMesesComp(anchor, stepMeses(r.periodicidade))
  return prox ? `${prox}-01` : ''
}

/** Próxima data de reajuste do CONTRATO = a mais próxima entre as linhas COMPLETAS
 *  (índice + data base). '' quando o contrato não reajusta — e aí nenhum valor é provisório. */
export function proximaDataReajusteContrato(c: CoreContract): string {
  const datas = (c.reajustes ?? [])
    .filter(r => r.indice && r.data)
    .map(r => proximaDataReajuste(c, r))
    .filter(Boolean)
    .sort()
  return datas[0] ?? ''
}

/** % ACUMULADO do índice na janela da periodicidade terminando na competência,
 *  por composição: fator = ∏(1 + varₘ/100).
 *  Devolve null quando NENHUM mês da janela tem valor publicado.
 *  `completo: false` avisa que a janela está incompleta (índice ainda não publicado) —
 *  aplicar reajuste com janela incompleta subestima o percentual. */
export function acumuladoPeriodo(
  serie: Record<string, number> | undefined,
  periodicidade: string,
  competencia: string,
): { percentual: number; completo: boolean } | null {
  const cmp = comp(competencia)
  if (!cmp || !serie) return null
  const n = stepMeses(periodicidade)
  let fator = 1
  let achou = 0
  for (let k = 0; k < n; k++) {
    const mes = addMesesComp(cmp, -k)
    const varM = mes ? serie[mes] : undefined
    if (typeof varM === 'number' && Number.isFinite(varM)) {
      fator *= 1 + varM / 100
      achou++
    }
  }
  if (!achou) return null
  return { percentual: (fator - 1) * 100, completo: achou === n }
}

/** Parcelas a REPRECIFICAR: a vencer (não pagas) com referência >= competência,
 *  apenas no lado da natureza do contrato (Despesa → pagamentos, Receita →
 *  recebimentos, Ambos → os dois). */
export function parcelasAlvo(c: CoreContract, competencia: string): Array<{ campo: LancField; lanc: CoreLancamento }> {
  const cmp = comp(competencia)
  if (!cmp) return []
  const alvo: Array<{ campo: LancField; lanc: CoreLancamento }> = []
  for (const campo of camposDaNatureza(c.natureza)) {
    for (const l of c[campo] ?? []) {
      const ref = lancRef(l)
      if (!lancPago(l) && ref && comp(ref) >= cmp) alvo.push({ campo, lanc: l })
    }
  }
  return alvo
}

/** Há cronograma no lado da natureza? Decide o modo do reajuste de parcela:
 *  com cronograma reprecifica as parcelas reais; sem cronograma usa a quantidade. */
export const temCronograma = (c: CoreContract): boolean =>
  camposDaNatureza(c.natureza).some(campo => (c[campo] ?? []).length > 0)

export interface AplicarReajusteInput {
  /** id da linha de reajuste (agenda) que originou este fato */
  reajusteId: string
  /** competência de referência, 'yyyy-mm' ou 'yyyy-mm-01' */
  competencia: string
  /** percentual aplicado (ex.: 4.62) */
  percentual: number
  base: 'total' | 'parcela'
  indiceSnapshot?: string
  observacao?: string
  user?: string
  /** id do registro; injetado por quem chama (front usa uid(), backend usa outro esquema) */
  id: string
  dataAplicacao?: string
  createdAt?: string
  /** base=parcela SEM cronograma: nº de parcelas usado no delta (default: qtdParcelas do contrato) */
  qtdParcelas?: number

  /* Overrides do formulário. Ausentes, tudo é derivado do contrato e do percentual.
     Presentes, o usuário digitou o número à mão e ele MANDA — o percentual vira só
     um registro histórico. O delta e a reprecificação continuam sendo calculados aqui. */
  /** base=total: valor total anterior (default: valorVigente) */
  valorAnterior?: number
  /** base=total: novo valor total (default: anterior × (1 + %)) */
  valorNovo?: number
  /** base=parcela: parcela anterior (default: parcelaVigente) */
  parcelaAnterior?: number
  /** base=parcela: nova parcela (default: anterior × (1 + %)) */
  parcelaNova?: number
}

export interface AplicarReajusteResult {
  reajuste: CoreReajusteRealizado
  pagamentos: CoreLancamento[]
  recebimentos: CoreLancamento[]
}

/** Aplica um reajuste ao contrato e devolve o FATO + os lançamentos resultantes.
 *  Função pura: não persiste nada. Quem chama grava (setValues no front, prisma no backend).
 *
 *  base 'total'   → novo total = anterior × (1 + %); parcelas não mudam.
 *  base 'parcela' → nova parcela = anterior × (1 + %); com cronograma, reprecifica as
 *                   parcelas a vencer e o total cresce só pelo DELTA real; sem cronograma,
 *                   delta = (nova − anterior) × qtdParcelas. */
export function aplicarReajuste(c: CoreContract, input: AplicarReajusteInput): AplicarReajusteResult {
  const cmp = comp(input.competencia)
  const pagamentos = [...(c.pagamentos ?? [])]
  const recebimentos = [...(c.recebimentos ?? [])]

  const rec: CoreReajusteRealizado = {
    id: input.id,
    reajusteId: input.reajusteId,
    competencia: `${cmp}-01`,
    indiceSnapshot: input.indiceSnapshot ?? '',
    base: input.base,
    percentual: input.percentual,
    valorAnterior: 0,
    valorNovo: 0,
    parcelaAnterior: 0,
    parcelaNova: 0,
    parcelasReajustadas: 0,
    dataAplicacao: input.dataAplicacao ?? '',
    observacao: input.observacao ?? '',
    user: input.user ?? '',
    createdAt: input.createdAt ?? '',
  }

  const totalVig = valorVigente(c)
  const fator = 1 + input.percentual / 100

  if (input.base === 'total') {
    const valorAnterior = input.valorAnterior ?? totalVig
    rec.valorAnterior = round2(valorAnterior)
    rec.valorNovo = round2(input.valorNovo ?? valorAnterior * fator)
    return { reajuste: rec, pagamentos, recebimentos }
  }

  /* base = parcela — o total ANTERIOR é sempre o vigente: o que muda é a parcela,
     e o total só cresce pelo delta que a reprecificação produz. */
  const parcelaAnterior = input.parcelaAnterior ?? parcelaVigente(c)
  const parcelaNova = round2(input.parcelaNova ?? parcelaAnterior * fator)
  rec.parcelaAnterior = round2(parcelaAnterior)
  rec.parcelaNova = parcelaNova

  if (temCronograma(c)) {
    const alvo = parcelasAlvo(c, cmp)
    const ids = new Set(alvo.map(x => x.lanc.id))
    /* delta calculado sobre a parcela JÁ ARREDONDADA — é o valor que de fato vai
       para as parcelas, então o total fecha exatamente com a soma do cronograma. */
    const delta = alvo.reduce((s, x) => s + (parcelaNova - num(x.lanc.valor)), 0)
    rec.parcelasReajustadas = alvo.length
    rec.valorAnterior = round2(totalVig)
    rec.valorNovo = round2(totalVig + delta)
    const reprice = (arr: CoreLancamento[]) => arr.map(l => (ids.has(l.id) ? { ...l, valor: parcelaNova } : l))
    return { reajuste: rec, pagamentos: reprice(pagamentos), recebimentos: reprice(recebimentos) }
  }

  const count = input.qtdParcelas != null ? input.qtdParcelas : int(c.qtdParcelas)
  const delta = (parcelaNova - parcelaAnterior) * count
  rec.parcelasReajustadas = count
  rec.valorAnterior = round2(totalVig)
  rec.valorNovo = round2(totalVig + delta)
  return { reajuste: rec, pagamentos, recebimentos }
}
