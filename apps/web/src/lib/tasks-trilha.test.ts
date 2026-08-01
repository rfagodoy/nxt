import { describe, it, expect } from 'vitest'
import { agruparPassos, type TimelineTask } from './tasks-ui'

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
