import type { LookupEntry } from '@/hooks/use-lookup-table'

/* ─── chaves das lookups (settings) ──────────────────────── */
export const TIPOS_KEY     = 'nxt:settings:contratos:tipos'
export const OBJETOS_KEY    = 'nxt:settings:contratos:objetos'
export const MOEDAS_KEY     = 'nxt:settings:contratos:moedas'
export const CONDICOES_KEY  = 'nxt:settings:contratos:condicoes'
export const INDICES_KEY    = 'nxt:settings:contratos:indices'

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
export const INIT_INDICES: LookupEntry[] = [
  { id: '1', label: 'IPCA',   active: true },
  { id: '2', label: 'IGPM',   active: true },
  { id: '3', label: 'INPC',   active: true },
  { id: '4', label: 'CDI',    active: true },
  { id: '5', label: 'SELIC',  active: true },
  { id: '6', label: 'Fixo',   active: true },
  { id: '7', label: 'Nenhum', active: true },
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
export interface CParte     { id: string; papel: string; ref_tipo: string; ref_id: string; nome: string; documento: string }
export interface CReajuste  { id: string; indice: string; data: string; periodicidade: string }
export interface CDocumento { id: string; nome: string; tipo: string; data: string; arquivo_nome: string; arquivo_key: string; status_assinatura: string; observacao: string }

export interface ContractFormValues {
  numero: string; titulo: string; descricao: string; objeto: string[]; tipo: string
  inicioVigencia: string; prazoIndeterminado: boolean; terminoVigencia: string; dataAssinatura: string
  situacao: string; moeda: string; valorParcela: string; valorTotal: string
  condicaoPagamento: string; complementoValor: string
  reajustes: CReajuste[]; partes: CParte[]; documentos: CDocumento[]
}

export const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
export const newCParte     = (papel = ''): CParte    => ({ id: uid(), papel, ref_tipo: '', ref_id: '', nome: '', documento: '' })
export const newCReajuste  = ():           CReajuste => ({ id: uid(), indice: '', data: '', periodicidade: '' })
export const newCDocumento = ():           CDocumento => ({ id: uid(), nome: '', tipo: '', data: '', arquivo_nome: '', arquivo_key: '', status_assinatura: 'nenhum', observacao: '' })

export function emptyContractForm(): ContractFormValues {
  return {
    numero: '', titulo: '', descricao: '', objeto: [], tipo: '',
    inicioVigencia: '', prazoIndeterminado: false, terminoVigencia: '', dataAssinatura: '',
    situacao: 'EM_CADASTRO', moeda: '', valorParcela: '', valorTotal: '',
    condicaoPagamento: '', complementoValor: '', reajustes: [], partes: [], documentos: [],
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function contractFromApi(c: Record<string, any>): ContractFormValues {
  const arr = (x: unknown) => (Array.isArray(x) ? x : [])
  return {
    numero: c.numero ?? '', titulo: c.titulo ?? '', descricao: c.descricao ?? '',
    objeto: arr(c.objeto) as string[], tipo: c.tipo ?? '',
    inicioVigencia: c.inicioVigencia ?? '', prazoIndeterminado: !!c.prazoIndeterminado,
    terminoVigencia: c.terminoVigencia ?? '', dataAssinatura: c.dataAssinatura ?? '',
    situacao: normalizeSituacao(c.situacao ?? 'EM_CADASTRO'), moeda: c.moeda ?? '',
    valorParcela: c.valorParcela != null ? String(c.valorParcela) : '',
    valorTotal:   c.valorTotal   != null ? String(c.valorTotal)   : '',
    condicaoPagamento: c.condicaoPagamento ?? '', complementoValor: c.complementoValor ?? '',
    reajustes: arr(c.reajustes).map((r: any) => ({ id: r.id ?? uid(), indice: r.indice ?? '', data: r.data ?? '', periodicidade: r.periodicidade ?? '' })),
    partes: arr(c.partes).map((p: any) => ({ id: p.id ?? uid(), papel: p.papel ?? p.tipo ?? '', ref_tipo: p.ref_tipo ?? '', ref_id: p.ref_id ?? '', nome: p.nome ?? '', documento: p.documento ?? '' })),
    documentos: arr(c.documentos).map((d: any) => ({ id: d.id ?? uid(), nome: d.nome ?? '', tipo: d.tipo ?? '', data: d.data ?? '', arquivo_nome: d.arquivo_nome ?? '', arquivo_key: d.arquivo_key ?? '', status_assinatura: d.status_assinatura ?? 'nenhum', observacao: d.observacao ?? '' })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function contractToPayload(v: ContractFormValues, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    numero: v.numero, titulo: v.titulo, descricao: v.descricao || undefined,
    objeto: v.objeto, tipo: v.tipo, situacao: v.situacao,
    inicioVigencia: v.inicioVigencia || undefined, prazoIndeterminado: v.prazoIndeterminado,
    terminoVigencia: v.prazoIndeterminado ? undefined : (v.terminoVigencia || undefined),
    dataAssinatura: v.dataAssinatura || undefined, moeda: v.moeda,
    valorTotal: parseFloat(v.valorTotal) || 0, valorParcela: parseFloat(v.valorParcela) || 0,
    condicaoPagamento: v.condicaoPagamento || undefined, complementoValor: v.complementoValor || undefined,
    reajustes: v.reajustes, documentos: v.documentos,
    partes: v.partes.map(p => ({ id: p.id, papel: p.papel, ref_tipo: p.ref_tipo, ref_id: p.ref_id, nome: p.nome, documento: p.documento })),
    ...extra,
  }
}
