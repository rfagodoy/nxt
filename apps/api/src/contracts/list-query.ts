/* Consulta server-side da LISTAGEM de contratos (auditoria 2026-08-21).
 *
 * Por que em memória e não em SQL, ao contrário de Parceiros: as colunas que o
 * usuário filtra/ordena são DERIVADAS — término e valor vêm dos aditivos aplicados,
 * a situação efetiva ("Vencido") nunca é gravada, as partes são resolvidas ao vivo.
 * Reimplementar essas regras em T-SQL duplicaria o que @nxt/contracts-core já faz
 * testado (mesma razão registrada no reports.service). O serviço deriva TODAS as
 * linhas da organização, filtra/ordena aqui e devolve SÓ a página — o navegador
 * deixa de receber a base inteira (o problema real da escala).
 */
import { effectiveSituacao, todayISO } from '@nxt/contracts-core'
import { displayCustomValue, type CustomFieldMeta } from '../partners/custom-field-query'

/** Linha da listagem — shape do toRow (contracts.service). */
export interface ListRow {
  id: string
  numero: string
  titulo: string
  tipo: string
  parte_principal: string
  inicio: string
  termino: string | null
  valor_total: number
  situacao: string
  documento: string
  papel: string
  data_assinatura: string
  moeda: string
  valor_parcela: number
  condicao_pagamento: string
  objeto: string[]
  contratante_nome: string
  contratante_doc: string
  contratada_nome: string
  contratada_doc: string
  [key: string]: unknown
}

export interface FilterItem { col: string; op: string; value: string }
export interface SortSpec { col: string; dir: 'asc' | 'desc' }

/* Rótulos das situações — vocabulário estável do produto (espelha SITUACOES do web).
   Busca/filtro casam TANTO o código quanto o rótulo: quem digita "vencido" encontra. */
