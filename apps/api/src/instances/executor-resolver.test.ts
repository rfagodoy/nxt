import { describe, expect, it } from 'vitest'
import { EXECUTOR_QUEM_INICIOU } from '@nxt/types'
import { entidadesDoStakeholder, ResolvedorDeExecutor } from './executor-resolver'

const ROT: Record<string, string> = { '3': 'Unidade contratante', '1': 'Contratante' }
const rotulo = (id: string) => ROT[id] ?? 'parte'
const contrato = (over: Record<string, unknown> = {}) => ({
  id: 'c1', numero: 'CT-1',
  partes: [
    { id: 'p1', papel: '3', ref_tipo: 'UNIDADE', ref_id: 'u1', nome: 'Diretoria Administrativa' },
    { id: 'p2', papel: '1', ref_tipo: 'PARCEIRO', ref_id: 'pa1', nome: 'ACME' },
  ],
  aditivos: [],
  ...over,
})
const solicitante = { entityType: 'UNIDADE', stakeholder: '3' }

describe('entidadesDoStakeholder', () => {
  it('acha a unidade que está como Unidade contratante', () => {
    expect(entidadesDoStakeholder(solicitante, contrato(), rotulo).entidades)
      .toEqual([{ tipo: 'UNIDADE', id: 'u1', nome: 'Diretoria Administrativa' }])
  })
  it('segue a parte VIGENTE: cessão por aditivo ativo troca a unidade', () => {
    const c = contrato({ aditivos: [{ id: 'a1', situacao: 'ATIVO', alteraPartes: true,
      cessoes: [{ id: 'x', parteId: 'p1', ref_tipo: 'UNIDADE', ref_id: 'u2', nome: 'Suprimentos', documento: '' }] }] })
    expect(entidadesDoStakeholder(solicitante, c, rotulo).entidades.map(e => e.nome)).toEqual(['Suprimentos'])
  })
  it('aditivo em rascunho não cede', () => {
    const c = contrato({ aditivos: [{ id: 'a1', situacao: 'RASCUNHO', alteraPartes: true,
      cessoes: [{ id: 'x', parteId: 'p1', ref_tipo: 'UNIDADE', ref_id: 'u2', nome: 'Suprimentos', documento: '' }] }] })
    expect(entidadesDoStakeholder(solicitante, c, rotulo).entidades.map(e => e.nome)).toEqual(['Diretoria Administrativa'])
  })
  it('duas partes com o mesmo papel → as duas', () => {
    const c = contrato({ partes: [
      { id: 'p1', papel: '3', ref_tipo: 'UNIDADE', ref_id: 'u1', nome: 'A' },
      { id: 'p3', papel: '3', ref_tipo: 'UNIDADE', ref_id: 'u9', nome: 'B' },
    ] })
    expect(entidadesDoStakeholder(solicitante, c, rotulo).entidades.map(e => e.id)).toEqual(['u1', 'u9'])
  })
  it('sem contrato / sem a parte / parte de outro tipo → diz por quê', () => {
    expect(entidadesDoStakeholder(solicitante, null, rotulo).falta).toBe('o processo não tem contrato')
    expect(entidadesDoStakeholder(solicitante, contrato({ partes: [] }), rotulo).falta).toBe('nenhuma parte do contrato está como “Unidade contratante”')
    expect(entidadesDoStakeholder({ entityType: 'EMPRESA', stakeholder: '1' }, contrato(), rotulo).falta)
      .toBe('quem está como “Contratante” neste contrato é um parceiro, não uma empresa do grupo')
  })
  it('@contrato = o próprio contrato do processo', () => {
    expect(entidadesDoStakeholder({ entityType: 'CONTRATO', stakeholder: '@contrato' }, contrato(), rotulo).entidades)
      .toEqual([{ tipo: 'CONTRATO', id: 'c1', nome: 'contrato CT-1' }])
  })
})

describe('ResolvedorDeExecutor.pessoasHoje (editor: "quem recebe hoje")', () => {
  const usuarios = [{ id: 'u1', name: 'Marina' }, { id: 'u2', name: 'João' }]
  const prisma = {
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      usuarios.filter(u => where.id.in.includes(u.id)).map(u => ({ name: u.name })).sort((a, b) => a.name.localeCompare(b.name)) },
  }
  const atribuicoes = (porEntidade: Record<string, string[]>) => ({
    resolveUsers: async (_org: string, _papel: string, tipo: string, id?: string) => porEntidade[`${tipo}:${id ?? ''}`] ?? [],
  })
  const novo = (porEntidade: Record<string, string[]>) =>
    new ResolvedorDeExecutor(prisma as never, atribuicoes(porEntidade) as never)

  it('entidade fixa: nomes de quem está no papel, em ordem', async () => {
    const r = novo({ 'UNIDADE:un1': ['u1', 'u2'] })
    expect(await r.pessoasHoje({ papelId: 'p', entityType: 'UNIDADE', mode: 'FIXA', entityId: 'un1' }, 'org')).toEqual(['João', 'Marina'])
  })
  it('papel global (ORG) não precisa de entidade', async () => {
    const r = novo({ 'ORG:': ['u1'] })
    expect(await r.pessoasHoje({ papelId: 'p', entityType: 'ORG', mode: 'FIXA' }, 'org')).toEqual(['Marina'])
  })
  it('ninguém no papel hoje = lista vazia', async () => {
    expect(await novo({}).pessoasHoje({ papelId: 'p', entityType: 'UNIDADE', mode: 'FIXA', entityId: 'un1' }, 'org')).toEqual([])
  })
  it('depende do processo (quem iniciou, do contrato, entidade não escolhida) = null', async () => {
    const r = novo({})
    expect(await r.pessoasHoje({ papelId: EXECUTOR_QUEM_INICIOU, entityType: 'ORG', mode: 'FIXA' }, 'org')).toBeNull()
    expect(await r.pessoasHoje({ papelId: 'p', entityType: 'UNIDADE', mode: 'VARIAVEL', stakeholder: '3' }, 'org')).toBeNull()
    expect(await r.pessoasHoje({ papelId: 'p', entityType: 'UNIDADE', mode: 'FIXA' }, 'org')).toBeNull()
  })
})
