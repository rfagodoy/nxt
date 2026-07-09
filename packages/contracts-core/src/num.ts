/* Coerção numérica única. O front modela valor como string ('5000.00') e o backend
   como number (Float do Prisma); estas funções aceitam os dois e são a razão de o
   core conseguir servir aos dois lados sem um DTO intermediário. */

export type Numeric = string | number | null | undefined

/** Número a partir de string ou number. Inválido/ausente = 0. Mesma semântica do
 *  `parseFloat(x) || 0` do front e do `Number(x) || 0` do backend. */
export function num(x: Numeric): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0
  if (typeof x === 'string') {
    const n = parseFloat(x)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Inteiro a partir de string ou number (quantidade de parcelas). */
export function int(x: Numeric): number {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.trunc(x) : 0
  if (typeof x === 'string') {
    const n = parseInt(x, 10)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Percentual digitado pelo usuário — aceita vírgula decimal ('4,62'). */
export function pct(x: Numeric): number {
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return num(x)
}

/** Arredonda para centavos. Dinheiro gravado no contrato tem 2 casas. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
