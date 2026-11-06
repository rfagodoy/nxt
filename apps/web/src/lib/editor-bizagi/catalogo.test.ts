import { describe, expect, it } from 'vitest'
import { executaHoje } from '@nxt/workflow-core'
import { CATALOGO, CATALOGO_FORA_DA_PALETA, TODOS_OS_ITENS, formaNova, itemDoArrasto, type GrupoPaleta } from './catalogo'

describe('catálogo da paleta', () => {
  it('catálogo tem os 5 grupos na ordem do mockup, só com o que executa', () => {
    expect(Object.keys(CATALOGO)).toEqual(['inicio', 'tarefa', 'escolha', 'paralelo', 'fim'])
    const nomes = (g: GrupoPaleta) => CATALOGO[g].map((i) => i.nome)
    expect(nomes('inicio')).toEqual(['Início'])
    expect(nomes('tarefa')).toEqual(['Tarefa de usuário', 'Ação automática'])
    expect(nomes('escolha')).toEqual(['Escolha'])
    expect(nomes('paralelo')).toEqual(['Ao mesmo tempo'])
    expect(nomes('fim')).toEqual(['Fim'])
    for (const g of Object.keys(CATALOGO) as GrupoPaleta[]) for (const i of CATALOGO[g]) expect(i.grupo).toBe(g)
    expect(CATALOGO.tarefa[1]).toMatchObject({ tipo: 'serviceTask' })
    expect(CATALOGO.escolha[0]).toMatchObject({ tipo: 'exclusiveGateway', modo: 'primeiro' })
    expect(CATALOGO.paralelo[0]).toMatchObject({ tipo: 'parallelGateway' })
  })

  it('o que saiu da paleta continua catalogado, só para reconhecer formas dos desenhos', () => {
    expect(CATALOGO_FORA_DA_PALETA.map((i) => i.nome)).toEqual([
      'Início agendado', 'Início por evento', 'Envio de mensagem', 'Recebimento de mensagem',
      'Fim com erro', 'Fim com cancelamento', 'Terminar tudo',
      'Subprocesso', 'Subprocesso embutido', 'Inclusivo', 'Baseado em evento', 'Temporizador', 'Recebe mensagem', 'Envia mensagem',
    ])
    const todos = TODOS_OS_ITENS.map((i) => i.nome)
    for (const n of ['Início agendado', 'Início por evento', 'Envio de mensagem', 'Recebimento de mensagem', 'Fim com erro', 'Fim com cancelamento', 'Terminar tudo']) {
      expect(todos).toContain(n)
    }
  })

  it('nada na paleta deixa de executar', () => {
    expect(Object.values(CATALOGO).flat().every(executaHoje)).toBe(true)
  })

  it('formaNova dá nome padrão, sem config', () => {
    expect(formaNova(CATALOGO.tarefa[0], 'a')).toEqual({ id: 'a', tipo: 'userTask', variante: 'usuario', nome: 'Nova tarefa' })
    expect(formaNova(CATALOGO.escolha[0], 'g')).toMatchObject({ tipo: 'exclusiveGateway', modo: 'primeiro', nome: 'Nova pergunta?' })
    expect(formaNova(CATALOGO.paralelo[0], 'p').nome).toBeUndefined()
    expect(formaNova(CATALOGO.inicio[0], 'i')).toMatchObject({ tipo: 'start', variante: 'simples', nome: 'Início' })
    expect(formaNova(CATALOGO.fim[0], 'f')).toMatchObject({ tipo: 'end', variante: 'simples', nome: 'Fim' })
    for (const g of Object.values(CATALOGO)) for (const i of g) expect(formaNova(i, 'x').config).toBeUndefined()
  })

  it('itemDoArrasto lê { grupo, indice } e recusa o que não é da paleta', () => {
    expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 0 }))).toBe(CATALOGO.fim[0])
    expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 1 }))).toBeNull()
    expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 9 }))).toBeNull()
    expect(itemDoArrasto(JSON.stringify({ grupo: 'toString', indice: 0 }))).toBeNull()
    expect(itemDoArrasto('userTask')).toBeNull()
    expect(itemDoArrasto('')).toBeNull()
  })
})
