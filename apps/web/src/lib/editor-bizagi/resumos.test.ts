import { describe, expect, it } from 'vitest'
import {
  listaPt, resumoDaEscolha, resumoDaFase, resumoDaMensagem, resumoDaPiscinaExterna, resumoDaRaia, resumoDaSeta, resumoDoBaseadoEmEvento,
  resumoDoEnvio, resumoDoFim, resumoDoInicio, resumoDoParalelo, resumoDoRecebimento, resumoDoSubprocesso, resumoDoTemporizador, textoDoResumo,
  type Trecho,
} from './resumos'

const texto = (t: Trecho[]) => textoDoResumo(t)
const fortes = (t: Trecho[]) => t.filter((r) => r.forte).map((r) => r.t)
const faltas = (t: Trecho[]) => t.filter((r) => r.falta).map((r) => r.t)

describe('listaPt', () => {
  it('junta com vírgula e "e"', () => {
    expect(listaPt([])).toBe('')
    expect(listaPt(['A'])).toBe('A')
    expect(listaPt(['A', 'B'])).toBe('A e B')
    expect(listaPt(['A', 'B', 'C'])).toBe('A, B e C')
  })
})

describe('resumoDaEscolha', () => {
  it('todos os que servirem, sem caso contrário: para e avisa', () => {
    const r = resumoDaEscolha({ anteriores: ['Analisar'], pergunta: 'Quais pareceres?', modo: 'todos' })
    expect(texto(r)).toBe('Depois de Analisar, o processo pergunta “Quais pareceres?” e segue por todos os caminhos que servirem. Se nenhum servir, o processo para e avisa.')
    expect(fortes(r)).toEqual(['Analisar', '“Quais pareceres?”', 'todos os caminhos que servirem', 'para e avisa'])
  })
  it('primeiro que servir, com caso contrário', () => {
    const r = resumoDaEscolha({ anteriores: [], pergunta: 'Valor alto?', modo: 'primeiro', seNenhum: 'Aprovar' })
    expect(texto(r)).toBe('O processo pergunta “Valor alto?” e segue pelo primeiro caminho que servir. Se nenhum servir, segue por Aprovar.')
  })
  it('sem pergunta e caminhos sem condição: o que falta aparece na frase', () => {
    const r = resumoDaEscolha({ anteriores: ['A', 'B'], pergunta: '  ', modo: 'primeiro', semCondicao: 2 })
    expect(texto(r)).toContain('Depois de A e B')
    expect(faltas(r)).toEqual(['faz uma pergunta que ainda não foi escrita', 'Falta escolher a condição de 2 caminhos.'])
    expect(faltas(resumoDaEscolha({ anteriores: [], pergunta: 'x', modo: 'todos', semCondicao: 1 }))).toEqual(['Falta escolher a condição de 1 caminho.'])
  })
})

describe('resumoDoParalelo', () => {
  it('várias frentes', () => {
    expect(texto(resumoDoParalelo(3))).toBe('As 3 frentes começam juntas e o processo só segue quando todas terminarem.')
  })
  it('uma frente', () => {
    expect(texto(resumoDoParalelo(1))).toBe('Só há uma frente: o processo segue quando ela terminar.')
  })
})

describe('resumoDaRaia', () => {
  it('com executor padrão', () => {
    expect(texto(resumoDaRaia({ papel: 'Analista', total: 3, usamOPadrao: 2 })))
      .toBe('As tarefas desta raia são feitas por Analista por padrão (2 de 3 usam o padrão).')
    expect(texto(resumoDaRaia({ papel: 'Analista', total: 0, usamOPadrao: 0 }))).toContain('(ainda não há tarefas nela)')
  })
  it('sem executor padrão', () => {
    const r = resumoDaRaia({ total: 1, usamOPadrao: 0 })
    expect(faltas(r)).toEqual(['não tem executor padrão'])
    expect(texto(r)).toContain('1 tarefa de usuário nesta raia.')
  })
})

describe('resumoDaFase', () => {
  it('com e sem prazo; singular e plural', () => {
    expect(texto(resumoDaFase({ formas: 4, prazoDiasUteis: 5 }))).toBe('4 formas nesta fase. Prazo: 5 dias úteis.')
    expect(texto(resumoDaFase({ formas: 1, prazoDiasUteis: 1 }))).toBe('1 forma nesta fase. Prazo: 1 dia útil.')
    expect(texto(resumoDaFase({ formas: 0 }))).toBe('0 formas nesta fase. Prazo: sem prazo.')
  })
})

