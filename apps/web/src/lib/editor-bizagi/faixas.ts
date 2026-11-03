/* ─── Faixas do desenho: piscina, raias, fases e piscinas externas ─────────────
   Puro. Tudo na coordenada LÓGICA (sempre horizontal): as raias empilham em y a partir de
   0, a coluna do rótulo fica à esquerda do x = 0 e, antes dela, a faixa com o nome. Com
   fases, o cabeçalho delas fica ACIMA das raias (y = −FASE_ALTURA): nenhuma posição
   gravada muda quando a primeira fase nasce. As piscinas externas ficam embaixo da
   principal, com INTERVALO_EXTERNAS entre elas. A tela é a transposição (`faixasNaTela`). */
import type { FaseDesenho, LayoutDesenho, PiscinaExterna, RaiaDesenho } from '@nxt/types'
import { GRADE, RAIA_ROTULO_W } from '@/lib/desenho-bpmn'
import { alinhar, daTela, paraTela, retanguloParaTela, type Caixa, type ModoAlinhar, type Orientacao } from './geometria'

/** Altura do cabeçalho das fases (no topo da piscina). */
export const FASE_ALTURA = 28
/** Largura da faixa com o nome da piscina (a do processo e as externas). */
export const FAIXA_DO_NOME = 28
/** Intervalo entre a piscina principal e cada piscina externa. */
export const INTERVALO_EXTERNAS = 48
/** Largura mínima da raia (com a coluna do rótulo). */
export const LARGURA_MINIMA_RAIA = 640
/** Folga à direita da última forma, dentro da raia (largura automática). */
export const FOLGA_RAIA = 160

export type Retangulo = { x: number; y: number; largura: number; altura: number }
export type Pt = { x: number; y: number }

export interface Faixas {
  /** Largura da raia, com a coluna do rótulo: é a `larguraPiscina` do layout. */
  largura: number
  /** Piscina principal inteira (faixa do nome + cabeçalho das fases + raias); null sem raias. */
  piscina: Retangulo | null
  raias: Array<{ id: string; caixa: Retangulo }>
  /** `cabecalho` = a faixa do nome; `coluna` = do cabeçalho até o fundo das raias. */
  fases: Array<{ id: string; nome: string; cabecalho: Retangulo; coluna: Retangulo; primeira: boolean; ultima: boolean }>
  externas: Array<{ id: string; nome: string; caixa: Retangulo }>
}

/** Onde cada faixa fica. `conteudo` = borda direita e fundo das formas (lógico). A largura é a
 *  gravada (`larguraPiscina`, nunca menor que o conteúdo) ou a automática; com fases, cabe
 *  todas elas — a última se estica até o fim da piscina. */
export function faixasDoDesenho(
  raias: ReadonlyArray<Pick<RaiaDesenho, 'id' | 'altura'>>,
  layout: Pick<LayoutDesenho, 'larguraPiscina'> & { fases: readonly FaseDesenho[]; piscinasExternas: readonly PiscinaExterna[] },
  conteudo: { direita: number; fundo: number },
): Faixas {
  const base = layout.larguraPiscina !== undefined
    ? Math.max(layout.larguraPiscina, RAIA_ROTULO_W + conteudo.direita + 2 * GRADE)
    : Math.max(LARGURA_MINIMA_RAIA, RAIA_ROTULO_W + conteudo.direita + FOLGA_RAIA)
  const temFases = raias.length > 0 && layout.fases.length > 0
  const somaFases = layout.fases.reduce((s, f) => s + f.largura, 0)
  const largura = Math.max(base, temFases ? RAIA_ROTULO_W + somaFases : 0)
  const alturaRaias = raias.reduce((s, r) => s + r.altura, 0)
  const topo = temFases ? -FASE_ALTURA : 0

  let y = 0
  const raiasG = raias.map((r) => { const g = { id: r.id, caixa: { x: -RAIA_ROTULO_W, y, largura, altura: r.altura } }; y += r.altura; return g })

  let x = 0
  const fim = largura - RAIA_ROTULO_W
  const fases = temFases ? layout.fases.map((f, i, todas) => {
    const ultima = i === todas.length - 1
    const w = ultima ? Math.max(f.largura, fim - x) : f.largura
    const g = {
      id: f.id, nome: f.nome, primeira: i === 0, ultima,
      cabecalho: { x, y: -FASE_ALTURA, largura: w, altura: FASE_ALTURA },
      coluna: { x, y: -FASE_ALTURA, largura: w, altura: FASE_ALTURA + alturaRaias },
    }
    x += w
    return g
  }) : []

  const esquerda = -RAIA_ROTULO_W - FAIXA_DO_NOME
  const piscina = raias.length ? { x: esquerda, y: topo, largura: FAIXA_DO_NOME + largura, altura: alturaRaias - topo } : null
  let yExt = (raias.length ? alturaRaias : conteudo.fundo) + INTERVALO_EXTERNAS
  const externas = layout.piscinasExternas.map((p) => {
    const g = { id: p.id, nome: p.nome, caixa: { x: esquerda, y: yExt, largura: FAIXA_DO_NOME + largura, altura: p.altura } }
    yExt += p.altura + INTERVALO_EXTERNAS
    return g
  })
  return { largura, piscina, raias: raiasG, fases, externas }
}