const SIT_LABEL: Record<string, string> = {
  EM_CADASTRO: 'Em cadastro/revisão',
  VIGENTE: 'Vigente',
  VENCIDO: 'Vencido',
  ENCERRADO: 'Encerrado',
  RESCINDIDO: 'Rescindido',
  CANCELADO: 'Cancelado',
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Texto de comparação de uma coluna NATIVA (busca/filtro/ordenação). Mesma matriz do
 *  `fieldValue` do front, com um conserto: a situação compara pela EFETIVA (código +
 *  rótulo) — no client-side "vencido" nunca casava, porque VENCIDO é derivado. */
export function rowText(r: ListRow, key: string): string {
  switch (key) {
    case 'valor_total':     return String(r.valor_total)
    case 'valor_parcela':   return String(r.valor_parcela ?? '')
    case 'termino':         return r.termino ?? ''
    case 'situacao': {
      const eff = effectiveSituacao(r.situacao, r.termino, todayISO())
      return `${eff} ${SIT_LABEL[eff] ?? ''}`
    }
    case 'parte_principal':
      return [r.parte_principal, r.contratante_nome, r.contratante_doc, r.contratada_nome, r.contratada_doc]
        .filter(Boolean).join(' ')
    case 'objeto':          return (r.objeto ?? []).join(' ')
    default:                return String(r[key] ?? '')
  }
}

/** Valor de ORDENAÇÃO: numérico para colunas de dinheiro (lexical ordenaria "9" > "10"). */
export function sortValue(r: ListRow, key: string): string | number {
  if (key === 'valor_total') return r.valor_total ?? 0
  if (key === 'valor_parcela') return r.valor_parcela ?? 0
  return norm(rowText(r, key))
}

/** aceita "1234.56" e "1.234,56" — o filtro chega como texto digitado. */
function asNumber(s: string): number | null {
  const t = s.trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Operadores da ListToolbar (SERVER_OPERATORS). gt/gte/lt/lte comparam NUMERICAMENTE
 *  quando os dois lados são números — o client-side comparava "9" > "10" como texto. */
export function opMatch(cell: string, op: string, val: string): boolean {
  const c = norm(cell), v = norm(val)
  const nc = asNumber(cell), nv = asNumber(val)
  const num = nc !== null && nv !== null
  switch (op) {
    case 'contains':      return c.includes(v)
    case 'notContains':   return !c.includes(v)
    case 'eq':            return num ? nc === nv : c === v
    case 'neq':           return num ? nc !== nv : c !== v
    case 'startsWith':    return c.startsWith(v)
    case 'notStartsWith': return !c.startsWith(v)
    case 'endsWith':      return c.endsWith(v)
    case 'notEndsWith':   return !c.endsWith(v)
    case 'gt':            return num ? nc! > nv! : c > v
    case 'gte':           return num ? nc! >= nv! : c >= v
    case 'lt':            return num ? nc! < nv! : c < v
    case 'lte':           return num ? nc! <= nv! : c <= v
    default:              return true
  }
}

export interface ContractStats {
  total: number
  byEffective: Record<string, number>
}

/** Tiles da listagem — contagem pela situação EFETIVA (a mesma conta dos cards do front). */
export function computeStats(rows: ListRow[]): ContractStats {
  const byEffective: Record<string, number> = {}
  for (const r of rows) {
    const eff = effectiveSituacao(r.situacao, r.termino, todayISO())
    byEffective[eff] = (byEffective[eff] ?? 0) + 1
  }
  return { total: rows.length, byEffective }
}

/** Pipeline completo: busca global + condições (E/OU) + ordenação. Campos custom
 *  entram pelo TEXTO EXIBIDO (rótulo de select resolvido via displayCustomValue) —
 *  o usuário filtra pelo que vê, não pelo código gravado. */
export function applyQuery(
  rows: ListRow[],
  opts: {
    search?: string
    filters?: FilterItem[]
    logic?: 'AND' | 'OR'
    sort?: SortSpec | null
    customMeta: Map<string, CustomFieldMeta>
    customValues: Map<string, Map<string, string>> // contratoId → fieldId → valor bruto
  },
): ListRow[] {
  const { customMeta, customValues } = opts
  const customText = (r: ListRow, fieldId: string): string => {
    const raw = customValues.get(r.id)?.get(fieldId) ?? ''
    const meta = customMeta.get(fieldId)
    return meta ? displayCustomValue(raw, meta) : raw
  }
  const text = (r: ListRow, key: string): string =>
    customMeta.has(key) ? customText(r, key) : rowText(r, key)

  let out = rows

  const q = norm(opts.search ?? '')
  if (q) {
    out = out.filter((r) => {
      if (NATIVE_SEARCH_COLS.some((k) => norm(rowText(r, k)).includes(q))) return true
      for (const fieldId of customMeta.keys()) if (norm(customText(r, fieldId)).includes(q)) return true
      return false
    })
  }

  const active = (opts.filters ?? []).filter((f) => f.value?.trim())
  if (active.length) {
    const logic = opts.logic ?? 'AND'
    out = out.filter((r) => {
      const res = active.map((f) => opMatch(text(r, f.col), f.op, f.value))
      return logic === 'AND' ? res.every(Boolean) : res.some(Boolean)
    })
  }

  const sort = opts.sort
  if (sort?.col) {
    const dir = sort.dir === 'desc' ? -1 : 1
    out = [...out].sort((a, b) => {
      const va = customMeta.has(sort.col) ? norm(customText(a, sort.col)) : sortValue(a, sort.col)
      const vb = customMeta.has(sort.col) ? norm(customText(b, sort.col)) : sortValue(b, sort.col)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base', numeric: true }) * dir
    })
  }

  return out
}

/* A busca global varre as colunas que a tela oferece (base + nativas extras). */
const NATIVE_SEARCH_COLS = [
  'numero', 'titulo', 'tipo', 'parte_principal', 'inicio', 'termino', 'valor_total',
  'situacao', 'documento', 'papel', 'data_assinatura', 'moeda', 'valor_parcela',
  'condicao_pagamento', 'objeto',
]
