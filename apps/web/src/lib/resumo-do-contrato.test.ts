import { describe, it, expect } from 'vitest'
import { resumoDoContrato } from './resumo-do-contrato'
import { emptyContractForm, newCLancamento } from './contract-options'
import { INIT_PAPEIS } from './contract-roles'

const HOJE = '2026-11-22'
const base = () => ({
  ...emptyContractForm(),
  natureza: 'DESPESA', moeda: 'BRL', inicioVigencia: '2026-11-03', terminoVigencia: '2027-11-02',
  valorTotal: '60000', valorParcela: '5000', qtdParcelas: '12',
  partes: [
    { id: 'a', papel: '1', ref_tipo: 'EMPRESA', ref_id: 'e', nome: 'RECORD TV', documento: '' },
    { id: 'b', papel: '2', ref_tipo: 'PARCEIRO', ref_id: 'p', nome: 'GOLDNET TI S/A', documento: '' },
  ],
})

describe('resumoDoContrato', () => {
  it('contratada, vigência, valor com parcelas e saldo', () => {
    const r = resumoDoContrato(base() as never, INIT_PAPEIS, HOJE)
    expect(r.contratada).toBe('GOLDNET TI S/A')
    expect(r.vigencia).toBe('03/11/2026 a 02/11/2027')
    expect(r.valor).toBe('R$ 60.000,00')
    expect(r.parcelas).toBe('12 × R$ 5.000,00')
    expect(r.saldo).toBe('R$ 60.000,00')
    expect(r.vencido).toBe('')
  })
  it('parcela prevista vencida e não baixada aparece como vencido; paga abate o saldo', () => {
    const v = base()
    v.pagamentos = [
      { ...newCLancamento(), vencimento: '2026-11-10', valorPrevisto: '5000' },
      { ...newCLancamento(), vencimento: '2026-11-05', valorPrevisto: '5000', valorPago: '5000', data: '2026-11-05' },
    ]
    const r = resumoDoContrato(v as never, INIT_PAPEIS, HOJE)
    expect(r.vencido).toBe('R$ 5.000,00 vencido')
    expect(r.saldo).toBe('R$ 55.000,00')
  })
  it('outra moeda pelo código e prazo indeterminado', () => {
    const r = resumoDoContrato({ ...base(), moeda: 'USD', prazoIndeterminado: true } as never, INIT_PAPEIS, HOJE)
    expect(r.valor).toBe('USD 60.000,00')
    expect(r.vigencia).toBe('desde 03/11/2026, prazo indeterminado')
  })
})
