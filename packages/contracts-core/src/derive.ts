import { num, round2 } from './num'
import type { CoreAditivo, CoreContract, CoreLancamento, LancField } from './types'

/* ─── derivação do estado VIGENTE ────────────────────────────────────────────
   O contrato guarda os valores ORIGINAIS. Cada aditivo ATIVO, cada reajuste
   aplicado e cada renovação sobrepõem/acumulam sobre eles, em ordem. Nada disso
   é gravado: é sempre derivado na leitura. */

/** Aditivo em RASCUNHO não aplica efeito. Registro legado sem `situacao` conta como ATIVO.
 *
 *  Nota: o front (`aditivoAtivo`) exigia `=== 'ATIVO'` e o backend usava `!== 'RASCUNHO'`,
 *  divergindo justamente quando `situacao` vinha ausente. `contractFromApi` já normaliza
 *  para 'ATIVO' nesse caso, então a semântica do backend é a que descreve os dados reais. */
export const aditivoAtivo = (a: CoreAditivo): boolean => (a.situacao ?? 'ATIVO') === 'ATIVO'

/** Campos de lançamento pertinentes à natureza do contrato. */
export function camposDaNatureza(natureza?: string | null): LancField[] {
  if (natureza === 'RECEITA') return ['recebimentos']
  if (natureza === 'AMBOS') return ['pagamentos', 'recebimentos']
  return ['pagamentos']
}

/* ─── PREVISTO × REALIZADO ────────────────────────────────────────────────────
   A parcela tem dois valores: o `valorPrevisto` (contratado) e o `valorPago`
   (efetivamente baixado). "Pago" é DERIVADO da presença do valorPago — não é um
   campo que alguém possa deixar inconsistente com o dinheiro.

   LEGADO: antes desta separação havia um único `valor` e um `status` textual, e a
   leitura tratava "sem status" como PAGO — na origem a seção se chamava "Pagamentos
   realizados" e todo lançamento era um realizado. Ler esse dado como "previsto"
   zeraria o consumo de contratos antigos. Por isso o fallback abaixo consulta o
   status legado antes de decidir. Nenhum caminho de escrita produz mais esse formato. */

const presente = (x: unknown) => x !== undefined && x !== null && x !== ''
/** modelo antigo: só tem `valor`, sem os dois campos novos */
const ehLegado = (l: CoreLancamento) => !presente(l.valorPrevisto) && !presente(l.valorPago) && presente(l.valor)
const legadoPago = (l: CoreLancamento) => (l.status || 'pago') === 'pago'

/** A parcela foi baixada? Presença do valorPago — não `> 0`: uma baixa de R$ 0,00 é rara,
 *  mas é uma baixa. */
export const lancPago = (l: CoreLancamento): boolean =>
  presente(l.valorPago) ? true : ehLegado(l) ? legadoPago(l) : false

/** Valor contratado da parcela. */
export const lancPrevisto = (l: CoreLancamento): number =>
  num(presente(l.valorPrevisto) ? l.valorPrevisto : l.valor)

/** Valor efetivamente pago/recebido. 0 quando a parcela ainda não foi baixada. */
export const lancRealizado = (l: CoreLancamento): number =>
  presente(l.valorPago) ? num(l.valorPago) : ehLegado(l) && legadoPago(l) ? num(l.valor) : 0

/** Quanto o realizado se afastou do previsto: + juros/multa, − desconto/glosa.
 *  Zero enquanto a parcela não é paga (não há desvio contra o que ainda não aconteceu). */
export const lancDesvio = (l: CoreLancamento): number =>
  lancPago(l) ? round2(lancRealizado(l) - lancPrevisto(l)) : 0

/** Devolve a parcela com um novo valor PREVISTO, descartando o `valor` legado para
 *  não deixar dois números discordando no mesmo registro. */
export function comPrevisto(l: CoreLancamento, valorPrevisto: number): CoreLancamento {
  const { valor: _legado, ...resto } = l
  return { ...resto, valorPrevisto }
}

/** data de referência da parcela: vencimento (ou pagamento, p/ legado). */
export const lancRef = (l: CoreLancamento) => l.vencimento || l.data || ''
/** O reajuste alcança esta parcela? Só `false` explícito exclui — dado legado reajusta. */
export const lancReajustavel = (l: CoreLancamento) => l.reajustavel !== false

