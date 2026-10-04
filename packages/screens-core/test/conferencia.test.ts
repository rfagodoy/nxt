import { describe, expect, it } from 'vitest'
import { contractFromApi, contractToPayload } from '@nxt/contracts-core'
import {
  alteracoesTravadas, buildNativeSeed, fraseDasTravas, reconcileNative,
  type Screen, type ScreenField,
} from '../index'

/* Tela do tipo com a estrutura nativa completa; `mexe` ajusta campos/seções por nativeKey. */
function tela(subject: 'CONTRATO' | 'FORNECEDOR', mexe: {
  readOnly?: boolean
  camposTravados?: string[]
  secoesTravadas?: string[]
  custom?: Partial<ScreenField>[]
} = {}): Screen {
  const seed = buildNativeSeed(subject)
  const fields = seed.fields.map(f => ({ ...f, locked: mexe.camposTravados?.includes(f.nativeKey!) ?? false }))
  const sections = seed.sections.map(s => ({ ...s, locked: mexe.secoesTravadas?.includes(s.nativeKey!) ?? false }))
  for (const [i, c] of (mexe.custom ?? []).entries())
    fields.push({
      id: c.id ?? `cf${i}`, fieldKey: c.fieldKey, sectionId: c.sectionId ?? sections[0].id, name: 'x', label: c.label ?? `Campo ${i}`,
      type: 'text', source: 'CUSTOM', mode: 'EDIT', visible: true, required: c.required ?? false, locked: c.locked ?? false, order: 99,
    } as ScreenField)
  return reconcileNative({
    id: 'tela1', name: 'Tela de teste', subjectType: subject, status: 'ACTIVE', isDefault: true,
    readOnly: mexe.readOnly ?? false, sections, fields,
  })
}

/* Contrato gravado como chega do banco — inclusive com o LEGADO que a tela normaliza. */
const contratoGravado = () => ({
  numero: 'C-1', titulo: 'Manutenção', tipo: 'SERVICO', natureza: 'DESPESA', situacao: 'VIGENTE',
  inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', prazoIndeterminado: false, acaoTermino: 'MANUAL',
  moeda: 'BRL', valorTotal: 1200, valorParcela: 100, qtdParcelas: 12, objeto: ['Manutenção'],
  partes: [{ id: 'p1', papel: 'CONTRATADA', ref_tipo: 'PARCEIRO', ref_id: 'x', nome: 'ACME', documento: '1' }],
  /* parcela antiga: sem id, sem reajustavel, valorPago nulo */
  pagamentos: [{ vencimento: '2026-02-01', data: '', valorPrevisto: 100, valorPago: null }],
  recebimentos: [], reajustes: [], reajustesRealizados: [], aditivos: [], documentos: [], renovacoes: [],
})
/* O que a tela manda quando a pessoa abre e salva sem mexer (ida e volta pelo formulário). */
const comoATelaManda = (c: Record<string, unknown>) => contractToPayload(contractFromApi(c), { user: 'Ana' })

