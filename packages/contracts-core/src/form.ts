/* Modelo ÚNICO do formulário de contrato e a (de)serialização com a API.
   Mora no core porque o SERVIDOR precisa enxergar o contrato exatamente como a tela
   enxerga: a conferência das travas das Telas compara "o que está gravado, passado pela
   tela" com "o que chegou" — qualquer outra normalização acusaria alteração onde a pessoa
   não mexeu (padrões como reajustavel=true, valorPago null, aditivo sem flag…). */
import { aditivoAtivo, normalizeSituacao } from './derive'

/** Mostra pagamentos (Despesa/Ambos) */
export const temPagamentos   = (n?: string) => n === 'DESPESA' || n === 'AMBOS'
/** Mostra recebimentos (Receita/Ambos) */
export const temRecebimentos = (n?: string) => n === 'RECEITA' || n === 'AMBOS'

/* ─── modelo único do formulário de contrato ─────────────── */
export interface CParte      { id: string; papel: string; ref_tipo: string; ref_id: string; nome: string; documento: string }
/** Linha de reajuste = a AGENDA. `aplicacao` é a política do motor de datas:
 *  MANUAL (default) só notifica; AUTOMATICA aplica sozinho quando vence e o índice
 *  do período está publicado.
 *  Para registrar que um período NÃO reajustou, aplique um reajuste de 0%: nada muda
 *  de valor, a próxima competência avança e o fato fica no histórico.
 *  O que o reajuste altera (parcela ou total) NÃO é configurável: reajustar as
 *  parcelas já reajusta o contrato. Ver `baseDe` no core. */
export interface CReajuste   { id: string; indice: string; data: string; periodicidade: string; aplicacao: string }

export const APLICACOES_REAJUSTE = [
  { value: 'MANUAL',     label: 'Manual (só avisa)'        },
  { value: 'AUTOMATICA', label: 'Automática (motor aplica)'},
]
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
/** Renovação automática (cláusula, não aditamento): estende a vigência sem gerar aditivo.
 *  valorPeriodo = valor das parcelas geradas para o novo período (soma ao valor total do contrato). */
export interface CRenovacao  { id: string; data: string; terminoAnterior: string; novoTermino: string; automatica: boolean; valorPeriodo: string }
export interface CDocumento  { id: string; nome: string; tipo: string; data: string; arquivo_nome: string; arquivo_key: string; status_assinatura: string; observacao: string }
/** Lançamento de pagamento (Despesa) ou recebimento (Receita). Mesma forma. */
/** Lançamento = parcela do cronograma.
 *  `valorPrevisto` = contratado; `valorPago` = baixado ('' enquanto não se paga).
 *  "Pago" e "Vencido" são DERIVADOS (lancPago / vencimento < hoje), nunca campos.
 *  `reajustavel: false` tira a parcela do alcance do reajuste (ex.: equipamento entregue). */
/** `comprovante_*` é o anexo da BAIXA (mesmo par nome/key de CDocumento e CAditivo).
 *  Metadado: não entra em regra de valor nenhuma. */
export interface CLancamento { id: string; vencimento: string; data: string; valorPrevisto: string; valorPago: string; forma: string; documento: string; observacao: string; reajustavel: boolean; comprovante_nome: string; comprovante_key: string }
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
  /** '' = não informado · 'SIM' | 'NAO'. No payload vira boolean (coluna maoDeObra). */
  maoDeObra: string; maoDeObraLocal: string
  inicioVigencia: string; prazoIndeterminado: boolean; terminoVigencia: string; dataAssinatura: string
  acaoTermino: string; renovacaoAnos: string; renovacaoMeses: string; renovacaoDias: string
  situacao: string; moeda: string; valorParcela: string; valorTotal: string; qtdParcelas: string
  condicaoPagamento: string; formaPagamento: string; complementoValor: string
  reajustes: CReajuste[]; partes: CParte[]; documentos: CDocumento[]
  pagamentos: CLancamento[]; recebimentos: CLancamento[]; aditivos: CAditivo[]; renovacoes: CRenovacao[]
  reajustesRealizados: CReajusteRealizado[]
}