/** Término vigente = término original, sobreposto pelos aditivos de prorrogação ATIVOS
 *  (o último vence) e estendido pelas renovações (a mais tardia vence). */
export function terminoVigente(c: CoreContract): string {
  let t = c.terminoVigencia ?? ''
  for (const a of c.aditivos ?? []) if (aditivoAtivo(a) && a.alteraTermino && a.novoTermino) t = a.novoTermino
  for (const r of c.renovacoes ?? []) if (r.novoTermino && r.novoTermino > t) t = r.novoTermino
  return t
}

/** Valor total vigente = valor inicial + acréscimos dos aditivos de valor ATIVOS
 *  + deltas dos reajustes aplicados (valorNovo − valorAnterior) + valor dos períodos renovados.
 *  Somar o DELTA (e não recalcular pelo percentual) torna o resultado independente de ordem. */
export function valorVigente(c: CoreContract): number {
  let val = num(c.valorTotal)
  for (const a of c.aditivos ?? []) if (aditivoAtivo(a) && a.alteraValor) val += num(a.novoValor)
  for (const r of c.reajustesRealizados ?? []) val += num(r.valorNovo) - num(r.valorAnterior)
  for (const r of c.renovacoes ?? []) val += num(r.valorPeriodo)
  return val
}

/** Parcela vigente = última parcela definida cronologicamente por um aditivo de valor
 *  ATIVO (novaParcela) ou por um reajuste de parcela aplicado (parcelaNova). Último vence. */
export function parcelaVigente(c: CoreContract): number {
  let p = num(c.valorParcela)
  const eventos: { data: string; val: number }[] = [
    ...(c.aditivos ?? [])
      .filter(a => aditivoAtivo(a) && a.alteraValor && num(a.novaParcela))
      .map(a => ({ data: String(a.data ?? ''), val: num(a.novaParcela) })),
    ...(c.reajustesRealizados ?? [])
      .filter(r => num(r.parcelaNova))
      .map(r => ({ data: String(r.competencia ?? ''), val: num(r.parcelaNova) })),
  ].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  for (const e of eventos) if (e.val) p = e.val
  return p
}

/** Consumo = só o que foi efetivamente pago/recebido.
 *
 *  ATENÇÃO: preserva o comportamento histórico do scheduler — natureza AMBOS conta
 *  apenas `pagamentos`. Diverge de `camposDaNatureza`; mantido idêntico de propósito
 *  para que a extração não mude nenhum número. Ver nota em docs. */
export function consumo(c: CoreContract): number {
  const arr = (c.natureza === 'RECEITA' ? c.recebimentos : c.pagamentos) ?? []
  return round2(arr.reduce((s, l) => s + lancRealizado(l), 0))
}

/* ─── situação ───────────────────────────────────────────────────────────────
   Estados persistidos: EM_CADASTRO, VIGENTE, ENCERRADO, RESCINDIDO.
   VENCIDO é DERIVADO, nunca gravado: contrato VIGENTE cujo término já passou. */

/** Converte situações do modelo antigo para o ciclo atual. */
export function normalizeSituacao(s: string): string {
  switch (s) {
    case 'ATIVO':                                     return 'VIGENTE'
    case 'PENDENTE': case 'REVISAO': case 'SUSPENSO': return 'EM_CADASTRO'
    default:                                          return s
  }
}

/** Situação exibida: normaliza o legado e resolve 'VENCIDO'.
 *  `termino` deve ser o término VIGENTE (com aditivos e renovações) — prorrogou, não vence.
 *  Passe '' quando o prazo for indeterminado. */
export function effectiveSituacao(situacao: string, termino: string | null | undefined, today: string): string {
  const s = normalizeSituacao(situacao)
  if (s === 'VIGENTE' && termino && termino < today) return 'VENCIDO'
  return s
}

/** Soma do que está CONTRATADO (previsto) numa lista de parcelas. */
export const somaLancamentos = (arr: CoreLancamento[]) => round2(arr.reduce((s, l) => s + lancPrevisto(l), 0))
/** Soma do que foi efetivamente PAGO (realizado). */
export const somaLancamentosPagos = (arr: CoreLancamento[]) => round2(arr.reduce((s, l) => s + lancRealizado(l), 0))
/** Soma dos desvios (realizado − previsto) das parcelas já pagas. */
export const somaDesvios = (arr: CoreLancamento[]) => round2(arr.reduce((s, l) => s + lancDesvio(l), 0))
