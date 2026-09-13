import { describe, it, expect } from 'vitest'
import { emptyContractForm, newCParte, newCDocumento } from './contract-options'
import type { PartnerFormValues } from '@/components/partners/partner-fields'
import {
  faltantesContrato, faltantesParceiro, agruparPorSecao, rotuloDeSecao, camposDaSecao,
  SECOES_CONTRATO, SECOES_PARCEIRO,
} from './campos-obrigatorios'

const contrato = (over: Partial<ReturnType<typeof emptyContractForm>> = {}) =>
  ({ ...emptyContractForm(), partes: [newCParte('')], ...over })

/** contrato com todos os nativos obrigatórios preenchidos */
const contratoCheio = (over: Partial<ReturnType<typeof emptyContractForm>> = {}) => contrato({
  numero: 'CT-1', titulo: 'Galpão', tipo: 't1', inicioVigencia: '2026-01-01', valorTotal: '120000',
  partes: [{ ...newCParte(''), nome: 'ACME' }], ...over,
})

const parceiro = (over: Partial<PartnerFormValues> = {}) => ({
  category: 'PJ_BR', documento: '', razaoSocial: '', dataNascimento: '', paisOrigem: '',
  enderecos: [{ cep: '', estado: '', logradouro: '', numero: '', bairro: '', cidade: '', address1: '', pais_endereco: '' }],
  ...over,
}) as unknown as PartnerFormValues

const nomes = (itens: { campo: string }[]) => itens.map(i => i.campo)

describe('faltantesContrato', () => {
  it('rascunho cobra só Número e Título', () => {
    expect(nomes(faltantesContrato(contrato(), { acao: 'rascunho' }))).toEqual(['Número', 'Título'])
  })
  it('numeração automática não cobra o Número', () => {
    expect(nomes(faltantesContrato(contrato(), { acao: 'rascunho', autoNumero: true }))).toEqual(['Título'])
  })
  it('ativar lista TODOS os que faltam, cada um na sua seção', () => {
    const f = faltantesContrato(contrato({ numero: 'CT-1', titulo: 'Galpão' }), { acao: 'ativar' })
    expect(f).toEqual([
      { secao: 'dados_gerais', campo: 'Tipo de contrato' },
      { secao: 'vigencia', campo: 'Início da vigência' },
      { secao: 'partes', campo: 'Ao menos uma parte' },
      { secao: 'valor', campo: 'Valor total do contrato' },
    ])
  })
  it('ativar cobra o nome de cada documento anexado, numerando quando há mais de um', () => {
    const um = contratoCheio({ documentos: [newCDocumento()] })
    expect(faltantesContrato(um, { acao: 'ativar' })).toEqual([{ secao: 'documentos', campo: 'Nome do documento' }])
    const tres = contratoCheio({ documentos: [{ ...newCDocumento(), nome: 'Proposta' }, newCDocumento(), newCDocumento()] })
    expect(nomes(faltantesContrato(tres, { acao: 'ativar' }))).toEqual(['Nome do documento 2', 'Nome do documento 3'])
  })
  it('rascunho NÃO cobra valor total nem nome de documento', () => {
    expect(faltantesContrato(contrato({ numero: '1', titulo: 'T', documentos: [newCDocumento()] }), { acao: 'rascunho' })).toEqual([])
  })
  it('com tela: não cobra o que a tela esconde (seção ausente ou campo oculto)', () => {
    const cheio = contratoCheio({ valorTotal: '', documentos: [newCDocumento()] })
    const semSecoes = [{ key: 'dados_gerais', customFields: [] }]
    expect(faltantesContrato(cheio, { acao: 'ativar', secoes: semSecoes })).toEqual([])
    const valorOculto = [{ key: 'valor', customFields: [], screenVis: (k: string) => k !== 'valor_total' }]
    expect(faltantesContrato(cheio, { acao: 'ativar', secoes: valorOculto })).toEqual([])
    const valorVisivel = [{ key: 'valor', customFields: [], screenVis: () => true }, { key: 'documentos', customFields: [] }]
    expect(nomes(faltantesContrato(cheio, { acao: 'ativar', secoes: valorVisivel }))).toEqual(['Valor total do contrato', 'Nome do documento'])
  })
  it('ativar inclui campo personalizado obrigatório vazio, com o rótulo da tela', () => {
    const secoes = [{ key: 'sec_extra', label: 'Compliance', customFields: [
      { id: 'c1', label: 'Centro de custo', required: true },
      { id: 'c2', label: 'Observação', required: false },
      { id: 'c3', label: 'Aprovador', required: true },
    ] }]
    const f = faltantesContrato(contratoCheio(), { acao: 'ativar', secoes, valores: { c3: 'Maria', c2: '' } })
    expect(f).toEqual([{ secao: 'sec_extra', campo: 'Centro de custo' }])
  })
  it('rascunho NÃO cobra personalizado obrigatório', () => {
    const secoes = [{ key: 's', customFields: [{ id: 'c1', label: 'X', required: true }] }]
    expect(faltantesContrato(contrato({ numero: '1', titulo: 'T' }), { acao: 'rascunho', secoes, valores: {} })).toEqual([])
  })
})

describe('faltantesParceiro', () => {
  it('rascunho cobra só o nome (Razão Social na PJ, Nome Completo na PF)', () => {
    expect(nomes(faltantesParceiro(parceiro(), { acao: 'rascunho' }))).toEqual(['Razão Social'])
    expect(nomes(faltantesParceiro(parceiro({ category: 'PF_BR' }), { acao: 'rascunho' }))).toEqual(['Nome Completo'])
  })
  it('ativar PJ brasileira: CNPJ + endereço brasileiro completo', () => {
    const f = faltantesParceiro(parceiro({ razaoSocial: 'ACME' }), { acao: 'ativar' })
    expect(nomes(f)).toEqual(['CNPJ', 'CEP', 'Estado', 'Logradouro', 'Número', 'Bairro', 'Cidade'])
    expect(camposDaSecao(f, 'identificacao')).toEqual(['CNPJ'])
  })
  it('ativar PF estrangeira: Código, nascimento, país de origem e endereço internacional', () => {
    const f = faltantesParceiro(parceiro({ category: 'PF_EST', razaoSocial: 'John' }), { acao: 'ativar' })
    expect(nomes(f)).toEqual(['Código', 'Data de Nascimento', 'País de Origem', 'Endereço — Linha 1', 'Cidade', 'País'])
  })
})

describe('agruparPorSecao / rotuloDeSecao', () => {
  it('agrupa na ordem de aparição e usa o nome que a TELA deu à seção', () => {
    const itens = [
      { secao: 'dados_gerais', campo: 'Título' },
      { secao: 'vigencia', campo: 'Início da vigência' },
      { secao: 'dados_gerais', campo: 'Tipo de contrato' },
    ]
    const rotulo = rotuloDeSecao(SECOES_CONTRATO, [{ key: 'dados_gerais', label: 'Identificação do contrato' }])
    expect(agruparPorSecao(itens, rotulo)).toEqual([
      { secao: 'dados_gerais', rotulo: 'Identificação do contrato', campos: ['Título', 'Tipo de contrato'] },
      { secao: 'vigencia', rotulo: 'Vigência', campos: ['Início da vigência'] },
    ])
  })
  it('sem tela, cai no nome padrão; seção desconhecida mostra a chave', () => {
    const rotulo = rotuloDeSecao(SECOES_PARCEIRO)
    expect(rotulo('endereco')).toBe('Endereço')
    expect(rotulo('xyz')).toBe('xyz')
  })
})
