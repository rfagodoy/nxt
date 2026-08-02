import { describe, it, expect } from 'vitest'
import { layoutGraph, titleLineCount, nodeSize, LANE_HEADER_W, LANE_SEM_RESPONSAVEL, type FlowGraph } from './flow-layout'

const g = (nodes: FlowGraph['nodes'], edges: FlowGraph['edges']): FlowGraph => ({ nodes, edges, startId: 'start' })

describe('titleLineCount / altura dinâmica do card', () => {
  it('nome vazio/curto = 1 linha; cresce com o comprimento; capa em 3', () => {
    expect(titleLineCount('')).toBe(1)
    expect(titleLineCount('Aprovar')).toBe(1)
    expect(titleLineCount('a'.repeat(30))).toBe(2)
    expect(titleLineCount('a'.repeat(200))).toBe(3) // capado
  })
  it('a altura do card de atividade acompanha o nº de linhas do título', () => {
    const short = nodeSize({ id: 'x', type: 'userTask', name: 'Aprovar' }, 1, 1).h
    const long = nodeSize({ id: 'y', type: 'userTask', name: 'a'.repeat(50) }, 1, 1).h
    expect(long).toBeGreaterThan(short)
  })

  /* O rodapé varia por cartão (executor, unidade, prazo). Se a caixa não acompanhasse,
     mostrar a unidade cortaria a última linha nos cartões que já tinham prazo. */
  it('a altura acompanha também o nº de linhas do RODAPÉ', () => {
    const base = { id: 'x', type: 'userTask' as const, name: 'Aprovar' }
    const duas = nodeSize({ ...base, metaLines: 2 }, 1, 1).h
    const tres = nodeSize({ ...base, metaLines: 3 }, 1, 1).h
    const uma = nodeSize({ ...base, metaLines: 1 }, 1, 1).h
    expect(tres).toBeGreaterThan(duas)
    expect(duas).toBeGreaterThan(uma)
    // sem informar, mantém o cartão de sempre (2 linhas) — compatibilidade
    expect(nodeSize(base, 1, 1).h).toBe(duas)
  })
})