describe('Contrato — campo travado', () => {
  it('abrir e salvar sem mexer passa, mesmo com legado (parcela sem id, padrões implícitos)', () => {
    const antes = contratoGravado()
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen: tela('CONTRATO', { camposTravados: ['valor_total', 'termino'], secoesTravadas: ['pagamentos', 'partes'] }),
      antes, depois: comoATelaManda(antes),
    })
    expect(r).toEqual([])
  })

  it('alterar um campo travado é recusado com o rótulo; outro campo livre passa', () => {
    const antes = contratoGravado()
    const screen = tela('CONTRATO', { camposTravados: ['valor_total'] })
    const ok = alteracoesTravadas({ subject: 'CONTRATO', screen, antes, depois: { ...comoATelaManda(antes), titulo: 'Outro' } })
    expect(ok).toEqual([])
    const r = alteracoesTravadas({ subject: 'CONTRATO', screen, antes, depois: { ...comoATelaManda(antes), valorTotal: 9999 } })
    expect(r.map(x => x.chave)).toEqual(['valor_total'])
    expect(fraseDasTravas(r)).toBe('“Valor total do contrato” está travado nesta tela e não pode ser alterado.')
  })

  it('campo de várias propriedades: mão de obra cobre o local', () => {
    const antes = { ...contratoGravado(), maoDeObra: true, maoDeObraLocal: 'CLIENTE' }
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen: tela('CONTRATO', { camposTravados: ['mao_de_obra'] }),
      antes, depois: { ...comoATelaManda(antes), maoDeObraLocal: 'CONTRATADA' },
    })
    expect(r.map(x => x.chave)).toEqual(['mao_de_obra'])
  })

  it('gravação parcial (só a situação) não toca campo travado', () => {
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen: tela('CONTRATO', { camposTravados: ['valor_total', 'titulo'] }),
      antes: contratoGravado(), depois: { situacao: 'ENCERRADO' },
    })
    expect(r).toEqual([])
  })

  it('seção-bloco travada: dar baixa numa parcela é alteração', () => {
    const antes = contratoGravado()
    const depois = comoATelaManda(antes) as { pagamentos: Record<string, unknown>[] }
    depois.pagamentos[0].valorPago = 100
    const r = alteracoesTravadas({ subject: 'CONTRATO', screen: tela('CONTRATO', { secoesTravadas: ['pagamentos'] }), antes, depois })
    expect(r.map(x => x.chave)).toEqual(['pagamentos'])
  })

  it('trocar a natureza (livre) apagaria pagamentos travados → recusa', () => {
    const antes = contratoGravado()
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen: tela('CONTRATO', { secoesTravadas: ['pagamentos'] }),
      antes, depois: comoATelaManda({ ...antes, natureza: 'RECEITA' }),
    })
    expect(r.map(x => x.chave)).toEqual(['pagamentos'])
  })

  it('camada da ATIVIDADE (lockedFields por fieldKey) aperta', () => {
    const antes = contratoGravado()
    const screen = tela('CONTRATO')
    const titulo = screen.fields.find(f => f.nativeKey === 'titulo')!
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen, lock: { stepLocked: new Set([titulo.fieldKey ?? titulo.id]) },
      antes, depois: { ...comoATelaManda(antes), titulo: 'Novo' },
    })
    expect(r.map(x => x.chave)).toEqual(['titulo'])
  })

  it('criar com campo travado preenchido passa (decisão do PO)', () => {
    const r = alteracoesTravadas({
      subject: 'CONTRATO', screen: tela('CONTRATO', { camposTravados: ['valor_total'] }),
      antes: null, depois: comoATelaManda(contratoGravado()),
    })
    expect(r).toEqual([])
  })
})

describe('Tela somente consulta', () => {
  const screen = tela('CONTRATO', { readOnly: true })
  it('não cria', () => {
    const r = alteracoesTravadas({ subject: 'CONTRATO', screen, antes: null, depois: comoATelaManda(contratoGravado()) })
    expect(fraseDasTravas(r)).toBe('A tela “Tela de teste” é somente consulta: nada pode ser gravado por ela.')
  })
  it('salvar sem mexer passa; mudar a situação não', () => {
    const antes = contratoGravado()
    expect(alteracoesTravadas({ subject: 'CONTRATO', screen, antes, depois: comoATelaManda(antes) })).toEqual([])
    expect(alteracoesTravadas({ subject: 'CONTRATO', screen, antes, depois: { situacao: 'ENCERRADO' } })).toHaveLength(1)
  })
  it('etapa em consulta (screenReadOnly por fora) vale igual', () => {
    const antes = contratoGravado()
    const r = alteracoesTravadas({ subject: 'CONTRATO', screen: tela('CONTRATO'), lock: { screenReadOnly: true }, antes, depois: { titulo: 'x' } })
    expect(r[0].motivo).toBe('tela-so-consulta')
  })
})

