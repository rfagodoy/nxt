import { describe, it, expect } from 'vitest'
import { abasDaAtividade } from './screen-task'

describe('abasDaAtividade', () => {
  it('sem tela não há abas; sem adicionais há só a principal', () => {
    expect(abasDaAtividade({})).toEqual([])
    expect(abasDaAtividade({ screenRef: 'a', entityMode: 'EDIT' })).toEqual([{ screenRef: 'a', editavel: true, principal: true }])
  })

  it('adicionais vêm depois da principal, cada uma com o seu modo', () => {
    expect(abasDaAtividade({
      screenRef: 'a', entityMode: 'CREATE',
      extraScreens: [{ screenRef: 'b', mode: 'VIEW' }, { screenRef: 'c', mode: 'EDIT' }],
    })).toEqual([
      { screenRef: 'a', editavel: true, principal: true },
      { screenRef: 'b', editavel: false, principal: false },
      { screenRef: 'c', editavel: true, principal: false },
    ])
  })

  it('atividade de CONSULTA: nenhuma aba edita', () => {
    const abas = abasDaAtividade({ screenRef: 'a', entityMode: 'VIEW', extraScreens: [{ screenRef: 'b', mode: 'EDIT' }] })
    expect(abas.map((x) => x.editavel)).toEqual([false, false])
  })

  it('tela repetida (inclusive a principal) entra uma vez só', () => {
    const abas = abasDaAtividade({ screenRef: 'a', extraScreens: [{ screenRef: 'a', mode: 'EDIT' }, { screenRef: 'b', mode: 'EDIT' }, { screenRef: 'b', mode: 'VIEW' }] })
    expect(abas.map((x) => x.screenRef)).toEqual(['a', 'b'])
  })
})
