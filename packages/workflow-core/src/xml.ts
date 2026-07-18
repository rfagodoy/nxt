/* ─── Mini-parser de XML ────────────────────────────────────────────────────────
   Parser enxuto do SUBCONJUNTO de XML que o BPMN do bpmn-js usa: elementos,
   atributos, texto, auto-fechamento, comentários e declaração. Não é um parser
   XML completo (não trata CDATA, DTD, namespaces semânticos) — de propósito: o
   BPMN emitido pelo designer é regular e previsível, e não queremos dependência
   externa no motor. Namespaces viram apenas prefixo no nome (guardamos `local`,
   o nome sem prefixo, para casar `bpmn:process` como `process`). */

export interface XmlNode {
  /** nome completo, ex.: "bpmn:process" */
  name: string
  /** nome sem prefixo de namespace, ex.: "process" */
  local: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** texto concatenado dos nós de texto diretos (com entidades decodificadas) */
  text: string
}

export class XmlError extends Error {}

const localName = (name: string): string => {
  const i = name.indexOf(':')
  return i === -1 ? name : name.slice(i + 1)
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent: string) => {
    switch (ent) {
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'amp':
        return '&'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
    }
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isNaN(code) ? m : String.fromCodePoint(code)
    }
    return m
  })
}

/** Acha o `>` que fecha uma tag de abertura, IGNORANDO os que aparecem dentro de
 *  valores de atributo entre aspas (ex.: name="Valor > 100 mil?" é XML válido). */
function findTagEnd(src: string, from: number): number {
  let quote = ''
  for (let k = from; k < src.length; k++) {
    const c = src[k]
    if (quote) {
      if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '>') return k
  }
  return -1
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const value = m[3] !== undefined ? m[3] : m[4] ?? ''
    attrs[m[1]] = decodeEntities(value)
  }
  return attrs
}

/** Faz o parse do XML e devolve o elemento raiz. */
export function parseXml(src: string): XmlNode {
  let i = 0
  const n = src.length
  const stack: XmlNode[] = []
  let root: XmlNode | null = null

  const pushChild = (node: XmlNode) => {
    const top = stack[stack.length - 1]
    if (top) top.children.push(node)
    else if (!root) root = node
    else throw new XmlError('XML com mais de um elemento raiz')
  }

  while (i < n) {
    if (src[i] !== '<') {
      // texto até o próximo '<'
      let j = i
      while (j < n && src[j] !== '<') j++
      const raw = src.slice(i, j).trim()
      if (raw) {
        const top = stack[stack.length - 1]
        if (top) top.text += (top.text ? '' : '') + decodeEntities(raw)
      }
      i = j
      continue
    }

    // declaração <?xml ...?>
    if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i)
      if (end === -1) throw new XmlError('Declaração <? não terminada')
      i = end + 2
      continue
    }
    // comentário <!-- ... -->
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i)
      if (end === -1) throw new XmlError('Comentário não terminado')
      i = end + 3
      continue
    }
    // <!DOCTYPE ...> e afins
    if (src.startsWith('<!', i)) {
      const end = src.indexOf('>', i)
      if (end === -1) throw new XmlError('Declaração <! não terminada')
      i = end + 1
      continue
    }
    // fechamento </nome>
    if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i)
      if (end === -1) throw new XmlError('Tag de fechamento não terminada')
      const name = src.slice(i + 2, end).trim()
      const top = stack.pop()
      if (!top) throw new XmlError(`Fechamento </${name}> sem abertura`)
      if (top.name !== name) throw new XmlError(`Fechamento </${name}> não casa com <${top.name}>`)
      i = end + 1
      continue
    }

    // abertura <nome attrs> ou <nome attrs/> — busca o fim ciente de aspas
    const end = findTagEnd(src, i + 1)
    if (end === -1) throw new XmlError('Tag de abertura não terminada')
    let inner = src.slice(i + 1, end).trim()
    const selfClosing = inner.endsWith('/')
    if (selfClosing) inner = inner.slice(0, -1).trim()

    const spaceIdx = inner.search(/\s/)
    const name = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)
    const attrsRaw = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1)

    const node: XmlNode = {
      name,
      local: localName(name),
      attrs: parseAttrs(attrsRaw),
      children: [],
      text: '',
    }
    pushChild(node)
    if (!selfClosing) stack.push(node)
    i = end + 1
  }

  if (stack.length > 0) throw new XmlError(`Elemento <${stack[stack.length - 1].name}> não foi fechado`)
  if (!root) throw new XmlError('XML sem elemento raiz')
  return root
}

/** Percorre a árvore (profundidade) e devolve todos os descendentes com o
 *  `local` dado (nome sem prefixo). */
export function findByLocal(node: XmlNode, local: string): XmlNode[] {
  const out: XmlNode[] = []
  const walk = (n: XmlNode) => {
    if (n.local === local) out.push(n)
    for (const c of n.children) walk(c)
  }
  walk(node)
  return out
}

/** Primeiro descendente (ou o próprio) com o `local` dado. */
export function firstByLocal(node: XmlNode, local: string): XmlNode | undefined {
  if (node.local === local) return node
  for (const c of node.children) {
    const found = firstByLocal(c, local)
    if (found) return found
  }
  return undefined
}