describe('layoutGraph', () => {
  it('fluxo linear fica numa linha reta (mesma faixa/centro-y)', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'userTask', name: 'A' },
        { id: 'b', type: 'serviceTask', name: 'B' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' },
        { id: 'e3', from: 'b', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    // todas as faixas iguais → linha reta
    const lanes = Object.values(L.nodes).map((n) => n.lane)
    expect(new Set(lanes).size).toBe(1)
    // colunas crescem da esquerda p/ direita
    expect(L.nodes.a.x).toBeGreaterThan(L.nodes.start.x)
    expect(L.nodes.b.x).toBeGreaterThan(L.nodes.a.x)
    expect(L.nodes.end.x).toBeGreaterThan(L.nodes.b.x)
    // centros y iguais (reta)
    const cy = (n: { y: number; h: number }) => n.y + n.h / 2
    expect(cy(L.nodes.a)).toBeCloseTo(cy(L.nodes.b))
  })

  it('paralelo abre faixas simétricas e a junção volta ao eixo', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'p', type: 'parallelGateway', name: 'Em paralelo' },
        { id: 'x', type: 'userTask', name: 'X' },
        { id: 'y', type: 'userTask', name: 'Y' },
        { id: 'j', type: 'parallelGateway' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'p' },
        { id: 'e1', from: 'p', to: 'x' },
        { id: 'e2', from: 'p', to: 'y' },
        { id: 'e3', from: 'x', to: 'j' },
        { id: 'e4', from: 'y', to: 'j' },
        { id: 'e5', from: 'j', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    // fork e join no eixo (faixa 0)
    expect(L.nodes.p.lane).toBe(0)
    expect(L.nodes.j.lane).toBe(0)
    // ramos simétricos (faixas opostas)
    expect(L.nodes.x.lane).toBe(-L.nodes.y.lane)
    expect(L.nodes.x.lane).not.toBe(0)
    // BPMN: fork e junção são o MESMO losango — o que distingue é o rótulo, não o tamanho
    expect(L.nodes.j.w).toBe(L.nodes.p.w)
    expect(L.nodes.p.w).toBe(L.nodes.p.h)
  })

  it('BPMN: evento e gateway são quadrados (círculo/losango) e centrados no eixo da faixa', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'userTask', name: 'a'.repeat(60) }, // cartão alto (3 linhas)
        { id: 'gw', type: 'exclusiveGateway', name: 'Aprova?' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'a' },
        { id: 'e2', from: 'a', to: 'gw' },
        { id: 'e3', from: 'gw', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    for (const id of ['start', 'gw', 'end']) expect(L.nodes[id].w).toBe(L.nodes[id].h)
    // centros y iguais mesmo com alturas MUITO diferentes → setas retas
    const cy = (n: { y: number; h: number }) => n.y + n.h / 2
    expect(cy(L.nodes.gw)).toBeCloseTo(cy(L.nodes.a))
    expect(cy(L.nodes.start)).toBeCloseTo(cy(L.nodes.a))
  })

  it('o rótulo externo do gateway cabe no desenho (não é cortado na borda)', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'gw', type: 'exclusiveGateway', name: 'Necessita de aprovação?' } ],
      [ { id: 'e1', from: 'start', to: 'gw' } ],
    )
    const L = layoutGraph(graph)
    const p = L.nodes.gw
    expect(L.height).toBeGreaterThan(p.y + p.h) // sobra vertical para o nome embaixo
    expect(L.width).toBeGreaterThan(p.x + p.w)  // e horizontal para ele transbordar centrado
  })

  it('decisão exclusiva: saída PADRÃO segue reto, condicional abre', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'g', type: 'exclusiveGateway', name: 'Valor > 100k?' },
        { id: 'n2', type: 'userTask', name: 'Aprovar' },
        { id: 'm', type: 'exclusiveGateway' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'g' },
        { id: 'e1', from: 'g', to: 'n2', condition: 'valor > 100000' }, // condicional → abre
        { id: 'e2', from: 'g', to: 'm', isDefault: true },              // padrão → reto
        { id: 'e3', from: 'n2', to: 'm' },
        { id: 'e4', from: 'm', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    expect(L.nodes.g.lane).toBe(0)
    expect(L.nodes.m.lane).toBe(0)      // reencontro volta ao eixo (padrão era reto)
    expect(L.nodes.n2.lane).not.toBe(0) // condicional abriu para fora do eixo
  })

  it('Início e Fim não se sobrepõem quando o fluxo fica sem atividades', () => {
    // só start e end, sem aresta (caso: criei atividades e deletei todas)
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'end', type: 'end' } ],
      [],
    )
    const L = layoutGraph(graph)
    // colunas diferentes → não colam
    expect(L.nodes.end.x).toBeGreaterThan(L.nodes.start.x + L.nodes.start.w - 1)
    // sem sobreposição de bounding box
    const overlap = L.nodes.end.x < L.nodes.start.x + L.nodes.start.w && L.nodes.start.x < L.nodes.end.x + L.nodes.end.w
    expect(overlap).toBe(false)
  })

  it('dois nós órfãos no mesmo rank não se sobrepõem', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask' }, { id: 'b', type: 'userTask' }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'end' } ], // a e b desconectados (rank 0)
    )
    const L = layoutGraph(graph)
    expect(L.nodes.a.lane).not.toBe(L.nodes.b.lane)
  })

  /* Devolução ("Não" volta para a etapa anterior) cria CICLO. Antes deste teste o Kahn
     não alcançava os nós do ciclo, todos ficavam no rank 0 e o desenho empilhava numa
     coluna só — só não aparecia porque as posições manuais mascaravam. */
  it('aresta de RETORNO não colapsa as colunas', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'preencher', type: 'userTask', name: 'Preencher' },
        { id: 'gw', type: 'exclusiveGateway', name: 'Aprova?' },
        { id: 'seguir', type: 'userTask', name: 'Seguir' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'preencher' },
        { id: 'e2', from: 'preencher', to: 'gw' },
        { id: 'e3', from: 'gw', to: 'seguir', label: 'Sim' },
        { id: 'e4', from: 'gw', to: 'preencher', label: 'Não' }, // ← retorno
        { id: 'e5', from: 'seguir', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    // cada etapa numa coluna própria, da esquerda para a direita
    expect(L.nodes.preencher.x).toBeGreaterThan(L.nodes.start.x)
    expect(L.nodes.gw.x).toBeGreaterThan(L.nodes.preencher.x)
    expect(L.nodes.seguir.x).toBeGreaterThan(L.nodes.gw.x)
    expect(L.nodes.end.x).toBeGreaterThan(L.nodes.seguir.x)
    // o retorno não faz o gateway parecer um fork: a saída segue reta
    expect(L.nodes.seguir.lane).toBe(L.nodes.gw.lane)
  })

  it('sem swimlanes não há bandas (o canvas de sempre)', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask', name: 'A', lane: 'Solicitante' }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'a' }, { id: 'e2', from: 'a', to: 'end' } ],
    )
    expect(layoutGraph(graph).lanes).toBeUndefined()
  })

  it('posição manual sobrepõe o auto-layout (só do nó informado)', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask' }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'a' }, { id: 'e2', from: 'a', to: 'end' } ],
    )
    const auto = layoutGraph(graph)
    const L = layoutGraph(graph, { a: { x: 999, y: 777 } })
    expect(L.nodes.a.x).toBe(999)
    expect(L.nodes.a.y).toBe(777)
    // os demais seguem o auto
    expect(L.nodes.start.x).toBe(auto.nodes.start.x)
    // extents crescem para acomodar o nó movido
    expect(L.width).toBeGreaterThanOrEqual(999 + L.nodes.a.w)
  })

  it('não sobrepõe: faixas diferentes ficam distantes o bastante', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'p', type: 'parallelGateway' },
        { id: 'x', type: 'userTask' },
        { id: 'y', type: 'userTask' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'p' },
        { id: 'e1', from: 'p', to: 'x' },
        { id: 'e2', from: 'p', to: 'y' },
        { id: 'e3', from: 'x', to: 'end' },
        { id: 'e4', from: 'y', to: 'end' },
      ],
    )
    const L = layoutGraph(graph)
    const a = L.nodes.x, b = L.nodes.y
    const gap = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2))
    expect(gap).toBeGreaterThanOrEqual(a.h) // sem sobreposição vertical
  })
})

