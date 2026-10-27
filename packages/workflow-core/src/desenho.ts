/* ─── Desenho BPMN — regras puras sobre posições, raias e setas ───────────────────
 * O desenho é só VISUAL: a verdade continua sendo o `FluxoBlocos`. Aqui vivem a leitura
 * defensiva do desenho gravado e a regra de "onde soltar": dada uma seta do grafo gerado
 * (de → para), qual é a vaga (lista + índice) do fluxo em blocos que ela representa. */
import type { DesenhoBpmn } from '@nxt/types'
import { SUFIXO_REENCONTRO, destinosDeVolta, listarEscolhas, temSenaoAntigo, type BlocoEscolha, type FimCaminho, type FluxoBlocos, type ItemFluxo } from './blocos'

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

/* ─── setas desenhadas à mão ─────────────────────────────────────────────────────── */

export type Ligacao = { ok: true; caminhoId: string; fim: FimCaminho } | { ok: false; motivo: string }

export const MSG_LOSANGO = 'Uma volta só pode apontar para uma tarefa — voltar para um losango trava o processo.'
export const MSG_PARALELO = 'Dentro de “ao mesmo tempo” não dá para voltar nem encerrar: as outras frentes continuariam rodando.'
export const MSG_ORDEM = 'As setas seguem a ordem das etapas. Para mudar a ordem, arraste a etapa para cima de outra seta.'
export const MSG_DESTINO = 'Só dá para voltar para uma tarefa que vem antes desta escolha e fora de “ao mesmo tempo”.'

/** Ids das escolhas que moram (em qualquer profundidade) dentro de uma frente de paralelo,
 *  e ids de todos os paralelos. */
function mapearParalelos(f: FluxoBlocos): { dentroDeParalelo: Set<string>; paralelos: Set<string> } {
  const dentroDeParalelo = new Set<string>()
  const paralelos = new Set<string>()
  const varrer = (itens: ItemFluxo[], dentro: boolean) => {
    for (const it of itens) {
      if (it.kind === 'escolha') {
        if (dentro) dentroDeParalelo.add(it.id)
        for (const c of it.caminhos) varrer(c.itens, dentro)
        varrer(it.casoContrario.itens, dentro)
      } else if (it.kind === 'paralelo') {
        paralelos.add(it.id)
        for (const c of it.caminhos) varrer(c.itens, true)
      }
    }
  }
  varrer(f.itens, false)
  return { dentroDeParalelo, paralelos }
}

/** Uma seta `de → para` desenhada à mão vira o fim de um caminho (volta ou encerra)? */
export function ligacaoPermitida(f: FluxoBlocos, de: string, para: string): Ligacao {
  let escolha: BlocoEscolha | null = null
  let caminhoId = ''
  for (const e of listarEscolhas(f)) {
    const c = e.caminhos.find((x) => {
      const ultimo = x.itens[x.itens.length - 1]
      return ultimo?.kind === 'atividade' && ultimo.id === de
    })
    if (c) { escolha = e; caminhoId = c.id; break }
  }
  if (!escolha) return { ok: false, motivo: MSG_ORDEM }
  const { dentroDeParalelo, paralelos } = mapearParalelos(f)
  if (dentroDeParalelo.has(escolha.id)) return { ok: false, motivo: MSG_PARALELO }
  if (para === f.fimId) return { ok: true, caminhoId, fim: { tipo: 'encerra' } }
  if (destinosDeVolta(f, escolha.id).some((a) => a.id === para)) return { ok: true, caminhoId, fim: { tipo: 'volta', alvoId: para } }
  const ehLosango = para.endsWith(SUFIXO_REENCONTRO) || paralelos.has(para) || listarEscolhas(f).some((e) => e.id === para)
  return { ok: false, motivo: ehLosango ? MSG_LOSANGO : MSG_DESTINO }
}

/** Onde mora o item `id`: a lista (`'raiz'` ou id do caminho/frente) e a posição dele nela.
 *  `null` para início, fim, reencontro ou id desconhecido — eles não moram em lista. */
export function localDoItem(f: FluxoBlocos, id: string): PontoDeInsercao | null {
  const buscar = (ref: string, itens: ItemFluxo[]): PontoDeInsercao | null => {
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      if (it.id === id) return { ref, indice: i }
      if (it.kind === 'escolha') {
        for (const c of [...it.caminhos, it.casoContrario]) {
          const achado = buscar(c.id, c.itens)
          if (achado) return achado
        }
      } else if (it.kind === 'paralelo') {
        for (const c of it.caminhos) {
          const achado = buscar(c.id, c.itens)
          if (achado) return achado
        }
      }
    }
    return null
  }
  return buscar('raiz', f.itens)
}
