import type { LookupEntry } from '@/hooks/use-lookup-table'

/* ─── chaves das lookups (settings) ──────────────────────── */
export const TIPOS_KEY         = 'nxt:settings:contratos:tipos'
export const OBJETOS_KEY        = 'nxt:settings:contratos:objetos'
export const MOEDAS_KEY         = 'nxt:settings:contratos:moedas'
export const CONDICOES_KEY      = 'nxt:settings:contratos:condicoes'
export const INDICES_KEY        = 'nxt:settings:contratos:indices'
export const TIPOS_ADITIVO_KEY  = 'nxt:settings:contratos:tipos-aditivo'
export const FORMAS_PGTO_KEY    = 'nxt:settings:contratos:formas-pagamento'

/* ─── sementes ───────────────────────────────────────────── */
export const INIT_TIPOS: LookupEntry[] = [
  { id: '1', label: 'Prestação de Serviços', active: true },
  { id: '2', label: 'Fornecimento de Bens',  active: true },
  { id: '3', label: 'Locação',               active: true },
  { id: '4', label: 'Parceria / Convênio',   active: true },
  { id: '5', label: 'Licença de Software',   active: true },
  { id: '6', label: 'Outro',                 active: true },
]
export const INIT_OBJETOS: LookupEntry[] = [
  { id: '1', label: 'Desenvolvimento de software',   active: true },
  { id: '2', label: 'Consultoria técnica',           active: true },
  { id: '3', label: 'Fornecimento de equipamentos',  active: true },
  { id: '4', label: 'Serviços de manutenção',        active: true },
  { id: '5', label: 'Locação de imóvel',             active: true },
  { id: '6', label: 'Suporte e sustentação',         active: true },
  { id: '7', label: 'Treinamento',                   active: true },
]
export const INIT_MOEDAS: LookupEntry[] = [
  { id: '1', code: 'BRL', label: 'Real brasileiro', active: true },
  { id: '2', code: 'USD', label: 'Dólar americano', active: true },
  { id: '3', code: 'EUR', label: 'Euro',            active: true },
  { id: '4', code: 'GBP', label: 'Libra esterlina', active: true },
]
export const INIT_CONDICOES: LookupEntry[] = [
  { id: '1', label: 'À vista',    active: true },
  { id: '2', label: 'Parcelado',  active: true },
  { id: '3', label: 'Mensal',     active: true },
  { id: '4', label: 'Trimestral', active: true },
  { id: '5', label: 'Semestral',  active: true },
  { id: '6', label: 'Anual',      active: true },
  { id: '7', label: 'Outro',      active: true },
]
/* Índices de reajuste do BCB (série SGS) — códigos verificados na API pública.
   `code` = série SGS; usado no import do Banco Central e no schedule diário.
   INCC-M (7832) foi descontinuado — usamos INCC-DI (192). */
export interface BcbIndice { label: string; sgs: string }
export const BCB_INDICES: BcbIndice[] = [
  { label: 'IPCA',         sgs: '433'  },
  { label: 'IPCA-15',      sgs: '7478' },
  { label: 'INPC',         sgs: '188'  },
  { label: 'IGP-M',        sgs: '189'  },
  { label: 'IGP-DI',       sgs: '190'  },
  { label: 'IGP-10',       sgs: '7447' },
  { label: 'INCC-DI',      sgs: '192'  },
  { label: 'IPC-BR (FGV)', sgs: '191'  },
  { label: 'IPC-Fipe',     sgs: '193'  },
  { label: 'CDI',          sgs: '4391' },
  { label: 'SELIC',        sgs: '4390' },
  { label: 'TR',           sgs: '226'  },
  { label: 'Poupança',     sgs: '196'  },
]
/** Normaliza rótulo p/ casar índice existente com o canônico (IGPM ↔ IGP-M etc.). */
export const normIndiceLabel = (s: string) => s.toUpperCase().replace(/[\s\-().]/g, '')

export const INIT_INDICES: LookupEntry[] = [
  ...BCB_INDICES.map((x, i) => ({ id: String(i + 1), label: x.label, code: x.sgs, active: true })),
  { id: 'fixo',   label: 'Fixo',   active: true },
  { id: 'nenhum', label: 'Nenhum', active: true },
]
export const INIT_TIPOS_ADITIVO: LookupEntry[] = [
  { id: '1', label: 'Prorrogação de prazo',              active: true, efeito: 'termino' },
  { id: '2', label: 'Reajuste / Repactuação de valor',   active: true, efeito: 'valor'   },
  { id: '3', label: 'Acréscimo de escopo',               active: true, efeito: 'objeto'  },
  { id: '4', label: 'Supressão de escopo',               active: true, efeito: 'objeto'  },
  { id: '5', label: 'Cessão / Sub-rogação',              active: true, efeito: 'partes'  },
  { id: '6', label: 'Reequilíbrio econômico-financeiro', active: true, efeito: 'valor'   },
  { id: '7', label: 'Re-ratificação',                    active: true, efeito: 'nenhum'  },
  { id: '8', label: 'Outro',                             active: true, efeito: 'nenhum'  },
]
export const INIT_FORMAS_PGTO: LookupEntry[] = [
  { id: '1', label: 'PIX',                     active: true },
  { id: '2', label: 'Boleto bancário',         active: true },
  { id: '3', label: 'Transferência (TED/DOC)', active: true },
  { id: '4', label: 'Cartão de crédito',       active: true },
  { id: '5', label: 'Cartão de débito',        active: true },
  { id: '6', label: 'Dinheiro',                active: true },
  { id: '7', label: 'Cheque',                  active: true },
  { id: '8', label: 'Débito automático',       active: true },
  { id: '9', label: 'Outro',                   active: true },
]

