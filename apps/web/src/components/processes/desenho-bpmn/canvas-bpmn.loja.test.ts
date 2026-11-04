/* Guarda de regressão: o CanvasBpmn RENDERIZA o <ReactFlow> e não está dentro de um
   <ReactFlowProvider>, então não pode chamar os hooks da loja do React Flow no próprio corpo
   — o editor quebra ao abrir ("Seems like you have not used ReactFlowProvider…"). Esses hooks
   moram nos componentes filhos, renderizados dentro do <ReactFlow>. Os testes do front rodam
   em node, sem DOM: a guarda lê o código-fonte em vez de renderizar. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const fonte = readFileSync(path.join(__dirname, 'canvas-bpmn.tsx'), 'utf-8').replace(/\r\n/g, '\n')

/** O corpo de `export function CanvasBpmn(`, até o `}` que fecha na coluna 0. */
function corpoDoCanvas(): string {
  const inicio = fonte.indexOf('export function CanvasBpmn(')
  expect(inicio).toBeGreaterThanOrEqual(0)
  const fim = fonte.indexOf('\n}\n', inicio)
  expect(fim).toBeGreaterThan(inicio)
  return fonte.slice(inicio, fim)
}

describe('CanvasBpmn e a loja do React Flow', () => {
  it('não chama hooks da loja no próprio corpo (não há ReactFlowProvider acima dele)', () => {
    const hooks = corpoDoCanvas().match(/\buse(Store|StoreApi|ReactFlow|Viewport|Nodes|Edges|UpdateNodeInternals|InternalNode|NodesData|NodeConnections|HandleConnections|OnSelectionChange|OnViewportChange|KeyPress)\s*[(<]/g)
    expect(hooks ?? []).toEqual([])
  })
})