describe('Parceiro — listas com campo travado', () => {
  const parceiro = () => ({
    categoria: 'PJ_BR', status: 'ATIVO', razaoSocial: 'ACME LTDA', documento: '11222333000181',
    contatos: [{ id: 'c1', nome: 'Ana', email: 'ana@acme.com', telefone: '' }],
    enderecos: [], bancos: [], socios: [],
  })
  const screen = tela('FORNECEDOR', { camposTravados: ['con_email', 'cnpj'] })

  it('documento remascarado pela tela não é alteração', () => {
    const antes = parceiro()
    expect(alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, documento: '11.222.333/0001-81' } })).toEqual([])
  })
  it('linha em branco semeada pela tela não conta', () => {
    const antes = parceiro()
    expect(alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, enderecos: [{ id: 'e_1', cep: '' }] } })).toEqual([])
  })
  it('mudar o e-mail travado de um contato existente é recusado', () => {
    const antes = parceiro()
    const r = alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, contatos: [{ ...antes.contatos[0], email: 'x@y.com' }] } })
    expect(r.map(x => [x.chave, x.motivo])).toEqual([['con_email', 'travado']])
  })
  it('mudar um campo livre da mesma linha passa', () => {
    const antes = parceiro()
    expect(alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, contatos: [{ ...antes.contatos[0], nome: 'Ana Maria' }] } })).toEqual([])
  })
  it('linha nova com o campo travado preenchido é recusada; vazio passa', () => {
    const antes = parceiro()
    const nova = { id: 'c2', nome: 'Bia', email: '' }
    expect(alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, contatos: [...antes.contatos, nova] } })).toEqual([])
    const r = alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, contatos: [...antes.contatos, { ...nova, email: 'b@c.com' }] } })
    expect(r.map(x => x.chave)).toEqual(['con_email'])
  })
  it('remover linha com valor no campo travado é recusado (decisão do PO)', () => {
    const antes = parceiro()
    const r = alteracoesTravadas({ subject: 'FORNECEDOR', screen, antes, depois: { ...antes, contatos: [] } })
    expect(r.map(x => x.motivo)).toEqual(['linha-removida'])
    expect(fraseDasTravas(r)).toContain('Não é possível remover uma linha que tem “E-mail” preenchido')
  })
  it('o rótulo do documento que vale é o do tipo: CPF travado não prende um PJ', () => {
    const antes = parceiro()
    const r = alteracoesTravadas({
      subject: 'FORNECEDOR', screen: tela('FORNECEDOR', { camposTravados: ['cpf'] }),
      antes, depois: { ...antes, documento: '99888777000100' },
    })
    expect(r).toEqual([])
  })
  it('seção inteira travada prende todos os campos dela', () => {
    const antes = parceiro()
    const r = alteracoesTravadas({
      subject: 'FORNECEDOR', screen: tela('FORNECEDOR', { secoesTravadas: ['identificacao'] }),
      antes, depois: { ...antes, razaoSocial: 'OUTRA' },
    })
    expect(r.map(x => x.chave)).toEqual(['razao_social'])
  })
})

describe('Personalizados', () => {
  const screen = tela('CONTRATO', { custom: [{ id: 'linha9', fieldKey: 'cc', label: 'Centro de custo', locked: true }, { fieldKey: 'obs', label: 'Obs' }] })
  it('travado pela chave do campo no tipo: mudar recusa, repetir passa, ausente não mexe', () => {
    const base = { subject: 'CONTRATO' as const, screen, antes: contratoGravado(), depois: {}, customAntes: { cc: '100' } }
    expect(alteracoesTravadas({ ...base, customDepois: { cc: '100', obs: 'novo' } })).toEqual([])
    expect(alteracoesTravadas({ ...base, customDepois: { obs: 'novo' } })).toEqual([])
    expect(alteracoesTravadas({ ...base, customDepois: { cc: '200' } }).map(x => x.chave)).toEqual(['cc'])
  })
})
