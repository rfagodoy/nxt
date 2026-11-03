import { describe, expect, it } from 'vitest'
import type { PiscinaExterna } from '@nxt/types'
import { RAIA_ROTULO_W } from '@/lib/desenho-bpmn'
import {
  FAIXA_DO_NOME, FASE_ALTURA, INTERVALO_EXTERNAS, LARGURA_MINIMA_RAIA,
  alcaNaTela, alinharNaTela, faixasDoDesenho, faixasNaTela, pontoNaTela, rotaDaMensagem,
} from './faixas'
import { paraTela, type Caixa } from './geometria'

const raias = [{ id: 'r1', altura: 144 }, { id: 'r2', altura: 160 }]
const semNada = { fases: [], piscinasExternas: [] }
const externa = (id: string, altura = 96): PiscinaExterna => ({ id, nome: id, altura, quem: 'contratada', canal: 'portal' })

describe('faixasDoDesenho', () => {
  it('sem layout novo: raias empilhadas a partir de 0, piscina sem cabeçalho (o desenho de sempre)', () => {
    const f = faixasDoDesenho(raias, semNada, { direita: 800, fundo: 200 })
    expect(f.largura).toBe(RAIA_ROTULO_W + 800 + 160)
    expect(f.raias).toEqual([
      { id: 'r1', caixa: { x: -RAIA_ROTULO_W, y: 0, largura: f.largura, altura: 144 } },
      { id: 'r2', caixa: { x: -RAIA_ROTULO_W, y: 144, largura: f.largura, altura: 160 } },
    ])
    expect(f.piscina).toEqual({ x: -RAIA_ROTULO_W - FAIXA_DO_NOME, y: 0, largura: FAIXA_DO_NOME + f.largura, altura: 304 })
    expect(f.fases).toEqual([])
    expect(f.externas).toEqual([])
  })

  it('largura mínima sem formas', () => {
    expect(faixasDoDesenho(raias, semNada, { direita: 0, fundo: 0 }).largura).toBe(LARGURA_MINIMA_RAIA)
  })

  it('larguraPiscina gravada vence a automática, mas não corta as formas', () => {
    expect(faixasDoDesenho(raias, { ...semNada, larguraPiscina: 2000 }, { direita: 800, fundo: 0 }).largura).toBe(2000)
    expect(faixasDoDesenho(raias, { ...semNada, larguraPiscina: 640 }, { direita: 800, fundo: 0 }).largura).toBe(RAIA_ROTULO_W + 800 + 32)
  })

  it('fases: cabeçalho acima das raias, a última se estica até o fim da piscina', () => {
    const fases = [{ id: 'f1', nome: 'A', largura: 320 }, { id: 'f2', nome: 'B', largura: 160 }]
    const f = faixasDoDesenho(raias, { ...semNada, fases, larguraPiscina: 1200 }, { direita: 0, fundo: 0 })
    expect(f.piscina).toEqual({ x: -RAIA_ROTULO_W - FAIXA_DO_NOME, y: -FASE_ALTURA, largura: FAIXA_DO_NOME + 1200, altura: 304 + FASE_ALTURA })
    expect(f.fases[0]).toMatchObject({ id: 'f1', primeira: true, ultima: false, cabecalho: { x: 0, y: -FASE_ALTURA, largura: 320, altura: FASE_ALTURA } })
    expect(f.fases[1]).toMatchObject({ id: 'f2', ultima: true, cabecalho: { x: 320, largura: 1200 - RAIA_ROTULO_W - 320 } })
    expect(f.fases[1].coluna.altura).toBe(FASE_ALTURA + 304)
  })

  it('fases mais largas que a piscina a alargam', () => {
    const fases = [{ id: 'f1', nome: 'A', largura: 1280 }, { id: 'f2', nome: 'B', largura: 320 }]
    const f = faixasDoDesenho(raias, { ...semNada, fases }, { direita: 0, fundo: 0 })
    expect(f.largura).toBe(RAIA_ROTULO_W + 1600)
    expect(f.fases[1].cabecalho.largura).toBe(320)
  })

  it('sem raias, não há piscina nem fases', () => {
    const f = faixasDoDesenho([], { fases: [{ id: 'f1', nome: 'A', largura: 320 }], piscinasExternas: [] }, { direita: 0, fundo: 0 })
    expect(f.piscina).toBeNull()
    expect(f.fases).toEqual([])
  })

  it('piscinas externas embaixo da principal, com intervalo', () => {
    const f = faixasDoDesenho(raias, { fases: [], piscinasExternas: [externa('e1'), externa('e2', 64)] }, { direita: 0, fundo: 0 })
    expect(f.externas.map((e) => e.caixa)).toEqual([
      { x: -RAIA_ROTULO_W - FAIXA_DO_NOME, y: 304 + INTERVALO_EXTERNAS, largura: FAIXA_DO_NOME + f.largura, altura: 96 },
      { x: -RAIA_ROTULO_W - FAIXA_DO_NOME, y: 304 + 96 + 2 * INTERVALO_EXTERNAS, largura: FAIXA_DO_NOME + f.largura, altura: 64 },
    ])
  })
})

