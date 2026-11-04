import { describe, expect, it } from 'vitest'
import type { DesenhoV2, FormaDesenho } from '@nxt/types'
import { LAYOUT_PADRAO } from '@nxt/workflow-core'
import { apagarForma } from '@/lib/desenho-bpmn'
import {
  adicionarFase, adicionarPiscinaExterna, apagarMensagem, atualizarPiscinaExterna, larguraDaPiscina, layoutDe, ligarMensagem,
  mudarOrientacao, podeLigarMensagem, prazoDaFase, redimensionarFase, redimensionarForma, removerFase, removerPiscinaExterna,
  renomearFase, rotularMensagem,
} from './layout'

const forma = (id: string, tipo: string): FormaDesenho => ({ id, tipo } as FormaDesenho)
const doc = (): DesenhoV2 => ({
  versao: 2,
  formas: [forma('ini', 'start'), forma('a1', 'userTask'), forma('a2', 'serviceTask'), forma('g', 'exclusive'), forma('fim', 'end')],
  setas: [{ id: 's1', de: 'ini', para: 'a1' }],
  posicoes: {},
  raias: [],
})
let n = 0
const ids = () => 'id' + ++n
const comExterna = () => adicionarPiscinaExterna(doc(), () => 'ext1')

describe('layoutDe e orientação', () => {
  it('layoutDe devolve o padrão quando não há layout', () => {
    expect(layoutDe(doc())).toBe(LAYOUT_PADRAO)
  })
  it('mudarOrientacao grava layout completo; igual devolve o mesmo d', () => {
    const d = doc()
    expect(mudarOrientacao(d, 'horizontal')).toBe(d)
    const v = mudarOrientacao(d, 'vertical')
    expect(v.layout).toEqual({ ...LAYOUT_PADRAO, orientacao: 'vertical' })
    expect(mudarOrientacao(v, 'vertical')).toBe(v)
  })
  it('mudarOrientacao de volta ao padrão tira o layout (H→V→H não deixa "Não salvo")', () => {
    const d = doc()
    const ida = mudarOrientacao(d, 'vertical')
    const volta = mudarOrientacao(ida, 'horizontal')
    expect(volta.layout).toBeUndefined()
    expect('layout' in volta).toBe(false)
    expect(volta).toEqual(d)
  })
  it('mudarOrientacao de volta ao horizontal mantém o layout que tem outra coisa (fase)', () => {
    const comFase = adicionarFase(mudarOrientacao(doc(), 'vertical'), { gerarId: ids })
    expect(mudarOrientacao(comFase, 'horizontal').layout?.orientacao).toBe('horizontal')
  })
})

describe('fases', () => {
  it('sem fases cria "Fase 1" ocupando a área das formas (raia menos o rótulo) e a "Nova fase"', () => {
    const d = adicionarFase(doc(), { gerarId: ids })
    expect(layoutDe(d).fases.map((f) => [f.nome, f.largura])).toEqual([['Fase 1', 1280 - 160], ['Nova fase', 320]])
    expect(layoutDe(d).larguraPiscina).toBeUndefined()
    const l = larguraDaPiscina(doc(), 1600)
    expect(layoutDe(adicionarFase(l, { gerarId: ids })).fases[0].largura).toBe(1600 - 160)
  })
  it('com a largura mostrada, a "Fase 1" fica com ela e a piscina é presa nela', () => {
    const d = adicionarFase(doc(), { larguraAtual: 960, gerarId: ids })
    expect(layoutDe(d).fases[0].largura).toBe(800)
    expect(layoutDe(d).larguraPiscina).toBe(960)
  })
  it('com fases acrescenta "Nova fase" de 320', () => {
    const d = adicionarFase(adicionarFase(doc(), { gerarId: ids }), { gerarId: ids })
    expect(layoutDe(d).fases).toHaveLength(3)
    expect(layoutDe(d).fases[2]).toMatchObject({ nome: 'Nova fase', largura: 320 })
  })
  it('renomear: nome em branco ou igual devolve o mesmo d', () => {
    const d = adicionarFase(doc(), { gerarId: ids })
    const [f1] = layoutDe(d).fases
    expect(renomearFase(d, f1.id, '  ')).toBe(d)
    expect(renomearFase(d, f1.id, 'Fase 1')).toBe(d)
    expect(renomearFase(d, 'nada', 'x')).toBe(d)
    expect(layoutDe(renomearFase(d, f1.id, ' Análise ')).fases[0].nome).toBe('Análise')
  })
  it('redimensionar: mínimo 160, na grade', () => {
    const d = adicionarFase(doc(), { gerarId: ids })
    const id = layoutDe(d).fases[1].id
    expect(layoutDe(redimensionarFase(d, id, 50)).fases[1].largura).toBe(160)
    expect(layoutDe(redimensionarFase(d, id, 405)).fases[1].largura).toBe(400)
    expect(redimensionarFase(d, id, 320)).toBe(d)
  })
  it('removerFase e prazoDaFase', () => {
    const d = adicionarFase(doc(), { gerarId: ids })
    const id = layoutDe(d).fases[1].id
    const p = prazoDaFase(d, id, 5)
    expect(layoutDe(p).fases[1].prazoDiasUteis).toBe(5)
    expect(prazoDaFase(p, id, 5)).toBe(p)
    expect('prazoDiasUteis' in layoutDe(prazoDaFase(p, id)).fases[1]).toBe(false)
    expect(layoutDe(removerFase(d, id)).fases).toHaveLength(1)
    expect(removerFase(d, 'nada')).toBe(d)
  })
})

