import { describe, expect, it } from 'vitest'
import type { StepFormSchema } from '@nxt/types'
import {
  buildNativeSeed, faltantesDaGravacao, faltantesDaTarefa, fraseDosFaltantes, nativoObrigatorioConfiguravel,
  reconcileNative, type Screen, type ScreenField,
} from '../index'

/* Tela de Contrato com `nativos` marcados como obrigatórios; `mexe` ajusta campo a campo. */
function tela(o: {
  id?: string
  nativos?: string[]
  travados?: string[]
  ocultos?: string[]
  secoesOcultas?: string[]
  custom?: Partial<ScreenField>[]
} = {}): Screen {
  const seed = buildNativeSeed('CONTRATO')
  return reconcileNative({
    id: o.id ?? 'tela1', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: true,
    sections: seed.sections.map(s => ({ ...s, visible: !o.secoesOcultas?.includes(s.nativeKey!) })),
    fields: [
      ...seed.fields.map(f => ({
        ...f,
        required: o.nativos?.includes(f.nativeKey!) ?? false,
        locked: o.travados?.includes(f.nativeKey!) ?? false,
        visible: !o.ocultos?.includes(f.nativeKey!),
      })),
      ...(o.custom ?? []).map((c, i) => ({
        id: `c${i}`, fieldKey: c.fieldKey, sectionId: seed.sections[0].id, name: 'x', label: c.label ?? 'X', type: 'text',
        source: 'CUSTOM', mode: 'EDIT', visible: c.visible ?? true, required: !!c.required, locked: !!c.locked, order: 50,
      } as ScreenField)),
    ],
  })
}

const etapa = (over: Partial<StepFormSchema> = {}) =>
  ({ stepId: 'n1', stepName: 'Preencher', fields: [], screenRef: 'tela1', screenSubject: 'CONTRATO', entityMode: 'EDIT', ...over }) as StepFormSchema

const contrato = (over: Record<string, unknown> = {}) => ({ numero: 'C-1', titulo: 'T', situacao: 'EM_CADASTRO', partes: [], ...over })
const nomes = (r: { campo: string }[]) => r.map(x => x.campo)

describe('quais nativos aceitam a marca Obrigatório', () => {
  it.each(['mao_de_obra', 'tipo', 'inicio', 'termino', 'valor_total', 'objeto', 'moeda'])('%s aceita', k => {
    expect(nativoObrigatorioConfiguravel('CONTRATO', k)).toBe(true)
  })
  it.each(['numero', 'titulo', 'situacao', 'prazo_indeterminado'])('%s não aceita', k => {
    expect(nativoObrigatorioConfiguravel('CONTRATO', k)).toBe(false)
  })
  it('campo nativo de Fornecedor não aceita', () => {
    expect(nativoObrigatorioConfiguravel('FORNECEDOR', 'razao_social')).toBe(false)
  })
})

