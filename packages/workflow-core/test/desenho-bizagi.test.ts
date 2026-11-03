import { describe, it, expect } from 'vitest'
import type { DesenhoV2, FormaDesenho, LayoutDesenho } from '@nxt/types'
import { lerDesenhoV2, desenhoParaBlocos } from '../src/desenho-livre'
import { varianteDe, rotuloDaVariante, executaHoje, LAYOUT_PADRAO } from '../src/variantes'

const base = (): DesenhoV2 => ({
  versao: 2,
  formas: [{ id: 'start', tipo: 'start' }, { id: 'a1', tipo: 'userTask' }, { id: 'end', tipo: 'end' }],
  setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 'end' }],
  posicoes: { a1: { x: 10, y: 20 } },
  raias: [],
})

const layoutValido = (): LayoutDesenho => ({
  orientacao: 'vertical',
  larguraPiscina: 900,
  fases: [{ id: 'f1', nome: 'Análise', largura: 400, prazoDiasUteis: 5 }],
  piscinasExternas: [{ id: 'p1', nome: 'Contratada', altura: 120, quem: 'contratada', canal: 'portal' }],
  fluxosMensagem: [{ id: 'm1', de: 'a1', para: 'p1', rotulo: 'Pede documentos' }],
  tamanhos: { a1: { largura: 160, altura: 80 } },
})

describe('lerDesenhoV2 (editor Bizagi)', () => {
  it('aceita os tipos novos e a variante', () => {
    const d = base()
    const t: FormaDesenho = { id: 't', tipo: 'intermediateEvent', variante: 'temporizador', config: { espera: 'prazo', n: 5, unidade: 'diasUteis' } }
    d.formas.push(t)
    expect(lerDesenhoV2(d)?.formas.find((f) => f.id === 't')).toEqual(t)
  })
  it('mantém layout válido', () => {
    const d = { ...base(), layout: layoutValido() }
    expect(lerDesenhoV2(d)?.layout).toEqual(layoutValido())
  })
  it('descarta layout malformado sem recusar o desenho', () => {
    const d = { ...base(), layout: { orientacao: 'diagonal' } }
    const lido = lerDesenhoV2(d)
    expect(lido).not.toBeNull()
    expect(lido).not.toHaveProperty('layout')
  })
  it('descarta fluxo de mensagem para id inexistente', () => {
    const l = layoutValido()
    l.fluxosMensagem.push({ id: 'm2', de: 'x', para: 'p1' })
    const lido = lerDesenhoV2({ ...base(), layout: l })
    expect(lido?.layout?.fluxosMensagem.map((m) => m.id)).toEqual(['m1'])
    expect(lido?.layout?.fases).toEqual(layoutValido().fases)
  })
  it('descarta variante desconhecida sem recusar o desenho', () => {
    const d = base()
    ;(d.formas[1] as unknown as Record<string, unknown>).variante = 'banana'
    expect(lerDesenhoV2(d)?.formas[1]).toEqual({ id: 'a1', tipo: 'userTask' })
  })
  it('desenho antigo sem layout nem variante lê igual', () => {
    expect(lerDesenhoV2(base())).toEqual(base())
  })
})

