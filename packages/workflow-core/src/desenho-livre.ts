/* ─── Desenho livre (v2) ───────────────────────────────────────────────────────
   Spec: docs/superpowers/specs/2026-10-30-desenho-livre-design.md. O desenho (formas +
   setas) é a fonte da verdade do editor; os blocos são derivados dele (`desenhoParaBlocos`)
   e voltam para ele (`blocosParaDesenho`) quando o Roteiro muda a estrutura. */

import type { DesenhoV2, FormaDesenho, RaiaDesenho, SetaDesenho, TipoForma } from '@nxt/types'
import { lerDesenho } from './desenho'
import { blocosParaGrafo, modoDaEscolha, temSenaoAntigo, type FluxoBlocos, type ItemFluxo, type SetaGerada } from './blocos'

const TIPOS: readonly TipoForma[] = ['start', 'end', 'userTask', 'serviceTask', 'exclusiveGateway', 'parallelGateway']

/** Confere o JSON gravado. Seta para forma inexistente é descartada (sobra de exclusão);
 *  forma repetida ou estrutura errada invalidam o desenho. */
export function lerDesenhoV2(bruto: unknown): DesenhoV2 | null {
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  if (!obj(bruto) || bruto.versao !== 2 || !Array.isArray(bruto.formas) || !Array.isArray(bruto.setas)) return null
  // posições e raias têm as mesmas regras do v1
  if (!lerDesenho({ versao: 1, posicoes: bruto.posicoes, raias: bruto.raias })) return null
  const ids = new Set<string>()
  const formas: FormaDesenho[] = []
  for (const f of bruto.formas) {
    if (!obj(f) || typeof f.id !== 'string' || !TIPOS.includes(f.tipo as TipoForma) || ids.has(f.id)) return null
    ids.add(f.id)
    formas.push(f as unknown as FormaDesenho)
  }
  const setas: SetaDesenho[] = []
  for (const s of bruto.setas) {
    if (!obj(s) || typeof s.id !== 'string' || typeof s.de !== 'string' || typeof s.para !== 'string') return null
    if (ids.has(s.de) && ids.has(s.para)) setas.push(s as unknown as SetaDesenho)
  }
  return { versao: 2, formas, setas, posicoes: bruto.posicoes as DesenhoV2['posicoes'], raias: bruto.raias as DesenhoV2['raias'] }
}

/** Todos os itens do fluxo, em qualquer profundidade, por id. */
function itensPorId(f: FluxoBlocos): Map<string, ItemFluxo> {
  const m = new Map<string, ItemFluxo>()
  const visitar = (itens: ItemFluxo[]) => {
    for (const it of itens) {
      m.set(it.id, it)
      if (it.kind === 'escolha') for (const c of [...it.caminhos, it.casoContrario]) visitar(c.itens)
      else if (it.kind === 'paralelo') for (const c of it.caminhos) visitar(c.itens)
    }
  }
  visitar(f.itens)
  return m
}

/** Blocos → desenho. Volta da estrutura mudada pelo Roteiro (e abertura de workflows em
 *  blocos): ids, posições e raias do que já existia ficam; formas novas ficam sem posição
 *  (o editor completa). A seta que sai do losango para um caminho leva o id do caminho —
 *  é o que liga a condição editada no bloco à seta do desenho (e vice-versa). */
export function blocosParaDesenho(
  f: FluxoBlocos,
  anterior?: { posicoes: Record<string, { x: number; y: number }>; raias: RaiaDesenho[] } | null,
): DesenhoV2 {
  const g = blocosParaGrafo(f, { juncaoSempre: true })
  const itens = itensPorId(f)
  const formas: FormaDesenho[] = g.nodes.map((n) => {
    const tipo: TipoForma = n.type === 'inclusiveGateway' ? 'exclusiveGateway' : (n.type as TipoForma)
    const forma: FormaDesenho = { id: n.id, tipo }
    const it = itens.get(n.id)
    if (it?.kind === 'atividade') {
      if (it.nome) forma.nome = it.nome
      if (it.vinculoDe) forma.vinculoDe = it.vinculoDe
    } else if (it?.kind === 'escolha') {
      forma.modo = modoDaEscolha(it)
      if (it.pergunta) forma.pergunta = it.pergunta
    } else if (it?.kind === 'paralelo') {
      if (it.nome) forma.nome = it.nome
    }
    return forma
  })
  // as saídas de cada losango que divide, na ordem dos caminhos (blocosParaGrafo as ordena)
  const idDoCaminho = new Map<SetaGerada, string>()
  for (const it of itens.values()) {
    if (it.kind === 'atividade') continue
    const caminhos = it.kind === 'escolha' ? [...it.caminhos, ...(temSenaoAntigo(it) ? [it.casoContrario] : [])] : it.caminhos
    g.edges.filter((e) => e.from === it.id).forEach((e, i) => { if (caminhos[i]) idDoCaminho.set(e, caminhos[i].id) })
  }
  const setas: SetaDesenho[] = g.edges.map((e) => {
    const s: SetaDesenho = { id: idDoCaminho.get(e) ?? e.id, de: e.from, para: e.to }
    if (e.condition) s.condition = e.condition
    if (e.conditionSpec) s.conditionSpec = e.conditionSpec as SetaDesenho['conditionSpec'] // mesma forma; o tipo da tela é mais estreito nos operadores
    if (e.label) s.rotulo = e.label
    if (e.isDefault) s.padrao = true
    return s
  })
  const vivos = new Set(formas.map((x) => x.id))
  const posicoes = Object.fromEntries(Object.entries(anterior?.posicoes ?? {}).filter(([id]) => vivos.has(id)))
  return { versao: 2, formas, setas, posicoes, raias: anterior?.raias ?? [] }
}
