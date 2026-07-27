import { describe, it, expect } from 'vitest'
import { diffCustom, valorExibivel, type CampoCustom } from './custom-audit'

/* Campos personalizados guardam o que o negócio do cliente tem de particular — e
   mudavam em silêncio. Um histórico que mostra "razão social alterada" e esconde
   "classificação de risco alterada" é pior do que não ter histórico: dá confiança de
   que está tudo registrado. */

const campos = new Map<string, CampoCustom>([
  ['f1', { id: 'f1', label: 'Classificação de risco', type: 'select', options: [{ value: 'a', label: 'Alto' }, { value: 'b', label: 'Baixo' }] }],
  ['f2', { id: 'f2', label: 'Segmentos', type: 'multiselect', options: [{ value: 'x', label: 'Varejo' }, { value: 'y', label: 'Indústria' }] }],
  ['f3', { id: 'f3', label: 'Observação', type: 'text' }],
  ['f4', { id: 'f4', label: 'Homologado', type: 'checkbox' }],
])

describe('valorExibivel', () => {
  it('troca o código da opção pelo rótulo que a pessoa vê', () => {
    expect(valorExibivel('a', campos.get('f1'))).toBe('Alto')
  })

  it('resolve multiselect para os rótulos, na ordem', () => {
    expect(valorExibivel('["x","y"]', campos.get('f2'))).toBe('Varejo, Indústria')
  })

  it('mantém o valor cru quando a opção não existe mais (definição mudou depois)', () => {
    expect(valorExibivel('z', campos.get('f1'))).toBe('z')
  })

  it('traduz booleano para Sim/Não', () => {
    expect(valorExibivel('true', campos.get('f4'))).toBe('Sim')
    expect(valorExibivel('false', campos.get('f4'))).toBe('Não')
  })

  it('texto passa direto', () => {
    expect(valorExibivel('qualquer coisa', campos.get('f3'))).toBe('qualquer coisa')
  })

  it('vazio continua vazio', () => {
    expect(valorExibivel('', campos.get('f1'))).toBe('')
    expect(valorExibivel(null)).toBe('')
  })

  it('multiselect com JSON quebrado não derruba — devolve o cru', () => {
    expect(valorExibivel('["x",', campos.get('f2'))).toBe('["x",')
  })
})

describe('diffCustom', () => {
  it('registra a mudança com os RÓTULOS, não com os códigos', () => {
    const d = diffCustom(new Map([['f1', 'a']]), new Map([['f1', 'b']]), campos)
    expect(d).toEqual([{ field: 'custom.f1', label: 'Classificação de risco', before: 'Alto', after: 'Baixo' }])
  })

  it('não registra o que não mudou', () => {
    expect(diffCustom(new Map([['f1', 'a']]), new Map([['f1', 'a']]), campos)).toEqual([])
  })

  it('preenchimento pela primeira vez aparece como "—" → valor', () => {
    const d = diffCustom(new Map(), new Map([['f3', 'texto novo']]), campos)
    expect(d[0]).toMatchObject({ before: '—', after: 'texto novo' })
  })

  it('apagar um valor aparece como valor → "—"', () => {
    const d = diffCustom(new Map([['f3', 'antigo']]), new Map([['f3', '']]), campos)
    expect(d[0]).toMatchObject({ before: 'antigo', after: '—' })
  })

  it('campo AUSENTE na gravação não vira apagamento', () => {
    // a tela pode estar salvando só parte dos campos — tratar ausência como remoção
    // registraria apagamentos que nunca aconteceram
    expect(diffCustom(new Map([['f1', 'a'], ['f3', 'x']]), new Map([['f1', 'a']]), campos)).toEqual([])
  })

  it('campo sem definição conhecida ainda é registrado, com rótulo genérico', () => {
    const d = diffCustom(new Map(), new Map([['desconhecido', 'v']]), campos)
    expect(d[0]).toMatchObject({ field: 'custom.desconhecido', label: 'Campo personalizado', after: 'v' })
  })

  it('ignora diferença que é só espaço em volta', () => {
    expect(diffCustom(new Map([['f3', 'texto']]), new Map([['f3', '  texto  ']]), campos)).toEqual([])
  })

  it('junta várias mudanças numa passada', () => {
    const d = diffCustom(
      new Map([['f1', 'a'], ['f3', 'velho']]),
      new Map([['f1', 'b'], ['f3', 'novo'], ['f4', 'true']]),
      campos,
    )
    expect(d.length).toBe(3)
    expect(d.map((x) => x.label)).toEqual(['Classificação de risco', 'Observação', 'Homologado'])
  })
})
