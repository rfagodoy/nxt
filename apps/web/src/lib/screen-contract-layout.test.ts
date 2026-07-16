import { describe, it, expect } from 'vitest'
import { buildNativeSeed, reconcileNative } from './screen-native-structure'
import { resolveContractSections, CONTRACT_BLOCK_SECTIONS } from './screen-contract-layout'
import type { Screen, ScreenField, ScreenSection } from './screen-types'

/** Tela padrão de Contrato a partir da estrutura nativa viva (como no cadastro real). */
function contractScreen(): Screen {
  const seed = buildNativeSeed('CONTRATO')
  return {
    id: 'scr_contr', name: 'Contrato', subjectType: 'CONTRATO',
    status: 'ACTIVE', isDefault: true, isSystem: true,
    sections: seed.sections, fields: seed.fields,
  }
}

const keys = (screen: Screen, natureza: string, mode: 'new' | 'detail') =>
  resolveContractSections(screen, natureza, mode).map(s => s.nativeKey)

describe('resolveContractSections — gating por natureza', () => {
  it('DESPESA mostra Pagamentos e oculta Recebimentos', () => {
    const k = keys(contractScreen(), 'DESPESA', 'detail')
    expect(k).toContain('pagamentos')
    expect(k).not.toContain('recebimentos')
  })

  it('RECEITA mostra Recebimentos e oculta Pagamentos', () => {
    const k = keys(contractScreen(), 'RECEITA', 'detail')
    expect(k).toContain('recebimentos')
    expect(k).not.toContain('pagamentos')
  })

  it('AMBOS mostra os dois', () => {
    const k = keys(contractScreen(), 'AMBOS', 'detail')
    expect(k).toContain('pagamentos')
    expect(k).toContain('recebimentos')
  })
})

describe('resolveContractSections — gating por modo', () => {
  it('cadastro novo esconde Aditivos e Histórico', () => {
    const k = keys(contractScreen(), 'AMBOS', 'new')
    expect(k).not.toContain('aditivos')
    expect(k).not.toContain('historico')
  })

  it('detalhe inclui Aditivos e Histórico', () => {
    const k = keys(contractScreen(), 'AMBOS', 'detail')
    expect(k).toContain('aditivos')
    expect(k).toContain('historico')
  })
})

describe('resolveContractSections — visibilidade e seções', () => {
  it('screenVis reflete o campo nativo desligado na tela', () => {
    const screen = contractScreen()
    // desliga o campo "descricao" de Dados Gerais
    screen.fields = screen.fields.map(f => f.nativeKey === 'descricao' ? { ...f, visible: false } : f)
    const dados = resolveContractSections(screen, 'AMBOS', 'detail').find(s => s.nativeKey === 'dados_gerais')!
    expect(dados.screenVis('descricao')).toBe(false)
    expect(dados.screenVis('titulo')).toBe(true)
    // chave desconhecida → visível (não esconde por engano)
    expect(dados.screenVis('inexistente')).toBe(true)
  })

  it('seção de CAMPOS esvaziada (todos os nativos ocultos, sem custom) some', () => {
    const screen = contractScreen()
    screen.fields = screen.fields.map(f =>
      f.source === 'NATIVE' && f.sectionId === 'nsec_valor' ? { ...f, visible: false } : f)
    const k = keys(screen, 'AMBOS', 'detail')
    expect(k).not.toContain('valor')
    // seção-bloco (partes) permanece mesmo sem campos nativos
    expect(k).toContain('partes')
    expect(CONTRACT_BLOCK_SECTIONS.has('partes')).toBe(true)
  })

  it('campo personalizado aparece na seção correspondente', () => {
    const screen = contractScreen()
    screen.fields = [...screen.fields, {
      id: 'cfld_x', sectionId: 'nsec_dados_gerais', name: 'ref_externa', label: 'Ref. externa',
      type: 'text', source: 'CUSTOM', mode: 'EDIT', visible: true, required: false, order: 99,
    }]
    const dados = resolveContractSections(screen, 'AMBOS', 'detail').find(s => s.nativeKey === 'dados_gerais')!
    expect(dados.customFields.map(f => f.id)).toContain('cfld_x')
  })

  it('seção da tela marcada como oculta não aparece', () => {
    const screen = contractScreen()
    screen.sections = screen.sections.map(s => s.nativeKey === 'reajuste' ? { ...s, visible: false } : s)
    expect(keys(screen, 'AMBOS', 'detail')).not.toContain('reajuste')
  })
})

/** Tela ANTIGA (pré-R3): 2 seções (dados_gerais + vigencia_valor). reconcileNative deve
 *  podar `vigencia_valor`, re-parentar os campos migrados e semear a estrutura nova. */
function staleContractScreen(): Screen {
  const sec = (key: string, label: string, order: number): ScreenSection => ({
    id: `nsec_${key}`, label, name: key, source: 'NATIVE', nativeKey: key, visible: true, order, defaultOpen: order === 0,
  })
  const fld = (key: string, sectionKey: string, order: number): ScreenField => ({
    id: `nfld_${key}`, sectionId: `nsec_${sectionKey}`, name: key, label: key,
    type: 'text', source: 'NATIVE', nativeKey: key, mode: 'VIEW', visible: true, required: false, order,
  })
  return {
    id: 'scr_old', name: 'Contrato', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: true, isSystem: true,
    sections: [sec('dados_gerais', 'Dados Gerais', 0), sec('vigencia_valor', 'Vigência e Valor', 1)],
    fields: [
      fld('numero', 'dados_gerais', 0), fld('titulo', 'dados_gerais', 1), fld('tipo', 'dados_gerais', 2),
      fld('natureza', 'dados_gerais', 3), fld('objeto', 'dados_gerais', 4), fld('parte_principal', 'dados_gerais', 5),
      fld('inicio', 'vigencia_valor', 0), fld('termino', 'vigencia_valor', 1), fld('moeda', 'vigencia_valor', 2),
      fld('valor_total', 'vigencia_valor', 3), fld('valor_parcela', 'vigencia_valor', 4),
      fld('condicao_pagamento', 'vigencia_valor', 5), fld('data_assinatura', 'vigencia_valor', 6),
    ],
  }
}

describe('reconcileNative — migração da tela antiga de Contrato', () => {
  it('poda vigencia_valor, re-parenta campos e semeia a estrutura nova', () => {
    const reconciled = reconcileNative(staleContractScreen())
    const k = resolveContractSections(reconciled, 'AMBOS', 'detail').map(s => s.nativeKey)
    // seção órfã sumiu; as novas seções de campos aparecem (não vazias)
    expect(k).not.toContain('vigencia_valor')
    expect(k).toContain('vigencia')
    expect(k).toContain('valor')
    // campos migrados foram re-parentados e ficam visíveis na seção nova
    const vig = resolveContractSections(reconciled, 'AMBOS', 'detail').find(s => s.nativeKey === 'vigencia')!
    const val = resolveContractSections(reconciled, 'AMBOS', 'detail').find(s => s.nativeKey === 'valor')!
    expect(vig.screenVis('inicio')).toBe(true)
    expect(val.screenVis('moeda')).toBe(true)
    // campo nativo que saiu da estrutura (parte_principal) foi podado
    expect(reconciled.fields.some(f => f.nativeKey === 'parte_principal')).toBe(false)
    // seções-bloco novas presentes
    expect(k).toContain('partes')
    expect(k).toContain('reajuste')
  })
})