const naTela = (r: Retangulo, o: Orientacao): Retangulo => {
  const { x, y, largura, altura } = retanguloParaTela({ id: '', ...r }, o)
  return { x, y, largura, altura }
}

/** As mesmas faixas na tela: na vertical, cada retângulo inteiro é transposto. */
export function faixasNaTela(f: Faixas, o: Orientacao): Faixas {
  if (o === 'horizontal') return f
  return {
    largura: f.largura,
    piscina: f.piscina && naTela(f.piscina, o),
    raias: f.raias.map((r) => ({ ...r, caixa: naTela(r.caixa, o) })),
    fases: f.fases.map((g) => ({ ...g, cabecalho: naTela(g.cabecalho, o), coluna: naTela(g.coluna, o) })),
    externas: f.externas.map((p) => ({ ...p, caixa: naTela(p.caixa, o) })),
  }
}

/** Ponto lógico ↔ tela (a transposição é a própria inversa). */
export const pontoNaTela = (p: Pt, o: Orientacao): Pt => (o === 'vertical' ? { x: p.y, y: p.x } : p)

/** Alça da forma na tela: na vertical o lado troca (direita → base, esquerda → topo). */
export function alcaNaTela(alca: string, o: Orientacao): string {
  if (o === 'horizontal') return alca
  const troca: Record<string, string> = { r: 'b', b: 'r', l: 't', t: 'l' }
  return alca.replace(/-([rblt])$/, (_m, lado: string) => `-${troca[lado]}`)
}

/** Alinha as formas como se vê na tela (o "topo" da vertical é o topo da tela) e devolve
 *  as posições LÓGICAS novas (canto superior esquerdo) por id. */
export function alinharNaTela(caixas: readonly Caixa[], modo: ModoAlinhar, o: Orientacao): Record<string, Pt> {
  const tela = caixas.map((c) => paraTela(c, o))
  const novas = alinhar(tela, modo)
  const saida: Record<string, Pt> = {}
  for (const c of tela) {
    const p = novas[c.id]
    if (!p) continue
    const l = daTela({ ...c, x: p.x, y: p.y }, o)
    saida[c.id] = { x: l.x, y: l.y }
  }
  return saida
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** Traço do fluxo de mensagem (lógico): sai do centro da forma na vertical, pela borda de
 *  cima ou de baixo, até a borda da piscina (no x da forma, preso ao corpo da piscina). */
export function rotaDaMensagem(de: { caixa: Retangulo; piscina: boolean }, para: { caixa: Retangulo; piscina: boolean }): Pt[] {
  const A = de.caixa, B = para.caixa
  const centro = (r: Retangulo): Pt => ({ x: r.x + r.largura / 2, y: r.y + r.altura / 2 })
  const xNaPiscina = (p: Retangulo, x: number) => limitar(x, p.x + FAIXA_DO_NOME + 10, p.x + p.largura - 10)
  const ca = centro(A), cb = centro(B)
  const xa = de.piscina ? xNaPiscina(A, cb.x) : ca.x
  const xb = para.piscina ? xNaPiscina(B, xa) : cb.x
  // B abaixo: sai pela base de A e chega pelo topo de B; acima, o contrário
  const desce = cb.y >= ca.y
  const y1 = desce ? A.y + A.altura : A.y
  const y2 = desce ? B.y : B.y + B.altura
  if (xa === xb) return [{ x: xa, y: y1 }, { x: xb, y: y2 }]
  const meio = (y1 + y2) / 2
  return [{ x: xa, y: y1 }, { x: xa, y: meio }, { x: xb, y: meio }, { x: xb, y: y2 }]
}
