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
