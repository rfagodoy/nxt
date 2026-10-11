/* Vencimentos por mês e concentração por parceiro — os dois gráficos de carteira do
   dashboard (opção C dos mockups, PO 11/10/2026). Funções puras: recebem a carteira já
   DERIVADA (situação, término e valor vigentes) e não tocam no banco. */

const DAY = 86_400_000

export interface ItemCarteira {
  situacao: string
  /** término VIGENTE (YYYY-MM-DD) ou '' quando indeterminado */
  termino: string
  valor: number
  /** contraparte EXTERNA (parte que é parceiro), já com cessões aplicadas */
  contraparte: { id: string; nome: string } | null
}

export interface MesVencimento { mes: string; qtd: number; valor: number }

export interface Vencimentos {
  /** 12 meses a partir do mês atual (`YYYY-MM`) */
  meses: MesVencimento[]
  /** vigentes que vencem de hoje a hoje+90 dias */
  prox90: { qtd: number; valor: number }
  /** término passou e não foi renovado/encerrado (situação derivada VENCIDO) */
  vencidos: { qtd: number; valor: number }
}

const chaveMes = (iso: string) => iso.slice(0, 7)

/** Agrupa os VIGENTES pelo mês de término, 12 meses a partir do mês de `hoje`. Indeterminado
 *  não tem vencimento; VENCIDO vai para o próprio balde; os demais (em cadastro, encerrado,
 *  cancelado) não estão "em mãos". */
export function vencimentosPorMes(itens: ItemCarteira[], hoje: string): Vencimentos {
  const [a, m] = hoje.split('-').map(Number)
  const meses: MesVencimento[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 + i, 1))
    return { mes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, qtd: 0, valor: 0 }
  })
  const porMes = new Map(meses.map((x) => [x.mes, x]))
  const limite90 = new Date(new Date(hoje + 'T00:00:00Z').getTime() + 90 * DAY).toISOString().slice(0, 10)
  const prox90 = { qtd: 0, valor: 0 }
  const vencidos = { qtd: 0, valor: 0 }
  for (const it of itens) {
    if (it.situacao === 'VENCIDO') { vencidos.qtd++; vencidos.valor += it.valor; continue }
    if (it.situacao !== 'VIGENTE' || !it.termino || it.termino < hoje) continue
    const balde = porMes.get(chaveMes(it.termino))
    if (balde) { balde.qtd++; balde.valor += it.valor }
    if (it.termino <= limite90) { prox90.qtd++; prox90.valor += it.valor }
  }
  return { meses, prox90, vencidos }
}

export interface Concentracao {
  /** valor vigente dos contratos COM parceiro externo (base dos percentuais) */
  total: number
  /** os 5 maiores, do maior para o menor */
  parceiros: Array<{ id: string; nome: string; valor: number; pct: number }>
  outros: { qtd: number; valor: number; pct: number }
  /** % somado dos 3 maiores */
  top3Pct: number
  /** contratos em mãos sem parceiro externo (só unidades/empresas do grupo) — fora da conta */
  semParceiro: number
}

/** Valor vigente por contraparte externa, entre os contratos EM MÃOS (vigentes e vencidos não
 *  renovados — o mesmo critério do "valor ativo" do cartão de Contratos). */
export function concentracaoPorParceiro(itens: ItemCarteira[], topN = 5): Concentracao {
  const soma = new Map<string, { id: string; nome: string; valor: number }>()
  let semParceiro = 0
  for (const it of itens) {
    if (it.situacao !== 'VIGENTE' && it.situacao !== 'VENCIDO') continue
    if (!it.contraparte) { semParceiro++; continue }
    const atual = soma.get(it.contraparte.id) ?? { id: it.contraparte.id, nome: it.contraparte.nome, valor: 0 }
    atual.valor += it.valor
    soma.set(it.contraparte.id, atual)
  }
  const ordenados = [...soma.values()].sort((x, y) => y.valor - x.valor || x.nome.localeCompare(y.nome, 'pt-BR'))
  const total = ordenados.reduce((s, x) => s + x.valor, 0)
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0)
  const topo = ordenados.slice(0, topN)
  const resto = ordenados.slice(topN)
  const valorOutros = resto.reduce((s, x) => s + x.valor, 0)
  return {
    total,
    parceiros: topo.map((x) => ({ ...x, pct: pct(x.valor) })),
    outros: { qtd: resto.length, valor: valorOutros, pct: pct(valorOutros) },
    top3Pct: pct(ordenados.slice(0, 3).reduce((s, x) => s + x.valor, 0)),
    semParceiro,
  }
}