describe('piscinas externas', () => {
  it('adicionar usa os valores padrão', () => {
    expect(layoutDe(comExterna()).piscinasExternas).toEqual([{ id: 'ext1', nome: 'Participante externo', altura: 96, quem: 'contratada', canal: 'portal' }])
  })
  it('atualizar muda campos; sem mudança devolve o mesmo d', () => {
    const d = comExterna()
    expect(atualizarPiscinaExterna(d, 'ext1', { canal: 'portal' })).toBe(d)
    expect(atualizarPiscinaExterna(d, 'x', { canal: 'email' })).toBe(d)
    expect(layoutDe(atualizarPiscinaExterna(d, 'ext1', { canal: 'email', nome: 'Órgão' })).piscinasExternas[0]).toMatchObject({ canal: 'email', nome: 'Órgão' })
  })
  it('removerPiscinaExterna leva os fluxos dela', () => {
    let d = ligarMensagem(comExterna(), 'a1', 'ext1', () => 'm1')
    d = ligarMensagem(d, 'ext1', 'a2', () => 'm2')
    d = adicionarPiscinaExterna(d, () => 'ext2')
    d = ligarMensagem(d, 'a1', 'ext2', () => 'm3')
    const r = removerPiscinaExterna(d, 'ext1')
    expect(layoutDe(r).fluxosMensagem.map((m) => m.id)).toEqual(['m3'])
    expect(layoutDe(r).piscinasExternas.map((p) => p.id)).toEqual(['ext2'])
    expect(removerPiscinaExterna(d, 'nada')).toBe(d)
  })
})

describe('fluxos de mensagem', () => {
  it('podeLigarMensagem recusa com as frases exatas', () => {
    const d = ligarMensagem(comExterna(), 'a1', 'ext1', () => 'm1')
    const piscinas = 'Fluxo de mensagem liga piscinas diferentes. Dentro da mesma piscina, use Sequência.'
    expect(podeLigarMensagem(d, 'a1', 'a1')).toBe(piscinas)
    expect(podeLigarMensagem(d, 'a1', 'a2')).toBe(piscinas)
    expect(podeLigarMensagem(d, 'a1', 'ext1')).toBe('Já existe um fluxo de mensagem entre esses dois.')
    expect(podeLigarMensagem(d, 'ext1', 'a1')).toBeNull()
    expect(podeLigarMensagem(d, 'a2', 'ext1')).toBeNull()
  })
  it('ligar acrescenta; recusado devolve o mesmo d', () => {
    const d = comExterna()
    expect(ligarMensagem(d, 'a1', 'a2')).toBe(d)
    const l = ligarMensagem(d, 'a1', 'ext1', () => 'm1')
    expect(layoutDe(l).fluxosMensagem).toEqual([{ id: 'm1', de: 'a1', para: 'ext1' }])
    expect(ligarMensagem(l, 'a1', 'ext1')).toBe(l)
  })
  it('rotular e apagar', () => {
    const d = ligarMensagem(comExterna(), 'a1', 'ext1', () => 'm1')
    const r = rotularMensagem(d, 'm1', ' Envia minuta ')
    expect(layoutDe(r).fluxosMensagem[0].rotulo).toBe('Envia minuta')
    expect(rotularMensagem(r, 'm1', 'Envia minuta')).toBe(r)
    expect('rotulo' in layoutDe(rotularMensagem(r, 'm1', '')).fluxosMensagem[0]).toBe(false)
    expect(rotularMensagem(d, 'm1', '')).toBe(d)
    expect(layoutDe(apagarMensagem(d, 'm1')).fluxosMensagem).toEqual([])
    expect(apagarMensagem(d, 'nada')).toBe(d)
  })
})

