import { describe, expect, it } from 'vitest'
import type { StepFormSchema } from '@nxt/types'
import {
  buildNativeSeed, campoDoFiltroExigivel, camposCobradosAoConcluir, reconcileNative, rotulosDosCamposDoFiltro,
  type Screen, type ScreenField,
} from '../index'

function tela(o: { id?: string; nativos?: string[]; travados?: string[]; ocultos?: string[]; custom?: Partial<ScreenField>[] } = {}): Screen {
  const seed = buildNativeSeed('CONTRATO')
  return reconcileNative({
    id: o.id ?? 'tela1', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: true,
    sections: seed.sections,
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
  ({ stepId: 'n1', stepName: 'Preencher', fields: [], screenRef: 'tela1', screenSubject: 'CONTRATO', entityMode: 'CREATE', ...over }) as StepFormSchema

const cobrados = (step: StepFormSchema, telas: Screen[]) => [...camposCobradosAoConcluir(step, telas)].sort()

describe('camposCobradosAoConcluir', () => {
  it('nativo obrigatório sai na chave do filtro', () => {
    expect(cobrados(etapa(), [tela({ nativos: ['mao_de_obra', 'valor_total', 'inicio'] })]))
      .toEqual(['contrato.inicioVigencia', 'contrato.maoDeObra', 'contrato.valorTotal'])
  })

  it('personalizado obrigatório sai pela chave do campo', () => {
    expect(cobrados(etapa(), [tela({ custom: [{ fieldKey: 'cf_area', required: true }, { fieldKey: 'cf_obs' }] })]))
      .toEqual(['contrato.cf_area'])
  })

  it('oculto ou travado não conta', () => {
    const t = tela({ nativos: ['mao_de_obra', 'moeda'], ocultos: ['moeda'], custom: [{ fieldKey: 'cf_a', required: true, locked: true }] })
    expect(cobrados(etapa(), [t])).toEqual(['contrato.maoDeObra'])
  })

  it('campo travado pela atividade (ao editar) não conta', () => {
    const t = tela({ nativos: ['mao_de_obra'] })
    const mo = t.fields.find(f => f.nativeKey === 'mao_de_obra')!.id
    expect(cobrados(etapa({ entityMode: 'EDIT', lockedFields: [mo] }), [t])).toEqual([])
  })

  it('consulta não cobra nada; aba adicional de consulta também não', () => {
    const principal = tela({ id: 't1' })
    const extra = tela({ id: 't2', nativos: ['mao_de_obra'] })
    expect(cobrados(etapa({ screenRef: 't2', entityMode: 'VIEW' }), [extra])).toEqual([])
    expect(cobrados(etapa({ screenRef: 't1', extraScreens: [{ screenRef: 't2', mode: 'VIEW' }] }), [principal, extra])).toEqual([])
    expect(cobrados(etapa({ screenRef: 't1', extraScreens: [{ screenRef: 't2', mode: 'EDIT' }] }), [principal, extra])).toEqual(['contrato.maoDeObra'])
  })

  it('atividade sem tela de contrato não cobra', () => {
    expect(cobrados(etapa({ screenSubject: 'FORNECEDOR' }), [tela({ nativos: ['mao_de_obra'] })])).toEqual([])
    expect(cobrados(etapa({ screenRef: undefined }), [tela({ nativos: ['mao_de_obra'] })])).toEqual([])
  })
})

describe('campoDoFiltroExigivel', () => {
  it.each(['contrato.maoDeObra', 'contrato.valorTotal', 'contrato.cf_area'])('%s é conferido', c => {
    expect(campoDoFiltroExigivel(c)).toBe(true)
  })
  it.each(['contrato.situacao', 'contrato.prazoIndeterminado', 'contrato.maoDeObraLocal', 'aprovado'])('%s fica de fora', c => {
    expect(campoDoFiltroExigivel(c)).toBe(false)
  })
})

describe('rotulosDosCamposDoFiltro', () => {
  it('nativos pelo cadastro padrão e personalizados pela tela', () => {
    const r = rotulosDosCamposDoFiltro([tela({ custom: [{ fieldKey: 'cf_area', label: 'Área solicitante' }] })])
    expect(r.get('contrato.maoDeObra')).toBe('Mão de obra alocada')
    expect(r.get('contrato.cf_area')).toBe('Área solicitante')
  })
})