/* ─── natureza do contrato ───────────────────────────────── */
export const NATUREZAS = [
  { value: 'DESPESA', label: 'Despesa' },
  { value: 'RECEITA', label: 'Receita' },
  { value: 'AMBOS',   label: 'Ambos'   },
]
/** Mostra pagamentos (Despesa/Ambos) */
export const temPagamentos   = (n?: string) => n === 'DESPESA' || n === 'AMBOS'
/** Mostra recebimentos (Receita/Ambos) */
export const temRecebimentos = (n?: string) => n === 'RECEITA' || n === 'AMBOS'

/* ─── ação no término da vigência ────────────────────────── */
export const ACOES_TERMINO = [
  { value: 'MANUAL',   label: 'Definir manualmente'     },
  { value: 'RENOVAR',  label: 'Renovar automaticamente' },
  { value: 'ENCERRAR', label: 'Encerrar automaticamente'},
]

export const SITUACOES = [
  { value: 'EM_CADASTRO', label: 'Em cadastro/revisão' },
  { value: 'VIGENTE',     label: 'Vigente'             },
  { value: 'VENCIDO',     label: 'Vencido'             },  // derivado — nunca gravado (ver effectiveSituacao)
  { value: 'ENCERRADO',   label: 'Encerrado'           },
  { value: 'RESCINDIDO',  label: 'Rescindido'          },
]

/* ─── ciclo de vida da situação ──────────────────────────────
   Estados persistidos: EM_CADASTRO, VIGENTE, ENCERRADO, RESCINDIDO.
   VENCIDO é DERIVADO (nunca gravado): contrato VIGENTE cujo término já passou. */

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Converte situações legadas (modelo antigo) para o ciclo atual. */
export function normalizeSituacao(s: string): string {
  switch (s) {
    case 'ATIVO':                          return 'VIGENTE'
    case 'PENDENTE': case 'REVISAO': case 'SUSPENSO': return 'EM_CADASTRO'
    default:                               return s
  }
}

/** Situação exibida: normaliza legado e resolve 'Vencido' (VIGENTE + término < hoje). */
export function effectiveSituacao(situacao: string, terminoVigencia?: string | null): string {
  const s = normalizeSituacao(situacao)
  if (s === 'VIGENTE' && terminoVigencia && terminoVigencia < todayISO()) return 'VENCIDO'
  return s
}
export const PERIODICIDADES    = ['Mensal', 'Trimestral', 'Semestral', 'Anual']
export const TIPOS_DOCUMENTO   = ['Contrato original', 'Proposta comercial', 'Aditivo', 'Distrato', 'Ata de reunião', 'Outros']
export const STATUS_ASSINATURA = [
  { value: 'nenhum',     label: 'Sem assinatura digital' },
  { value: 'aguardando', label: 'Aguardando envio'        },
  { value: 'enviado',    label: 'Enviado p/ assinatura'   },
  { value: 'assinado',   label: 'Assinado'                },
  { value: 'rejeitado',  label: 'Rejeitado'               },
]

/* ─── modelo único do formulário de contrato ─────────────── */
export interface CParte      { id: string; papel: string; ref_tipo: string; ref_id: string; nome: string; documento: string }
export interface CReajuste   { id: string; indice: string; data: string; periodicidade: string }
/** Reajuste efetivamente aplicado (fato, não agenda). A próxima ocorrência continua derivada;
 *  este registro alimenta o valor vigente, ancora a próxima data e serve de auditoria/histórico.
 *  competencia = yyyy-mm-01 (mês de referência); valorAnterior/valorNovo guardam o delta exato. */
export interface CReajusteRealizado {
  id: string; reajusteId: string; competencia: string; indiceSnapshot: string
  base: string // 'total' | 'parcela' — o que o reajuste alterou
  percentual: string; valorAnterior: string; valorNovo: string
  parcelaAnterior: string; parcelaNova: string; parcelasReajustadas: string // nº de parcelas reajustadas (base 'parcela')
  dataAplicacao: string; observacao: string; user: string; createdAt: string
}
/** Renovação automática (cláusula, não aditamento): estende a vigência sem gerar aditivo. */
export interface CRenovacao  { id: string; data: string; terminoAnterior: string; novoTermino: string; automatica: boolean }
export interface CDocumento  { id: string; nome: string; tipo: string; data: string; arquivo_nome: string; arquivo_key: string; status_assinatura: string; observacao: string }
/** Lançamento de pagamento (Despesa) ou recebimento (Receita). Mesma forma. */
/** Lançamento = parcela do cronograma. status 'previsto' | 'pago'; vencimento = data de vencimento;
 *  data = data de pagamento (preenchida quando pago). "Vencido" é derivado (previsto + vencimento < hoje). */