export const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
export const newCParte      = (papel = ''): CParte      => ({ id: uid(), papel, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCReajuste   = ():           CReajuste   => ({ id: uid(), indice: '', data: '', periodicidade: '', aplicacao: 'MANUAL' })
export const newCReajusteRealizado = (reajusteId = ''): CReajusteRealizado => ({ id: uid(), reajusteId, competencia: '', indiceSnapshot: '', base: 'total', percentual: '', valorAnterior: '', valorNovo: '', parcelaAnterior: '', parcelaNova: '', parcelasReajustadas: '', dataAplicacao: '', observacao: '', user: '', createdAt: '' })
export const newCDocumento  = ():           CDocumento  => ({ id: uid(), nome: '', tipo: '', data: '', arquivo_nome: '', arquivo_key: '', status_assinatura: 'nenhum', observacao: '' })
export const newCLancamento = (): CLancamento => ({ id: uid(), vencimento: '', data: '', valorPrevisto: '', valorPago: '', forma: '', documento: '', observacao: '', reajustavel: true, comprovante_nome: '', comprovante_key: '' })
export const newCCessao      = (parteId = ''):CCessao    => ({ id: uid(), parteId, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCAditivo     = (numero = ''): CAditivo   => ({
  id: uid(), numero, situacao: 'RASCUNHO', tipos: [], data: '', vigenciaInicio: '', descricao: '', arquivo_nome: '', arquivo_key: '',
  alteraTermino: false, novoTermino: '', alteraValor: false, novoValor: '', novaParcela: '', novaCondicaoPagamento: '', novoComplemento: '', alteraObjeto: false, novoObjeto: [], novoTitulo: '', novaDescricao: '', alteraPartes: false, cessoes: [],
})

export function emptyContractForm(): ContractFormValues {
  return {
    numero: '', titulo: '', descricao: '', objeto: [], tipo: '', natureza: '',
    maoDeObra: '', maoDeObraLocal: '',
    inicioVigencia: '', prazoIndeterminado: false, terminoVigencia: '', dataAssinatura: '',
    acaoTermino: 'MANUAL', renovacaoAnos: '', renovacaoMeses: '', renovacaoDias: '',
    situacao: 'EM_CADASTRO', moeda: '', valorParcela: '', valorTotal: '', qtdParcelas: '',
    condicaoPagamento: '', formaPagamento: '', complementoValor: '', reajustes: [], partes: [], documentos: [],
    pagamentos: [], recebimentos: [], aditivos: [], renovacoes: [], reajustesRealizados: [],
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function contractFromApi(c: Record<string, any>): ContractFormValues {
  const arr = (x: unknown) => (Array.isArray(x) ? x : [])
  /* Normaliza o lançamento para o modelo previsto/realizado. É o único lugar que traduz o
     LEGADO (um `valor` só + `status` textual; sem status = pago, herança de quando a seção
     se chamava "Pagamentos realizados"). `reajustavel` ausente = true. */
  const lanc = (x: unknown) => arr(x).map((l: any): CLancamento => {
    const legado = l.valorPrevisto == null && l.valorPago == null && l.valor != null
    const previsto = legado ? l.valor : l.valorPrevisto
    const pago = legado ? ((l.status ?? 'pago') === 'pago' ? l.valor : null) : l.valorPago
    return {
      id: l.id ?? uid(), vencimento: l.vencimento ?? '', data: l.data ?? '',
      valorPrevisto: previsto != null ? String(previsto) : '',
      valorPago:     pago     != null ? String(pago)     : '',
      forma: l.forma ?? '', documento: l.documento ?? '', observacao: l.observacao ?? '',
      reajustavel: l.reajustavel !== false,
      comprovante_nome: l.comprovante_nome ?? '', comprovante_key: l.comprovante_key ?? '',
    }
  })
  const numStr = (x: unknown) => (x != null ? String(x) : '')
  return {
    numero: c.numero ?? '', titulo: c.titulo ?? '', descricao: c.descricao ?? '',
    objeto: arr(c.objeto) as string[], tipo: c.tipo ?? '', natureza: c.natureza ?? '',
    maoDeObra: c.maoDeObra == null ? '' : (c.maoDeObra ? 'SIM' : 'NAO'),
    maoDeObraLocal: (c.maoDeObraLocal as string) ?? '',
    inicioVigencia: c.inicioVigencia ?? '', prazoIndeterminado: !!c.prazoIndeterminado,
    terminoVigencia: c.terminoVigencia ?? '', dataAssinatura: c.dataAssinatura ?? '',
    acaoTermino: c.acaoTermino || 'MANUAL', renovacaoAnos: numStr(c.renovacaoAnos), renovacaoMeses: numStr(c.renovacaoMeses), renovacaoDias: numStr(c.renovacaoDias),
    situacao: normalizeSituacao(c.situacao ?? 'EM_CADASTRO'), moeda: c.moeda ?? '',
    valorParcela: numStr(c.valorParcela), valorTotal: numStr(c.valorTotal), qtdParcelas: numStr(c.qtdParcelas),
    condicaoPagamento: c.condicaoPagamento ?? '', formaPagamento: c.formaPagamento ?? '', complementoValor: c.complementoValor ?? '',
    /* linha sem `aplicacao` é anterior à política: nasce MANUAL, nunca reajusta sozinha */
    /* só 'AUTOMATICA' liga o motor; o resto (inclusive o extinto 'SUSPENSA') vira MANUAL */
    reajustes: arr(c.reajustes).map((r: any) => ({ id: r.id ?? uid(), indice: r.indice ?? '', data: r.data ?? '', periodicidade: r.periodicidade ?? '', aplicacao: r.aplicacao === 'AUTOMATICA' ? 'AUTOMATICA' : 'MANUAL' })),
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
    renovacoes: arr(c.renovacoes).map((r: any) => ({ id: r.id ?? uid(), data: r.data ?? '', terminoAnterior: r.terminoAnterior ?? '', novoTermino: r.novoTermino ?? '', automatica: r.automatica !== false, valorPeriodo: r.valorPeriodo != null ? String(r.valorPeriodo) : '' })),
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
    maoDeObra: v.maoDeObra === '' ? undefined : v.maoDeObra === 'SIM',
    maoDeObraLocal: v.maoDeObra === 'SIM' ? (v.maoDeObraLocal || undefined) : undefined,
    inicioVigencia: v.inicioVigencia || undefined, prazoIndeterminado: v.prazoIndeterminado,
    terminoVigencia: v.prazoIndeterminado ? undefined : (v.terminoVigencia || undefined),
    acaoTermino: v.prazoIndeterminado ? undefined : (v.acaoTermino || undefined),
    renovacaoAnos:  renovar ? intOrNull(v.renovacaoAnos)  : undefined,
    renovacaoMeses: renovar ? intOrNull(v.renovacaoMeses) : undefined,
    renovacaoDias:  renovar ? intOrNull(v.renovacaoDias)  : undefined,
    dataAssinatura: v.dataAssinatura || undefined, moeda: v.moeda,
    valorTotal: parseFloat(v.valorTotal) || 0, valorParcela: parseFloat(v.valorParcela) || 0,
    qtdParcelas: v.prazoIndeterminado ? undefined : intOrNull(v.qtdParcelas),
    condicaoPagamento: v.condicaoPagamento || undefined, formaPagamento: v.formaPagamento || undefined, complementoValor: v.complementoValor || undefined,
    reajustes: v.reajustes, documentos: v.documentos,
    pagamentos:   pagamentos.map(l => ({
      id: l.id, vencimento: l.vencimento, data: l.data,
      valorPrevisto: parseFloat(l.valorPrevisto) || 0,
      /* `null` (e não 0) quando não há baixa: a AUSÊNCIA é o que significa "não pago" */
      valorPago: l.valorPago === '' || l.valorPago == null ? null : parseFloat(l.valorPago) || 0,
      forma: l.forma, documento: l.documento, observacao: l.observacao, reajustavel: l.reajustavel !== false,
      /* '' vira undefined: parcela sem comprovante não carrega chave vazia no JSON */
      comprovante_nome: l.comprovante_nome || undefined, comprovante_key: l.comprovante_key || undefined,
    })),
    recebimentos: recebimentos.map(l => ({
      id: l.id, vencimento: l.vencimento, data: l.data,
      valorPrevisto: parseFloat(l.valorPrevisto) || 0,
      /* `null` (e não 0) quando não há baixa: a AUSÊNCIA é o que significa "não pago" */
      valorPago: l.valorPago === '' || l.valorPago == null ? null : parseFloat(l.valorPago) || 0,
      forma: l.forma, documento: l.documento, observacao: l.observacao, reajustavel: l.reajustavel !== false,
      /* '' vira undefined: parcela sem comprovante não carrega chave vazia no JSON */
      comprovante_nome: l.comprovante_nome || undefined, comprovante_key: l.comprovante_key || undefined,
    })),
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
    renovacoes: v.renovacoes.map(r => ({ id: r.id, data: r.data, terminoAnterior: r.terminoAnterior, novoTermino: r.novoTermino, automatica: r.automatica, valorPeriodo: parseFloat(r.valorPeriodo) || 0 })),
    reajustesRealizados: (v.reajustesRealizados ?? []).map(r => ({
      id: r.id, reajusteId: r.reajusteId, competencia: r.competencia, indiceSnapshot: r.indiceSnapshot, base: r.base || 'total',
      percentual: parseFloat(r.percentual) || 0, valorAnterior: parseFloat(r.valorAnterior) || 0, valorNovo: parseFloat(r.valorNovo) || 0,
      parcelaAnterior: parseFloat(r.parcelaAnterior) || 0, parcelaNova: parseFloat(r.parcelaNova) || 0, parcelasReajustadas: parseInt(r.parcelasReajustadas, 10) || 0,
      dataAplicacao: r.dataAplicacao, observacao: r.observacao, user: r.user, createdAt: r.createdAt,
    })),
    ...extra,
  }
}

/** Partes VIGENTES: as do cadastro com as cessões dos aditivos ATIVOS aplicadas (a parte
 *  cedida passa a ser a nova entidade, mantendo o papel). É quem "está" no contrato hoje —
 *  o executor do workflow por stakeholder resolve por aqui. */
export function partesVigentes(v: Pick<ContractFormValues, 'partes' | 'aditivos'>): CParte[] {
  let partes = v.partes
  for (const a of v.aditivos)
    if (aditivoAtivo(a) && a.alteraPartes)
      for (const c of a.cessoes)
        partes = partes.map(p => p.id === c.parteId ? { ...p, ref_tipo: c.ref_tipo, ref_id: c.ref_id, nome: c.nome, documento: c.documento } : p)
  return partes
}
