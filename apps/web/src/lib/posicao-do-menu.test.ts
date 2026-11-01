import { describe, it, expect } from 'vitest'
import { posicaoDoMenu } from './posicao-do-menu'

const janela = { largura: 1280, altura: 800 }
const caixa = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height })

describe('posicaoDoMenu', () => {
  it('embaixo do botão, alinhado pela borda pedida (como sempre)', () => {
    const p = posicaoDoMenu({ ancora: caixa(1100, 10, 40, 30), menu: { largura: 300, altura: 400 }, janela, align: 'end' })
    expect(p).toEqual({ top: 44, left: 840 })
  })

  it('sem espaço embaixo e com espaço em cima: abre para cima', () => {
    const p = posicaoDoMenu({ ancora: caixa(100, 700, 40, 30), menu: { largura: 200, altura: 300 }, janela })
    expect(p.top).toBe(700 - 4 - 300)
  })

  describe('lado esquerdo (submenu)', () => {
    it('abre à esquerda do item, com o topo alinhado ao dele', () => {
      const p = posicaoDoMenu({ ancora: caixa(970, 150, 290, 36), menu: { largura: 248, altura: 360 }, janela, lado: 'esquerda' })
      expect(p).toEqual({ top: 150, left: 970 - 4 - 248 })
    })

    it('sem espaço à esquerda: abre à direita', () => {
      const p = posicaoDoMenu({ ancora: caixa(20, 150, 290, 36), menu: { largura: 248, altura: 360 }, janela, lado: 'esquerda' })
      expect(p).toEqual({ top: 150, left: 20 + 290 + 4 })
    })

    it('sem espaço dos dois lados (celular): abre embaixo do item', () => {
      const p = posicaoDoMenu({ ancora: caixa(16, 150, 340, 36), menu: { largura: 248, altura: 360 }, janela: { largura: 375, altura: 800 }, lado: 'esquerda' })
      expect(p).toEqual({ top: 150 + 36 + 4, left: 16 })
    })

    it('perto do pé da janela: sobe o necessário para caber', () => {
      const p = posicaoDoMenu({ ancora: caixa(970, 600, 290, 36), menu: { largura: 248, altura: 360 }, janela, lado: 'esquerda' })
      expect(p.top).toBe(800 - 8 - 360)
    })
  })
})
