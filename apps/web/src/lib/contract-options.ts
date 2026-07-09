import {
  aditivoAtivo, parcelaVigente, proximoDiaISO, somaLancamentos, somaLancamentosPagos, somaDesvios,
  terminoVigente, valorVigente, lancPago, lancPrevisto, lancRealizado, lancDesvio,
  normalizeSituacao, todayISO, effectiveSituacao as coreEffectiveSituacao,
} from '@nxt/contracts-core'
import type { LookupEntry } from '@/hooks/use-lookup-table'

/* As regras de negócio do contrato vivem em @nxt/contracts-core — implementação ÚNICA,
   compartilhada com o backend. Este módulo re-exporta o que o front consome e mantém o
   que é de UI: sementes das lookups, rótulos, fábricas de linha (newC*) e (de)serialização.
   Antes desta extração havia duas implementações das derivações, e elas divergiam. */
export {
  aditivoAtivo, parcelaVigente, proximoDiaISO, somaLancamentos, somaLancamentosPagos, somaDesvios,
  terminoVigente, valorVigente, lancPago, lancPrevisto, lancRealizado, lancDesvio, normalizeSituacao,
}

/** Parcela vigente formatada para um input de texto: '' quando não há parcela.
 *  `parcelaVigente` devolve número (é o core); os campos do formulário são string. */
