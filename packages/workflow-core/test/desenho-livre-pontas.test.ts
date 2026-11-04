import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, SetaDesenho } from '@nxt/types'
import { blocosParaDesenho, desenhoParaBlocos, lerDesenhoV2 } from '../src/desenho-livre'
import { assinaturaDoQueExecuta } from '../src/o-que-executa'
import { inserirItem, type FluxoBlocos } from '../src/blocos'

/* Pontas livres das setas (PO, 03/11/2026): só visuais. Ficam gravadas, sobrevivem à volta dos
   blocos e não mexem no que o motor executa. */

const F = (id: string, tipo: FormaDesenho['tipo'] = 'userTask', extra: Partial<FormaDesenho> = {}): FormaDesenho => ({ id, tipo, ...extra })
const S = (de: string, para: string, extra: Partial<SetaDesenho> = {}): SetaDesenho => ({ id: `s_${de}_${para}`, de, para, ...extra })

const base: DesenhoV2 = {
  versao: 2,
  formas: [F('start', 'start'), F('T0'), F('T1'), F('end', 'end')],
  setas: [S('start', 'T0'), S('T0', 'T1', { saida: { lado: 'baixo', t: 0.25 }, entrada: { lado: 'cima', t: 0.75 } }), S('T1', 'end')],
  posicoes: {}, raias: [],
  layout: {
    orientacao: 'horizontal', fases: [],
    piscinasExternas: [{ id: 'px1', nome: 'Contratada', altura: 160, quem: 'contratada', canal: 'portal' }],
    fluxosMensagem: [{ id: 'm1', de: 'T0', para: 'px1', saida: { lado: 'direita', t: 0.5 } }], tamanhos: {},
  },
}

describe('lerDesenhoV2 e as pontas', () => {
  it('pontas válidas ficam (setas e fluxos de mensagem)', () => {
    const d = lerDesenhoV2(JSON.parse(JSON.stringify(base)))!
    expect(d.setas[1].saida).toEqual({ lado: 'baixo', t: 0.25 })
    expect(d.setas[1].entrada).toEqual({ lado: 'cima', t: 0.75 })
    expect(d.layout?.fluxosMensagem[0].saida).toEqual({ lado: 'direita', t: 0.5 })
  })
  it('ponta inválida some sem recusar o desenho', () => {
    const bruto = JSON.parse(JSON.stringify(base))
    bruto.setas[1].saida = { lado: 'meio', t: 0.5 }
    bruto.setas[1].entrada = { lado: 'cima', t: 1.5 }
    bruto.setas[0].saida = { lado: 'cima', t: 'x' }
    bruto.setas[2].entrada = 'esquerda'
    bruto.layout.fluxosMensagem[0].saida = { lado: 'direita', t: -0.1 }
    bruto.layout.fluxosMensagem[0].entrada = { lado: 'baixo', t: 0 }
    const d = lerDesenhoV2(bruto)!
    expect(d).not.toBeNull()
    expect(d.setas.map((s) => [s.saida, s.entrada])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]])
    expect('saida' in d.setas[1]).toBe(false)
    expect(d.layout?.fluxosMensagem[0].saida).toBeUndefined()
    expect(d.layout?.fluxosMensagem[0].entrada).toEqual({ lado: 'baixo', t: 0 })
  })
})

describe('blocosParaDesenho guarda as pontas', () => {
  const c = desenhoParaBlocos(base)
  if (!c.ok) throw new Error(c.problemas[0].mensagem)
  const comT2: FluxoBlocos = inserirItem(c.fluxo, 'raiz', 2, { kind: 'atividade', id: 'T2', tipo: 'userTask' })
  it('na seta que continua ligando as mesmas formas', () => {
    const r = blocosParaDesenho(comT2, base)
    const s = r.setas.find((x) => x.de === 'T0' && x.para === 'T1')
    expect(s?.saida).toEqual({ lado: 'baixo', t: 0.25 })
    expect(s?.entrada).toEqual({ lado: 'cima', t: 0.75 })
    expect(r.layout?.fluxosMensagem[0].saida).toEqual({ lado: 'direita', t: 0.5 })
  })
  it('na seta que sai de um losango (caminho da escolha)', () => {
    const d: DesenhoV2 = {
      versao: 2,
      formas: [F('start', 'start'), F('L', 'exclusiveGateway'), F('A'), F('B'), F('J', 'exclusiveGateway'), F('end', 'end')],
      setas: [S('start', 'L'), { id: 'c1', de: 'L', para: 'A', condition: 'x', saida: { lado: 'cima', t: 0.5 } }, { id: 'c2', de: 'L', para: 'B' },
        S('A', 'J', { entrada: { lado: 'esquerda', t: 0.1 } }), S('B', 'J'), S('J', 'end')],
      posicoes: {}, raias: [],
    }
    const cc = desenhoParaBlocos(d)
    if (!cc.ok) throw new Error(cc.problemas[0].mensagem)
    const r = blocosParaDesenho(cc.fluxo, d)
    expect(r.setas.find((x) => x.de === 'L' && x.para === 'A')?.saida).toEqual({ lado: 'cima', t: 0.5 })
    expect(r.setas.find((x) => x.de === 'A')?.entrada).toEqual({ lado: 'esquerda', t: 0.1 })
  })
  it('seta que mudou de ponta perde as pontas', () => {
    const semT1 = { ...c.fluxo, itens: c.fluxo.itens.filter((i) => i.id !== 'T1') }
    const r = blocosParaDesenho(semT1, base)
    expect(r.setas.some((x) => x.saida || x.entrada)).toBe(false)
  })
})

describe('assinaturaDoQueExecuta ignora as pontas', () => {
  const steps = [{ stepId: 'T0', stepName: 'A', stepType: 'userTask', fields: [] }, { stepId: 'T1', stepName: 'B', stepType: 'userTask', fields: [] }]
  const semPontas: DesenhoV2 = { ...base, setas: base.setas.map(({ saida: _s, entrada: _e, ...x }) => x), layout: { ...base.layout!, fluxosMensagem: [{ id: 'm1', de: 'T0', para: 'px1' }] } }
  it('mudar só as pontas não muda o que o motor executa', () => {
    const a = assinaturaDoQueExecuta({ steps, desenho: semPontas })
    expect(a).not.toBeNull()
    expect(assinaturaDoQueExecuta({ steps, desenho: base })).toBe(a)
  })
})
