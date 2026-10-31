import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { desenhoParaBlocos, type ProblemaDoDesenho } from '../src/desenho-livre'

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const desenho = (formas: FormaDesenho[], setas: SetaDesenho[]): DesenhoV2 =>
  ({ versao: 2, formas: [F('start', 'start'), ...formas, F('end', 'end')], setas, posicoes: {}, raias: [] })
const recusa = (d: DesenhoV2): ProblemaDoDesenho => {
  const c = desenhoParaBlocos(d)
  if (c.ok) throw new Error('deveria recusar')
  return c.problemas[0]
}

describe('desenhoParaBlocos — recusas (frase e culpados)', () => {
  it('duas setas saindo de uma etapa', () => {
    const p = recusa(desenho([F('a1', 'userTask', { nome: 'Analisar' }), F('a2'), F('a3')], [
      S('start', 'a1'), S('a1', 'a2'), S('a1', 'a3'), S('a2', 'end'), S('a3', 'end'),
    ]))
    expect(p.tipo).toBe('saidas-multiplas')
    expect(p.mensagem).toBe('Saem 2 setas de "Analisar". Para decidir entre elas, use uma Escolha; para fazer as duas, um Ao mesmo tempo.')
    expect(p.formas).toEqual(['a1'])
    expect(p.setas).toEqual(['s_a1_a2', 's_a1_a3'])
  })
  it('losango + juntando caminhos de uma escolha', () => {
    const p = recusa(desenho([F('e1', 'exclusiveGateway'), F('a1'), F('a2'), F('P', 'parallelGateway')], [
      S('start', 'e1'), S('e1', 'a1', { condition: 'x' }), S('e1', 'a2', { condition: 'y' }), S('a1', 'P'), S('a2', 'P'), S('P', 'end'),
    ]))
    expect(p.tipo).toBe('juncao-de-escolha')
    expect(p.mensagem).toBe('A junção espera todas as setas, mas elas vêm de uma escolha: só um caminho acontece e o processo ficaria parado.')
    expect(p.formas).toEqual(['P'])
  })
  it('ramos de ao mesmo tempo chegando direto numa etapa', () => {
    const p = recusa(desenho([F('p1', 'parallelGateway'), F('a1'), F('a2'), F('a3', 'userTask', { nome: 'Arquivar' })], [
      S('start', 'p1'), S('p1', 'a1'), S('p1', 'a2'), S('a1', 'a3'), S('a2', 'a3'), S('a3', 'end'),
    ]))
    expect(p.tipo).toBe('ramos-sem-juncao')
    expect(p.mensagem).toBe('Junte os ramos com um losango +; sem ele, "Arquivar" seria criada duas vezes.')
    expect(p.formas).toEqual(['a3'])
  })
  it('ramos de ao mesmo tempo chegando num losango ×', () => {
    const p = recusa(desenho([F('p1', 'parallelGateway'), F('a1'), F('a2'), F('J', 'exclusiveGateway')], [
      S('start', 'p1'), S('p1', 'a1'), S('p1', 'a2'), S('a1', 'J'), S('a2', 'J'), S('J', 'end'),
    ]))
    expect(p.tipo).toBe('ramos-sem-juncao')
  })
  it('volta sem decisão', () => {
    const p = recusa(desenho([F('a1', 'userTask', { nome: 'Solicitar' }), F('a2')], [S('start', 'a1'), S('a1', 'a2'), S('a2', 'a1')]))
    expect(p.tipo).toBe('volta-sem-decisao')
    expect(p.mensagem).toBe('A volta para "Solicitar" não depende de decisão: o processo repetiria para sempre.')
  })
  it('caminho que salta o ponto de encontro', () => {
    const p = recusa(desenho([F('e1', 'exclusiveGateway'), F('a1'), F('a2'), F('J', 'exclusiveGateway'), F('a3')], [
      S('start', 'e1'), S('e1', 'a1', { condition: 'x' }), S('e1', 'a2', { condition: 'y' }), S('a1', 'J'), S('J', 'a3'), S('a2', 'a3'), S('a3', 'end'),
    ]))
    expect(p.tipo).toBe('salto-do-encontro')
    expect(p.mensagem).toBe('Este caminho salta para depois do ponto em que os caminhos se juntam. Ligue-o ao losango que junta.')
  })
  it('forma solta fora do fluxo', () => {
    const p = recusa(desenho([F('a1'), F('solta', 'userTask', { nome: 'Esquecida' })], [S('start', 'a1'), S('a1', 'end')]))
    expect(p.tipo).toBe('fora-do-fluxo')
    expect(p.formas).toEqual(['solta'])
  })
})