describe('faixasNaTela', () => {
  const f = faixasDoDesenho(raias, { fases: [{ id: 'f1', nome: 'A', largura: 320 }], piscinasExternas: [externa('e1')] }, { direita: 0, fundo: 0 })
  it('horizontal não muda nada', () => {
    expect(faixasNaTela(f, 'horizontal')).toBe(f)
  })
  it('vertical transpõe cada retângulo inteiro', () => {
    const v = faixasNaTela(f, 'vertical')
    expect(v.raias[1].caixa).toEqual({ x: 144, y: -RAIA_ROTULO_W, largura: 160, altura: f.largura })
    expect(v.fases[0].cabecalho).toEqual({ x: -FASE_ALTURA, y: 0, largura: FASE_ALTURA, altura: f.largura - RAIA_ROTULO_W })
    expect(v.piscina).toEqual({ x: -FASE_ALTURA, y: -RAIA_ROTULO_W - FAIXA_DO_NOME, largura: f.piscina!.altura, altura: f.piscina!.largura })
    expect(v.externas[0].caixa.x).toBe(f.externas[0].caixa.y)
  })
})

describe('tela', () => {
  it('pontoNaTela transpõe na vertical', () => {
    expect(pontoNaTela({ x: 3, y: 7 }, 'vertical')).toEqual({ x: 7, y: 3 })
    expect(pontoNaTela({ x: 3, y: 7 }, 'horizontal')).toEqual({ x: 3, y: 7 })
  })
  it('alcaNaTela troca os lados na vertical', () => {
    expect(alcaNaTela('s-r', 'vertical')).toBe('s-b')
    expect(alcaNaTela('e-l', 'vertical')).toBe('e-t')
    expect(alcaNaTela('s-b', 'vertical')).toBe('s-r')
    expect(alcaNaTela('e-t', 'vertical')).toBe('e-l')
    expect(alcaNaTela('s-r', 'horizontal')).toBe('s-r')
    expect(alcaNaTela('ligar', 'vertical')).toBe('ligar')
  })
})

describe('alinharNaTela', () => {
  const caixas: Caixa[] = [
    { id: 'a', x: 0, y: 0, largura: 190, altura: 64 },
    { id: 'b', x: 400, y: 96, largura: 56, altura: 56 },
  ]
  it('horizontal: o mesmo que alinhar', () => {
    expect(alinharNaTela(caixas, 'topo', 'horizontal')).toEqual({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } })
  })
  it('vertical: "topo" é o topo da TELA; volta em coordenadas lógicas', () => {
    const r = alinharNaTela(caixas, 'topo', 'vertical')
    const tela = (id: string) => paraTela({ ...caixas.find((c) => c.id === id)!, ...r[id] }, 'vertical')
    expect(tela('a').y).toBe(tela('b').y)
    // o outro eixo da tela não muda
    expect(tela('a').x).toBe(paraTela(caixas[0], 'vertical').x)
    expect(tela('b').x).toBe(paraTela(caixas[1], 'vertical').x)
  })
  it('vertical: centroX alinha os centros na tela', () => {
    const r = alinharNaTela(caixas, 'centroX', 'vertical')
    const cx = (id: string) => { const t = paraTela({ ...caixas.find((c) => c.id === id)!, ...r[id] }, 'vertical'); return t.x + t.largura / 2 }
    expect(cx('a')).toBeCloseTo(cx('b'))
  })
})

describe('rotaDaMensagem', () => {
  const forma = { caixa: { x: 100, y: 40, largura: 190, altura: 64 }, piscina: false }
  const pool = { caixa: { x: -188, y: 400, largura: 1000, altura: 96 }, piscina: true }
  it('forma → piscina embaixo: desce reto do centro da forma até o topo da piscina', () => {
    expect(rotaDaMensagem(forma, pool)).toEqual([{ x: 195, y: 104 }, { x: 195, y: 400 }])
  })
  it('piscina → forma: sobe da borda de cima da piscina até a base da forma', () => {
    expect(rotaDaMensagem(pool, forma)).toEqual([{ x: 195, y: 400 }, { x: 195, y: 104 }])
  })
  it('forma fora da piscina: o ponto na piscina fica preso ao corpo', () => {
    const longe = { caixa: { x: 2000, y: 40, largura: 56, altura: 56 }, piscina: false }
    const r = rotaDaMensagem(longe, pool)
    expect(r[r.length - 1]).toEqual({ x: -188 + 1000 - 10, y: 400 })
    expect(r).toHaveLength(4)
  })
})
