import { describe, it, expect } from 'vitest'
import { fieldLocked, nativeLockFn, screenIsReadOnly, sectionIsLocked, lockCtx, secaoTotalmenteTravada, pendenciasDeTrava, fraseDaPendencia } from './screen-locks'
import type { Screen, ScreenField, ScreenSection } from './screen-types'

const field = (over: Partial<ScreenField>): ScreenField => ({
  id: over.id ?? 'f1', name: over.name ?? 'x', label: over.label ?? 'X',
  type: 'text', source: 'CUSTOM', mode: 'EDIT', required: false, order: 0, ...over,
})

const screen = (over: Partial<Screen>): Screen => ({
  id: 's1', name: 'Tela', subjectType: 'CONTRATO', status: 'ACTIVE',
  sections: [], fields: [], ...over,
})

describe('fieldLocked — as duas camadas', () => {
  it('campo solto não é travado', () => {
    expect(fieldLocked(field({}))).toBe(false)
  })
  it('tela em consulta trava TODO campo, mesmo o destravado', () => {
    expect(fieldLocked(field({ locked: false }), { screenReadOnly: true })).toBe(true)
  })
  it('trava da tela (campo a campo) vale sozinha', () => {
    expect(fieldLocked(field({ locked: true }))).toBe(true)
  })
  it('a atividade APERTA: campo destravado na tela trava na etapa', () => {
    expect(fieldLocked(field({ id: 'a' }), { stepLocked: new Set(['a']) })).toBe(true)
    expect(fieldLocked(field({ id: 'b' }), { stepLocked: new Set(['a']) })).toBe(false)
  })
  it('a atividade NUNCA afrouxa: campo travado na tela segue travado fora da lista da etapa', () => {
    expect(fieldLocked(field({ id: 'a', locked: true }), { stepLocked: new Set(['z']) })).toBe(true)
  })
})

describe('nativeLockFn — predicado por chave nativa', () => {
  const s = screen({
    fields: [
      field({ id: 'n1', source: 'NATIVE', nativeKey: 'valor_total', mode: 'VIEW', locked: true }),
      field({ id: 'n2', source: 'NATIVE', nativeKey: 'titulo',      mode: 'VIEW' }),
    ],
  })

  it('trava só a chave marcada', () => {
    const lock = nativeLockFn(s)
    expect(lock('valor_total')).toBe(true)
    expect(lock('titulo')).toBe(false)
  })
  it('mode=VIEW herdado dos nativos NÃO trava — só `locked` trava', () => {
    // regressão: todo nativo nasce com mode 'VIEW'; se isso travasse, o cadastro inteiro congelaria
    expect(nativeLockFn(s)('titulo')).toBe(false)
  })
  it('chave que a tela não conhece não é travada', () => {
    expect(nativeLockFn(s)('chave_inexistente')).toBe(false)
  })
  it('tela em consulta trava qualquer chave', () => {
    expect(nativeLockFn(screen({ readOnly: true, fields: s.fields }))('titulo')).toBe(true)
  })
  it('a etapa do workflow trava um nativo pelo id do campo', () => {
    expect(nativeLockFn(s, { stepLocked: new Set(['n2']) })('titulo')).toBe(true)
  })
})

describe('screenIsReadOnly', () => {
  it('vem da tela ou da etapa', () => {
    expect(screenIsReadOnly(screen({ readOnly: true }))).toBe(true)
    expect(screenIsReadOnly(screen({}), true)).toBe(true)
    expect(screenIsReadOnly(screen({}))).toBe(false)
    expect(screenIsReadOnly(null)).toBe(false)
  })
})

describe('pendenciasDeTrava — obrigatório E travado', () => {
  it('acusa o campo obrigatório e travado', () => {
    const p = pendenciasDeTrava(screen({ fields: [field({ id: 'a', label: 'Valor', required: true, locked: true })] }))
    expect(p).toHaveLength(1)
    expect(p[0].label).toBe('Valor')
    expect(fraseDaPendencia(p[0])).toContain('obrigatório e está travado')
  })
  it('não acusa travado que não é obrigatório, nem obrigatório destravado', () => {
    expect(pendenciasDeTrava(screen({ fields: [field({ locked: true })] }))).toHaveLength(0)
    expect(pendenciasDeTrava(screen({ fields: [field({ required: true })] }))).toHaveLength(0)
  })
  it('campo oculto não é pendência (a obrigatoriedade não é exigida)', () => {
    expect(pendenciasDeTrava(screen({ fields: [field({ required: true, locked: true, visible: false })] }))).toHaveLength(0)
  })
  it('tela inteira em consulta não gera pendência — lá nada é gravado', () => {
    const s = screen({ readOnly: true, fields: [field({ required: true, locked: true })] })
    expect(pendenciasDeTrava(s)).toHaveLength(0)
  })
  it('Fornecedor: acusa por TIPO, e só onde o campo aparece e é exigido', () => {
    const s = screen({
      subjectType: 'FORNECEDOR',
      fields: [field({ id: 'a', label: 'IE', locked: true, required: true, requiredCategories: ['PJ_BR'], hiddenCategories: ['PF_BR', 'PF_EST'] })],
    })
    const p = pendenciasDeTrava(s)
    expect(p).toHaveLength(1)
    expect(p[0].categorias).toEqual(['PJ BR'])
    expect(fraseDaPendencia(p[0])).toContain('obrigatório em PJ BR')
  })
  it('Fornecedor: obrigatório só num tipo onde está oculto não é pendência', () => {
    const s = screen({
      subjectType: 'FORNECEDOR',
      fields: [field({ id: 'a', label: 'IE', locked: true, required: true, requiredCategories: ['PJ_BR'], hiddenCategories: ['PJ_BR'] })],
    })
    expect(pendenciasDeTrava(s)).toHaveLength(0)
  })
})

