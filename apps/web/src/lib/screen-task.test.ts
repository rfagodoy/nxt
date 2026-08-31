import { describe, it, expect } from 'vitest'
import { screenIdVar, screenTargetVar, screenEntityFromVars, screenBloqueio } from './screen-task'
import type { StepFormSchema } from '@nxt/types'

const step = (extra: Partial<StepFormSchema> = {}): StepFormSchema =>
  ({ stepId: 'T1', stepName: 'Cadastrar contrato', fields: [], screenRef: 'scr_1', screenSubject: 'CONTRATO', ...extra }) as StepFormSchema

describe('screenIdVar', () => {
  it('escolhe a variável pelo assunto da tela', () => {
    expect(screenIdVar({ screenSubject: 'CONTRATO' })).toBe('contratoId')
    expect(screenIdVar({ screenSubject: 'FORNECEDOR' })).toBe('partnerId')
    expect(screenIdVar({})).toBe('partnerId') // sem assunto = parceiro (padrão histórico)
  })
})

describe('screenTargetVar', () => {
  it('CREATE lê a variável que ele mesmo escreve (devolução reedita a entidade)', () => {
    expect(screenTargetVar(step())).toBe('contratoId')
    expect(screenTargetVar(step({ entityMode: 'CREATE' }))).toBe('contratoId')
  })
  it('EDIT/VIEW leem a variável escolhida no desenho', () => {
    expect(screenTargetVar(step({ entityMode: 'EDIT', entityVar: 'contratoDoAditivo' }))).toBe('contratoDoAditivo')
    expect(screenTargetVar(step({ entityMode: 'VIEW', entityVar: 'contratoDoAditivo' }))).toBe('contratoDoAditivo')
  })
})

describe('screenEntityFromVars', () => {
  it('acha o id na variável do processo', () => {
    expect(screenEntityFromVars(step(), { contratoId: 'c1' })).toBe('c1')
  })
  it('trata ausente e vazio como sem entidade (senão o botão liberaria em falso)', () => {
    expect(screenEntityFromVars(step(), {})).toBeNull()
    expect(screenEntityFromVars(step(), { contratoId: '' })).toBeNull()
    expect(screenEntityFromVars(step(), { contratoId: null })).toBeNull()
  })
  it('ignora a variável do outro assunto', () => {
    expect(screenEntityFromVars(step(), { partnerId: 'p1' })).toBeNull()
  })
})

describe('screenBloqueio', () => {
  it('sem entidade salva: manda salvar antes de concluir', () => {
    expect(screenBloqueio(step(), null)).toMatch(/Salve o contrato antes de concluir/)
    expect(screenBloqueio(step({ screenSubject: 'FORNECEDOR' }), null)).toMatch(/Salve o parceiro/)
  })
  it('na consulta o problema é o desenho, não a pessoa — não manda salvar', () => {
    const msg = screenBloqueio(step({ entityMode: 'VIEW', entityVar: 'contratoId' }), null) ?? ''
    expect(msg).toMatch(/consulta um contrato que o processo ainda não tem/)
    expect(msg).not.toMatch(/Salve/)
  })
  it('com entidade salva, nada bloqueia', () => {
    expect(screenBloqueio(step(), 'c1')).toBeNull()
  })
  it('atividade sem tela não usa esta regra', () => {
    expect(screenBloqueio(step({ screenRef: undefined }), null)).toBeNull()
    expect(screenBloqueio(null, null)).toBeNull()
  })
})
