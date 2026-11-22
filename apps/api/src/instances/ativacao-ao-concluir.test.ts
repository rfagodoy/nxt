import { describe, expect, it } from 'vitest'
import { buildNativeSeed } from '@nxt/screens-core'
import { ativacaoAoConcluir } from './obrigatorios-da-tarefa'

/* "Ao concluir, ativa o contrato" (PO, 22/11/2026): o botão Ativar saiu da tarefa; a etapa
   marcada leva o contrato a Vigente, com os obrigatórios de ativação conferidos. */

const STEP = { stepId: 'N1', stepName: 'Validar', fields: [], screenRef: 's1', screenSubject: 'CONTRATO', entityMode: 'EDIT', ativaContratoAoConcluir: true } as const
const seed = buildNativeSeed('CONTRATO')
const tela = { id: 's1', name: 'T', subjectType: 'CONTRATO', status: 'ACTIVE', isDefault: false, readOnly: false, sections: seed.sections, fields: seed.fields.map(f => ({ ...f, required: false })) }
const completo = {
  id: 'c1', numero: 'C-1', titulo: 'T', situacao: 'EM_CADASTRO', tipo: 'tp', inicioVigencia: '2026-12-01',
  partes: [{ id: 'p', papel: 'x', nome: 'Fornecedor' }], valorTotal: 100, documentos: [],
}
const prisma = (contrato: Record<string, unknown> | null) => ({
  contract: { findFirst: async () => contrato },
  screen: { findFirst: async () => tela },
  screenFieldValue: { findMany: async () => [] },
}) as never

describe('ativacaoAoConcluir', () => {
  it('contrato completo em cadastro: ativa, sem faltantes', async () => {
    expect(await ativacaoAoConcluir(prisma(completo), 'org', STEP as never, { contratoId: 'c1' })).toEqual({ contratoId: 'c1', faltantes: [] })
  })

  it('faltando o que a ativação exige: devolve os campos', async () => {
    const r = await ativacaoAoConcluir(prisma({ ...completo, tipo: null, inicioVigencia: null }), 'org', STEP as never, { contratoId: 'c1' })
    expect(r?.faltantes.map(f => f.campo)).toEqual(expect.arrayContaining(['Tipo de contrato', 'Início da vigência']))
  })

  it('sem a marca, sem contrato ou já vigente: nada a ativar', async () => {
    expect(await ativacaoAoConcluir(prisma(completo), 'org', { ...STEP, ativaContratoAoConcluir: false } as never, { contratoId: 'c1' })).toBeNull()
    expect(await ativacaoAoConcluir(prisma(completo), 'org', STEP as never, {})).toBeNull()
    expect(await ativacaoAoConcluir(prisma({ ...completo, situacao: 'VIGENTE' }), 'org', STEP as never, { contratoId: 'c1' })).toBeNull()
  })

  it('etapa de consulta não ativa', async () => {
    expect(await ativacaoAoConcluir(prisma(completo), 'org', { ...STEP, entityMode: 'VIEW' } as never, { contratoId: 'c1' })).toBeNull()
  })
})
