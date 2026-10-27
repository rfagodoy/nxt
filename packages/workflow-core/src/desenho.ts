/* ─── Desenho BPMN — regras puras sobre posições, raias e setas ───────────────────
 * O desenho é só VISUAL: a verdade continua sendo o `FluxoBlocos`. Aqui vivem a leitura
 * defensiva do desenho gravado e a regra de "onde soltar": dada uma seta do grafo gerado
 * (de → para), qual é a vaga (lista + índice) do fluxo em blocos que ela representa. */
import type { DesenhoBpmn } from '@nxt/types'
import { SUFIXO_REENCONTRO, temSenaoAntigo, type FluxoBlocos, type ItemFluxo } from './blocos'

/** Vaga de inserção: lista (`'raiz'` ou id do caminho) e posição dentro dela. */
export interface PontoDeInsercao { ref: string; indice: number }

const ALTURA_MINIMA_RAIA = 60

/** Confere a forma de um desenho vindo de fora. `null` se algo não bate. */
export function lerDesenho(bruto: unknown): DesenhoBpmn | null {
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  if (!obj(bruto) || bruto.versao !== 1 || !obj(bruto.posicoes) || !Array.isArray(bruto.raias)) return null
  for (const p of Object.values(bruto.posicoes)) {
    if (!obj(p) || !num(p.x) || !num(p.y)) return null
  }
  for (const r of bruto.raias) {
    if (!obj(r) || typeof r.id !== 'string' || typeof r.nome !== 'string' || !num(r.altura) || r.altura < ALTURA_MINIMA_RAIA) return null
  }
  return bruto as unknown as DesenhoBpmn
}

/** Descarta as posições de nós que não existem mais. As raias ficam. */
export function podarDesenho(d: DesenhoBpmn, idsDosNos: Iterable<string>): DesenhoBpmn {
  const vivos = new Set(idsDosNos)
  const posicoes: DesenhoBpmn['posicoes'] = {}
  for (const [id, p] of Object.entries(d.posicoes)) if (vivos.has(id)) posicoes[id] = p
  return { ...d, posicoes }
}

/** Nó de onde sai a seta que segue o item. */
const saida = (it: ItemFluxo): string => (it.kind === 'atividade' ? it.id : it.id + SUFIXO_REENCONTRO)

/** Em que vaga do fluxo em blocos mora a seta `de → para`? `null` se ela não é uma vaga
 *  (volta, seta que não existe, caminho que encerra/volta e não chega ao reencontro). */
export function pontoDaSeta(f: FluxoBlocos, de: string, para: string): PontoDeInsercao | null {
  let achado: PontoDeInsercao | null = null
  const lista = (ref: string, itens: ItemFluxo[], origem: string, destino: string | null) => {
    const n = itens.length
    for (let k = 0; k <= n && !achado; k++) {
      if (k === n && destino === null) break
      const a = k === 0 ? origem : saida(itens[k - 1])
      const b = k === n ? destino! : itens[k].id
      if (a === de && b === para) { achado = { ref, indice: k }; return }
    }
    for (const it of itens) {
      if (achado) return
      if (it.kind === 'escolha') {
        const reencontro = it.id + SUFIXO_REENCONTRO
        for (const c of it.caminhos) lista(c.id, c.itens, it.id, c.fim.tipo === 'segue' ? reencontro : null)
        if (temSenaoAntigo(it)) lista(it.casoContrario.id, it.casoContrario.itens, it.id, it.casoContrario.fim.tipo === 'segue' ? reencontro : null)
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) lista(c.id, c.itens, it.id, it.id + SUFIXO_REENCONTRO)
      }
    }
  }
  lista('raiz', f.itens, f.inicioId, f.fimId)
  return achado
}
