import { addMesesComp, comp } from './dates'
import { num, int, round2 } from './num'
import { camposDaNatureza, lancPago, lancRef, lancReajustavel, parcelaVigente, valorVigente } from './derive'
import type { AplicacaoReajuste, CoreContract, CoreLancamento, CoreReajuste, CoreReajusteRealizado, LancField } from './types'

/* ─── reajuste: agenda, acumulação do índice e aplicação ─────────────────────
   A LINHA de reajuste (CoreReajuste) é a agenda: índice + data base + periodicidade.
   O reajuste REALIZADO (CoreReajusteRealizado) é o fato. A próxima ocorrência é
   sempre derivada da última competência aplicada — nunca gravada. */

const STEP_MESES: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, QUADRIMESTRAL: 4, SEMESTRAL: 6, ANUAL: 12 }

/** Política de aplicação da linha. Só 'AUTOMATICA' liga o motor; todo o resto é MANUAL.
 *  Assim uma linha cadastrada antes de a política existir nunca passa a reajustar sozinha
 *  por causa de um deploy — e um 'SUSPENSA' legado volta a AVISAR, em vez de seguir mudo. */
export const aplicacaoDe = (r: CoreReajuste): AplicacaoReajuste =>
  String(r.aplicacao ?? '').toUpperCase() === 'AUTOMATICA' ? 'AUTOMATICA' : 'MANUAL'

/** Base do reajuste automático: a PARCELA quando o contrato tem parcela, senão o TOTAL.
 *  Não é configurável — reajustar as parcelas já é reajustar o contrato (o total cresce
 *  pelo delta delas). Só um contrato sem parcela precisa que o total suba sozinho.
 *  Quem precisar de outro tratamento usa a linha em modo MANUAL e escolhe a base no
 *  momento de registrar, olhando o número. */
export const baseDe = (c: CoreContract): 'total' | 'parcela' => (parcelaVigente(c) > 0 ? 'parcela' : 'total')

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

/** Parcelas a REPRECIFICAR: a vencer (não pagas), marcadas como reajustáveis, com
 *  referência >= competência, apenas no lado da natureza do contrato (Despesa →
 *  pagamentos, Receita → recebimentos, Ambos → os dois). */
export function parcelasAlvo(c: CoreContract, competencia: string): Array<{ campo: LancField; lanc: CoreLancamento }> {
  const cmp = comp(competencia)
  if (!cmp) return []
  const alvo: Array<{ campo: LancField; lanc: CoreLancamento }> = []
  for (const campo of camposDaNatureza(c.natureza)) {
    for (const l of c[campo] ?? []) {
      const ref = lancRef(l)
      if (!lancPago(l) && lancReajustavel(l) && ref && comp(ref) >= cmp) alvo.push({ campo, lanc: l })
    }
  }
  return alvo
}

/** Há cronograma no lado da natureza? Decide o modo do reajuste de parcela:
 *  com cronograma reprecifica as parcelas reais; sem cronograma usa a quantidade. */
export const temCronograma = (c: CoreContract): boolean =>
  camposDaNatureza(c.natureza).some(campo => (c[campo] ?? []).length > 0)

/* ─── planejamento: aplicar ou não, e com qual percentual ─────────────────── */

export type MotivoNaoAplicar =
  | 'SEM_AGENDA'          // linha sem índice ou sem data base
  | 'NAO_VENCIDO'         // a próxima competência ainda está no futuro
  | 'MANUAL'              // política da linha: o motor avisa, a pessoa aplica
  | 'SEM_SERIE'           // nenhum valor do índice publicado para a janela
  | 'JANELA_INCOMPLETA'   // o índice do período ainda não saiu por inteiro

export interface PlanoReajuste {
  aplicar: boolean
  motivo?: MotivoNaoAplicar
  /** competência a aplicar ('yyyy-mm-01'), quando há agenda */
  competencia: string
  /** % acumulado do índice na janela da periodicidade (0 quando não calculável) */
  percentual: number
  base: 'total' | 'parcela'
  /** true quando a data já passou e nada foi aplicado — vira notificação CRÍTICA */
  vencido: boolean
}

/** Decide o que fazer com UMA linha de reajuste, sem efeito colateral.
 *  Aplicar com a janela do índice incompleta subestimaria o percentual — o motor
 *  não aplica, mantém a notificação pendente e tenta de novo quando o BCB publicar. */