describe('resumoDaPiscinaExterna', () => {
  it('a contratada pelo portal', () => {
    expect(texto(resumoDaPiscinaExterna({ nome: 'Fornecedor', quem: 'contratada', canal: 'portal' })))
      .toBe('Fornecedor é a contratada do contrato e conversa pelo portal do fornecedor.')
  })
  it('órgão por e-mail, sem nome', () => {
    expect(texto(resumoDaPiscinaExterna({ nome: ' ', quem: 'orgao', canal: 'email' })))
      .toBe('O participante é um órgão ou sistema externo e conversa por e-mail com link seguro.')
  })
})

describe('mensagem e seta', () => {
  it('mensagem com e sem rótulo', () => {
    expect(texto(resumoDaMensagem({ rotulo: 'Minuta', de: 'Enviar', para: 'Fornecedor' }))).toBe('Minuta vai de Enviar para Fornecedor.')
    expect(texto(resumoDaMensagem({ de: 'A', para: 'B' }))).toBe('Uma mensagem vai de A para B.')
  })
  it('seta', () => {
    expect(texto(resumoDaSeta({ de: 'A', para: 'B' }))).toBe('Leva de A para B.')
  })
})

describe('resumoDoTemporizador', () => {
  it('prazo', () => {
    expect(texto(resumoDoTemporizador({ espera: 'prazo', n: 5, unidade: 'diasUteis' }))).toBe('Espera 5 dias úteis e segue.')
    expect(texto(resumoDoTemporizador({ espera: 'prazo', n: 1, unidade: 'horasUteis' }))).toBe('Espera 1 hora útil e segue.')
  })
  it('data do contrato', () => {
    expect(texto(resumoDoTemporizador({ espera: 'data', n: 30, unidade: 'diasUteis', campoData: 'vencimento', sentido: 'antes' })))
      .toBe('Espera até 30 dias antes da data de vencimento do contrato e segue.')
    expect(texto(resumoDoTemporizador({ espera: 'data', n: 0, unidade: 'diasUteis', campoData: 'inicioVigencia', sentido: 'depois' })))
      .toBe('Espera até o início da vigência do contrato e segue.')
  })
})

describe('resumoDoSubprocesso', () => {
  it('com workflow, levando o contrato e esperando', () => {
    expect(texto(resumoDoSubprocesso({ workflow: 'Renovação', levarContrato: true, esperar: true })))
      .toBe('Chama o workflow Renovação, levando o contrato do processo, e espera ele terminar para seguir.')
  })
  it('sem workflow: falta', () => {
    const r = resumoDoSubprocesso({ levarContrato: false, esperar: false })
    expect(faltas(r)).toEqual(['(falta escolher qual)'])
    expect(texto(r)).toContain('segue na hora, sem esperar.')
  })
})

describe('resumoDoFim', () => {
  it('cada variante', () => {
    expect(texto(resumoDoFim('simples', {}))).toBe('Encerra este caminho. Quando todos os caminhos terminam, o processo fica Concluído.')
    expect(texto(resumoDoFim('erro', { motivo: 'Doc recusada' }))).toBe('Encerra o processo com erro: “Doc recusada”.')
    expect(faltas(resumoDoFim('erro', {}))).toEqual(['Falta o motivo.'])
    expect(texto(resumoDoFim('cancela', { motivo: 'Sem resposta', avisarQuemIniciou: true }))).toBe('Cancela o processo com o motivo “Sem resposta” e avisa quem iniciou.')
    expect(texto(resumoDoFim('cancela', { avisarQuemIniciou: false }))).toBe('Cancela o processo.')
    expect(texto(resumoDoFim('terminar', {}))).toContain('inteiro')
  })
})

describe('início, envio, recebimento, baseado em evento', () => {
  it('início', () => {
    expect(texto(resumoDoInicio('simples', {}))).toBe('O processo começa aqui, quando alguém clica em + Novo processo.')
    expect(texto(resumoDoInicio('agendado', { quando: 'mes' }))).toBe('O processo começa sozinho, todo mês, num dia fixo.')
    expect(texto(resumoDoInicio('evento', { evento: 'criado' }))).toBe('O processo começa quando um contrato é criado.')
  })
  it('envio e recebimento', () => {
    expect(texto(resumoDoEnvio({ para: 'Fornecedor', canal: 'email' }))).toBe('Envia para Fornecedor por e-mail com link seguro.')
    expect(faltas(resumoDoEnvio({ canal: 'portal' }))).toEqual(['(falta escolher para quem)'])
    expect(texto(resumoDoRecebimento({ de: 'Fornecedor', recebido: 'portal' }))).toBe('Espera a resposta no portal de Fornecedor e segue.')
  })
  it('baseado em evento', () => {
    expect(texto(resumoDoBaseadoEmEvento(2))).toBe('Espera o primeiro evento que acontecer entre 2 saídas e segue por ele.')
    expect(faltas(resumoDoBaseadoEmEvento(0))).toEqual(['nenhuma seta sai daqui ainda'])
  })
})