describe('conclusão da atividade', () => {
  const faltam = (o: { telas?: Screen[]; step?: StepFormSchema; registro?: Record<string, unknown>; valores?: Record<string, string> } = {}) =>
    nomes(faltantesDaTarefa({ step: o.step ?? etapa(), telas: o.telas ?? [tela({ nativos: ['mao_de_obra'] })], registro: o.registro ?? contrato(), valores: o.valores ?? {} }))

  it('nativo obrigatório em branco é cobrado pelo nome', () => {
    expect(faltam()).toEqual(['Mão de obra alocada'])
  })
  it('responder Não conta como preenchido', () => {
    expect(faltam({ registro: contrato({ maoDeObra: false }) })).toEqual([])
    expect(faltam({ registro: contrato({ maoDeObra: true }) })).toEqual([])
  })
  it('personalizado obrigatório é cobrado mesmo com o contrato em rascunho', () => {
    const telas = [tela({ custom: [{ fieldKey: 'pat', label: 'Parecer do Patrimônio', required: true }] })]
    expect(faltam({ telas })).toEqual(['Parecer do Patrimônio'])
    expect(faltam({ telas, valores: { pat: 'Não' } })).toEqual([])
  })
  it('valor zerado conta como em branco', () => {
    const telas = [tela({ nativos: ['valor_total'] })]
    expect(faltam({ telas, registro: contrato({ valorTotal: 0 }) })).toEqual(['Valor total do contrato'])
    expect(faltam({ telas, registro: contrato({ valorTotal: 10 }) })).toEqual([])
  })
  it('lista vazia conta como em branco', () => {
    const telas = [tela({ nativos: ['objeto'] })]
    expect(faltam({ telas, registro: contrato({ objeto: [] }) })).toEqual(['Objeto do contrato'])
    expect(faltam({ telas, registro: contrato({ objeto: ['x'] }) })).toEqual([])
  })
  it('término não é cobrado em prazo indeterminado, porque o campo some', () => {
    const telas = [tela({ nativos: ['termino'] })]
    expect(faltam({ telas })).toEqual(['Término da vigência'])
    expect(faltam({ telas, registro: contrato({ prazoIndeterminado: true }) })).toEqual([])
  })
  it('o que a pessoa não consegue preencher não é cobrado', () => {
    expect(faltam({ telas: [tela({ nativos: ['mao_de_obra'], ocultos: ['mao_de_obra'] })] })).toEqual([])
    expect(faltam({ telas: [tela({ nativos: ['mao_de_obra'], travados: ['mao_de_obra'] })] })).toEqual([])
    expect(faltam({ telas: [tela({ nativos: ['mao_de_obra'], secoesOcultas: ['dados_gerais'] })] })).toEqual([])
  })
  it('campo travado pela própria atividade não é cobrado', () => {
    const t = tela({ nativos: ['mao_de_obra'] })
    const f = t.fields.find(x => x.nativeKey === 'mao_de_obra')!
    expect(faltam({ telas: [t], step: etapa({ lockedFields: [f.fieldKey ?? f.id] }) })).toEqual([])
  })
  it('atividade de consulta não cobra nada', () => {
    expect(faltam({ step: etapa({ entityMode: 'VIEW' }) })).toEqual([])
  })
  it('aba adicional editável cobra; aba adicional de consulta não', () => {
    const principal = tela()
    const extra = tela({ id: 'tela2', nativos: ['mao_de_obra'] })
    const com = (mode: 'EDIT' | 'VIEW') => etapa({ extraScreens: [{ screenRef: 'tela2', mode }] } as Partial<StepFormSchema>)
    expect(faltam({ telas: [principal, extra], step: com('EDIT') })).toEqual(['Mão de obra alocada'])
    expect(faltam({ telas: [principal, extra], step: com('VIEW') })).toEqual([])
  })
  it('o mesmo campo em duas abas aparece uma vez só', () => {
    const extra = tela({ id: 'tela2', nativos: ['mao_de_obra'] })
    const step = etapa({ extraScreens: [{ screenRef: 'tela2', mode: 'EDIT' }] } as Partial<StepFormSchema>)
    expect(faltam({ telas: [tela({ nativos: ['mao_de_obra'] }), extra], step })).toEqual(['Mão de obra alocada'])
  })
  it('atividade que não é de contrato não cobra', () => {
    expect(faltam({ step: etapa({ screenSubject: 'FORNECEDOR' }) })).toEqual([])
  })
  it('a frase diz concluir', () => {
    expect(fraseDosFaltantes([{ secao: 'dados_gerais', campo: 'Mão de obra alocada' }], 'concluir'))
      .toBe('Para concluir, preencha “Mão de obra alocada”.')
  })
})

describe('gravação do contrato fora da atividade', () => {
  const pronto = { ...contrato(), tipo: 'S', inicioVigencia: '2026-01-01', valorTotal: 10, partes: [{ nome: 'ACME' }] }

  it('ativar cobra o nativo marcado na tela', () => {
    const r = faltantesDaGravacao({ subject: 'CONTRATO', screen: tela({ nativos: ['mao_de_obra'] }), antes: pronto, depois: { situacao: 'VIGENTE' } })
    expect(nomes(r)).toEqual(['Mão de obra alocada'])
  })
  it('salvar rascunho continua sem cobrar', () => {
    const r = faltantesDaGravacao({ subject: 'CONTRATO', screen: tela({ nativos: ['mao_de_obra'] }), antes: pronto, depois: { titulo: 'Outro' } })
    expect(r).toEqual([])
  })
  it('campo que o sistema já exige ao ativar não sai repetido', () => {
    const r = faltantesDaGravacao({ subject: 'CONTRATO', screen: tela({ nativos: ['tipo'] }), antes: { ...pronto, tipo: '' }, depois: { situacao: 'VIGENTE' } })
    expect(nomes(r)).toEqual(['Tipo de contrato'])
  })
})
