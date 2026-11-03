import { describe, expect, it } from 'vitest'
import { caixaDaForma, familiaDaForma, iconeDaTarefa, iconeDoEvento, nomeDoEvento, tipoDaTarefa, tipoDoEvento } from './formas-do-canvas'

describe('formas no canvas', () => {
  it('família de cada tipo', () => {
    expect(['userTask', 'serviceTask', 'subProcess'].map(familiaDaForma)).toEqual(['tarefa', 'tarefa', 'tarefa'])
    expect(['exclusiveGateway', 'inclusiveGateway', 'parallelGateway', 'eventGateway'].map(familiaDaForma)).toEqual(['losango', 'losango', 'losango', 'losango'])
    expect(['start', 'end', 'intermediateEvent'].map(familiaDaForma)).toEqual(['evento', 'evento', 'evento'])
    expect(['start', 'intermediateEvent', 'end'].map(tipoDoEvento)).toEqual(['inicio', 'intermediario', 'fim'])
  })

  it('ícone de cada variante de evento; o simples continua liso', () => {
    expect(iconeDoEvento('simples')).toBeNull()
    expect(iconeDoEvento(undefined)).toBeNull()
    expect(iconeDoEvento('agendado')).toBe('relogio')
    expect(iconeDoEvento('temporizador')).toBe('relogio')
    expect(iconeDoEvento('evento')).toBe('envelope')
    expect(iconeDoEvento('recebe')).toBe('envelope')
    expect(iconeDoEvento('envia')).toBe('envelopeCheio')
    expect(iconeDoEvento('erro')).toBe('raio')
    expect(iconeDoEvento('cancela')).toBe('xis')
    expect(iconeDoEvento('terminar')).toBe('disco')
  })

  it('ícone da tarefa: usuário, engrenagem, envelopes; subprocesso sem ícone', () => {
    expect(iconeDaTarefa('userTask', 'usuario')).toBe('usuario')
    expect(iconeDaTarefa('userTask', undefined)).toBe('usuario')
    expect(iconeDaTarefa('serviceTask', undefined)).toBe('engrenagem')
    expect(iconeDaTarefa('userTask', 'envio')).toBe('envelopeCheio')
    expect(iconeDaTarefa('userTask', 'recebimento')).toBe('envelope')
    expect(iconeDaTarefa('subProcess', 'chamada')).toBeNull()
  })

  it('nome para o leitor de tela', () => {
    expect(nomeDoEvento('inicio', 'simples')).toBe('Início do processo')
    expect(nomeDoEvento('fim', 'simples', '  ')).toBe('Fim do processo')
    expect(nomeDoEvento('intermediario', 'temporizador', 'Aguardar assinatura')).toBe('Temporizador: Aguardar assinatura')
    expect(nomeDoEvento('fim', 'erro')).toBe('Fim com erro')
    expect(nomeDoEvento('inicio', 'agendado', 'Todo dia 1º')).toBe('Início agendado: Todo dia 1º')
    // o nome padrão da paleta só repete o tipo
    expect(nomeDoEvento('intermediario', 'temporizador', 'Temporizador')).toBe('Temporizador')
    expect(nomeDoEvento('inicio', 'simples', 'Início')).toBe('Início do processo')
    expect(nomeDoEvento('fim', 'simples', 'Fim')).toBe('Fim do processo')
    expect(tipoDaTarefa(false, 'usuario')).toBe('Tarefa')
    expect(tipoDaTarefa(true, undefined)).toBe('Ação automática')
    expect(tipoDaTarefa(false, 'envio')).toBe('Envio de mensagem')
    expect(tipoDaTarefa(false, 'chamada', 'chamada')).toBe('Subprocesso')
    expect(tipoDaTarefa(false, 'embutido', 'embutido')).toBe('Subprocesso embutido')
  })

  it('caixa: o tamanho gravado vale só para tarefa, ação automática e subprocesso', () => {
    const padrao = { w: 190, h: 113 }
    const tamanhos = { t: { largura: 256, altura: 96 }, s: { largura: 160, altura: 80 }, e: { largura: 300, altura: 300 } }
    expect(caixaDaForma('t', 'userTask', padrao, tamanhos)).toEqual({ w: 256, h: 96 })
    expect(caixaDaForma('s', 'subProcess', padrao, tamanhos)).toEqual({ w: 160, h: 80 })
    expect(caixaDaForma('e', 'end', { w: 56, h: 56 }, tamanhos)).toEqual({ w: 56, h: 56 })
    expect(caixaDaForma('x', 'userTask', padrao, tamanhos)).toBe(padrao)
  })
})
