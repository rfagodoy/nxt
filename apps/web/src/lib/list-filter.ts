/* Filtro de listagem — lógica ÚNICA (condições E/OU) usada pela ListToolbar e pelas telas.
   Espelha os operadores do padrão Parceiros/Contratos. */

export interface FilterRow { id: string; col: string; op: string; value: string }

export const OPERATORS = [
  { value: 'contains',    label: 'Contém'      },
  { value: 'notContains', label: 'Não contém'  },
  { value: 'eq',          label: 'Igual a'     },
  { value: 'neq',         label: 'Diferente de' },
  { value: 'startsWith',  label: 'Começa com'  },
  { value: 'endsWith',    label: 'Termina com' },
]

/** Operadores para filtro CLIENT-SIDE com comparação numérica/lexical (Contratos, via applyOp).
 *  Estende os textuais com maior/menor. */
export const CLIENT_OPERATORS = [
  ...OPERATORS,
  { value: 'gt',  label: 'Maior que'        },
  { value: 'gte', label: 'Maior ou igual a' },
  { value: 'lt',  label: 'Menor que'        },
  { value: 'lte', label: 'Menor ou igual a' },
]

/** Operadores para filtro SERVER-SIDE (Parceiros) — inclui as negações de início/fim que o
 *  backend sabe aplicar. */
export const SERVER_OPERATORS = [
  { value: 'contains',      label: 'Contém'           },
  { value: 'notContains',   label: 'Não contém'       },
  { value: 'eq',            label: 'Igual a'          },
  { value: 'neq',           label: 'Diferente de'     },
  { value: 'startsWith',    label: 'Começa com'       },
  { value: 'notStartsWith', label: 'Não começa com'   },
  { value: 'endsWith',      label: 'Termina com'      },
  { value: 'notEndsWith',   label: 'Não termina com'  },
  { value: 'gt',            label: 'Maior que'        },
  { value: 'gte',           label: 'Maior ou igual a' },
  { value: 'lt',            label: 'Menor que'        },
  { value: 'lte',           label: 'Menor ou igual a' },
]

/** normaliza p/ comparação: minúsculas, sem acento, trim (alinha à collation do SQL Server). */
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Coluna filtrável: `get` devolve o texto da célula (para busca/filtro/ordenação). */
export interface FilterCol<T> { key: string; label: string; get: (row: T) => string }

/** Aplica busca (em todas as colunas) + condições (E/OU) a uma lista, client-side. */
export function filterRows<T>(rows: T[], cols: FilterCol<T>[], search: string, filters: FilterRow[], logic: 'AND' | 'OR'): T[] {
  const s = norm(search)
  const active = filters.filter((f) => f.value.trim())
  return rows.filter((row) => {
    if (s && !cols.some((c) => norm(c.get(row)).includes(s))) return false
    if (active.length === 0) return true
    const rs = active.map((f) => { const c = cols.find((x) => x.key === f.col); return c ? matchOp(c.get(row), f.op, f.value) : true })
    return logic === 'AND' ? rs.every(Boolean) : rs.some(Boolean)
  })
}

/** aplica um operador de filtro a um valor de célula já em texto. */
export function matchOp(cell: string, op: string, val: string): boolean {
  const c = norm(cell), v = norm(val)
  switch (op) {
    case 'contains':    return c.includes(v)
    case 'notContains': return !c.includes(v)
    case 'eq':          return c === v
    case 'neq':         return c !== v
    case 'startsWith':  return c.startsWith(v)
    case 'endsWith':    return c.endsWith(v)
    default:            return true
  }
}

/* ─── Filtro NA COLUNA (padrão planilha) — espelho de apps/api/src/contracts/list-query.ts ── */

/** Formas em que a célula aparece na tela: o filtro casa com o que a pessoa VÊ — data ISO
 *  também como dd/mm/aaaa, número também com milhar e vírgula pt-BR. */
export function formasVisiveis(texto: string): string[] {
  const formas = [texto]
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  if (iso) formas.push(`${iso[3]}/${iso[2]}/${iso[1]}`)
  if (/^-?\d+(\.\d+)?$/.test(texto.trim())) {
    formas.push(Number(texto).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  return formas
}

/** "contém" do filtro na coluna; campo vazio não filtra. */
export function colunaContem(texto: string, valor: string): boolean {
  const v = norm(valor)
  return !v || formasVisiveis(texto).some((f) => norm(f).includes(v))
}

/** Aplica o filtro na coluna (sempre E) a uma lista filtrada no navegador. */
export function aplicarFiltroColuna<T>(rows: T[], cols: FilterCol<T>[], ativos: { col: string; value: string }[]): T[] {
  if (!ativos.length) return rows
  return rows.filter((row) => ativos.every((f) => {
    const c = cols.find((x) => x.key === f.col)
    return c ? colunaContem(c.get(row), f.value) : true
  }))
}
