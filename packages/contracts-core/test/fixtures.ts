/* Fixtures no formato do registro CRU do Prisma (valores numéricos).
   O teste de paridade converte para o shape do formulário com `toForm`. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import real from './fixtures/cct-2026-0001.json'

/** Contrato real exportado do banco: 6 renovações automáticas, 85 parcelas,
 *  nenhum aditivo e — repare — NENHUMA linha de reajuste cadastrada. */
export const cct20260001: any = real

const lanc = (id: string, vencimento: string, valor: number, status = 'previsto') => ({
  id, status, vencimento, data: status === 'pago' ? vencimento : '', valor, forma: '', documento: '', observacao: '',
})

/** Despesa simples, 12 parcelas mensais de 1000, primeiras 3 pagas. */
export const despesaSimples: any = {
  numero: 'FIX-001', natureza: 'DESPESA',
  terminoVigencia: '2026-12-31',
  valorTotal: 12000, valorParcela: 1000, qtdParcelas: 12,
  aditivos: [], renovacoes: [], reajustes: [], reajustesRealizados: [],
  pagamentos: Array.from({ length: 12 }, (_, i) =>
    lanc(`p${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-10`, 1000, i < 3 ? 'pago' : 'previsto')),
  recebimentos: [],
}

/** Mesmo contrato, com uma linha de reajuste anual ancorada em 2026-01. */
export const despesaComReajuste: any = {
  ...despesaSimples,
  numero: 'FIX-002',
  reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
}

/** Aditivo ATIVO (prorroga + acresce valor + nova parcela) e outro em RASCUNHO (não aplica). */
export const comAditivos: any = {
  ...despesaSimples,
  numero: 'FIX-003',
  aditivos: [
    { id: 'a1', situacao: 'ATIVO', data: '2026-06-01', alteraTermino: true, novoTermino: '2027-06-30', alteraValor: true, novoValor: 5000, novaParcela: 1200 },
    { id: 'a2', situacao: 'RASCUNHO', data: '2026-07-01', alteraTermino: true, novoTermino: '2030-01-01', alteraValor: true, novoValor: 99999, novaParcela: 9999 },
  ],
}

/** Aditivo LEGADO, sem `situacao`. Front tratava como inativo; backend, como ativo. */
export const aditivoLegado: any = {
  ...despesaSimples,
  numero: 'FIX-004',
  aditivos: [{ id: 'a1', data: '2026-06-01', alteraTermino: true, novoTermino: '2027-06-30', alteraValor: true, novoValor: 5000, novaParcela: 1200 }],
}

/** Reajuste aplicado sobre o TOTAL. */
export const reajusteTotalAplicado: any = {
  ...despesaComReajuste,
  numero: 'FIX-005',
  reajustesRealizados: [
    { id: 'rr1', reajusteId: 'r1', competencia: '2026-01-01', base: 'total', percentual: 10, valorAnterior: 12000, valorNovo: 13200, parcelaAnterior: 0, parcelaNova: 0, parcelasReajustadas: 0 },
  ],
}

/** Reajuste aplicado sobre a PARCELA, com as parcelas a vencer já reprecificadas. */
export const reajusteParcelaAplicado: any = {
  ...despesaComReajuste,
  numero: 'FIX-006',
  pagamentos: despesaSimples.pagamentos.map((l: any, i: number) => (i < 3 ? l : { ...l, valor: 1100 })),
  reajustesRealizados: [
    { id: 'rr1', reajusteId: 'r1', competencia: '2026-01-01', base: 'parcela', percentual: 10, valorAnterior: 12000, valorNovo: 12900, parcelaAnterior: 1000, parcelaNova: 1100, parcelasReajustadas: 9 },
  ],
}

/** Receita: o lado que reajusta é `recebimentos`. */
export const receita: any = {
  numero: 'FIX-007', natureza: 'RECEITA',
  terminoVigencia: '2026-12-31',
  valorTotal: 6000, valorParcela: 500, qtdParcelas: 12,
  aditivos: [], renovacoes: [], reajustesRealizados: [],
  reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Semestral' }],
  pagamentos: [],
  recebimentos: Array.from({ length: 12 }, (_, i) =>
    lanc(`r${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-10`, 500, i < 2 ? 'pago' : 'previsto')),
}

/** Ambos: reajuste alcança pagamentos E recebimentos. */
export const ambos: any = {
  numero: 'FIX-008', natureza: 'AMBOS',
  terminoVigencia: '2026-12-31',
  valorTotal: 18000, valorParcela: 1000, qtdParcelas: 12,
  aditivos: [], renovacoes: [], reajustesRealizados: [],
  reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
  pagamentos: Array.from({ length: 6 }, (_, i) => lanc(`p${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-10`, 1000)),
  recebimentos: Array.from({ length: 6 }, (_, i) => lanc(`r${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-10`, 2000)),
}

/** Sem cronograma: reajuste de parcela usa qtdParcelas para o delta. */
export const semCronograma: any = {
  numero: 'FIX-009', natureza: 'DESPESA',
  terminoVigencia: '2026-12-31',
  valorTotal: 12000, valorParcela: 1000, qtdParcelas: 12,
  aditivos: [], renovacoes: [], reajustesRealizados: [],
  reajustes: [{ id: 'r1', indice: '1', data: '2026-01-01', periodicidade: 'Anual' }],
  pagamentos: [], recebimentos: [],
}

/** Todas as fixtures que devem ter paridade exata entre core e legado. */
export const paridade: Array<[string, any]> = [
  ['CCT_2026_0001 (real)', cct20260001],
  ['despesa simples', despesaSimples],
  ['despesa com reajuste', despesaComReajuste],
  ['com aditivos (ativo + rascunho)', comAditivos],
  ['reajuste total aplicado', reajusteTotalAplicado],
  ['reajuste parcela aplicado', reajusteParcelaAplicado],
  ['receita', receita],
  ['ambos', ambos],
  ['sem cronograma', semCronograma],
]
