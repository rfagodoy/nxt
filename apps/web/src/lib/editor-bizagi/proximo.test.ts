import { describe, expect, it } from 'vitest'
import { GRADE } from '@/lib/desenho-bpmn'
import { nodeSize } from '@/lib/flow-layout'
import { PROXIMOS, caixaReal, lugarDoProximo } from './proximo'

const naGrade = (v: number) => Math.round(v / GRADE) * GRADE

describe('PROXIMOS', () => {
  it('são os 5 itens do mockup, em dois grupos', () => {
    expect(PROXIMOS.map((g) => g.map((i) => i.nome))).toEqual([
      ['Tarefa de usuário', 'Escolha', 'Temporizador'],
      ['Subprocesso', 'Fim'],
    ])
    expect(PROXIMOS[0][0]).toMatchObject({ tipo: 'userTask', variante: 'usuario' })
    expect(PROXIMOS[1][1]).toMatchObject({ tipo: 'end', variante: 'simples' })
  })
})

describe('caixaReal', () => {
  it('usa o tamanho gravado da tarefa e o padrão do resto', () => {
    expect(caixaReal({ id: 'a', type: 'userTask' }, { x: 10, y: 20 }, { a: { largura: 256, altura: 112 } }))
      .toEqual({ id: 'a', x: 10, y: 20, largura: 256, altura: 112 })
    expect(caixaReal({ id: 'g', type: 'exclusiveGateway' }, { x: 0, y: 0 }, { g: { largura: 300, altura: 300 } }))
      .toEqual({ id: 'g', x: 0, y: 0, largura: 56, altura: 56 })
  })
})

describe('lugarDoProximo', () => {
  const tarefa = nodeSize({ id: 'a', type: 'userTask' }, 0, 0)
  const nos = [{ id: 'a', type: 'userTask' }]

  it('à direita da base, centrado na altura dela', () => {
    const p = lugarDoProximo('a', { tipo: 'exclusiveGateway' }, nos, { a: { x: 0, y: 160 } }, {})
    expect(p).toEqual({ x: naGrade(tarefa.w + 4 * GRADE), y: naGrade(160 + tarefa.h / 2 - 28) })
  })

  it('a base redimensionada empurra a forma nova', () => {
    const p = lugarDoProximo('a', { tipo: 'end' }, nos, { a: { x: 0, y: 0 } }, { a: { largura: 320, altura: 96 } })
    expect(p).toEqual({ x: naGrade(320 + 4 * GRADE), y: naGrade(48 - 28) })
  })

  it('lugar ocupado: desce', () => {
    const livre = lugarDoProximo('a', { tipo: 'exclusiveGateway' }, nos, { a: { x: 0, y: 160 } }, {})!
    const p = lugarDoProximo('a', { tipo: 'exclusiveGateway' },
      [...nos, { id: 'g', type: 'exclusiveGateway' }], { a: { x: 0, y: 160 }, g: livre }, {})
    expect(p).toEqual({ x: livre.x, y: livre.y + 6 * GRADE })
  })

  it('sem posição da base: null', () => {
    expect(lugarDoProximo('a', { tipo: 'end' }, nos, {}, {})).toBeNull()
  })
})