export interface CLancamento { id: string; status: string; vencimento: string; data: string; valor: string; forma: string; documento: string; observacao: string }
/** Cessão de parte num aditivo: a parte `parteId` passa a ser a entidade indicada (mantém o papel). */
export interface CCessao { id: string; parteId: string; ref_tipo: string; ref_id: string; nome: string; documento: string }
/** Termo aditivo: altera, em vigor, término/valor/objeto/partes do contrato; original é preservado. */
export interface CAditivo {
  id: string; numero: string; situacao: string; tipos: string[]; data: string; vigenciaInicio: string; descricao: string  // situacao: RASCUNHO | ATIVO
  arquivo_nome: string; arquivo_key: string
  alteraTermino: boolean; novoTermino: string
  alteraValor:   boolean; novoValor:   string; novaParcela: string  // novoValor = acréscimo somado ao inicial
  novaCondicaoPagamento: string; novoComplemento: string           // renegociação: opcionais, vigente = último definido
  alteraObjeto:  boolean; novoObjeto:  string[]; novoTitulo: string; novaDescricao: string  // escopo: título/descrição opcionais
  alteraPartes:  boolean; cessoes:     CCessao[]
}

export interface ContractFormValues {
  numero: string; titulo: string; descricao: string; objeto: string[]; tipo: string; natureza: string
  inicioVigencia: string; prazoIndeterminado: boolean; terminoVigencia: string; dataAssinatura: string
  acaoTermino: string; renovacaoAnos: string; renovacaoMeses: string; renovacaoDias: string
  situacao: string; moeda: string; valorParcela: string; valorTotal: string; qtdParcelas: string
  condicaoPagamento: string; complementoValor: string
  reajustes: CReajuste[]; partes: CParte[]; documentos: CDocumento[]
  pagamentos: CLancamento[]; recebimentos: CLancamento[]; aditivos: CAditivo[]; renovacoes: CRenovacao[]
  reajustesRealizados: CReajusteRealizado[]
}