describe('raias (swimlanes)', () => {
  /* Fluxo com 3 papéis: Solicitante preenche → Aprovador decide → Sistema formaliza. */
  const fluxo = (): FlowGraph => g(
    [
      { id: 'start', type: 'start' },
      { id: 'preencher', type: 'userTask', name: 'Preencher', lane: 'Solicitante' },
      { id: 'gw', type: 'exclusiveGateway', name: 'Aprova?' },
      { id: 'aprovar', type: 'userTask', name: 'Aprovar', lane: 'Aprovador' },
      { id: 'criar', type: 'serviceTask', name: 'Criar contrato', lane: 'Sistema' },
      { id: 'end', type: 'end' },
    ],
    [
      { id: 'e1', from: 'start', to: 'preencher' },
      { id: 'e2', from: 'preencher', to: 'gw' },
      { id: 'e3', from: 'gw', to: 'aprovar' },
      { id: 'e4', from: 'aprovar', to: 'criar' },
      { id: 'e5', from: 'criar', to: 'end' },
    ],
  )
  const bandaDe = (L: ReturnType<typeof layoutGraph>, id: string) =>
    L.lanes!.find((b) => { const p = L.nodes[id]; const c = p.y + p.h / 2; return c >= b.y && c < b.y + b.h })

  it('uma banda por papel, na ordem em que APARECEM no fluxo', () => {
    const L = layoutGraph(fluxo(), undefined, { swimlanes: true })
    expect(L.lanes!.map((b) => b.label)).toEqual(['Solicitante', 'Aprovador', 'Sistema'])
  })

  it('cada atividade cai na banda do seu papel', () => {
    const L = layoutGraph(fluxo(), undefined, { swimlanes: true })
    expect(bandaDe(L, 'preencher')!.label).toBe('Solicitante')
    expect(bandaDe(L, 'aprovar')!.label).toBe('Aprovador')
    expect(bandaDe(L, 'criar')!.label).toBe('Sistema')
  })

  it('gateway HERDA a raia do antecessor (fica na banda de quem decide)', () => {
    const L = layoutGraph(fluxo(), undefined, { swimlanes: true })
    expect(bandaDe(L, 'gw')!.label).toBe('Solicitante') // vem de "Preencher"
  })

  it('atividade sem executor vai para a raia "Sem responsável"', () => {
    const graph = g(
      [ { id: 'start', type: 'start' }, { id: 'a', type: 'userTask', name: 'A', lane: LANE_SEM_RESPONSAVEL }, { id: 'end', type: 'end' } ],
      [ { id: 'e1', from: 'start', to: 'a' }, { id: 'e2', from: 'a', to: 'end' } ],
    )
    const L = layoutGraph(graph, undefined, { swimlanes: true })
    expect(L.lanes!.map((b) => b.label)).toContain(LANE_SEM_RESPONSAVEL)
  })

  it('as bandas se encostam sem buraco nem sobreposição, e nenhum nó vaza da sua', () => {
    const L = layoutGraph(fluxo(), undefined, { swimlanes: true })
    for (let i = 1; i < L.lanes!.length; i++) {
      expect(L.lanes![i].y).toBe(L.lanes![i - 1].y + L.lanes![i - 1].h) // encostadas
    }
    for (const id of Object.keys(L.nodes)) {
      const b = bandaDe(L, id)!, p = L.nodes[id]
      expect(p.y).toBeGreaterThanOrEqual(b.y)
      expect(p.y + p.h).toBeLessThanOrEqual(b.y + b.h)
    }
  })

  /* A faixa de ramificação é um offset GLOBAL e fica esparsa dentro de uma banda.
     Sem compactar, uma banda com nós nas faixas -3 e +4 virava 8 linhas para 2 cartões
     — que foi o desenho cheio de vazio que o PO mostrou. */
  it('a banda usa só as linhas que precisa (faixas esparsas compactam)', () => {
    /* Fluxo largo: um paralelo abre 4 ramos, e o 1º e o 4º voltam ao MESMO papel.
       As faixas deles ficam distantes; a banda tem de ter 2 linhas, não 4+. */
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'p', type: 'parallelGateway', name: 'Em paralelo' },
        { id: 'a', type: 'userTask', name: 'A', lane: 'Fulano' },
        { id: 'b', type: 'userTask', name: 'B', lane: 'Outro 1' },
        { id: 'c', type: 'userTask', name: 'C', lane: 'Outro 2' },
        { id: 'd', type: 'userTask', name: 'D', lane: 'Fulano' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e0', from: 'start', to: 'p' },
        { id: 'e1', from: 'p', to: 'a' }, { id: 'e2', from: 'p', to: 'b' },
        { id: 'e3', from: 'p', to: 'c' }, { id: 'e4', from: 'p', to: 'd' },
        { id: 'e5', from: 'a', to: 'end' }, { id: 'e6', from: 'b', to: 'end' },
        { id: 'e7', from: 'c', to: 'end' }, { id: 'e8', from: 'd', to: 'end' },
      ],
    )
    const L = layoutGraph(graph, undefined, { swimlanes: true })
    // A e D estão em faixas de ramificação DISTANTES (extremos do leque)
    const intervaloCru = Math.abs(L.nodes.a.lane - L.nodes.d.lane) + 1
    expect(intervaloCru).toBeGreaterThan(2)
    // a banda não herda esse intervalo — as linhas são empacotadas
    const banda = L.lanes!.find((x) => x.label === 'Fulano')!
    const alturaDeUmaLinha = L.nodes.a.h + 22
    expect(banda.h).toBeLessThan(intervaloCru * alturaDeUmaLinha)
    // A e D estão na MESMA coluna, então continuam em linhas diferentes (sem sobrepor)
    expect(L.nodes.a.x).toBeCloseTo(L.nodes.d.x)
    expect(L.nodes.a.y).not.toBeCloseTo(L.nodes.d.y)
  })

  /* O que o PO chamou de "justificar": nós do mesmo papel em COLUNAS diferentes não
     precisam de linhas diferentes — a vertical dentro da banda não significa nada. */
  it('nós do mesmo papel em colunas diferentes DIVIDEM a linha', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'userTask', name: 'A', lane: 'Solicitante' },
        { id: 'meio', type: 'userTask', name: 'Meio', lane: 'Outro' },
        { id: 'z', type: 'userTask', name: 'Z', lane: 'Solicitante' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'a' },
        { id: 'e2', from: 'a', to: 'meio' },
        { id: 'e3', from: 'meio', to: 'z' },
        { id: 'e4', from: 'z', to: 'end' },
      ],
    )
    const L = layoutGraph(graph, undefined, { swimlanes: true })
    expect(L.nodes.z.x).toBeGreaterThan(L.nodes.a.x)          // colunas diferentes
    expect(L.nodes.a.y).toBeCloseTo(L.nodes.z.y)              // mesma linha
    const banda = L.lanes!.find((b) => b.label === 'Solicitante')!
    expect(banda.h).toBeLessThan(2 * (L.nodes.a.h + 22))      // uma linha só
  })

  it('banda só de losangos não herda a altura do cartão mais alto do fluxo', () => {
    const graph = g(
      [
        { id: 'start', type: 'start' },
        { id: 'grande', type: 'userTask', name: 'a'.repeat(60), lane: 'Solicitante' },
        { id: 'gw', type: 'exclusiveGateway', name: 'Decide?', lane: 'Comitê' },
        { id: 'end', type: 'end' },
      ],
      [
        { id: 'e1', from: 'start', to: 'grande' },
        { id: 'e2', from: 'grande', to: 'gw' },
        { id: 'e3', from: 'gw', to: 'end' },
      ],
    )
    const L = layoutGraph(graph, undefined, { swimlanes: true })
    const doCartao = L.lanes!.find((b) => b.label === 'Solicitante')!
    const doLosango = L.lanes!.find((b) => b.label === 'Comitê')!
    expect(doLosango.h).toBeLessThan(doCartao.h)
  })

  describe('ordem escolhida pelo usuário', () => {
    it('a ordem manual vence a ordem de aparição, e as atividades vão junto', () => {
      const auto = layoutGraph(fluxo(), undefined, { swimlanes: true })
      expect(auto.lanes!.map((b) => b.label)).toEqual(['Solicitante', 'Aprovador', 'Sistema'])

      const L = layoutGraph(fluxo(), undefined, { swimlanes: true, laneOrder: ['Sistema', 'Aprovador', 'Solicitante'] })
      expect(L.lanes!.map((b) => b.label)).toEqual(['Sistema', 'Aprovador', 'Solicitante'])
      // a atividade do Sistema, que era a última, passou a ficar ACIMA das outras
      expect(L.nodes.criar.y).toBeLessThan(L.nodes.preencher.y)
      expect(L.nodes.criar.y).toBeLessThan(L.nodes.aprovar.y)
      // e cada nó continua dentro da banda do seu papel
      expect(bandaDe(L, 'criar')!.label).toBe('Sistema')
      expect(bandaDe(L, 'preencher')!.label).toBe('Solicitante')
    })

    it('chave que não existe mais é ignorada e raia nova entra no fim', () => {
      const L = layoutGraph(fluxo(), undefined, {
        swimlanes: true,
        laneOrder: ['Papel apagado', 'Sistema', 'Solicitante'], // sem "Aprovador"
      })
      // a inexistente some; a que ficou de fora da lista entra depois das escolhidas
      expect(L.lanes!.map((b) => b.label)).toEqual(['Sistema', 'Solicitante', 'Aprovador'])
    })

    it('as bandas continuam encostadas depois de reordenar', () => {
      const L = layoutGraph(fluxo(), undefined, { swimlanes: true, laneOrder: ['Sistema', 'Solicitante', 'Aprovador'] })
      for (let i = 1; i < L.lanes!.length; i++) {
        expect(L.lanes![i].y).toBe(L.lanes![i - 1].y + L.lanes![i - 1].h)
      }
    })
  })

  it('o desenho abre espaço à esquerda para o rótulo da raia', () => {
    const L = layoutGraph(fluxo(), undefined, { swimlanes: true })
    for (const p of Object.values(L.nodes)) expect(p.x).toBeGreaterThanOrEqual(LANE_HEADER_W)
  })

  /* Arrastar continua valendo com raia — organizar o desenho é legítimo. O que não pode
     é o cartão sair da faixa dele: pousado na banda de outro papel, o desenho mentiria
     sobre quem executa, que é justamente o que a raia existe para evitar. */
  it('com raias o arrasto é LIVRE na horizontal', () => {
    const L = layoutGraph(fluxo(), { aprovar: { x: 999, y: 0 } }, { swimlanes: true })
    expect(L.nodes.aprovar.x).toBe(999)
    expect(L.width).toBeGreaterThan(999) // o desenho cresce para acomodar
  })

  it('com raias o arrasto é PRESO à banda na vertical', () => {
    const alvo = layoutGraph(fluxo(), undefined, { swimlanes: true }).lanes!.find((b) => b.label === 'Aprovador')!

    // puxar muito para CIMA (para dentro da banda de outro papel) para no topo da própria
    const acima = layoutGraph(fluxo(), { aprovar: { x: 300, y: -5000 } }, { swimlanes: true })
    expect(acima.nodes.aprovar.y).toBeGreaterThanOrEqual(alvo.y)
    expect(bandaDe(acima, 'aprovar')!.label).toBe('Aprovador')

    // puxar muito para BAIXO para na base da própria banda
    const abaixo = layoutGraph(fluxo(), { aprovar: { x: 300, y: 5000 } }, { swimlanes: true })
    const p = abaixo.nodes.aprovar
    expect(p.y + p.h).toBeLessThanOrEqual(alvo.y + alvo.h)
    expect(bandaDe(abaixo, 'aprovar')!.label).toBe('Aprovador')
  })

  it('com raias o nó não invade a coluna do rótulo', () => {
    const L = layoutGraph(fluxo(), { aprovar: { x: -500, y: 0 } }, { swimlanes: true })
    expect(L.nodes.aprovar.x).toBeGreaterThanOrEqual(LANE_HEADER_W)
  })

  it('fluxo sem nenhuma atividade não quebra: uma banda só', () => {
    const graph = g([ { id: 'start', type: 'start' }, { id: 'end', type: 'end' } ], [ { id: 'e1', from: 'start', to: 'end' } ])
    const L = layoutGraph(graph, undefined, { swimlanes: true })
    expect(L.lanes).toHaveLength(1)
  })
})
