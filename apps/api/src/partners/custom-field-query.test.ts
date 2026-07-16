import { describe, it, expect } from 'vitest'
import {
  type CustomFieldMeta, isNegateOp, optionValuesMatching,
  customValueWhere, displayCustomValue, customSearchOr,
} from './custom-field-query'

const text: CustomFieldMeta = { type: 'text', options: [] }
const sel: CustomFieldMeta = { type: 'select', options: [
  { value: 'adm', label: 'Administrativo' }, { value: 'ope', label: 'Operacional' },
] }
const multi: CustomFieldMeta = { type: 'multiselect', options: sel.options }

describe('isNegateOp', () => {
  it('reconhece negações', () => {
    expect(isNegateOp('neq')).toBe(true)
    expect(isNegateOp('notContains')).toBe(true)
    expect(isNegateOp('contains')).toBe(false)
    expect(isNegateOp('eq')).toBe(false)
  })
})

describe('customValueWhere — texto', () => {
  it('contains → value.contains', () => {
    expect(customValueWhere('contains', 'abc', text)).toEqual({ value: { contains: 'abc' } })
  })
  it('eq → value.equals', () => {
    expect(customValueWhere('eq', 'abc', text)).toEqual({ value: { equals: 'abc' } })
  })
  it('negação usa o operador BASE (a negação é aplicada como notIn pelo chamador)', () => {
    expect(customValueWhere('neq', 'abc', text)).toEqual({ value: { equals: 'abc' } })
    expect(customValueWhere('notStartsWith', 'ab', text)).toEqual({ value: { startsWith: 'ab' } })
  })
  it('operador sem suporte em texto cai em contains', () => {
    expect(customValueWhere('gt', 'x', text)).toEqual({ value: { contains: 'x' } })
  })
})

describe('customValueWhere — select', () => {
  it('resolve rótulo → values das opções', () => {
    expect(customValueWhere('contains', 'Administ', sel)).toEqual({ value: { in: ['adm'] } })
    expect(customValueWhere('eq', 'operacional', sel)).toEqual({ value: { in: ['ope'] } })
  })
  it('também casa pelo code', () => {
    expect(customValueWhere('contains', 'adm', sel)).toEqual({ value: { in: ['adm'] } })
  })
  it('sem opção casada → conjunto vazio (não casa nada)', () => {
    const r = customValueWhere('contains', 'zzz', sel) as { value: { in: string[] } }
    expect(r.value.in).toHaveLength(1)
    expect(r.value.in).not.toContain('adm')
    expect(r.value.in).not.toContain('ope')
  })
})

describe('customValueWhere — multiselect', () => {
  it('OR de contains com o value entre aspas', () => {
    expect(customValueWhere('contains', 'oper', multi)).toEqual({
      OR: [{ value: { contains: '"ope"' } }],
    })
  })
})

describe('optionValuesMatching', () => {
  it('casa por rótulo ou value, case-insensitive', () => {
    expect(optionValuesMatching('ADMIN', sel)).toEqual(['adm'])
    expect(optionValuesMatching('o', sel)).toEqual(['adm', 'ope']) // "administrativO" e "Operacional"
  })
  it('acento-insensível (alinha com a collation do SQL Server)', () => {
    const seg: CustomFieldMeta = { type: 'select', options: [{ value: 'ind', label: 'Indústria' }] }
    expect(optionValuesMatching('indus', seg)).toEqual(['ind'])   // sem acento casa acentuado
    expect(optionValuesMatching('INDÚS', seg)).toEqual(['ind'])
  })
})

describe('displayCustomValue', () => {
  it('select → rótulo', () => {
    expect(displayCustomValue('adm', sel)).toBe('Administrativo')
    expect(displayCustomValue('xxx', sel)).toBe('xxx')
  })
  it('multiselect (JSON) → rótulos juntos', () => {
    expect(displayCustomValue(JSON.stringify(['adm', 'ope']), multi)).toBe('Administrativo, Operacional')
  })
  it('texto passa direto; vazio → vazio', () => {
    expect(displayCustomValue('livre', text)).toBe('livre')
    expect(displayCustomValue('', sel)).toBe('')
  })
})

describe('customSearchOr', () => {
  it('inclui match cru + labels de select/multiselect', () => {
    const fields = new Map<string, CustomFieldMeta>([['f1', sel], ['f2', text]])
    const or = customSearchOr('operacional', fields)
    expect(or[0]).toEqual({ value: { contains: 'operacional' } })
    expect(or).toContainEqual({ fieldId: 'f1', value: { equals: 'ope' } })
  })
  it('campo de texto não contribui com resolução de rótulo', () => {
    const fields = new Map<string, CustomFieldMeta>([['f2', text]])
    expect(customSearchOr('abc', fields)).toEqual([{ value: { contains: 'abc' } }])
  })
})
