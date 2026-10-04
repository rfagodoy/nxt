import { describe, expect, it } from 'vitest'
import { buildNativeSeed, linhaTemValorTravado, reconcileNative, renovacaoLiberada, travasDaEtapa, type Screen } from '../index'

const telaContrato = (travar: { campos?: string[]; secoes?: string[]; readOnly?: boolean } = {}): Screen => {
  const seed = buildNativeSeed('CONTRATO')
  return reconcileNative({
    id: 't', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', readOnly: travar.readOnly,
    sections: seed.sections.map(s => ({ ...s, locked: travar.secoes?.includes(s.nativeKey!) })),
    fields: seed.fields.map(f => ({ ...f, locked: travar.campos?.includes(f.nativeKey!) })),
  })
}

describe('travas da etapa', () => {
  const step = { screenRef: 'A', entityMode: 'EDIT' as const, extraScreens: [{ screenRef: 'B', mode: 'VIEW' as const }], lockedFields: ['k1'] }
  it('aba de edição leva os campos travados da atividade', () => {
    expect(travasDaEtapa(step, 'A')).toEqual({ stepLocked: new Set(['k1']) })
  })
  it('aba de consulta força a tela em consulta', () => {
    expect(travasDaEtapa(step, 'B')?.screenReadOnly).toBe(true)
  })
  it('tela que não é aba da etapa → null (a gravação não pode se valer da tarefa)', () => {
    expect(travasDaEtapa(step, 'C')).toBeNull()
  })
  it('ao CRIAR, os campos travados da atividade não valem', () => {
    expect(travasDaEtapa({ ...step, entityMode: 'CREATE' }, 'A')).toEqual({})
  })
})

describe('renovar período', () => {
  it('livre sem trava', () => expect(renovacaoLiberada(telaContrato())).toBe(true))
  it('término travado bloqueia', () => expect(renovacaoLiberada(telaContrato({ campos: ['termino'] }))).toBe(false))
  it('pagamentos ou reajuste travados bloqueiam', () => {
    expect(renovacaoLiberada(telaContrato({ secoes: ['pagamentos'] }))).toBe(false)
    expect(renovacaoLiberada(telaContrato({ secoes: ['reajuste'] }))).toBe(false)
  })
  it('vigência inteira travada bloqueia (o término mora nela)', () => expect(renovacaoLiberada(telaContrato({ secoes: ['vigencia'] }))).toBe(false))
  it('documentos travados não importam', () => expect(renovacaoLiberada(telaContrato({ secoes: ['documentos'] }))).toBe(true))
  it('tela em consulta bloqueia; sem tela, livre', () => {
    expect(renovacaoLiberada(telaContrato({ readOnly: true }))).toBe(false)
    expect(renovacaoLiberada(null)).toBe(true)
  })
})

describe('linha com valor travado', () => {
  const travado = (k: string) => k === 'con_email'
  it('tem valor no campo travado → presa', () => expect(linhaTemValorTravado('contatos', { email: 'a@b.c', nome: '' }, travado)).toBe(true))
  it('campo travado vazio → pode sair', () => expect(linhaTemValorTravado('contatos', { email: ' ', nome: 'Ana' }, travado)).toBe(false))
  it('a trava é da lista certa', () => expect(linhaTemValorTravado('bancos', { email: 'a@b.c' }, travado)).toBe(false))
})
