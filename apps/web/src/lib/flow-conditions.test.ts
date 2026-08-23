import { describe, it, expect } from 'vitest'
import { camposDisponiveis, gerarExpressao, rotuloDaCondicao, tipoDoCampo, type CampoDisponivel } from './flow-conditions'
import { evalCondition } from '@nxt/workflow-core'
import type { EdgeConditionSpec } from '@nxt/types'

/* fluxo: start → preencher (Tela contrato) → losango g1 → a / b
   e uma atividade FORA do caminho (depois do losango) que NÃO pode aparecer. */
const nodes = [
  { id: 'start', type: 'startEvent' },
  { id: 'preencher', type: 'userTask', step: { stepName: 'Preencher dados', screenRef: 'tela1', screenSubject: 'CONTRATO', fields: [] } },
  { id: 'legado', type: 'userTask', step: { stepName: 'Aprovação', fields: [
    { name: 'aprovacao', label: 'Aprovação', type: 'select', options: [{ label: 'Sim', value: 'Sim' }, { label: 'Não', value: 'Nao' }] },
    { name: 'anexo', label: 'Anexo', type: 'file' }, // não filtrável — não pode aparecer
  ] } },
  { id: 'g1', type: 'exclusiveGateway' },
  { id: 'depois', type: 'userTask', step: { stepName: 'Depois do losango', fields: [{ name: 'tardio', label: 'Tardio', type: 'text' }] } },
]
const edges = [
  { from: 'start', to: 'preencher' },
  { from: 'preencher', to: 'legado' },
  { from: 'legado', to: 'g1' },
  { from: 'g1', to: 'depois' },
]
const screens = [{
  id: 'tela1', name: 'Cadastro de Contrato', subjectType: 'CONTRATO',
  fields: [
    { id: 'fld_patrimonio', label: 'Necessita de parecer do Patrimônio', type: 'select', source: 'CUSTOM', options: [{ label: 'Sim', value: 'Sim' }, { label: 'Não', value: 'Nao' }] },
    { id: 'fld_nativo', label: 'Título', type: 'text', source: 'NATIVE' }, // nativo da Tela não entra (os nativos vêm da lista curada)
  ],
}]

describe('camposDisponiveis', () => {
  const campos = camposDisponiveis(nodes, edges, 'g1', screens)
  const keys = campos.map((c) => c.key)

  it('oferece o campo custom da Tela como contrato.<fieldId> (id estável)', () => {
    expect(keys).toContain('contrato.fld_patrimonio')
    const c = campos.find((x) => x.key === 'contrato.fld_patrimonio')!
    expect(c.tipo).toBe('selecao')
    expect(c.options?.map((o) => o.label)).toContain('Sim')
  })
  it('oferece os nativos curados do contrato e o campo legado da atividade', () => {
    expect(keys).toContain('contrato.valorTotal')
    expect(keys).toContain('aprovacao')
  })
  it('NÃO oferece campo de atividade DEPOIS do losango, nem tipo não-filtrável', () => {
    expect(keys).not.toContain('tardio')
    expect(keys).not.toContain('anexo')
  })
  it('sem Tela de contrato a montante, os contrato.* não aparecem', () => {
    const semTela = camposDisponiveis(nodes.filter((n) => n.id !== 'preencher'),
      edges.filter((e) => e.from !== 'preencher' && e.to !== 'preencher').concat([{ from: 'start', to: 'legado' }]), 'g1', screens)
    expect(semTela.map((c) => c.key)).not.toContain('contrato.valorTotal')
  })
})

describe('gerarExpressao → motor avalia (ponta a ponta com o parser real)', () => {
  const tipoDe = (k: string): CampoDisponivel['tipo'] => (k === 'contrato.valorTotal' ? 'numero' : 'selecao')

  it('caso do PO: parecer do Patrimônio = Sim desvia; Não cai no padrão', () => {
    const spec: EdgeConditionSpec = { logic: 'AND', rules: [{ campo: 'contrato.fld_patrimonio', op: 'eq', valor: 'Sim' }] }
    const expr = gerarExpressao(spec, tipoDe)
    expect(expr).toBe("contrato.fld_patrimonio == 'Sim'")
    expect(evalCondition(expr, { contrato: { fld_patrimonio: 'Sim' } })).toBe(true)
    expect(evalCondition(expr, { contrato: { fld_patrimonio: 'Nao' } })).toBe(false)
    expect(evalCondition(expr, {})).toBe(false) // contrato ainda não hidratado → padrão
  })

  it('número com vírgula + E/OU', () => {
    const spec: EdgeConditionSpec = { logic: 'OR', rules: [
      { campo: 'contrato.valorTotal', op: 'gt', valor: '100000,50' },
      { campo: 'contrato.fld_patrimonio', op: 'eq', valor: 'Sim' },
    ] }
    const expr = gerarExpressao(spec, tipoDe)
    expect(expr).toBe("contrato.valorTotal > 100000.5 || contrato.fld_patrimonio == 'Sim'")
    expect(evalCondition(expr, { contrato: { valorTotal: 200000, fld_patrimonio: 'Nao' } })).toBe(true)
    expect(evalCondition(expr, { contrato: { valorTotal: 5, fld_patrimonio: 'Nao' } })).toBe(false)
  })

  it('valor com aspas simples troca para aspas duplas (parser não tem escape)', () => {
    const spec: EdgeConditionSpec = { logic: 'AND', rules: [{ campo: 'contrato.fld_patrimonio', op: 'eq', valor: "D'Avila" }] }
    expect(gerarExpressao(spec, tipoDe)).toBe('contrato.fld_patrimonio == "D\'Avila"')
  })

  it('regra incompleta é ignorada (não gera expressão quebrada)', () => {
    const spec: EdgeConditionSpec = { logic: 'AND', rules: [{ campo: '', op: 'eq', valor: 'x' }, { campo: 'aprovacao', op: 'eq', valor: 'Sim' }] }
    expect(gerarExpressao(spec, () => 'selecao')).toBe("aprovacao == 'Sim'")
  })
})

describe('rotuloDaCondicao', () => {
  it('uma regra: "Campo é Valor"; várias: primeira + contador', () => {
    const labelDe = (k: string) => (k === 'contrato.fld_patrimonio' ? 'Parecer do Patrimônio' : k)
    const valorLabel = () => 'Sim'
    expect(rotuloDaCondicao({ logic: 'AND', rules: [{ campo: 'contrato.fld_patrimonio', op: 'eq', valor: 'Sim' }] }, labelDe, valorLabel))
      .toBe('Parecer do Patrimônio é Sim')
    expect(rotuloDaCondicao({ logic: 'AND', rules: [
      { campo: 'contrato.fld_patrimonio', op: 'eq', valor: 'Sim' },
      { campo: 'contrato.fld_patrimonio', op: 'neq', valor: 'X' },
    ] }, labelDe, valorLabel)).toBe('Parecer do Patrimônio é Sim e +1')
  })
})

describe('tipoDoCampo', () => {
  it('mapeia tipos e recusa os não-filtráveis', () => {
    expect(tipoDoCampo('currency')).toBe('numero')
    expect(tipoDoCampo('checkbox')).toBe('booleano')
    expect(tipoDoCampo('multiselect')).toBeNull()
    expect(tipoDoCampo('file')).toBeNull()
  })
})
