import { describe, it, expect } from 'vitest'
import { buildNativeSeed, reconcileNative } from './screen-native-structure'
import type { Screen, ScreenField } from './screen-types'

const campo = (screen: { fields: ScreenField[] }, nativeKey: string) =>
  screen.fields.find(f => f.nativeKey === nativeKey)

describe('buildNativeSeed — o tipo do campo nativo é o widget real do formulário', () => {
  it('Contrato: data, valor, lista e texto longo não são todos "texto"', () => {
    const seed = buildNativeSeed('CONTRATO')
    expect(campo(seed, 'data_assinatura')?.type).toBe('date')
    expect(campo(seed, 'valor_total')?.type).toBe('currency')
    expect(campo(seed, 'qtd_parcelas')?.type).toBe('number')
    expect(campo(seed, 'tipo')?.type).toBe('select')
    expect(campo(seed, 'descricao')?.type).toBe('textarea')
    expect(campo(seed, 'prazo_indeterminado')?.type).toBe('checkbox')
    expect(campo(seed, 'objeto')?.type).toBe('multiselect')
  })

  it('Contrato: campo sem tipo declarado continua texto', () => {
    expect(campo(buildNativeSeed('CONTRATO'), 'numero')?.type).toBe('text')
    expect(campo(buildNativeSeed('CONTRATO'), 'titulo')?.type).toBe('text')
  })

  it('Fornecedor: e-mail, telefone, data e lista têm o próprio tipo', () => {
    const seed = buildNativeSeed('FORNECEDOR')
    expect(campo(seed, 'con_email')?.type).toBe('email')
    expect(campo(seed, 'con_telefone')?.type).toBe('phone')
    expect(campo(seed, 'data_abertura')?.type).toBe('date')
    expect(campo(seed, 'natureza_juridica')?.type).toBe('select')
    expect(campo(seed, 'soc_participacao')?.type).toBe('number')
    expect(campo(seed, 'razao_social')?.type).toBe('text')
  })
})

describe('reconcileNative — o sistema é dono da forma do campo nativo', () => {
  /** Tela gravada ANTES de os tipos nativos existirem: tudo veio como 'text'. */
  const telaAntiga = (): Screen => {
    const seed = buildNativeSeed('CONTRATO')
    return {
      id: 's1', name: 'Antiga', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: false,
      sections: seed.sections,
      fields: seed.fields.map(f => ({ ...f, type: 'text' as const })),
    }
  }

  it('corrige o tipo de quem foi gravado como texto', () => {
    const antes = telaAntiga()
    expect(campo(antes, 'valor_total')?.type).toBe('text')

    const depois = reconcileNative(antes)
    expect(campo(depois, 'valor_total')?.type).toBe('currency')
    expect(campo(depois, 'data_assinatura')?.type).toBe('date')
  })

  it('não inventa tipo para campo personalizado — esse é do usuário', () => {
    const base = telaAntiga()
    const meu: ScreenField = {
      id: 'sf_1', sectionId: base.sections[0].id, name: 'meu', label: 'Meu campo',
      type: 'select', source: 'CUSTOM', mode: 'EDIT', visible: true, required: false, order: 99,
    }
    const depois = reconcileNative({ ...base, fields: [...base.fields, meu] })
    expect(depois.fields.find(f => f.id === 'sf_1')?.type).toBe('select')
  })

  it('mantém as marcações da tela (aparece / travado) ao corrigir o tipo', () => {
    const base = telaAntiga()
    const comMarcas = {
      ...base,
      fields: base.fields.map(f => f.nativeKey === 'valor_total' ? { ...f, visible: false, locked: true } : f),
    }
    const alvo = campo(reconcileNative(comMarcas), 'valor_total')
    expect(alvo?.type).toBe('currency')
    expect(alvo?.visible).toBe(false)
    expect(alvo?.locked).toBe(true)
  })
})
