import { describe, expect, it } from 'vitest'
import { telasDaTarefa } from '../index'

const ordem = (t: ReturnType<typeof telasDaTarefa>) => t.map(x => `${x.screenRef}${x.aberta ? '' : '(fechada)'}`)

describe('telasDaTarefa', () => {
  it('sem configuração: a ordem de antes, todas abertas', () => {
    expect(ordem(telasDaTarefa({ screenRef: 'a', extraScreens: [{ screenRef: 'b', mode: 'VIEW' }, { screenRef: 'c', mode: 'EDIT' }] })))
      .toEqual(['a', 'b', 'c'])
    expect(telasDaTarefa({})).toEqual([])
  })

  it('a principal vai para a posição configurada', () => {
    const step = { screenRef: 'a', extraScreens: [{ screenRef: 'b', mode: 'VIEW' as const }, { screenRef: 'c', mode: 'EDIT' as const }] }
    expect(ordem(telasDaTarefa({ ...step, posicaoDaPrincipal: 1 }))).toEqual(['b', 'a', 'c'])
    expect(ordem(telasDaTarefa({ ...step, posicaoDaPrincipal: 2 }))).toEqual(['b', 'c', 'a'])
    expect(ordem(telasDaTarefa({ ...step, posicaoDaPrincipal: 9 }))).toEqual(['b', 'c', 'a'])
    expect(ordem(telasDaTarefa({ ...step, posicaoDaPrincipal: -3 }))).toEqual(['a', 'b', 'c'])
  })

  it('cada tela começa aberta ou fechada como configurado', () => {
    const t = telasDaTarefa({ screenRef: 'a', principalFechada: true, extraScreens: [{ screenRef: 'b', mode: 'VIEW', fechada: true }, { screenRef: 'c', mode: 'EDIT' }] })
    expect(ordem(t)).toEqual(['a(fechada)', 'b(fechada)', 'c'])
    expect(t.find(x => x.principal)?.screenRef).toBe('a')
  })

  it('mantém quem edita e quem consulta (atividade de consulta: ninguém edita)', () => {
    const t = telasDaTarefa({ screenRef: 'a', entityMode: 'VIEW', extraScreens: [{ screenRef: 'b', mode: 'EDIT' }] })
    expect(t.map(x => x.editavel)).toEqual([false, false])
  })
})
