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