describe('tamanhos', () => {
  it('redimensionarForma: mínimo 128x64, na grade, só tipos que aceitam', () => {
    const d = doc()
    expect(layoutDe(redimensionarForma(d, 'a1', { largura: 10, altura: 10 })).tamanhos.a1).toEqual({ largura: 128, altura: 64 })
    expect(layoutDe(redimensionarForma(d, 'a2', { largura: 205, altura: 100 })).tamanhos.a2).toEqual({ largura: 208, altura: 96 })
    expect(redimensionarForma(d, 'g', { largura: 300, altura: 300 })).toBe(d)
    expect(redimensionarForma(d, 'nada', { largura: 300, altura: 300 })).toBe(d)
    const r = redimensionarForma(d, 'a1', { largura: 192, altura: 96 })
    expect(redimensionarForma(r, 'a1', { largura: 192, altura: 96 })).toBe(r)
  })
  it('subProcess é redimensionável', () => {
    const d = { ...doc(), formas: [forma('sp', 'subProcess')] }
    expect(layoutDe(redimensionarForma(d, 'sp', { largura: 400, altura: 200 })).tamanhos.sp).toEqual({ largura: 400, altura: 208 })
  })
  it('larguraDaPiscina: mínimo 640, na grade', () => {
    const d = doc()
    expect(layoutDe(larguraDaPiscina(d, 100)).larguraPiscina).toBe(640)
    expect(layoutDe(larguraDaPiscina(d, 1000)).larguraPiscina).toBe(1008)
    const l = larguraDaPiscina(d, 1008)
    expect(larguraDaPiscina(l, 1008)).toBe(l)
  })
})

describe('apagarForma com o layout', () => {
  it('apagarForma leva os fluxos de mensagem dela e o tamanho', () => {
    let d = ligarMensagem(comExterna(), 'a1', 'ext1', () => 'm1')
    d = ligarMensagem(d, 'ext1', 'a2', () => 'm2')
    d = redimensionarForma(d, 'a1', { largura: 192, altura: 96 })
    const r = apagarForma(d, 'a1')
    expect(layoutDe(r).fluxosMensagem.map((m) => m.id)).toEqual(['m2'])
    expect(layoutDe(r).tamanhos).toEqual({})
  })
  it('apagarForma sem layout não cria layout', () => {
    expect(apagarForma(doc(), 'a1').layout).toBeUndefined()
  })
  it('apagarForma apaga um Fim quando há outro', () => {
    const d = { ...doc(), formas: [...doc().formas, forma('fim2', 'end')] }
    expect(apagarForma(d, 'fim2').formas.map((f) => f.id)).not.toContain('fim2')
  })
  it('apagarForma apaga um Início quando há outro (a seta dele vai junto)', () => {
    const d = { ...doc(), formas: [...doc().formas, forma('ini2', 'start')], setas: [...doc().setas, { id: 'sx', de: 'ini2', para: 'a1' }] }
    const r = apagarForma(d, 'ini2')
    expect(r.formas.map((f) => f.id)).not.toContain('ini2')
    expect(r.setas.map((s) => s.id)).not.toContain('sx')
    expect(apagarForma(d, 'ini').formas.map((f) => f.id)).toContain('ini2')
  })
  it('apagarForma não apaga o último Fim nem o único Início', () => {
    const d = doc()
    expect(apagarForma(d, 'fim')).toBe(d)
    expect(apagarForma(d, 'ini')).toBe(d)
  })
})
