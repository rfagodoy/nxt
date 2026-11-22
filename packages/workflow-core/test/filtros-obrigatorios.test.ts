import { describe, it, expect } from 'vitest'
import { validarCamposDosFiltros, type EntradaFiltrosObrigatorios } from '../src/filtros-obrigatorios'
import { formatarProblemas } from '../src/activation-guard'

const MO = 'contrato.maoDeObra'
const filtro = (campo: string) => ({ conditionSpec: { rules: [{ campo }] } })
const exigivel = (c: string) => c.startsWith('contrato.') && c !== 'contrato.situacao'

/** início → A (preenche) → escolha "Tem mão de obra?" → (sim: B) / (caso contrário) → fim */
const nodes = [
  { id: 'start', type: 'start' },
  { id: 'A', type: 'userTask', name: 'Preencher dados' },
  { id: 'g', type: 'exclusiveGateway', name: 'Tem mão de obra?' },
  { id: 'B', type: 'userTask', name: 'Validar' },
  { id: 'end', type: 'end' },
]
const edges = [
  { from: 'start', to: 'A' }, { from: 'A', to: 'g' },
  { from: 'g', to: 'B', ...filtro(MO) }, { from: 'g', to: 'end' }, { from: 'B', to: 'end' },
]
const rodar = (cobrados: Record<string, string[]>, extra: Partial<EntradaFiltrosObrigatorios> = {}) =>
  validarCamposDosFiltros({
    nodes, edges, exigivel,
    cobrados: new Map(Object.entries(cobrados).map(([k, v]) => [k, new Set(v)])),
    rotuloDoCampo: (c) => (c === MO ? 'Mão de obra alocada' : undefined),
    ...extra,
  })

describe('validarCamposDosFiltros', () => {
  it('passa quando a atividade antes da escolha exige o campo', () => {
    expect(rodar({ A: [MO] })).toEqual([])
  })

  it('recusa quando nenhuma atividade exige o campo', () => {
    const [p, ...resto] = rodar({})
    expect(resto).toEqual([])
    expect(p).toMatchObject({ tipo: 'filtro-sem-obrigatorio', nodeId: 'g', rotulo: '"Tem mão de obra?" — "Mão de obra alocada"' })
    expect(p.severidade).toBeUndefined() // erro: impede ativar
    expect(p.mensagem).toContain('nenhuma atividade antes dela exige')
    expect(formatarProblemas([p])).toBe(p.mensagem)
  })

  it('recusa quando o campo só é exigido depois da escolha', () => {
    const [p] = rodar({ B: [MO] })
    expect(p.mensagem).toContain('só é obrigatório em "Validar", depois da escolha')
  })

  it('recusa quando só um ramo de uma escolha anterior exige o campo', () => {
    const ns = [...nodes, { id: 'g0', type: 'exclusiveGateway', name: 'Urgente?' }, { id: 'X', type: 'userTask', name: 'Detalhar' }]
    const es = [
      { from: 'start', to: 'g0' }, { from: 'g0', to: 'X', ...filtro('contrato.tipo') }, { from: 'g0', to: 'A' }, { from: 'X', to: 'A' },
      ...edges.filter((e) => e.from !== 'start'),
    ]
    const ps = rodar({ X: [MO, 'contrato.tipo'] }, { nodes: ns, edges: es })
    const daMaoDeObra = ps.find((p) => p.nodeId === 'g')!
    expect(daMaoDeObra.mensagem).toContain('só é obrigatório em "Detalhar", mas há caminho até a escolha que não passa por lá')
    // e o campo do filtro da 1ª escolha só é exigido no caminho dela, depois da decisão
    expect(ps.find((p) => p.nodeId === 'g0')?.mensagem).toContain('depois da escolha')
  })

  it('a volta de um caminho não conta como antes da escolha', () => {
    const es = [...edges.filter((e) => !(e.from === 'B')), { from: 'B', to: 'A' }]
    expect(rodar({ B: [MO] }, { edges: es })[0].mensagem).toContain('depois da escolha')
  })

  it('linha de "ao mesmo tempo" com junção garante o campo depois da junção', () => {
    const ns = [
      { id: 'start', type: 'start' }, { id: 'p', type: 'parallelGateway' },
      { id: 'L1', type: 'userTask', name: 'Jurídico' }, { id: 'L2', type: 'userTask', name: 'Compras' },
      { id: 'j', type: 'parallelGateway' }, { id: 'g', type: 'exclusiveGateway', name: 'Tem mão de obra?' }, { id: 'end', type: 'end' },
    ]
    const es = [
      { from: 'start', to: 'p' }, { from: 'p', to: 'L1' }, { from: 'p', to: 'L2' }, { from: 'L1', to: 'j' }, { from: 'L2', to: 'j' },
      { from: 'j', to: 'g' }, { from: 'g', to: 'end', ...filtro(MO) }, { from: 'g', to: 'end' },
    ]
    expect(rodar({ L2: [MO] }, { nodes: ns, edges: es })).toEqual([])
  })

  it('linha paralela sem junção não garante o campo para a escolha da outra linha', () => {
    const ns = [
      { id: 'start', type: 'start' }, { id: 'p', type: 'parallelGateway' },
      { id: 'L1', type: 'userTask', name: 'Jurídico' }, { id: 'g', type: 'exclusiveGateway', name: 'Tem mão de obra?' }, { id: 'end', type: 'end' },
    ]
    const es = [
      { from: 'start', to: 'p' }, { from: 'p', to: 'L1' }, { from: 'p', to: 'g' },
      { from: 'g', to: 'end', ...filtro(MO) }, { from: 'g', to: 'end' },
    ]
    expect(rodar({ L1: [MO] }, { nodes: ns, edges: es })).toHaveLength(1)
  })

  it('ignora campos que não podem ser exigidos e os de formulário próprio', () => {
    const es = [...edges.filter((e) => e.from !== 'g'), { from: 'g', to: 'B', conditionSpec: { rules: [{ campo: 'contrato.situacao' }, { campo: 'aprovado' }] } }, { from: 'g', to: 'end' }]
    expect(rodar({}, { edges: es })).toEqual([])
  })

  it('um problema por campo, sem repetir o campo testado em dois caminhos', () => {
    const es = [...edges.filter((e) => e.from !== 'g'),
      { from: 'g', to: 'B', conditionSpec: { rules: [{ campo: MO }, { campo: 'contrato.valorTotal' }] } },
      { from: 'g', to: 'end', ...filtro(MO) }, { from: 'g', to: 'end' }]
    expect(rodar({}, { edges: es }).map((p) => p.rotulo)).toEqual([
      '"Tem mão de obra?" — "Mão de obra alocada"', '"Tem mão de obra?" — "contrato.valorTotal"',
    ])
  })

  it('escolha que o início não alcança fica com as outras regras', () => {
    const es = edges.filter((e) => e.from !== 'A')
    expect(rodar({}, { edges: es })).toEqual([])
  })
})