describe('variantes', () => {
  const casos: [Pick<FormaDesenho, 'tipo' | 'variante'>, VarianteEsperada, string, boolean][] = [
    [{ tipo: 'start' }, 'simples', '', true],
    [{ tipo: 'start', variante: 'simples' }, 'simples', '', true],
    [{ tipo: 'userTask' }, 'usuario', '', true],
    [{ tipo: 'serviceTask' }, undefined, '', true],
    [{ tipo: 'exclusiveGateway' }, undefined, '', true],
    [{ tipo: 'parallelGateway' }, undefined, '', true],
    [{ tipo: 'end' }, 'simples', '', true],
    [{ tipo: 'end', variante: 'erro' }, 'erro', 'um fim com erro', false],
  ]
  it('varianteDe, rotuloDaVariante e executaHoje', () => {
    for (const [f, v, rotulo, executa] of casos) {
      expect(varianteDe(f)).toBe(v)
      if (rotulo) expect(rotuloDaVariante(f)).toBe(rotulo)
      expect(executaHoje(f)).toBe(executa)
    }
  })
  it('padrões por tipo e rótulos', () => {
    expect(varianteDe({ tipo: 'subProcess' })).toBe('chamada')
    expect(varianteDe({ tipo: 'intermediateEvent' })).toBe('temporizador')
    expect(rotuloDaVariante({ tipo: 'start', variante: 'agendado' })).toBe('um início agendado')
    expect(rotuloDaVariante({ tipo: 'start', variante: 'evento' })).toBe('um início por evento')
    expect(rotuloDaVariante({ tipo: 'userTask', variante: 'envio' })).toBe('um envio de mensagem')
    expect(rotuloDaVariante({ tipo: 'userTask', variante: 'recebimento' })).toBe('um recebimento de mensagem')
    expect(rotuloDaVariante({ tipo: 'subProcess' })).toBe('um subprocesso')
    expect(rotuloDaVariante({ tipo: 'subProcess', variante: 'embutido' })).toBe('um subprocesso embutido')
    expect(rotuloDaVariante({ tipo: 'intermediateEvent' })).toBe('um temporizador')
    expect(rotuloDaVariante({ tipo: 'intermediateEvent', variante: 'recebe' })).toBe('um evento que recebe mensagem')
    expect(rotuloDaVariante({ tipo: 'intermediateEvent', variante: 'envia' })).toBe('um evento que envia mensagem')
    expect(rotuloDaVariante({ tipo: 'eventGateway' })).toBe('um losango baseado em evento')
    expect(rotuloDaVariante({ tipo: 'end', variante: 'cancela' })).toBe('um fim com cancelamento')
    expect(rotuloDaVariante({ tipo: 'end', variante: 'terminar' })).toBe('um fim que termina tudo')
    expect(executaHoje({ tipo: 'start', variante: 'agendado' })).toBe(false)
    expect(executaHoje({ tipo: 'subProcess' })).toBe(false)
  })
  it('LAYOUT_PADRAO', () => {
    expect(LAYOUT_PADRAO).toEqual({ orientacao: 'horizontal', fases: [], piscinasExternas: [], fluxosMensagem: [], tamanhos: {} })
  })
})

type VarianteEsperada = ReturnType<typeof varianteDe>

describe('desenhoParaBlocos: o que ainda não executa', () => {
  const comTemporizador = (): DesenhoV2 => ({
    versao: 2,
    formas: [
      { id: 'start', tipo: 'start' }, { id: 'a1', tipo: 'userTask', nome: 'Analisar' },
      { id: 't', tipo: 'intermediateEvent', variante: 'temporizador', nome: 'Esperar 5 dias' }, { id: 'end', tipo: 'end' },
    ],
    setas: [{ id: 's1', de: 'start', para: 'a1' }, { id: 's2', de: 'a1', para: 't' }, { id: 's3', de: 't', para: 'end' }],
    posicoes: {}, raias: [],
  })

  it('recusa temporizador com a frase da spec', () => {
    const r = desenhoParaBlocos(comTemporizador())
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problemas).toEqual([{
      tipo: 'ainda-nao-executa',
      mensagem: '"Esperar 5 dias" é um temporizador, que ainda não executa. Troque por outro elemento ou deixe o workflow em rascunho.',
      formas: ['t'], setas: [],
    }])
  })
  it('lista todos os que não executam, um problema por forma', () => {
    const d = comTemporizador()
    d.formas[3] = { id: 'end', tipo: 'end', variante: 'erro' }
    const r = desenhoParaBlocos(d, { nomeDe: (id) => (id === 'end' ? 'Falhou' : '') })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problemas.map((p) => [p.tipo, p.formas])).toEqual([['ainda-nao-executa', ['t']], ['ainda-nao-executa', ['end']]])
    expect(r.problemas[1].mensagem).toBe('"Falhou" é um fim com erro, que ainda não executa. Troque por outro elemento ou deixe o workflow em rascunho.')
  })
  it('piscinas externas, fluxos de mensagem e fases não impedem', () => {
    const sem = base()
    const com: DesenhoV2 = { ...base(), layout: layoutValido() }
    const a = desenhoParaBlocos(sem), b = desenhoParaBlocos(com)
    expect(b.ok).toBe(true)
    expect(a.ok && b.ok && b.fluxo).toEqual(a.ok && a.fluxo)
  })
})
