import type { Numeric } from './num'

/* Formas "frouxas" do contrato: campos numéricos são Numeric (string no front,
   number no backend) e campos opcionais são opcionais de verdade, porque o
   registro cru do Prisma pode não trazê-los. O front continua usando os seus
   tipos estritos (ContractFormValues) — eles são atribuíveis a estes. */

export type LancField = 'pagamentos' | 'recebimentos'

/** Lançamento = parcela do cronograma. status 'previsto' | 'pago' (legado sem status = 'pago');
 *  vencimento = data de vencimento; data = data de pagamento. "Vencido" é derivado. */
export interface CoreLancamento {
  id: string
  status?: string
  vencimento?: string
  data?: string
  valor: Numeric
  forma?: string
  documento?: string
  observacao?: string
}

/** Termo aditivo: altera término/valor/objeto/partes em vigor. RASCUNHO não aplica efeito. */
export interface CoreAditivo {
  id?: string
  situacao?: string
  data?: string
  alteraTermino?: boolean
  novoTermino?: string | null
  alteraValor?: boolean
  novoValor?: Numeric
  novaParcela?: Numeric
}

/** Como o motor de datas trata esta linha de reajuste.
 *  AUTOMATICA = aplica sozinho quando vence; MANUAL = só notifica (default, e o
 *  comportamento histórico); SUSPENSA = nem notifica (contrato em disputa de índice). */
export type AplicacaoReajuste = 'AUTOMATICA' | 'MANUAL' | 'SUSPENSA'

/** Linha de reajuste = a AGENDA (índice + data base + periodicidade). */
export interface CoreReajuste {
  id: string
  indice: string
  data: string
  periodicidade: string
  /** ausente = MANUAL (linhas cadastradas antes da política existir) */
  aplicacao?: string
}

/** Reajuste efetivamente APLICADO (fato, não agenda). `valorAnterior`/`valorNovo`
 *  guardam o delta exato — é isso que torna valorVigente independente de ordem. */
export interface CoreReajusteRealizado {
  id: string
  reajusteId: string
  competencia: string
  indiceSnapshot?: string
  base?: string // 'total' | 'parcela'
  percentual?: Numeric
  valorAnterior?: Numeric
  valorNovo?: Numeric
  parcelaAnterior?: Numeric
  parcelaNova?: Numeric
  parcelasReajustadas?: Numeric
  dataAplicacao?: string
  observacao?: string
  user?: string
  createdAt?: string
}

/** Renovação automática (cláusula, não aditamento): estende a vigência. */
export interface CoreRenovacao {
  id?: string
  data?: string
  terminoAnterior?: string
  novoTermino?: string
  automatica?: boolean
  valorPeriodo?: Numeric
}

/** Subconjunto do contrato de que as regras de negócio precisam. */
export interface CoreContract {
  natureza?: string | null
  terminoVigencia?: string | null
  valorTotal?: Numeric
  valorParcela?: Numeric
  qtdParcelas?: Numeric
  aditivos?: CoreAditivo[]
  renovacoes?: CoreRenovacao[]
  reajustes?: CoreReajuste[]
  reajustesRealizados?: CoreReajusteRealizado[]
  pagamentos?: CoreLancamento[]
  recebimentos?: CoreLancamento[]
}