export const parcelaVigenteInput = (v: ContractFormValues): string => {
  const p = parcelaVigente(v)
  return p ? String(p) : ''
}

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
  { id: '1', label: 'Agência de publicidade e propaganda', active: true },
  { id: '2', label: 'Análise de dados e BI', active: true },
  { id: '3', label: 'Antecipação de recebíveis / factoring', active: true },
  { id: '4', label: 'Aquisição de veículos', active: true },
  { id: '5', label: 'Armazenagem e estoque', active: true },
  { id: '6', label: 'Assessoria de imprensa', active: true },
  { id: '7', label: 'Assessoria jurídica', active: true },
  { id: '8', label: 'Assinatura de publicações / conteúdo', active: true },
  { id: '9', label: 'Assinatura de software (SaaS)', active: true },
  { id: '10', label: 'Auditoria independente', active: true },
  { id: '11', label: 'BPO de folha de pagamento', active: true },
  { id: '12', label: 'Cessão de ponto / espaço comercial', active: true },
  { id: '13', label: 'Coleta e destinação de resíduos', active: true },
  { id: '14', label: 'Comodato de equipamentos', active: true },
  { id: '15', label: 'Construção civil (obra nova)', active: true },
  { id: '16', label: 'Consultoria ambiental', active: true },
  { id: '17', label: 'Consultoria contábil', active: true },
  { id: '18', label: 'Consultoria de marketing', active: true },
  { id: '19', label: 'Consultoria em processos e qualidade', active: true },
  { id: '20', label: 'Consultoria em recursos humanos', active: true },
  { id: '21', label: 'Consultoria em segurança da informação', active: true },
  { id: '22', label: 'Consultoria empresarial / gestão', active: true },
  { id: '23', label: 'Consultoria tributária / fiscal', active: true },
  { id: '24', label: 'Copeiragem e recepção', active: true },
  { id: '25', label: 'Courier / entregas expressas', active: true },
  { id: '26', label: 'Dedetização e controle de pragas', active: true },
  { id: '27', label: 'Desenvolvimento de aplicativo mobile', active: true },
  { id: '28', label: 'Desenvolvimento de software sob medida', active: true },
  { id: '29', label: 'Design gráfico', active: true },
  { id: '30', label: 'Despacho aduaneiro', active: true },
  { id: '31', label: 'Elaboração de projeto de engenharia', active: true },
  { id: '32', label: 'Empréstimo / mútuo financeiro', active: true },
  { id: '33', label: 'Estágio / jovem aprendiz', active: true },
  { id: '34', label: 'Fornecimento de combustível', active: true },
  { id: '35', label: 'Fornecimento de energia elétrica', active: true },
  { id: '36', label: 'Fornecimento de EPIs', active: true },
  { id: '37', label: 'Fornecimento de equipamentos de informática', active: true },
  { id: '38', label: 'Fornecimento de gêneros alimentícios', active: true },
  { id: '39', label: 'Fornecimento de matéria-prima', active: true },
  { id: '40', label: 'Fornecimento de material de escritório', active: true },
  { id: '41', label: 'Fornecimento de material de limpeza', active: true },
  { id: '42', label: 'Fornecimento de mobiliário', active: true },
  { id: '43', label: 'Fretamento de transporte de funcionários', active: true },
  { id: '44', label: 'Gerenciamento de obras', active: true },
  { id: '45', label: 'Gestão de facilities', active: true },
  { id: '46', label: 'Hospedagem e infraestrutura em nuvem', active: true },
  { id: '47', label: 'Impermeabilização e cobertura', active: true },
  { id: '48', label: 'Implantação de ERP', active: true },
  { id: '49', label: 'Instalação de ar-condicionado (HVAC)', active: true },
  { id: '50', label: 'Instalações elétricas', active: true },
  { id: '51', label: 'Instalações hidrossanitárias', active: true },
  { id: '52', label: 'Integração de sistemas (APIs)', active: true },
  { id: '53', label: 'Jardinagem e paisagismo', active: true },
  { id: '54', label: 'Licenciamento de banco de dados', active: true },
  { id: '55', label: 'Licenciamento de software (on-premise)', active: true },
  { id: '56', label: 'Limpeza e conservação', active: true },
  { id: '57', label: 'Locação de equipamentos de TI', active: true },
  { id: '58', label: 'Locação de espaço para eventos', active: true },
  { id: '59', label: 'Locação de galpão / armazém', active: true },
  { id: '60', label: 'Locação de imóvel comercial', active: true },
  { id: '61', label: 'Locação de imóvel residencial', active: true },
  { id: '62', label: 'Locação de máquinas e equipamentos', active: true },
  { id: '63', label: 'Locação de veículos (frota)', active: true },
  { id: '64', label: 'Manutenção de elevadores', active: true },
  { id: '65', label: 'Manutenção de infraestrutura viária', active: true },
  { id: '66', label: 'Manutenção de máquinas e equipamentos', active: true },
  { id: '67', label: 'Manutenção predial (preventiva/corretiva)', active: true },
  { id: '68', label: 'Marketing digital e mídias sociais', active: true },
  { id: '69', label: 'Medicina e segurança do trabalho (SESMT)', active: true },
  { id: '70', label: 'Montagem industrial', active: true },
  { id: '71', label: 'Obras de saneamento', active: true },
  { id: '72', label: 'Operador logístico (gestão de logística)', active: true },
  { id: '73', label: 'Organização de eventos', active: true },
  { id: '74', label: 'Outsourcing de TI', active: true },
  { id: '75', label: 'Patrocínio', active: true },
  { id: '76', label: 'Perícia técnica', active: true },
  { id: '77', label: 'Plano de saúde empresarial', active: true },
  { id: '78', label: 'Portaria e controle de acesso', active: true },
  { id: '79', label: 'Produção de conteúdo audiovisual', active: true },
  { id: '80', label: 'Provimento de link de internet/dados', active: true },
  { id: '81', label: 'Recrutamento e seleção', active: true },
  { id: '82', label: 'Reforma e ampliação predial', active: true },
  { id: '83', label: 'Segurança patrimonial (vigilância)', active: true },
  { id: '84', label: 'Seguro de frota / veículos', active: true },
  { id: '85', label: 'Seguro de vida em grupo', active: true },
  { id: '86', label: 'Seguro patrimonial (empresarial)', active: true },
  { id: '87', label: 'Serviços de arquitetura', active: true },
  { id: '88', label: 'Serviços de cobrança', active: true },
  { id: '89', label: 'Serviços de engenharia (projetos)', active: true },
  { id: '90', label: 'Serviços de fotografia', active: true },
  { id: '91', label: 'Serviços de tradução', active: true },
  { id: '92', label: 'Serviços gráficos e impressão', active: true },
  { id: '93', label: 'Suporte técnico e help desk', active: true },
  { id: '94', label: 'Sustentação e manutenção de sistemas', active: true },
  { id: '95', label: 'Telefonia fixa e móvel corporativa', active: true },
  { id: '96', label: 'Terceirização de mão de obra', active: true },
  { id: '97', label: 'Terraplenagem e pavimentação', active: true },
  { id: '98', label: 'Transporte rodoviário de cargas', active: true },
  { id: '99', label: 'Treinamento e capacitação', active: true },
  { id: '100', label: 'Vale-transporte / vale-refeição', active: true },
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
   VENCIDO é DERIVADO (nunca gravado): contrato VIGENTE cujo término já passou.
   A regra vive no core; aqui só injetamos "hoje". */

