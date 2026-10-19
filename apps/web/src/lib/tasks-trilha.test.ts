import { describe, it, expect } from 'vitest'
import { agruparEtapas, agruparPassos, type TimelineTask } from './tasks-ui'

const t = (id: string, nodeId: string, status: string, name: string, completedBy?: string): TimelineTask =>
  ({ id, nodeId, status, name, completedBy: completedBy ?? null })

describe('agruparPassos — trilha "Onde você está"', () => {
  it('mantém a ordem em que as etapas apareceram', () => {
    const passos = agruparPassos(
      [t('1', 'preencher', 'DONE', 'Preencher dados'), t('2', 'aprovar', 'PENDING', 'Aprovar')],
      '2',
    )
    expect(passos.map((p) => p.nodeId)).toEqual(['preencher', 'aprovar'])
  })

  it('marca como ATUAL a tarefa aberta e como CONCLUÍDA a que já passou', () => {
    const passos = agruparPassos(
      [t('1', 'preencher', 'DONE', 'Preencher dados', 'João'), t('2', 'aprovar', 'PENDING', 'Aprovar')],
      '2',
    )
    expect(passos[0]).toMatchObject({ situacao: 'done', completedBy: 'João', passagens: 1 })
    expect(passos[1]).toMatchObject({ situacao: 'current', passagens: 1 })
  })

  it('etapa reaberta por devolução NÃO vira linha nova — vira "2ª vez"', () => {
    // preencher (concluída) → aprovar (devolvida) → preencher de novo (aberta agora)
    const passos = agruparPassos(
      [
        t('1', 'preencher', 'DONE', 'Preencher dados', 'João'),
        t('2', 'aprovar', 'RETURNED', 'Aprovar', 'Maria'),
        t('3', 'preencher', 'PENDING', 'Preencher dados'),
      ],
      '3',
    )
    expect(passos).toHaveLength(2)
    expect(passos[0]).toMatchObject({ nodeId: 'preencher', situacao: 'current', passagens: 2 })
    expect(passos[1]).toMatchObject({ nodeId: 'aprovar', passagens: 1 })
  })

  it('a trilha não cresce com o histórico: 3 devoluções continuam sendo 2 etapas', () => {
    const timeline: TimelineTask[] = []
    for (let i = 0; i < 3; i++) {
      timeline.push(t(`p${i}`, 'preencher', 'DONE', 'Preencher dados', 'João'))
      timeline.push(t(`a${i}`, 'aprovar', 'RETURNED', 'Aprovar', 'Maria'))
    }
    timeline.push(t('final', 'preencher', 'PENDING', 'Preencher dados'))
    const passos = agruparPassos(timeline, 'final')
    expect(passos).toHaveLength(2)
    expect(passos[0].passagens).toBe(4)
  })

  it('guarda o nome de quem concluiu a passagem mais RECENTE', () => {
    const passos = agruparPassos(
      [
        t('1', 'preencher', 'DONE', 'Preencher dados', 'João'),
        t('2', 'preencher', 'DONE', 'Preencher dados', 'Ana'),
        t('3', 'aprovar', 'PENDING', 'Aprovar'),
      ],
      '3',
    )
    expect(passos[0].completedBy).toBe('Ana')
  })

  it('etapa sem nome não quebra a trilha', () => {
    const passos = agruparPassos([{ id: '1', nodeId: 'x', status: 'PENDING' }], '1')
    expect(passos[0].name).toBe('Etapa')
  })
})

describe('agruparEtapas — frentes em paralelo contam como uma etapa', () => {
  it('junta as etapas nascidas no mesmo lote e mantém a ordem', () => {
    const lote = '2026-10-18T22:06:16.122Z'
    const passos = agruparPassos([
      { id: '1', nodeId: 'a', status: 'DONE', createdAt: '2026-10-18T22:00:00.000Z' },
      { id: '2', nodeId: 'b', status: 'PENDING', createdAt: lote },
      { id: '3', nodeId: 'c', status: 'PENDING', createdAt: lote },
      { id: '4', nodeId: 'd', status: 'PENDING', createdAt: lote },
    ], '3')
    const grupos = agruparEtapas(passos)
    expect(grupos.map((g) => g.map((p) => p.nodeId))).toEqual([['a'], ['b', 'c', 'd']])
  })

  it('sem createdAt cada etapa fica sozinha (como era)', () => {
    const grupos = agruparEtapas(agruparPassos([
      { id: '1', nodeId: 'a', status: 'DONE' },
      { id: '2', nodeId: 'b', status: 'PENDING' },
    ], '2'))
    expect(grupos).toHaveLength(2)
  })

  it('devolução não separa a etapa do lote da primeira passagem', () => {
    const lote = '2026-10-18T22:06:16.122Z'
    const grupos = agruparEtapas(agruparPassos([
      { id: '1', nodeId: 'b', status: 'DONE', createdAt: lote },
      { id: '2', nodeId: 'c', status: 'DONE', createdAt: lote },
      { id: '3', nodeId: 'b', status: 'PENDING', createdAt: '2026-10-19T10:00:00.000Z' },
    ], '3'))
    expect(grupos.map((g) => g.map((p) => p.nodeId))).toEqual([['b', 'c']])
  })
})
