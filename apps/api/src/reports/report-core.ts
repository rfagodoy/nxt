/* Núcleo do relatório de contratos: filtros, derivação e totais. Puro e testável.
 *
 * A razão de existir deste módulo é uma só: a situação "Vencido" NÃO EXISTE no banco.
 * Ela é derivada (contrato VIGENTE cujo término já passou, considerando aditivos e
 * renovações). Um relatório que filtrasse `situacao = 'VENCIDO'` no SQL devolveria
 * ZERO linhas para sempre — e o usuário concluiria que não há contratos vencidos, que é
 * a pior resposta errada possível para quem gerencia contratos.
 *
 * Por isso o filtro de situação é aplicado DEPOIS da derivação, em memória. O custo é
 * conhecido e aceito: ver a nota sobre volume em reports.service.
 */

import {
  effectiveSituacao,
  terminoVigente,
  valorVigente,
  type CoreContract,
} from '@nxt/contracts-core'

export interface FiltroRelatorio {
  /** Recorte por vigência, não por data de cadastro: a pergunta de quem gere contrato
   *  é "o que está valendo neste período", não "o que foi digitado". */
  de?: string
  ate?: string
  situacoes?: string[]
  naturezas?: string[]
  tipos?: string[]
  parceiroIds?: string[]
  /** Busca livre em número e título. */
  busca?: string
}

export interface LinhaRelatorio {
  id: string
  numero: string
  titulo: string
  tipo: string
  natureza: string
  situacao: string
  inicioVigencia: string | null
  terminoVigencia: string | null
  prazoIndeterminado: boolean
  valor: number
  moeda: string
  parceiros: string
  diasParaTerminar: number | null
}

export interface TotaisRelatorio {
  contratos: number
  valorTotal: number
  porSituacao: Array<{ situacao: string; contratos: number; valor: number }>
  porNatureza: Array<{ natureza: string; contratos: number; valor: number }>
}

type ContratoBruto = CoreContract & {
  id: string
  numero: string
  titulo: string
  tipo: string | null
  natureza: string | null
  situacao: string
  inicioVigencia: string | null
  terminoVigencia: string | null
  prazoIndeterminado: boolean
  moeda: string
  partes?: unknown
}

const diasEntre = (de: string, ate: string): number =>
  Math.round((new Date(ate + 'T00:00:00').getTime() - new Date(de + 'T00:00:00').getTime()) / 86_400_000)

function nomesDasPartes(partes: unknown): string {
  if (!Array.isArray(partes)) return ''
  return partes
    .map((p) => (p && typeof p === 'object' ? String((p as { nome?: string }).nome ?? '') : ''))
    .filter(Boolean)
    .join(', ')
}

/** Converte o registro cru na linha do relatório, com tudo já derivado. */
export function derivarLinha(c: ContratoBruto, hoje: string): LinhaRelatorio {
  const termino = c.prazoIndeterminado ? null : (terminoVigente(c) ?? c.terminoVigencia ?? null)
  return {
    id: c.id,
    numero: c.numero,
    titulo: c.titulo,
    tipo: c.tipo ?? '',
    natureza: c.natureza ?? '',
    situacao: effectiveSituacao(c.situacao, c.prazoIndeterminado ? '' : termino, hoje),
    inicioVigencia: c.inicioVigencia ?? null,
    terminoVigencia: termino,
    prazoIndeterminado: !!c.prazoIndeterminado,
    valor: valorVigente(c),
    moeda: c.moeda ?? 'BRL',
    parceiros: nomesDasPartes(c.partes),
    diasParaTerminar: termino ? diasEntre(hoje, termino) : null,
  }
}

/** Aplica o recorte por período à VIGÊNCIA: entra o contrato que esteve em vigor em
 *  algum momento do intervalo. Contrato de prazo indeterminado entra sempre que já
 *  começou — ele não termina, então nunca "sai" do período. */
export function dentroDoPeriodo(l: LinhaRelatorio, de?: string, ate?: string): boolean {
  if (!de && !ate) return true
  const inicio = l.inicioVigencia
  const fim = l.prazoIndeterminado ? null : l.terminoVigencia

  if (ate && inicio && inicio > ate) return false      // começou depois da janela
  if (de && fim && fim < de) return false              // terminou antes da janela
  return true
}

export function filtrar(linhas: LinhaRelatorio[], f: FiltroRelatorio, parceiroPorId?: Map<string, string[]>): LinhaRelatorio[] {
  const busca = (f.busca ?? '').trim().toLowerCase()
  const sit = new Set(f.situacoes ?? [])
  const nat = new Set(f.naturezas ?? [])
  const tip = new Set(f.tipos ?? [])
  const par = new Set(f.parceiroIds ?? [])

  return linhas.filter((l) => {
    if (!dentroDoPeriodo(l, f.de, f.ate)) return false
    if (sit.size > 0 && !sit.has(l.situacao)) return false
    if (nat.size > 0 && !nat.has(l.natureza)) return false
    if (tip.size > 0 && !tip.has(l.tipo)) return false
    if (par.size > 0) {
      const ids = parceiroPorId?.get(l.id) ?? []
      if (!ids.some((id) => par.has(id))) return false
    }
    if (busca && !`${l.numero} ${l.titulo} ${l.parceiros}`.toLowerCase().includes(busca)) return false
    return true
  })
}

export function totalizar(linhas: LinhaRelatorio[]): TotaisRelatorio {
  const porSituacao = new Map<string, { contratos: number; valor: number }>()
  const porNatureza = new Map<string, { contratos: number; valor: number }>()
  let valorTotal = 0

  for (const l of linhas) {
    valorTotal += l.valor
    const s = porSituacao.get(l.situacao) ?? { contratos: 0, valor: 0 }
    s.contratos++; s.valor += l.valor
    porSituacao.set(l.situacao, s)

    const chaveNat = l.natureza || '(não informada)'
    const n = porNatureza.get(chaveNat) ?? { contratos: 0, valor: 0 }
    n.contratos++; n.valor += l.valor
    porNatureza.set(chaveNat, n)
  }

  const arred = (v: number) => Math.round(v * 100) / 100
  return {
    contratos: linhas.length,
    valorTotal: arred(valorTotal),
    porSituacao: [...porSituacao.entries()].map(([situacao, v]) => ({ situacao, contratos: v.contratos, valor: arred(v.valor) })).sort((a, b) => b.valor - a.valor),
    porNatureza: [...porNatureza.entries()].map(([natureza, v]) => ({ natureza, contratos: v.contratos, valor: arred(v.valor) })).sort((a, b) => b.valor - a.valor),
  }
}

export type CampoOrdenacao = 'numero' | 'titulo' | 'situacao' | 'terminoVigencia' | 'valor' | 'parceiros'

export function ordenar(linhas: LinhaRelatorio[], campo: CampoOrdenacao = 'numero', desc = false): LinhaRelatorio[] {
  const sinal = desc ? -1 : 1
  return [...linhas].sort((a, b) => {
    const va = a[campo], vb = b[campo]
    /* Nulo sempre por último, independentemente da direção: contrato sem término é
       "não se aplica", e jogá-lo para o topo ao inverter a ordem esconderia os
       contratos com data — que são o que a pessoa está procurando. */
    if (va === null) return 1
    if (vb === null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal
    return String(va).localeCompare(String(vb), 'pt-BR') * sinal
  })
}