/** Situação exibida: normaliza legado e resolve 'Vencido' (VIGENTE + término < hoje). */
export const effectiveSituacao = (situacao: string, terminoVigencia?: string | null): string =>
  coreEffectiveSituacao(situacao, terminoVigencia, todayISO())
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
export const newCReajuste   = ():           CReajuste   => ({ id: uid(), indice: '', data: '', periodicidade: '', aplicacao: 'MANUAL' })
export const newCReajusteRealizado = (reajusteId = ''): CReajusteRealizado => ({ id: uid(), reajusteId, competencia: '', indiceSnapshot: '', base: 'total', percentual: '', valorAnterior: '', valorNovo: '', parcelaAnterior: '', parcelaNova: '', parcelasReajustadas: '', dataAplicacao: '', observacao: '', user: '', createdAt: '' })
export const newCDocumento  = ():           CDocumento  => ({ id: uid(), nome: '', tipo: '', data: '', arquivo_nome: '', arquivo_key: '', status_assinatura: 'nenhum', observacao: '' })
export const newCLancamento = (): CLancamento => ({ id: uid(), vencimento: '', data: '', valorPrevisto: '', valorPago: '', forma: '', documento: '', observacao: '', reajustavel: true, comprovante_nome: '', comprovante_key: '' })
export const newCCessao      = (parteId = ''):CCessao    => ({ id: uid(), parteId, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCAditivo     = (numero = ''): CAditivo   => ({
  id: uid(), numero, situacao: 'RASCUNHO', tipos: [], data: '', vigenciaInicio: '', descricao: '', arquivo_nome: '', arquivo_key: '',
  alteraTermino: false, novoTermino: '', alteraValor: false, novoValor: '', novaParcela: '', novaCondicaoPagamento: '', novoComplemento: '', alteraObjeto: false, novoObjeto: [], novoTitulo: '', novaDescricao: '', alteraPartes: false, cessoes: [],
})

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

/** Lançamentos (pagamentos/recebimentos): cada linha exige Vencimento e Valor (>0).
 *  A Forma só é obrigatória na parcela PAGA — numa parcela projetada (a vencer) ainda
 *  não se sabe como será paga, e exigi-la impedia salvar qualquer cronograma gerado.
 *  Retorna a seção com problema (p/ focar a aba) e a mensagem, ou null. */
export function validateLancamentos(v: ContractFormValues): { field: 'pagamentos' | 'recebimentos'; msg: string } | null {
  const secoes = [
    { field: 'pagamentos'   as const, label: 'Pagamentos',   ativo: temPagamentos(v.natureza) },
    { field: 'recebimentos' as const, label: 'Recebimentos', ativo: temRecebimentos(v.natureza) },
  ]
  for (const s of secoes) {
    if (!s.ativo) continue
    if (v[s.field].some(l => !(l.vencimento || l.data) || !(parseFloat(l.valorPrevisto) > 0))) {
      return { field: s.field, msg: `Em ${s.label}, informe Vencimento e Valor previsto de cada parcela.` }
    }
    if (v[s.field].some(l => lancPago(l) && !l.forma)) {
      return { field: s.field, msg: `Em ${s.label}, informe a Forma de pagamento das parcelas já pagas.` }
    }
  }
  return null
}

/* ─── derivação do estado VIGENTE (original + aditivos ATIVOS aplicados em ordem) ──
   O contrato guarda os valores ORIGINAIS; cada aditivo ATIVO, em ordem, sobrepõe os
   campos que altera (o último vence). Aditivo em RASCUNHO NÃO aplica efeito — só após
   ativação. `terminoVigente`, `valorVigente`, `parcelaVigente` e `aditivoAtivo` vêm do
   core (re-exportados no topo). As derivações abaixo são específicas do formulário. */

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
  /* `automatica: false` = renovação registrada à mão ("Gerar próximo período") */
  for (const r of (v.renovacoes ?? [])) if (r.novoTermino) eventos.push({ termino: r.novoTermino, label: r.automatica === false ? 'Renovação manual' : 'Renovação automática', aditivo: false })
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
    inicioVigencia: c.inicioVigencia ?? '', prazoIndeterminado: !!c.prazoIndeterminado,
    terminoVigencia: c.terminoVigencia ?? '', dataAssinatura: c.dataAssinatura ?? '',
    acaoTermino: c.acaoTermino || 'MANUAL', renovacaoAnos: numStr(c.renovacaoAnos), renovacaoMeses: numStr(c.renovacaoMeses), renovacaoDias: numStr(c.renovacaoDias),
    situacao: normalizeSituacao(c.situacao ?? 'EM_CADASTRO'), moeda: c.moeda ?? '',
    valorParcela: numStr(c.valorParcela), valorTotal: numStr(c.valorTotal), qtdParcelas: numStr(c.qtdParcelas),
    condicaoPagamento: c.condicaoPagamento ?? '', complementoValor: c.complementoValor ?? '',
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
