/* ─── Próximo item (a coluna ao lado da forma selecionada) ─────────────────────
   Puro: os itens da coluna (do catálogo da paleta), as caixas reais das formas no desenho
   (o tamanho gravado vence o de sempre) e o lugar da forma nova — à direita da base, na
   altura dela, descendo quando o lugar já está ocupado (`posicaoDoProximo`). */
import type { LayoutDesenho, TipoForma, VarianteForma } from '@nxt/types'
import { nodeSize, type FlowNodeType } from '@/lib/flow-layout'
import { CATALOGO, type GrupoPaleta, type ItemCatalogo } from './catalogo'
import { caixaDaForma } from './formas-do-canvas'
import { posicaoDoProximo, type Caixa } from './geometria'

const doCatalogo = (grupo: GrupoPaleta, tipo: TipoForma, variante?: VarianteForma): ItemCatalogo => {
  const item = CATALOGO[grupo].find((i) => i.tipo === tipo && (variante === undefined || i.variante === variante))
  if (!item) throw new Error(`Item do catálogo ausente: ${grupo}/${tipo}/${variante ?? ''}`)
  return item
}

/** Os grupos da coluna (um separador entre eles): Tarefa de usuário, Escolha, Ao mesmo
 *  tempo │ Fim. */
export const PROXIMOS: ReadonlyArray<ReadonlyArray<ItemCatalogo>> = [
  [doCatalogo('tarefa', 'userTask', 'usuario'), doCatalogo('escolha', 'exclusiveGateway'), doCatalogo('paralelo', 'parallelGateway')],
  [doCatalogo('fim', 'end', 'simples')],
]

type NoDoDesenho = { id: string; type: string; name?: string }

/** A caixa de uma forma como o canvas a desenha: o tamanho gravado (tarefa/subprocesso
 *  redimensionado) ou o que o layout reserva. */
export function caixaReal(n: NoDoDesenho, pos: { x: number; y: number }, tamanhos: LayoutDesenho['tamanhos']): Caixa {
  const { w, h } = caixaDaForma(n.id, n.type, nodeSize({ id: n.id, type: n.type as FlowNodeType, name: n.name }, 0, 0), tamanhos)
  return { id: n.id, x: pos.x, y: pos.y, largura: w, altura: h }
}

/** Canto superior esquerdo da forma nova criada pelo próximo item da forma `baseId`.
 *  `null` quando a base não tem posição. */
export function lugarDoProximo(
  baseId: string,
  nova: { tipo: TipoForma; nome?: string },
  nos: ReadonlyArray<NoDoDesenho>,
  posicoes: Record<string, { x: number; y: number }>,
  tamanhos: LayoutDesenho['tamanhos'],
): { x: number; y: number } | null {
  const ocupadas = nos.filter((n) => posicoes[n.id]).map((n) => caixaReal(n, posicoes[n.id], tamanhos))
  const base = ocupadas.find((c) => c.id === baseId)
  if (!base) return null
  const { w, h } = nodeSize({ id: 'nova', type: nova.tipo as FlowNodeType, name: nova.nome }, 0, 0)
  return posicaoDoProximo(base, { largura: w, altura: h }, ocupadas)
}
