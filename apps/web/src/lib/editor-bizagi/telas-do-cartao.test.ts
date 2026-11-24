import { describe, it, expect } from 'vitest'
import { resumoDasTelas } from './telas-do-cartao'

const nomes: Record<string, string> = { t1: 'Dados do contrato', t2: 'Partes', t3: 'Documentos' }
const nome = (id: string) => nomes[id]

describe('resumoDasTelas', () => {
  it('sem tela', () => {
    expect(resumoDasTelas(undefined, nome)).toMatchObject({ texto: 'Sem tela', semTela: true })
    expect(resumoDasTelas({}, nome)).toMatchObject({ texto: 'Sem tela', semTela: true })
  })
  it('uma tela: só o nome', () => {
    const r = resumoDasTelas({ screenRef: 't1', entityMode: 'EDIT' }, nome)
    expect(r).toEqual({ texto: 'Dados do contrato', dica: '1. Dados do contrato · editar', semTela: false })
  })
  it('várias: a primeira na ordem da execução e +N; a dica lista todas', () => {
    const r = resumoDasTelas({
      screenRef: 't1', entityMode: 'EDIT', posicaoDaPrincipal: 1,
      extraScreens: [{ screenRef: 't2', mode: 'VIEW' }, { screenRef: 't3', mode: 'EDIT', fechada: true }],
    }, nome)
    expect(r.texto).toBe('Partes +2')
    expect(r.dica).toBe('1. Partes · consulta\n2. Dados do contrato · editar\n3. Documentos · editar · fechada')
  })
  it('a dica traz o código de cada tela, quando há', () => {
    const r = resumoDasTelas({ screenRef: 't1', entityMode: 'EDIT' }, nome, (id) => (id === 't1' ? 'TELA_CTR_003' : undefined))
    expect(r.dica).toBe('1. Dados do contrato (TELA_CTR_003) · editar')
    expect(r.texto).toBe('Dados do contrato')
  })
  it('atividade de consulta: todas em consulta; tela apagada aparece como removida', () => {
    const r = resumoDasTelas({ screenRef: 'x', entityMode: 'VIEW' }, nome)
    expect(r.texto).toBe('Tela removida')
    expect(r.dica).toBe('1. Tela removida · consulta')
  })
})
