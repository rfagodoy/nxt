import { describe, it, expect } from 'vitest'
import { aguardandoLinhas, situacaoDaInstancia, encerrouAgora } from './instances.service'

/* A situação da instância deixou de ser "concluiu ou está rodando" (2026-08-27): o
   processo pode ENCERRAR SEM CONCLUSÃO — as atividades acabaram sem que nenhum
   caminho passasse pelo evento de fim. Deixar isso como RUNNING criaria processo
   fantasma: aberto na lista, sem tarefa para ninguém e sem nunca fechar. */
/* Linha paralela (PO, 08/11/2026): a linha principal já passou pelo Fim, mas o processo
   segue em andamento até as outras terminarem. Quem acompanha precisa saber o porquê. */
describe('aguardandoLinhas', () => {
  it('em andamento e já passou pelo Fim: lista as atividades abertas, sem repetir', () => {
    expect(aguardandoLinhas('RUNNING', { reachedEnd: true }, ['Tomar ciência', 'Validar', 'Validar'])).toEqual(['Tomar ciência', 'Validar'])
  })
  it('ainda não passou pelo Fim: não há o que aguardar', () => {
    expect(aguardandoLinhas('RUNNING', { reachedEnd: false }, ['Analisar'])).toEqual([])
    expect(aguardandoLinhas('RUNNING', null, ['Analisar'])).toEqual([])
  })
  it('processo que não está em andamento não aguarda nada', () => {
    expect(aguardandoLinhas('COMPLETED', { reachedEnd: true }, ['X'])).toEqual([])
  })
})

describe('situacaoDaInstancia', () => {
  it('erro do motor/conector vence tudo', () => {
    expect(situacaoDaInstancia({ errored: 'conector falhou', completed: false })).toBe('ERROR')
    expect(situacaoDaInstancia({ errored: 'x', completed: true, endedIncomplete: 'sem-fim' })).toBe('ERROR')
  })
  it('passou pelo fim → concluída', () => {
    expect(situacaoDaInstancia({ completed: true })).toBe('COMPLETED')
  })
  it('acabou sem passar pelo fim → encerrada sem conclusão', () => {
    expect(situacaoDaInstancia({ completed: false, endedIncomplete: 'sem-fim' })).toBe('ENDED_INCOMPLETE')
    expect(situacaoDaInstancia({ completed: false, endedIncomplete: 'juncao-travada' })).toBe('ENDED_INCOMPLETE')
  })
  it('ainda há tarefa em aberto → em andamento', () => {
    expect(situacaoDaInstancia({ completed: false })).toBe('RUNNING')
  })
})

describe('encerrouAgora — carimbo da data de encerramento', () => {
  it('carimba concluída E encerrada sem conclusão (as duas pararam de correr)', () => {
    expect(encerrouAgora({ completed: true })).toBe(true)
    expect(encerrouAgora({ completed: false, endedIncomplete: 'sem-fim' })).toBe(true)
  })
  it('não carimba instância viva nem instância em erro (o erro tem retry)', () => {
    expect(encerrouAgora({ completed: false })).toBe(false)
    expect(encerrouAgora({ completed: true, errored: 'falhou' })).toBe(false)
  })
})
