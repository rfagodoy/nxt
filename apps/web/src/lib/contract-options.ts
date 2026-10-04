import {
  aditivoAtivo, parcelaVigente, proximoDiaISO, somaLancamentos, somaLancamentosPagos, somaDesvios,
  terminoVigente, valorVigente, lancPago, lancPrevisto, lancRealizado, lancDesvio,
  normalizeSituacao, todayISO, effectiveSituacao as coreEffectiveSituacao,
} from '@nxt/contracts-core'
import type { LookupEntry } from '@/hooks/use-lookup-table'
import { temPagamentos, temRecebimentos, type ContractFormValues, type CAditivo } from '@nxt/contracts-core'

/* O modelo do formulário (tipos C*, fábricas newC*, contractFromApi/contractToPayload)
   mora no core: o servidor confere as travas das Telas enxergando o contrato como a tela. */
export {
  temPagamentos, temRecebimentos, APLICACOES_REAJUSTE, uid,
  newCParte, newCReajuste, newCReajusteRealizado, newCDocumento, newCLancamento, newCCessao, newCAditivo,
  emptyContractForm, contractFromApi, contractToPayload, partesVigentes,
} from '@nxt/contracts-core'
export type {
  CParte, CReajuste, CReajusteRealizado, CRenovacao, CDocumento, CLancamento, CCessao, CAditivo, ContractFormValues,
} from '@nxt/contracts-core'

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

/* ─── mão de obra alocada (cessão de mão de obra — Lei 8.212/91) ── */
export const MAO_DE_OBRA_OPCOES = [
  { value: 'NAO', label: 'Não' },
  { value: 'SIM', label: 'Sim' },
]
export const MAO_DE_OBRA_LOCAIS = [
  { value: 'CONTRATADA',  label: 'Instalações da contratada' },
  { value: 'CONTRATANTE', label: 'Instalações da contratante' },
  { value: 'TERCEIRO',    label: 'Instalações de terceiro' },
]

/* ─── natureza do contrato ───────────────────────────────── */
export const NATUREZAS = [
  { value: 'DESPESA', label: 'Despesa' },
  { value: 'RECEITA', label: 'Receita' },
  { value: 'AMBOS',   label: 'Ambos'   },
]

/* ─── ação no término da vigência ────────────────────────── */
export const ACOES_TERMINO = [
  { value: 'MANUAL',   label: 'Definir manualmente'     },
  { value: 'RENOVAR',  label: 'Renovar automaticamente' },
  { value: 'ENCERRAR', label: 'Encerrar automaticamente'},
]

/* Ordem de exibição do filtro: segue o ciclo de vida, não a ordem da lista canônica
   do core. A COBERTURA é garantida por teste — contract-options.test.ts falha se uma
   situação nova entrar no core e não aparecer aqui. */
export const SITUACOES = [
  { value: 'EM_CADASTRO', label: 'Em cadastro/revisão' },
  { value: 'VIGENTE',     label: 'Vigente'             },
  { value: 'VENCIDO',     label: 'Vencido'             },  // derivado — nunca gravado (ver effectiveSituacao)
  { value: 'ENCERRADO',   label: 'Encerrado'           },
  { value: 'RESCINDIDO',  label: 'Rescindido'          },
  { value: 'CANCELADO',   label: 'Cancelado'           },
]

/* ─── ciclo de vida da situação ──────────────────────────────
   Estados persistidos: EM_CADASTRO, VIGENTE, ENCERRADO, RESCINDIDO, CANCELADO.
   VENCIDO é DERIVADO (nunca gravado): contrato VIGENTE cujo término já passou.
   A regra vive no core; aqui só injetamos "hoje".

   CANCELADO ≠ RESCINDIDO: rescisão é ato entre as partes, com efeitos jurídicos;
   cancelado é o contrato que NUNCA chegou a valer, porque o processo que o criou foi
   cancelado. Ficou de fora desta lista por um tempo, e o efeito era o contrato
   cancelado não aparecer em filtro nenhum — visível na listagem, impossível de isolar. */

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