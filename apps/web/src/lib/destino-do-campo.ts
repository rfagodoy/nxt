/* Para onde o processo vai em cada resposta de um campo (PO, 22/11/2026).
 *
 * Um campo de lista que decide a escolha logo depois da tarefa mostra, junto da resposta,
 * a próxima etapa ("O processo segue para Validar a contratação"). A conta usa o grafo
 * CONGELADO da instância e o mesmo avaliador de condições do motor.
 *
 * Só se diz o destino quando é certo: a escolha precisa vir logo depois da tarefa (passando
 * só por losangos de uma saída) e os filtros dela só podem testar ESTE campo. Com outro
 * campo no filtro, o destino dependeria de algo que a tela não está mostrando — melhor não
 * prometer nada. */
import { evalCondition } from '@nxt/workflow-core'

export interface GrafoDaInstancia {
  nodes: Record<string, { type: string; name?: string }>
  edges: Array<{ from: string; to: string; condition?: string; isDefault?: boolean }>
}

const LITERAIS = new Set(['true', 'false', 'null'])

/** Variáveis que uma condição lê (sem os textos entre aspas). */
function variaveisDa(condicao: string): string[] {
  const semTexto = condicao.replace(/'[^']*'|"[^"]*"/g, '')
  return (semTexto.match(/[A-Za-z_$][\w.$]*/g) ?? []).filter((x) => !LITERAIS.has(x))
}

const saidas = (g: GrafoDaInstancia, id: string) => g.edges.filter((e) => e.from === id)
const ehPassagem = (g: GrafoDaInstancia, id: string) => {
  const t = g.nodes[id]?.type
  return (t === 'exclusiveGateway' || t === 'inclusiveGateway') && saidas(g, id).length === 1
}

/** Nome da etapa a que um caminho leva (atravessando losangos de passagem). */
function nomeDoDestino(g: GrafoDaInstancia, id: string): string | null {
  let atual = id
  for (let passos = 0; passos < 50; passos++) {
    const n = g.nodes[atual]
    if (!n) return null
    if (n.type === 'userTask' || n.type === 'serviceTask') return n.name?.trim() || null
    if (n.type === 'end') return 'o fim do processo'
    if (!ehPassagem(g, atual)) return null
    atual = saidas(g, atual)[0].to
  }
  return null
}

/** Objeto de variáveis com o valor no caminho do campo: `contrato.sf_x` → { contrato: { sf_x } }. */
function varsCom(chave: string, valor: string): Record<string, unknown> {
  const partes = chave.split('.')
  const raiz: Record<string, unknown> = {}
  let atual = raiz
  partes.forEach((p, i) => {
    if (i === partes.length - 1) atual[p] = valor
    else { const prox: Record<string, unknown> = {}; atual[p] = prox; atual = prox }
  })
  return raiz
}

/**
 * Valor → nome da próxima etapa, para o campo `chave` (`contrato.<chave do campo>`), na
 * escolha logo depois da tarefa `nodeId`. `null` quando não há escolha logo à frente, ela
 * não testa este campo, ou testa outros campos junto.
 */
export function destinosDoCampo(
  grafo: GrafoDaInstancia | null | undefined,
  nodeId: string,
  chave: string,
  valores: readonly string[],
): Map<string, string> | null {
  if (!grafo?.nodes || !grafo.edges) return null
  let atual = nodeId
  for (let passos = 0; ; passos++) {
    if (passos > 50) return null
    const s = saidas(grafo, atual)
    if (s.length !== 1) return null
    atual = s[0].to
    if (!ehPassagem(grafo, atual)) break
  }
  if (grafo.nodes[atual]?.type !== 'exclusiveGateway') return null

  const opcoes = saidas(grafo, atual)
  const comFiltro = opcoes.filter((e) => !e.isDefault && e.condition?.trim())
  if (!comFiltro.length) return null
  const lidas = comFiltro.flatMap((e) => variaveisDa(e.condition!))
  if (!lidas.length || lidas.some((v) => v !== chave)) return null
  const casoContrario = opcoes.find((e) => e.isDefault || !e.condition?.trim())

  const out = new Map<string, string>()
  for (const valor of valores) {
    const vars = varsCom(chave, valor)
    let seta = comFiltro.find((e) => { try { return evalCondition(e.condition, vars) } catch { return false } })
    seta ??= casoContrario
    const nome = seta ? nomeDoDestino(grafo, seta.to) : null
    if (nome) out.set(valor, nome)
  }
  return out.size ? out : null
}