export const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
export const newCParte      = (papel = ''): CParte      => ({ id: uid(), papel, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCReajuste   = ():           CReajuste   => ({ id: uid(), indice: '', data: '', periodicidade: '' })
export const newCReajusteRealizado = (reajusteId = ''): CReajusteRealizado => ({ id: uid(), reajusteId, competencia: '', indiceSnapshot: '', base: 'total', percentual: '', valorAnterior: '', valorNovo: '', parcelaAnterior: '', parcelaNova: '', parcelasReajustadas: '', dataAplicacao: '', observacao: '', user: '', createdAt: '' })
export const newCDocumento  = ():           CDocumento  => ({ id: uid(), nome: '', tipo: '', data: '', arquivo_nome: '', arquivo_key: '', status_assinatura: 'nenhum', observacao: '' })
export const newCLancamento = (status = 'previsto'): CLancamento => ({ id: uid(), status, vencimento: '', data: '', valor: '', forma: '', documento: '', observacao: '' })
export const newCCessao      = (parteId = ''):CCessao    => ({ id: uid(), parteId, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCAditivo     = (numero = ''): CAditivo   => ({
  id: uid(), numero, situacao: 'RASCUNHO', tipos: [], data: '', vigenciaInicio: '', descricao: '', arquivo_nome: '', arquivo_key: '',
  alteraTermino: false, novoTermino: '', alteraValor: false, novoValor: '', novaParcela: '', novaCondicaoPagamento: '', novoComplemento: '', alteraObjeto: false, novoObjeto: [], novoTitulo: '', novaDescricao: '', alteraPartes: false, cessoes: [],
})

/** Soma os valores de uma lista de lançamentos (campo `valor` é número como string). */
export const somaLancamentos = (arr: CLancamento[]) => arr.reduce((s, x) => s + (parseFloat(x.valor) || 0), 0)
/** status efetivo (legado sem status = 'pago'). */
export const lancStatus = (l: CLancamento) => l.status || 'pago'
export const lancPago = (l: CLancamento) => lancStatus(l) === 'pago'
/** Soma só dos lançamentos PAGOS — consumo e saldo consideram só o realizado. */
export const somaLancamentosPagos = (arr: CLancamento[]) => arr.reduce((s, x) => s + (lancPago(x) ? parseFloat(x.valor) || 0 : 0), 0)

/** Validações de negócio compartilhadas entre cadastro e edição. Retorna a 1ª mensagem, ou null. */
export function validateContract(v: ContractFormValues): string | null {
  /* Vigência: início não pode ser posterior ao término (datas ISO comparam lexicograficamente).
     As Partes são validadas à parte (validatePartes, em contract-roles) — precisam do papel. */
  if (!v.prazoIndeterminado && v.inicioVigencia && v.terminoVigencia && v.terminoVigencia < v.inicioVigencia) {
    return 'A data de início da vigência não pode ser posterior à data de término.'
  }
  /* Reajustes: informado o índice, Data base de reajuste e Periodicidade tornam-se obrigatórios. */
  if (v.reajustes.some(r => r.indice && (!r.data || !r.periodicidade))) {
    return 'Em Reajustes, informe a Data base de reajuste e a Periodicidade de cada índice selecionado.'
  }
  return null
}

/** Lançamentos (pagamentos/recebimentos): cada linha exige Data, Valor (>0) e Forma.
 *  Retorna a seção com problema (p/ focar a aba) e a mensagem, ou null. */
export function validateLancamentos(v: ContractFormValues): { field: 'pagamentos' | 'recebimentos'; msg: string } | null {
  const secoes = [
    { field: 'pagamentos'   as const, label: 'Pagamentos',   ativo: temPagamentos(v.natureza) },
    { field: 'recebimentos' as const, label: 'Recebimentos', ativo: temRecebimentos(v.natureza) },
  ]
  for (const s of secoes) {
    if (!s.ativo) continue
    if (v[s.field].some(l => !(l.vencimento || l.data) || !(parseFloat(l.valor) > 0) || !l.forma)) {
      return { field: s.field, msg: `Em ${s.label}, informe Vencimento, Valor e Forma de cada parcela.` }
    }
  }
  return null
}

/* ─── derivação do estado VIGENTE (original + aditivos ATIVOS aplicados em ordem) ──
   O contrato guarda os valores ORIGINAIS; cada aditivo ATIVO, em ordem, sobrepõe os
   campos que altera (o último vence). Aditivo em RASCUNHO NÃO aplica efeito — só após
   ativação. Mesma lógica é replicada no backend (contracts.service) para a listagem. */
export const aditivoAtivo = (a: CAditivo) => a.situacao === 'ATIVO'

export function terminoVigente(v: ContractFormValues): string {
  let t = v.terminoVigencia
  for (const a of v.aditivos) if (aditivoAtivo(a) && a.alteraTermino && a.novoTermino) t = a.novoTermino
  /* renovações automáticas (cláusula, não aditivo) estendem a vigência; a mais tardia vence */
  for (const r of (v.renovacoes ?? [])) if (r.novoTermino && r.novoTermino > t) t = r.novoTermino
  return t
}
/** Valor total vigente = valor inicial + acréscimos dos aditivos de valor ATIVOS
 *  + deltas dos reajustes efetivamente aplicados (valorNovo − valorAnterior).
 *  Guardar o delta (não o %) torna a soma exata e independente da ordem entre aditivo e reajuste. */
export function valorVigente(v: ContractFormValues): number {
  let val = parseFloat(v.valorTotal) || 0
  for (const a of v.aditivos) if (aditivoAtivo(a) && a.alteraValor && a.novoValor) val += parseFloat(a.novoValor) || 0
  for (const r of (v.reajustesRealizados ?? [])) val += (parseFloat(r.valorNovo) || 0) - (parseFloat(r.valorAnterior) || 0)
  return val
}
/** Parcela vigente = última parcela definida, cronologicamente, por um aditivo de valor
 *  ATIVO (novaParcela) OU por um reajuste de parcela/ambos (parcelaNova). Último vence. */
export function parcelaVigente(v: ContractFormValues): string {
  let p = v.valorParcela
  const eventos: { data: string; val: string }[] = [
    ...v.aditivos.filter(a => aditivoAtivo(a) && a.alteraValor && a.novaParcela).map(a => ({ data: a.data, val: a.novaParcela })),
    ...(v.reajustesRealizados ?? []).filter(r => r.parcelaNova).map(r => ({ data: r.competencia, val: r.parcelaNova })),
  ].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  for (const e of eventos) if (e.val) p = e.val
  return p
}
/** Condição de pagamento vigente = última definida por um aditivo de valor ATIVO (ou a original). */
export function condicaoVigente(v: ContractFormValues): string {
  let c = v.condicaoPagamento
  for (const a of v.aditivos) if (aditivoAtivo(a) && a.alteraValor && a.novaCondicaoPagamento) c = a.novaCondicaoPagamento
  return c
}
/** Complemento do valor vigente = último definido por um aditivo de valor ATIVO (ou o original). */
export function complementoVigente(v: ContractFormValues): string {
  let c = v.complementoValor
  for (const a of v.aditivos) if (aditivoAtivo(a) && a.alteraValor && a.novoComplemento) c = a.novoComplemento
  return c
}
export function objetoVigente(v: ContractFormValues): string[] {
  let o = v.objeto
  for (const a of v.aditivos) if (aditivoAtivo(a) && a.alteraObjeto) o = a.novoObjeto
  return o
}
/** Último aditivo de escopo ATIVO que alterou um campo de texto (título/descrição): valor + origem. */
function escopoTextoVigente(v: ContractFormValues, original: string, get: (a: CAditivo) => string): { valor: string; aditivo: string } {
  let valor = original, aditivo = ''
  v.aditivos.forEach((a, idx) => {
    const novo = get(a)
    if (aditivoAtivo(a) && a.alteraObjeto && novo && novo !== valor) { valor = novo; aditivo = rotuloAditivo(a, idx) }
  })
  return { valor, aditivo }
}
export const tituloVigenteInfo    = (v: ContractFormValues) => escopoTextoVigente(v, v.titulo, a => a.novoTitulo)
export const descricaoVigenteInfo = (v: ContractFormValues) => escopoTextoVigente(v, v.descricao, a => a.novaDescricao)
export const tituloVigente    = (v: ContractFormValues) => tituloVigenteInfo(v).valor
export const descricaoVigente = (v: ContractFormValues) => descricaoVigenteInfo(v).valor
export function partesVigentes(v: ContractFormValues): CParte[] {
  let partes = v.partes
  for (const a of v.aditivos)
    if (aditivoAtivo(a) && a.alteraPartes)
      for (const c of a.cessoes)
        partes = partes.map(p => p.id === c.parteId ? { ...p, ref_tipo: c.ref_tipo, ref_id: c.ref_id, nome: c.nome, documento: c.documento } : p)
  return partes
}

/* ─── HISTÓRICO CONTRATUAL por dimensão (procedência dos aditivos ATIVOS) ───────
   Reconstrói como cada aspecto evoluiu, alimentando o "histórico embutido" de cada
   seção. Princípio: NADA some — o removido/cedido segue visível com sua origem. */

const rotuloAditivo = (a: CAditivo, idx: number) => a.numero ? `${a.numero}º aditivo` : `Aditivo ${idx + 1}`

/** Períodos de vigência: prazo original + cada prorrogação (contígua); o último fica "em vigor". */
export interface PeriodoVigencia { inicio: string; termino: string; label: string; aditivo: boolean; emVigor: boolean }
export function periodosVigencia(v: ContractFormValues): PeriodoVigencia[] {
  if (v.prazoIndeterminado || !v.terminoVigencia) return []
  /* eventos que estendem a vigência: aditivos de prorrogação (ATIVOS) + renovações automáticas */
  const eventos: { termino: string; label: string; aditivo: boolean }[] = []
  v.aditivos.forEach((a, idx) => {
    if (aditivoAtivo(a) && a.alteraTermino && a.novoTermino) eventos.push({ termino: a.novoTermino, label: rotuloAditivo(a, idx), aditivo: true })
  })
  for (const r of (v.renovacoes ?? [])) if (r.novoTermino) eventos.push({ termino: r.novoTermino, label: 'Renovação automática', aditivo: false })
  eventos.sort((a, b) => (a.termino < b.termino ? -1 : a.termino > b.termino ? 1 : 0)) // só estende → ordem cronológica

  const base: { inicio: string; termino: string; label: string; aditivo: boolean }[] = [
    { inicio: v.inicioVigencia, termino: v.terminoVigencia, label: 'Prazo original', aditivo: false },
  ]
  let anterior = v.terminoVigencia
  for (const e of eventos) {
    if (e.termino <= anterior) continue
    base.push({ inicio: proximoDiaISO(anterior), termino: e.termino, label: e.label, aditivo: e.aditivo })
    anterior = e.termino
  }
  return base.map((p, i) => ({ ...p, emVigor: i === base.length - 1 }))
}

/** Histórico financeiro como CHANGELOG por evento: cada aditivo de valor ATIVO e o que ele
 *  mudou (de → para), campo a campo. Agrupar por aditivo é mais sucinto que por dimensão. */
export interface RenegMudanca { campo: string; de: string; para: string; kind: 'money' | 'condicao' | 'texto'; delta?: string }
export interface RenegEvento { aditivo: string; data: string; mudancas: RenegMudanca[] }
export function historicoRenegociacao(v: ContractFormValues): RenegEvento[] {
  let total   = parseFloat(v.valorTotal) || 0
  let parcela = v.valorParcela
  let cond    = v.condicaoPagamento
  let comp    = v.complementoValor
  const eventos: RenegEvento[] = []
  v.aditivos.forEach((a, idx) => {
    if (!aditivoAtivo(a) || !a.alteraValor) return
    const m: RenegMudanca[] = []
    const acr = parseFloat(a.novoValor) || 0
    if (a.novoValor && acr !== 0) {
      const novo = total + acr
      m.push({ campo: 'Valor total', de: String(total), para: String(novo), kind: 'money', delta: String(acr) })
      total = novo
    }
    if (a.novaParcela && a.novaParcela !== parcela) {
      const d = (parseFloat(a.novaParcela) || 0) - (parseFloat(parcela) || 0)
      m.push({ campo: 'Parcela', de: parcela, para: a.novaParcela, kind: 'money', delta: String(d) }); parcela = a.novaParcela
    }
    if (a.novaCondicaoPagamento && a.novaCondicaoPagamento !== cond) {
      m.push({ campo: 'Condição', de: cond, para: a.novaCondicaoPagamento, kind: 'condicao' }); cond = a.novaCondicaoPagamento
    }
    if (a.novoComplemento && a.novoComplemento !== comp) {
      m.push({ campo: 'Complemento', de: comp, para: a.novoComplemento, kind: 'texto' }); comp = a.novoComplemento
    }
    if (m.length) eventos.push({ aditivo: rotuloAditivo(a, idx), data: a.data, mudancas: m })
  })
  return eventos
}

/** Diff do objeto: cada item com status original / acrescido / removido (e por qual aditivo). */
export interface ObjetoDiffItem { value: string; status: 'original' | 'acrescido' | 'removido'; aditivo?: string }
export function historicoObjeto(v: ContractFormValues): ObjetoDiffItem[] {
  const info = new Map<string, ObjetoDiffItem>()
  const ordem: string[] = []
  const set = (val: string, item: ObjetoDiffItem) => { if (!info.has(val)) ordem.push(val); info.set(val, item) }
  for (const val of v.objeto) set(val, { value: val, status: 'original' })
  let atual = new Set(v.objeto)
  v.aditivos.forEach((a, idx) => {
    if (!aditivoAtivo(a) || !a.alteraObjeto) return
    const rot = rotuloAditivo(a, idx)
    const novo = new Set(a.novoObjeto)
    for (const val of a.novoObjeto) if (!atual.has(val)) set(val, { value: val, status: 'acrescido', aditivo: rot })
    for (const val of atual)       if (!novo.has(val))  set(val, { value: val, status: 'removido', aditivo: rot })
    atual = novo
  })
  return ordem.map(val => info.get(val) as ObjetoDiffItem)
}

/** Cessões de parte: cada troca (de → para), o papel e por qual aditivo. */
export interface CessaoStep { aditivo: string; data: string; papel: string; de: string; para: string }
export function historicoCessoes(v: ContractFormValues): CessaoStep[] {
  const steps: CessaoStep[] = []
  let partes = v.partes.map(p => ({ ...p }))
  v.aditivos.forEach((a, idx) => {
    if (!aditivoAtivo(a) || !a.alteraPartes) return
    const rot = rotuloAditivo(a, idx)
    for (const c of a.cessoes) {
      const alvo = partes.find(p => p.id === c.parteId)
      if (!alvo || !c.nome) continue
      steps.push({ aditivo: rot, data: a.data, papel: alvo.papel, de: alvo.nome, para: c.nome })
      partes = partes.map(p => p.id === c.parteId ? { ...p, nome: c.nome } : p)
    }
  })
  return steps
}
/** Término vigente ANTES do aditivo de índice `index` (considera só os aditivos anteriores).
   Usado para derivar o início de uma prorrogação = término anterior + 1 dia. */
export function terminoVigenteAntes(v: ContractFormValues, index: number): string {
  let t = v.terminoVigencia
  for (let i = 0; i < index && i < v.aditivos.length; i++) {
    const a = v.aditivos[i]
    if (aditivoAtivo(a) && a.alteraTermino && a.novoTermino) t = a.novoTermino
  }
  return t
}
/** Objeto vigente ANTES do aditivo de índice `index` — baseline para o diff de escopo daquele aditivo. */
export function objetoVigenteAntes(v: ContractFormValues, index: number): string[] {
  let o = v.objeto
  for (let i = 0; i < index && i < v.aditivos.length; i++) {
    const a = v.aditivos[i]
    if (aditivoAtivo(a) && a.alteraObjeto) o = a.novoObjeto
  }
  return o
}
/** Dia seguinte a uma data ISO (YYYY-MM-DD); '' se inválida. */
export function proximoDiaISO(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function emptyContractForm(): ContractFormValues {
  return {
    numero: '', titulo: '', descricao: '', objeto: [], tipo: '', natureza: '',
    inicioVigencia: '', prazoIndeterminado: false, terminoVigencia: '', dataAssinatura: '',
    acaoTermino: 'MANUAL', renovacaoAnos: '', renovacaoMeses: '', renovacaoDias: '',
    situacao: 'EM_CADASTRO', moeda: '', valorParcela: '', valorTotal: '', qtdParcelas: '',
    condicaoPagamento: '', complementoValor: '', reajustes: [], partes: [], documentos: [],
    pagamentos: [], recebimentos: [], aditivos: [], renovacoes: [], reajustesRealizados: [],
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function contractFromApi(c: Record<string, any>): ContractFormValues {
  const arr = (x: unknown) => (Array.isArray(x) ? x : [])
  const lanc = (x: unknown) => arr(x).map((l: any) => ({ id: l.id ?? uid(), status: l.status ?? 'pago', vencimento: l.vencimento ?? '', data: l.data ?? '', valor: l.valor != null ? String(l.valor) : '', forma: l.forma ?? '', documento: l.documento ?? '', observacao: l.observacao ?? '' }))
  const numStr = (x: unknown) => (x != null ? String(x) : '')
  return {
    numero: c.numero ?? '', titulo: c.titulo ?? '', descricao: c.descricao ?? '',
    objeto: arr(c.objeto) as string[], tipo: c.tipo ?? '', natureza: c.natureza ?? '',
    inicioVigencia: c.inicioVigencia ?? '', prazoIndeterminado: !!c.prazoIndeterminado,
    terminoVigencia: c.terminoVigencia ?? '', dataAssinatura: c.dataAssinatura ?? '',
    acaoTermino: c.acaoTermino || 'MANUAL', renovacaoAnos: numStr(c.renovacaoAnos), renovacaoMeses: numStr(c.renovacaoMeses), renovacaoDias: numStr(c.renovacaoDias),
    situacao: normalizeSituacao(c.situacao ?? 'EM_CADASTRO'), moeda: c.moeda ?? '',
    valorParcela: numStr(c.valorParcela), valorTotal: numStr(c.valorTotal), qtdParcelas: numStr(c.qtdParcelas),
    condicaoPagamento: c.condicaoPagamento ?? '', complementoValor: c.complementoValor ?? '',
    reajustes: arr(c.reajustes).map((r: any) => ({ id: r.id ?? uid(), indice: r.indice ?? '', data: r.data ?? '', periodicidade: r.periodicidade ?? '' })),
    partes: arr(c.partes).map((p: any) => ({ id: p.id ?? uid(), papel: p.papel ?? p.tipo ?? '', ref_tipo: p.ref_tipo ?? '', ref_id: p.ref_id ?? '', nome: p.nome ?? '', documento: p.documento ?? '' })),
    documentos: arr(c.documentos).map((d: any) => ({ id: d.id ?? uid(), nome: d.nome ?? '', tipo: d.tipo ?? '', data: d.data ?? '', arquivo_nome: d.arquivo_nome ?? '', arquivo_key: d.arquivo_key ?? '', status_assinatura: d.status_assinatura ?? 'nenhum', observacao: d.observacao ?? '' })),
    pagamentos: lanc(c.pagamentos), recebimentos: lanc(c.recebimentos),
    aditivos: arr(c.aditivos).map((a: any) => ({
      id: a.id ?? uid(), numero: a.numero ?? '', situacao: a.situacao ?? 'ATIVO', tipos: arr(a.tipos) as string[], data: a.data ?? '', vigenciaInicio: a.vigenciaInicio ?? '', descricao: a.descricao ?? '',
      arquivo_nome: a.arquivo_nome ?? '', arquivo_key: a.arquivo_key ?? '',
      alteraTermino: !!a.alteraTermino, novoTermino: a.novoTermino ?? '',
      alteraValor:   !!a.alteraValor,   novoValor:   a.novoValor != null ? String(a.novoValor) : '', novaParcela: a.novaParcela != null ? String(a.novaParcela) : '',
      novaCondicaoPagamento: a.novaCondicaoPagamento ?? '', novoComplemento: a.novoComplemento ?? '',
      alteraObjeto:  !!a.alteraObjeto,  novoObjeto:  arr(a.novoObjeto) as string[], novoTitulo: a.novoTitulo ?? '', novaDescricao: a.novaDescricao ?? '',
      alteraPartes:  !!a.alteraPartes,  cessoes:     arr(a.cessoes).map((c: any) => ({ id: c.id ?? uid(), parteId: c.parteId ?? '', ref_tipo: c.ref_tipo ?? '', ref_id: c.ref_id ?? '', nome: c.nome ?? '', documento: c.documento ?? '' })),
    })),
    renovacoes: arr(c.renovacoes).map((r: any) => ({ id: r.id ?? uid(), data: r.data ?? '', terminoAnterior: r.terminoAnterior ?? '', novoTermino: r.novoTermino ?? '', automatica: r.automatica !== false })),
    reajustesRealizados: arr(c.reajustesRealizados).map((r: any) => ({
      id: r.id ?? uid(), reajusteId: r.reajusteId ?? '', competencia: r.competencia ?? '', indiceSnapshot: r.indiceSnapshot ?? '',
      base: r.base ?? 'total',
      percentual: r.percentual != null ? String(r.percentual) : '', valorAnterior: r.valorAnterior != null ? String(r.valorAnterior) : '', valorNovo: r.valorNovo != null ? String(r.valorNovo) : '',
      parcelaAnterior: r.parcelaAnterior != null ? String(r.parcelaAnterior) : '', parcelaNova: r.parcelaNova != null ? String(r.parcelaNova) : '', parcelasReajustadas: r.parcelasReajustadas != null ? String(r.parcelasReajustadas) : '',
      dataAplicacao: r.dataAplicacao ?? '', observacao: r.observacao ?? '', user: r.user ?? '', createdAt: r.createdAt ?? '',
    })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function contractToPayload(v: ContractFormValues, extra: Record<string, unknown> = {}): Record<string, unknown> {
  /* prazo de renovação só faz sentido quando a ação é RENOVAR */
  const renovar = v.acaoTermino === 'RENOVAR'
  const intOrNull = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : undefined }
  /* lançamentos só são relevantes conforme a natureza */
  const pagamentos   = temPagamentos(v.natureza)   ? v.pagamentos   : []
  const recebimentos = temRecebimentos(v.natureza) ? v.recebimentos : []
  return {
    numero: v.numero, titulo: v.titulo, descricao: v.descricao || undefined,
    objeto: v.objeto, tipo: v.tipo, natureza: v.natureza || undefined, situacao: v.situacao,
    inicioVigencia: v.inicioVigencia || undefined, prazoIndeterminado: v.prazoIndeterminado,
    terminoVigencia: v.prazoIndeterminado ? undefined : (v.terminoVigencia || undefined),
    acaoTermino: v.prazoIndeterminado ? undefined : (v.acaoTermino || undefined),
    renovacaoAnos:  renovar ? intOrNull(v.renovacaoAnos)  : undefined,
    renovacaoMeses: renovar ? intOrNull(v.renovacaoMeses) : undefined,
    renovacaoDias:  renovar ? intOrNull(v.renovacaoDias)  : undefined,
    dataAssinatura: v.dataAssinatura || undefined, moeda: v.moeda,
    valorTotal: parseFloat(v.valorTotal) || 0, valorParcela: parseFloat(v.valorParcela) || 0,
    qtdParcelas: v.prazoIndeterminado ? undefined : intOrNull(v.qtdParcelas),
    condicaoPagamento: v.condicaoPagamento || undefined, complementoValor: v.complementoValor || undefined,
    reajustes: v.reajustes, documentos: v.documentos,
    pagamentos:   pagamentos.map(l => ({ id: l.id, status: l.status || 'pago', vencimento: l.vencimento, data: l.data, valor: parseFloat(l.valor) || 0, forma: l.forma, documento: l.documento, observacao: l.observacao })),
    recebimentos: recebimentos.map(l => ({ id: l.id, status: l.status || 'pago', vencimento: l.vencimento, data: l.data, valor: parseFloat(l.valor) || 0, forma: l.forma, documento: l.documento, observacao: l.observacao })),
    aditivos: v.aditivos.map(a => ({
      id: a.id, numero: a.numero, situacao: a.situacao || 'RASCUNHO', tipos: a.tipos, data: a.data, vigenciaInicio: a.vigenciaInicio, descricao: a.descricao,
      arquivo_nome: a.arquivo_nome, arquivo_key: a.arquivo_key,
      alteraTermino: a.alteraTermino, novoTermino: a.alteraTermino ? (a.novoTermino || null) : null,
      alteraValor:   a.alteraValor,   novoValor:   a.alteraValor ? (parseFloat(a.novoValor) || 0) : null, novaParcela: a.alteraValor && a.novaParcela ? (parseFloat(a.novaParcela) || 0) : null,
      novaCondicaoPagamento: a.alteraValor ? (a.novaCondicaoPagamento || null) : null, novoComplemento: a.alteraValor ? (a.novoComplemento || null) : null,
      alteraObjeto:  a.alteraObjeto,  novoObjeto:  a.alteraObjeto ? a.novoObjeto : [], novoTitulo: a.alteraObjeto ? (a.novoTitulo || null) : null, novaDescricao: a.alteraObjeto ? (a.novaDescricao || null) : null,
      alteraPartes:  a.alteraPartes,  cessoes:     a.alteraPartes ? a.cessoes.map(c => ({ id: c.id, parteId: c.parteId, ref_tipo: c.ref_tipo, ref_id: c.ref_id, nome: c.nome, documento: c.documento })) : [],
    })),
    partes: v.partes.map(p => ({ id: p.id, papel: p.papel, ref_tipo: p.ref_tipo, ref_id: p.ref_id, nome: p.nome, documento: p.documento })),
    renovacoes: v.renovacoes,
    reajustesRealizados: (v.reajustesRealizados ?? []).map(r => ({
      id: r.id, reajusteId: r.reajusteId, competencia: r.competencia, indiceSnapshot: r.indiceSnapshot, base: r.base || 'total',
      percentual: parseFloat(r.percentual) || 0, valorAnterior: parseFloat(r.valorAnterior) || 0, valorNovo: parseFloat(r.valorNovo) || 0,
      parcelaAnterior: parseFloat(r.parcelaAnterior) || 0, parcelaNova: parseFloat(r.parcelaNova) || 0, parcelasReajustadas: parseInt(r.parcelasReajustadas, 10) || 0,
      dataAplicacao: r.dataAplicacao, observacao: r.observacao, user: r.user, createdAt: r.createdAt,
    })),
    ...extra,
  }
}