describe('secaoTotalmenteTravada — seção de lista sem nenhum campo editável', () => {
  const vis = (visiveis: string[]) => (k: string) => visiveis.includes(k)
  const lock = (travados: string[]) => (k: string) => travados.includes(k)
  const KEYS = ['con_nome', 'con_email', 'con_telefone']

  it('todos os visíveis travados → seção travada (não adiciona nem remove item)', () => {
    expect(secaoTotalmenteTravada(KEYS, vis(KEYS), lock(KEYS))).toBe(true)
  })
  it('um editável basta para continuar podendo adicionar e remover', () => {
    expect(secaoTotalmenteTravada(KEYS, vis(KEYS), lock(['con_nome', 'con_email']))).toBe(false)
  })
  it('campo travado que está OCULTO não conta — olha só o que aparece', () => {
    // con_telefone some da tela; os dois que sobram estão livres
    expect(secaoTotalmenteTravada(KEYS, vis(['con_nome', 'con_email']), lock(['con_telefone']))).toBe(false)
    // agora os dois visíveis estão travados: a seção fecha
    expect(secaoTotalmenteTravada(KEYS, vis(['con_nome', 'con_email']), lock(['con_nome', 'con_email']))).toBe(true)
  })
  it('seção sem campo visível nenhum NÃO conta como travada (ela nem aparece)', () => {
    expect(secaoTotalmenteTravada(KEYS, () => false, () => true)).toBe(false)
  })
})

const sec = (over: Partial<ScreenSection>): ScreenSection => ({
  id: over.id ?? 'sec1', label: 'Seção', name: 'secao', order: 0, defaultOpen: true, ...over,
})

describe('SEÇÃO travada — a camada do meio', () => {
  const tela = screen({
    sections: [sec({ id: 'A', locked: true }), sec({ id: 'B' })],
    fields: [
      field({ id: 'a1', sectionId: 'A' }),
      field({ id: 'b1', sectionId: 'B' }),
      field({ id: 'b2', sectionId: 'B', locked: true }),
    ],
  })
  const ctx = lockCtx(tela)

  it('a seção trava os campos dela, mesmo os destravados', () => {
    expect(fieldLocked(field({ id: 'a1', sectionId: 'A' }), ctx)).toBe(true)
  })
  it('campo de outra seção segue editável', () => {
    expect(fieldLocked(field({ id: 'b1', sectionId: 'B' }), ctx)).toBe(false)
  })
  it('a trava do campo continua valendo dentro de seção destravada', () => {
    expect(fieldLocked(field({ id: 'b2', sectionId: 'B', locked: true }), ctx)).toBe(true)
  })
  it('campo sem seção não é travado por seção nenhuma', () => {
    expect(fieldLocked(field({ id: 'solto' }), ctx)).toBe(false)
  })
  it('a tela em consulta é o piso: toda seção conta como travada', () => {
    const t = lockCtx(screen({ readOnly: true, sections: [sec({ id: 'B' })], fields: [] }))
    expect(sectionIsLocked(sec({ id: 'B' }), t)).toBe(true)
    expect(fieldLocked(field({ id: 'b1', sectionId: 'B' }), t)).toBe(true)
  })
  it('sectionIsLocked lê a própria seção e o contexto', () => {
    expect(sectionIsLocked(sec({ id: 'A', locked: true }))).toBe(true)
    expect(sectionIsLocked(sec({ id: 'A' }), ctx)).toBe(true)   // 'A' está no conjunto travado
    expect(sectionIsLocked(sec({ id: 'B' }), ctx)).toBe(false)
  })
  it('a ATIVIDADE segue apertando por cima da seção, sem destravar nada', () => {
    const comEtapa = lockCtx(tela, { stepLocked: new Set(['b1']) })
    expect(fieldLocked(field({ id: 'b1', sectionId: 'B' }), comEtapa)).toBe(true)
    expect(fieldLocked(field({ id: 'a1', sectionId: 'A' }), comEtapa)).toBe(true)
  })
})

describe('nativeLockFn e pendências enxergam a seção', () => {
  const tela = screen({
    sections: [sec({ id: 'A', locked: true }), sec({ id: 'B' })],
    fields: [
      field({ id: 'n1', sectionId: 'A', source: 'NATIVE', nativeKey: 'razao_social', mode: 'VIEW' }),
      field({ id: 'n2', sectionId: 'B', source: 'NATIVE', nativeKey: 'titulo', mode: 'VIEW' }),
    ],
  })

  it('nativo de seção travada é travado; o da seção livre não', () => {
    const lock = nativeLockFn(tela)
    expect(lock('razao_social')).toBe(true)
    expect(lock('titulo')).toBe(false)
  })
  it('obrigatório dentro de seção travada também é campo sem saída', () => {
    const t = screen({
      sections: [sec({ id: 'A', locked: true })],
      fields: [field({ id: 'c1', sectionId: 'A', label: 'Parecer', required: true })],
    })
    const p = pendenciasDeTrava(t)
    expect(p).toHaveLength(1)
    expect(fraseDaPendencia(p[0])).toContain('Parecer')
  })
})
