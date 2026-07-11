import type { Numeric } from './num'

/* Formas "frouxas" do contrato: campos numéricos são Numeric (string no front,
   number no backend) e campos opcionais são opcionais de verdade, porque o
   registro cru do Prisma pode não trazê-los. O front continua usando os seus
   tipos estritos (ContractFormValues) — eles são atribuíveis a estes. */

export type LancField = 'pagamentos' | 'recebimentos'

/** Lançamento = parcela do cronograma.
 *  `vencimento` = data prevista; `data` = data em que foi pago.
 *  "Vencido" e "pago" são DERIVADOS — ver lancPago/lancPrevisto/lancRealizado em derive.ts. */
export interface CoreLancamento {
  id: string
  vencimento?: string
  data?: string
  /** valor contratado da parcela (o que se espera pagar/receber) */
  valorPrevisto?: Numeric
  /** valor efetivamente pago/recebido. Ausente = a parcela ainda não foi baixada. */
  valorPago?: Numeric
  forma?: string
  documento?: string
  observacao?: string
  /** false = o reajuste NÃO alcança esta parcela (ex.: equipamento entregue, taxa fixa).
   *  Ausente = reajustável — é o caso da esmagadora maioria e de todo dado legado. */
  reajustavel?: boolean

  /* Comprovante da baixa (anexo no StorageService). METADADO: nenhuma regra deste pacote
     lê estes campos — não entram em soma, não afetam `lancPago` nem a reprecificação.
     Ficam aqui só para que o lançamento trafegue inteiro entre front e backend. */
  comprovante_nome?: string
  comprovante_key?: string

  /* ── modelo antigo, só para LEITURA de dados gravados antes da separação ──
     Um único `valor` e um `status` textual. Nenhum caminho de escrita produz isto hoje. */
  /** @deprecated use valorPrevisto / valorPago */
  valor?: Numeric
  /** @deprecated o estado é derivado de valorPago */
  status?: string
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
 *  comportamento histórico).
 *
 *  Não existe "suspensa". Silenciar o aviso de um reajuste pendente esconde uma
 *  obrigação de dinheiro sem resolvê-la — e a competência ressurgiria represada ao
 *  reativar. Para registrar que um período NÃO reajustou, aplique um reajuste de 0%:
 *  o valor não muda, a próxima competência avança, o alerta some e o fato fica no
 *  histórico com a sua justificativa. */
export type AplicacaoReajuste = 'AUTOMATICA' | 'MANUAL'

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
  /** forma de pagamento padrão do contrato (id da lookup); dirige a geração de cronograma/renovação */
  formaPagamento?: string | null
  aditivos?: CoreAditivo[]
  renovacoes?: CoreRenovacao[]
  reajustes?: CoreReajuste[]
  reajustesRealizados?: CoreReajusteRealizado[]
  pagamentos?: CoreLancamento[]
  recebimentos?: CoreLancamento[]
}
