/* Faixa de resumo no topo do contrato (auditoria de UX, 22/11/2026): valor, vigência,
   contratada e saldo só apareciam trocando de aba. Aqui ficam os quatro números que
   a pessoa procura ao abrir o contrato, já VIGENTES (com aditivos e renovações). */

import type { LookupEntry } from '@/hooks/use-lookup-table'
import { ladoDoPapel } from '@/lib/contract-roles'
import {
  lancPago, parcelaVigente, partesVigentes, simboloDaMoeda, somaLancamentosPagos, temRecebimentos, temPagamentos,
  terminoVigente, valorVigente, type ContractFormValues,
} from '@/lib/contract-options'

export interface ResumoDoContrato {
  contratada: string
  vigencia: string
  valor: string
  /** "12 × R$ 5.000,00", ou vazio sem parcelas */
  parcelas: string
  saldo: string
  /** parcelas previstas já vencidas e não baixadas ("R$ 5.000,00 vencido"), ou vazio */
  vencido: string
}

const data = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : ''
}

export function formatarValor(n: number, moeda: string): string {
  return `${simboloDaMoeda(moeda)} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function resumoDoContrato(v: ContractFormValues, papeis: LookupEntry[], hoje: string): ResumoDoContrato {
  const contratada = [...new Set(
    partesVigentes(v).filter((p) => ladoDoPapel(papeis, p.papel) === 'CONTRATADA').map((p) => p.nome).filter(Boolean),
  )].join(', ')

  const termino = v.prazoIndeterminado ? '' : terminoVigente(v)
  const vigencia = !v.inicioVigencia && !termino ? ''
    : v.prazoIndeterminado ? `desde ${data(v.inicioVigencia)}, prazo indeterminado`
    : [data(v.inicioVigencia), data(termino)].filter(Boolean).join(' a ')

  const total = valorVigente(v)
  const parcela = parcelaVigente(v)
  const qtd = Number(v.qtdParcelas) || 0

  /* Saldo pelo lado que a natureza movimenta; em "Ambos", o do que se paga. */
  const lanc = temPagamentos(v.natureza) ? v.pagamentos : temRecebimentos(v.natureza) ? v.recebimentos : []
  const realizado = somaLancamentosPagos(lanc)
  const vencidoNum = lanc
    .filter((l) => !lancPago(l) && (l.vencimento || l.data) && (l.vencimento || l.data) < hoje)
    .reduce((s, l) => s + (Number(l.valorPrevisto) || 0), 0)

  return {
    contratada,
    vigencia,
    valor: total ? formatarValor(total, v.moeda) : '',
    parcelas: qtd > 0 && parcela ? `${qtd} × ${formatarValor(parcela, v.moeda)}` : '',
    saldo: total ? formatarValor(total - realizado, v.moeda) : '',
    vencido: vencidoNum > 0 ? `${formatarValor(vencidoNum, v.moeda)} vencido` : '',
  }
}