export function planejarReajuste(
  c: CoreContract,
  r: CoreReajuste,
  serie: Record<string, number> | undefined,
  today: string,
): PlanoReajuste {
  const base = baseDe(c)
  const competencia = r.indice ? proximaDataReajuste(c, r) : ''
  if (!competencia) return { aplicar: false, motivo: 'SEM_AGENDA', competencia: '', percentual: 0, base, vencido: false }

  const vencido = competencia <= today
  const plano = { competencia, base, vencido }
  if (!vencido) return { aplicar: false, motivo: 'NAO_VENCIDO', percentual: 0, ...plano }

  const politica = aplicacaoDe(r)
  if (politica !== 'AUTOMATICA') return { aplicar: false, motivo: politica, percentual: 0, ...plano }

  const acum = acumuladoPeriodo(serie, r.periodicidade, competencia)
  if (!acum) return { aplicar: false, motivo: 'SEM_SERIE', percentual: 0, ...plano }
  /* percentual em 2 casas, como o registro manual faz: o motor e a pessoa devem chegar ao
     MESMO número. O delta gravado continua exato — é ele que alimenta o valor vigente. */
  const percentual = round2(acum.percentual)
  if (!acum.completo) return { aplicar: false, motivo: 'JANELA_INCOMPLETA', percentual, ...plano }

  return { aplicar: true, percentual, ...plano }
}

/** Parcelas JÁ PAGAS que a competência alcança. O reajuste não as reprecifica — a
 *  diferença simplesmente não é cobrada. Devolver o número torna isso visível em vez
 *  de silencioso: quem decide cobrar ou não é uma pessoa, não o motor.
 *
 *  A diferença é o percentual sobre CADA parcela paga, como seria a reprecificação. */
export function pagasAlcancadas(c: CoreContract, competencia: string, percentual: number): { quantidade: number; diferenca: number } {
  const cmp = comp(competencia)
  if (!cmp || !percentual) return { quantidade: 0, diferenca: 0 }
  const fator = 1 + percentual / 100
  let quantidade = 0
  let diferenca = 0
  for (const campo of camposDaNatureza(c.natureza)) {
    for (const l of c[campo] ?? []) {
      const ref = lancRef(l)
      /* parcela não reajustável não gera diferença: ela não subiria nem se estivesse a vencer */
      if (lancPago(l) && lancReajustavel(l) && ref && comp(ref) >= cmp) {
        quantidade++
        diferenca += round2(num(l.valor) * fator) - num(l.valor)
      }
    }
  }
  return { quantidade, diferenca: round2(diferenca) }
}

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
    /* Percentual APLICA sobre cada parcela; valor digitado à mão IGUALA todas.
       São coisas diferentes: "as parcelas sobem 5%" preserva a estrutura do cronograma
       (uma parcela de 150.000 vira 157.500), enquanto "a parcela passa a ser R$ 5.250"
       é uma renegociação de valor único. Igualar sempre destruiria cronogramas com
       parcelas de valores distintos. */
    const igualar = input.parcelaNova != null
    const novoValorDe = (l: CoreLancamento) => (igualar ? parcelaNova : round2(num(l.valor) * fator))

    const novos = new Map(alvo.map(x => [x.lanc.id, novoValorDe(x.lanc)]))
    /* delta sobre os valores JÁ ARREDONDADOS — é o que de fato vai para as parcelas,
       então o total fecha exatamente com a soma do cronograma. */
    const delta = alvo.reduce((s, x) => s + (novos.get(x.lanc.id)! - num(x.lanc.valor)), 0)
    rec.parcelasReajustadas = alvo.length
    rec.valorAnterior = round2(totalVig)
    rec.valorNovo = round2(totalVig + delta)
    const reprice = (arr: CoreLancamento[]) => arr.map(l => (novos.has(l.id) ? { ...l, valor: novos.get(l.id)! } : l))
    return { reajuste: rec, pagamentos: reprice(pagamentos), recebimentos: reprice(recebimentos) }
  }

  const count = input.qtdParcelas != null ? input.qtdParcelas : int(c.qtdParcelas)
  const delta = (parcelaNova - parcelaAnterior) * count
  rec.parcelasReajustadas = count
  rec.valorAnterior = round2(totalVig)
  rec.valorNovo = round2(totalVig + delta)
  return { reajuste: rec, pagamentos, recebimentos }
}
