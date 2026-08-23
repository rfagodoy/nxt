/* Guarda de ativação dos losangos de DECISÃO (construtor de condições, 2026-08-23).
 *
 * Um losango com 2+ saídas precisa de exatamente UMA saída padrão ("caso contrário")
 * e de condição em todas as outras — sem isso o motor escolheria um caminho por
 * acidente de ordem, e o processo desviaria diferente do desenhado. A recusa
 * acontece na ATIVAÇÃO (o rascunho pode ficar incompleto à vontade). */

interface NodeLike { id: string; type: string; name?: string }
interface EdgeLike { from: string; condition?: string; isDefault?: boolean }

export function validarDecisoes(nodes: NodeLike[], edges: EdgeLike[]): string | null {
  for (const n of nodes) {
    if (n.type !== 'exclusiveGateway') continue
    const saidas = edges.filter((e) => e.from === n.id)
    if (saidas.length < 2) continue
    const nome = n.name?.trim() ? `"${n.name.trim()}"` : 'sem nome'
    const padroes = saidas.filter((s) => s.isDefault)
    if (padroes.length === 0) {
      return `A decisão ${nome} não tem o caminho "caso contrário": deixe exatamente uma saída sem filtros — é por ela que o processo segue quando nenhum filtro casa.`
    }
    if (padroes.length > 1) {
      return `A decisão ${nome} tem ${padroes.length} caminhos "caso contrário". Deixe apenas um sem filtros.`
    }
    const semCondicao = saidas.filter((s) => !s.isDefault && !s.condition?.trim())
    if (semCondicao.length) {
      return `A decisão ${nome} tem caminho sem filtros que não é o "caso contrário". Monte os filtros dele — ou esvazie só o caminho que deve ser o caso contrário.`
    }
  }
  return null
}
