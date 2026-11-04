import { describe, expect, it } from 'vitest'
import { CATALOGO, CATALOGO_FORA_DA_PALETA, ROTULO_ETIQUETA, formaNova, itemDoArrasto, type GrupoPaleta } from './catalogo'

describe('catálogo da paleta', () => {
  it('catálogo tem os 5 grupos na ordem do mockup', () => {
    expect(Object.keys(CATALOGO)).toEqual(['inicio', 'tarefa', 'escolha', 'paralelo', 'fim'])
    const nomes = (g: GrupoPaleta) => CATALOGO[g].map((i) => i.nome)
    expect(nomes('inicio')).toEqual(['Início', 'Início agendado', 'Início por evento'])
    expect(nomes('tarefa')).toEqual(['Tarefa de usuário', 'Ação automática', 'Envio de mensagem', 'Recebimento de mensagem'])
    expect(nomes('escolha')).toEqual(['Escolha'])
    expect(nomes('paralelo')).toEqual(['Ao mesmo tempo'])
    expect(nomes('fim')).toEqual(['Fim', 'Fim com erro', 'Fim com cancelamento', 'Terminar tudo'])
    for (const g of Object.keys(CATALOGO) as GrupoPaleta[]) for (const i of CATALOGO[g]) expect(i.grupo).toBe(g)
    expect(CATALOGO.tarefa[1]).toMatchObject({ tipo: 'serviceTask' })
    expect(CATALOGO.escolha[0]).toMatchObject({ tipo: 'exclusiveGateway', modo: 'primeiro' })
    expect(CATALOGO.paralelo[0]).toMatchObject({ tipo: 'parallelGateway' })
  })

  it('o que saiu da paleta continua catalogado, só para reconhecer formas dos desenhos', () => {
    expect(CATALOGO_FORA_DA_PALETA.map((i) => i.nome)).toEqual(['Subprocesso', 'Subprocesso embutido', 'Inclusivo', 'Baseado em evento', 'Temporizador', 'Recebe mensagem', 'Envia mensagem'])
  })

  it("só o que executa hoje tem etiqueta 'hoje'", () => {
    const hoje = Object.values(CATALOGO).flat().filter((i) => i.etiqueta === 'hoje').map((i) => i.nome)
    expect(hoje).toEqual(['Início', 'Tarefa de usuário', 'Ação automática', 'Escolha', 'Ao mesmo tempo', 'Fim'])
    expect(CATALOGO_FORA_DA_PALETA.find((i) => i.variante === 'temporizador')!.etiqueta).toBe('proxima')
    expect(CATALOGO_FORA_DA_PALETA.filter((i) => i.grupo === 'subprocesso').every((i) => i.etiqueta === 'proxima')).toBe(true)
    expect(CATALOGO.fim[1].etiqueta).toBe('proxima')
    expect(CATALOGO.fim[2].etiqueta).toBe('proxima')
    expect(ROTULO_ETIQUETA).toEqual({ hoje: 'Executa hoje', proxima: 'Próxima rodada' })
  })

  it('formaNova dá nome e config padrão', () => {
    expect(formaNova(CATALOGO_FORA_DA_PALETA.find((i) => i.variante === 'temporizador')!, 't1')).toEqual({
      id: 't1', tipo: 'intermediateEvent', variante: 'temporizador', nome: 'Temporizador',
      config: { espera: 'prazo', n: 1, unidade: 'diasUteis' },
    })
    expect(formaNova(CATALOGO_FORA_DA_PALETA[0], 's1')).toEqual({
      id: 's1', tipo: 'subProcess', variante: 'chamada', nome: 'Novo subprocesso',
      config: { versao: 'ativa', levarContrato: true, campos: [], esperar: true },
    })
    expect(formaNova(CATALOGO.tarefa[2], 'a')).toMatchObject({ tipo: 'userTask', variante: 'envio', nome: 'Nova tarefa' })
    expect(formaNova(CATALOGO.escolha[0], 'g')).toMatchObject({ tipo: 'exclusiveGateway', modo: 'primeiro', nome: 'Nova pergunta?' })
    expect(formaNova(CATALOGO.paralelo[0], 'p').nome).toBeUndefined()
    expect(formaNova(CATALOGO.inicio[1], 'i')).toMatchObject({ tipo: 'start', variante: 'agendado', nome: 'Início' })
    expect(formaNova(CATALOGO.fim[3], 'f')).toMatchObject({ tipo: 'end', variante: 'terminar', nome: 'Fim' })
    // config é cópia: mexer numa forma não muda as outras
    const a = formaNova(CATALOGO_FORA_DA_PALETA[0], 'x'); const b = formaNova(CATALOGO_FORA_DA_PALETA[0], 'y')
    expect(a.config).not.toBe(b.config)
  })

  it('itemDoArrasto lê { grupo, indice } e recusa o que não é da paleta', () => {
    expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 1 }))).toBe(CATALOGO.fim[1])
    expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 9 }))).toBeNull()
    expect(itemDoArrasto(JSON.stringify({ grupo: 'toString', indice: 0 }))).toBeNull()
    expect(itemDoArrasto('userTask')).toBeNull()
    expect(itemDoArrasto('')).toBeNull()
  })
})
