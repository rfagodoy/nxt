/* ─── Avaliador de condições ───────────────────────────────────────────────────
   Condições dos gateways vêm como texto do diagrama (ex.: "valor > 100000 &&
   tipo == 'aditivo'"). NUNCA usar eval/new Function — seria injeção de código no
   servidor. Aqui há um mini-interpretador próprio: tokenizador → parser (Pratt,
   por precedência) → avaliação sobre as variáveis da instância.

   Gramática suportada:
     literais:   número (123, 1.5), string ('a' ou "a"), true, false, null
     variáveis:  identificador com caminho por ponto (valor, contrato.total)
     unários:    ! -
     binários:   ||  &&  ==  !=  <  <=  >  >=  +  -  *  /  %
     grupos:     ( ... )
   Igualdade é permissiva com número↔string ("100" == 100) para casar com valores
   que chegam do formulário como texto; relacionais coagem os dois lados a número. */

// ── Tokens ────────────────────────────────────────────────────────────────────

type TokType =
  | 'num'
  | 'str'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'eof'

interface Tok {
  type: TokType
  value: string
}

const OP_CHARS = new Set(['!', '=', '<', '>', '&', '|', '+', '-', '*', '/', '%'])

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '(') {
      toks.push({ type: 'lparen', value: c })
      i++
      continue
    }
    if (c === ')') {
      toks.push({ type: 'rparen', value: c })
      i++
      continue
    }
    // string
    if (c === "'" || c === '"') {
      const quote = c
      let j = i + 1
      let s = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          s += src[j + 1]
          j += 2
        } else {
          s += src[j]
          j++
        }
      }
      if (j >= n) throw new ConditionError(`String não terminada em "${src}"`)
      toks.push({ type: 'str', value: s })
      i = j + 1
      continue
    }
    // number
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++
      toks.push({ type: 'num', value: src.slice(i, j) })
      i = j
      continue
    }
    // identifier (letras/_/$ seguidos de letras/dígitos/_/./$)
    if (/[a-zA-Z_$]/.test(c)) {
      let j = i + 1
      while (j < n && /[a-zA-Z0-9_$.]/.test(src[j])) j++
      toks.push({ type: 'ident', value: src.slice(i, j) })
      i = j
      continue
    }
    // operator (guloso: casa 2 chars quando possível: == != <= >= && ||)
    if (OP_CHARS.has(c)) {
      const two = src.slice(i, i + 2)
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        toks.push({ type: 'op', value: two })
        i += 2
        continue
      }
      if (['!', '<', '>', '+', '-', '*', '/', '%'].includes(c)) {
        toks.push({ type: 'op', value: c })
        i++
        continue
      }
      throw new ConditionError(`Operador inválido "${c}" em "${src}"`)
    }
    throw new ConditionError(`Caractere inesperado "${c}" em "${src}"`)
  }
  toks.push({ type: 'eof', value: '' })
  return toks
}

// ── AST ───────────────────────────────────────────────────────────────────────

type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'var'; path: string[] }
  | { t: 'unary'; op: string; e: Node }
  | { t: 'binary'; op: string; l: Node; r: Node }

export class ConditionError extends Error {}

// Precedência (maior = liga mais forte).
const BIN_PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

class Parser {
  private pos = 0
  constructor(private readonly toks: Tok[], private readonly src: string) {}

  parse(): Node {
    const e = this.parseExpr(0)
    if (this.peek().type !== 'eof') {
      throw new ConditionError(`Sobra de tokens em "${this.src}"`)
    }
    return e
  }

  private peek(): Tok {
    return this.toks[this.pos]
  }
  private next(): Tok {
    return this.toks[this.pos++]
  }

  // Precedence-climbing.
  private parseExpr(minPrec: number): Node {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t.type !== 'op' || !(t.value in BIN_PREC)) break
      const prec = BIN_PREC[t.value]
      if (prec < minPrec) break
      this.next()
      const right = this.parseExpr(prec + 1)
      left = { t: 'binary', op: t.value, l: left, r: right }
    }
    return left
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t.type === 'op' && (t.value === '!' || t.value === '-')) {
      this.next()
      return { t: 'unary', op: t.value, e: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const t = this.next()
    switch (t.type) {
      case 'num':
        return { t: 'lit', v: Number(t.value) }
      case 'str':
        return { t: 'lit', v: t.value }
      case 'ident':
        if (t.value === 'true') return { t: 'lit', v: true }
        if (t.value === 'false') return { t: 'lit', v: false }
        if (t.value === 'null') return { t: 'lit', v: null }
        return { t: 'var', path: t.value.split('.') }
      case 'lparen': {
        const e = this.parseExpr(0)
        if (this.next().type !== 'rparen') {
          throw new ConditionError(`Parêntese não fechado em "${this.src}"`)
        }
        return e
      }
      default:
        throw new ConditionError(`Token inesperado "${t.value}" em "${this.src}"`)
    }
  }
}

// ── Avaliação ─────────────────────────────────────────────────────────────────

function resolvePath(path: string[], vars: Record<string, unknown>): unknown {
  let cur: unknown = vars
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return NaN
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  const na = toNum(a)
  const nb = toNum(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb
  return String(a) === String(b)
}

function truthy(v: unknown): boolean {
  if (typeof v === 'string') return v !== '' && v !== 'false'
  return Boolean(v)
}

function evalNode(node: Node, vars: Record<string, unknown>): unknown {
  switch (node.t) {
    case 'lit':
      return node.v
    case 'var':
      return resolvePath(node.path, vars)
    case 'unary':
      if (node.op === '!') return !truthy(evalNode(node.e, vars))
      return -toNum(evalNode(node.e, vars))
    case 'binary': {
      const { op } = node
      // curto-circuito nos lógicos
      if (op === '&&') return truthy(evalNode(node.l, vars)) && truthy(evalNode(node.r, vars))
      if (op === '||') return truthy(evalNode(node.l, vars)) || truthy(evalNode(node.r, vars))
      const l = evalNode(node.l, vars)
      const r = evalNode(node.r, vars)
      switch (op) {
        case '==':
          return looseEq(l, r)
        case '!=':
          return !looseEq(l, r)
        case '<':
          return toNum(l) < toNum(r)
        case '<=':
          return toNum(l) <= toNum(r)
        case '>':
          return toNum(l) > toNum(r)
        case '>=':
          return toNum(l) >= toNum(r)
        case '+':
          // soma numérica quando ambos numéricos; senão concatena
          if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r)
          return toNum(l) + toNum(r)
        case '-':
          return toNum(l) - toNum(r)
        case '*':
          return toNum(l) * toNum(r)
        case '/':
          return toNum(l) / toNum(r)
        case '%':
          return toNum(l) % toNum(r)
      }
    }
  }
  throw new ConditionError('Nó de expressão desconhecido')
}

/** Compila uma expressão em AST (útil para validar no salvamento do processo). */
export function parseCondition(expr: string): Node {
  return new Parser(tokenize(expr), expr).parse()
}

/** Avalia uma condição e devolve boolean. Expressão vazia = true (fluxo livre).
 *  Lança ConditionError se a sintaxe for inválida. */
export function evalCondition(expr: string | undefined, vars: Record<string, unknown>): boolean {
  if (expr == null || expr.trim() === '') return true
  const ast = new Parser(tokenize(expr), expr).parse()
  return truthy(evalNode(ast, vars))
}
