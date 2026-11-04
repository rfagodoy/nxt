import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { blocosParaDesenho, desenhoParaBlocos } from '../src/desenho-livre'
import { inserirItem, type FluxoBlocos, type ItemFluxo } from '../src/blocos'

/* Mudança de estrutura vinda dos blocos (excluir, incluir vinculada, caminho da escolha) refaz o
   desenho por `blocosParaDesenho`: o que só o desenho guarda não pode sumir nessa volta. */

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })
const at = (id: string): ItemFluxo => ({ kind: 'atividade', id, tipo: 'userTask' })

const base: DesenhoV2 = {
  versao: 2,
  formas: [F('start', 'start'), F('T0'), F('T1'), F('end', 'end')],
  setas: [S('start', 'T0'), S('T0', 'T1', { rotulo: 'pronto' }), S('T1', 'end')],
  posicoes: {}, raias: [],
  layout: {
    orientacao: 'vertical', fases: [{ id: 'fa1', nome: 'Análise', largura: 400 }],
    piscinasExternas: [{ id: 'px1', nome: 'Contratada', altura: 160, quem: 'contratada', canal: 'portal' }],
    fluxosMensagem: [{ id: 'm1', de: 'T0', para: 'px1', rotulo: 'aviso' }], tamanhos: { T1: { largura: 200, altura: 90 } },
  },
}
const comT2 = (d: DesenhoV2): FluxoBlocos => {
  const c = desenhoParaBlocos(d)
  if (!c.ok) throw new Error(c.problemas[0].mensagem)
  return inserirItem(c.fluxo, 'raiz', 2, at('T2'))
}

describe('blocosParaDesenho guarda o que só o desenho tem', () => {
  const r = blocosParaDesenho(comT2(base), base)
  it('o rótulo de uma seta comum que continua ligando as mesmas formas', () => {
    expect(r.setas.find((s) => s.de === 'T0' && s.para === 'T1')?.rotulo).toBe('pronto')
  })
  it('orientação, fases, piscinas externas, fluxos de mensagem e tamanhos', () => {
    expect(r.layout).toEqual(base.layout)
  })
  it('fluxo de mensagem e tamanho de uma forma que saiu vão junto', () => {
    const c = desenhoParaBlocos(base)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    const semT0: FluxoBlocos = { ...c.fluxo, itens: c.fluxo.itens.filter((i) => i.id !== 'T0') }
    const l = blocosParaDesenho(semT0, { ...base, layout: { ...base.layout!, tamanhos: { ...base.layout!.tamanhos, T0: { largura: 180, altura: 80 } } } }).layout
    expect(l?.fluxosMensagem).toEqual([])
    expect(l?.tamanhos).toEqual({ T1: { largura: 200, altura: 90 } })
    expect(l?.fases).toEqual(base.layout!.fases)
  })
  it('sem desenho anterior, nada disso aparece', () => {
    const s = blocosParaDesenho(comT2(base))
    expect(s.layout).toBeUndefined()
    expect(s.setas.some((x) => x.rotulo)).toBe(false)
  })
})

describe('blocosParaDesenho guarda nome, variação e configuração das formas que ficam', () => {
  const comNomes: DesenhoV2 = {
    ...base,
    formas: [F('start', 'start', { nome: 'Pedido recebido' }), F('T0', 'userTask', { variante: 'usuario' }), F('T1'), F('end', 'end', { nome: 'Contrato assinado', config: { avisarQuemIniciou: true } })],
  }
  const r = blocosParaDesenho(comT2(comNomes), comNomes)
  const forma = (id: string) => r.formas.find((f) => f.id === id)
  it('o nome do Início e do Fim', () => {
    expect(forma('start')?.nome).toBe('Pedido recebido')
    expect(forma('end')?.nome).toBe('Contrato assinado')
  })
  it('a variação e a configuração', () => {
    expect(forma('T0')?.variante).toBe('usuario')
    expect(forma('end')?.config).toEqual({ avisarQuemIniciou: true })
  })
  it('o nome da etapa vem dos blocos (não do desenho anterior)', () => {
    const d: DesenhoV2 = { ...comNomes, formas: comNomes.formas.map((f) => (f.id === 'T1' ? { ...f, nome: 'Antigo' } : f)) }
    const c = desenhoParaBlocos(d)
    if (!c.ok) throw new Error(c.problemas[0].mensagem)
    const f2: FluxoBlocos = { ...c.fluxo, itens: c.fluxo.itens.map((i) => (i.id === 'T1' && i.kind === 'atividade' ? { ...i, nome: 'Novo' } : i)) }
    expect(blocosParaDesenho(f2, d).formas.find((f) => f.id === 'T1')?.nome).toBe('Novo')
  })
})
