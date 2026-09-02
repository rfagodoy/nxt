import { describe, it, expect } from 'vitest'
import { resumoDeInicio } from '../src/preview'
import type { WfGraph, WfNode } from '../src/types'

/** Monta um grafo a partir de nós soltos e pares "a->b" (com condição opcional). */
function grafo(nos: WfNode[], ligacoes: Array<[string, string, string?]>): WfGraph {
  return {
    nodes: Object.fromEntries(nos.map((n) => [n.id, n])),
    edges: ligacoes.map(([from, to, condition], i) => ({ id: `e${i}`, from, to, ...(condition ? { condition } : {}) })),
    startId: nos.find((n) => n.type === 'start')?.id ?? 'start',
  }
}

const inicio: WfNode = { id: 'start', type: 'start', name: 'Início' }
const fim: WfNode = { id: 'fim', type: 'end', name: 'Fim' }
const tarefa = (id: string, name: string, extra: Partial<WfNode> = {}): WfNode =>
  ({ id, type: 'userTask', name, ...extra })

describe('resumoDeInicio', () => {
  it('acha a atividade de entrada e o que vem depois dela', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher dados'), tarefa('b', 'Analisar'), fim],
      [['start', 'a'], ['a', 'b'], ['b', 'fim']],
    )
    const r = resumoDeInicio(g)
    expect(r.primeira?.nome).toBe('Preencher dados')
    expect(r.proximas.map((e) => e.nome)).toEqual(['Analisar'])
    expect(r.frentes).toEqual([])
    expect(r.totais).toEqual({ atividades: 2, decisoes: 0 })
    expect(r.caminhoVaria).toBe(false)
  })

  it('atravessa o losango e diz qual decisão leva a cada etapa', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher'), { id: 'gw', type: 'exclusiveGateway', name: 'Possui erros?' },
       tarefa('b', 'Corrigir'), tarefa('c', 'Seguir'), fim],
      [['start', 'a'], ['a', 'gw'], ['gw', 'b', "x == 'sim'"], ['gw', 'c'], ['b', 'fim'], ['c', 'fim']],
    )
    const r = resumoDeInicio(g)
    expect(r.primeira?.nome).toBe('Preencher')
    expect(r.proximas.map((e) => e.nome).sort()).toEqual(['Corrigir', 'Seguir'])
    expect(r.proximas.every((e) => e.decisao === 'Possui erros?')).toBe(true)
    expect(r.caminhoVaria).toBe(true)
  })

  /* A bifurcação em paralelo é o caso do fluxo real de contratos: uma atividade de
     entrada e três frentes que nascem JUNTAS. Confundir isso com "próximas" faria a
     tela dizer "pode ir para uma destas" onde o certo é "as três acontecem". */
  it('separa frentes paralelas de próximas etapas', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher'), { id: 'par', type: 'parallelGateway', name: 'Frentes' },
       tarefa('x', 'Cadastral'), tarefa('y', 'Financeira'), tarefa('z', 'Patrimônio'), fim],
      [['start', 'a'], ['a', 'par'], ['par', 'x'], ['par', 'y'], ['par', 'z'], ['x', 'fim'], ['y', 'fim'], ['z', 'fim']],
    )
    const r = resumoDeInicio(g)
    expect(r.frentes.map((e) => e.nome)).toEqual(['Cadastral', 'Financeira', 'Patrimônio'])
    expect(r.proximas).toEqual([])
  })

  /* Laço de correção: "Corrigir" volta para "Analisar". Sem conjunto de visitados a
     travessia roda para sempre — este teste é o que impede a regressão. */
  it('não se perde em laço de correção', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher'), tarefa('b', 'Analisar'),
       { id: 'gw', type: 'exclusiveGateway', name: 'Possui erros?' }, tarefa('c', 'Corrigir'), fim],
      [['start', 'a'], ['a', 'b'], ['b', 'gw'], ['gw', 'c', "erro == 'sim'"], ['c', 'b'], ['gw', 'fim']],
    )
    const r = resumoDeInicio(g)
    expect(r.primeira?.nome).toBe('Preencher')
    expect(r.proximas.map((e) => e.nome)).toEqual(['Analisar'])
  })

  it('avisa quando o processo pode encerrar logo depois da entrada', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher'), { id: 'gw', type: 'exclusiveGateway', name: 'Precisa de análise?' },
       tarefa('b', 'Analisar'), fim],
      [['start', 'a'], ['a', 'gw'], ['gw', 'b', "precisa == 'sim'"], ['gw', 'fim'], ['b', 'fim']],
    )
    expect(resumoDeInicio(g).podeTerminarCedo).toBe(true)
  })

  it('sem uma entrada única, as etapas de início viram frentes', () => {
    const g = grafo(
      [inicio, { id: 'par', type: 'parallelGateway', name: 'Frentes' }, tarefa('x', 'A'), tarefa('y', 'B'), fim],
      [['start', 'par'], ['par', 'x'], ['par', 'y'], ['x', 'fim'], ['y', 'fim']],
    )
    const r = resumoDeInicio(g)
    expect(r.primeira).toBeNull()
    expect(r.frentes.map((e) => e.nome)).toEqual(['A', 'B'])
  })

  it('carrega prazo, tela e executor para a tela mostrar', () => {
    const g = grafo(
      [inicio, tarefa('a', 'Preencher', {
        slaBusinessDays: 2, formRef: 'tela1',
        executor: { papelId: 'p1', entityType: 'UNIDADE', mode: 'FIXA', entityId: 'u1' },
      }), fim],
      [['start', 'a'], ['a', 'fim']],
    )
    const p = resumoDeInicio(g).primeira
    expect(p?.prazoDiasUteis).toBe(2)
    expect(p?.formRef).toBe('tela1')
    expect(p?.executor?.papelId).toBe('p1')
  })
})
