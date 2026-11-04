/* ─── Contorno das formas: as pontas livres das setas (PO, 03/11/2026) ─────────
   Puro. Uma ponta é (lado, t): o lado da CAIXA da forma e a posição nele, de 0 a 1 a partir
   do topo/esquerda. No retângulo é o próprio ponto do lado; no losango e no círculo, esse
   ponto da caixa é projetado no contorno pelo raio que sai do centro. A seta sai (e chega)
   perpendicular ao lado. As pontas gravadas são LÓGICAS (horizontal): na vertical o lado
   troca na tela (`pontaParaTela`/`pontaDaTela`) e o `t` fica — como as alças (`alcaNaTela`). */
import type { PontaDaSeta } from '@nxt/types';
import { polilinhaDaSeta, type LadoDaSeta } from '@/lib/desenho-bpmn';
import type { Orientacao } from './geometria';

export type FormaDoContorno = 'retangulo' | 'losango' | 'circulo';
type Pt = { x: number; y: number };
/** x,y = canto superior esquerdo (a mesma convenção de `Caixa`, sem o id). */
export type CaixaDoContorno = { x: number; y: number; largura: number; altura: number };

const prender = (t: number) => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5);
const centro = (c: CaixaDoContorno): Pt => ({ x: c.x + c.largura / 2, y: c.y + c.altura / 2 });

/** O ponto (lado, t) na borda da CAIXA. */
function pontoDaCaixa(c: CaixaDoContorno, p: PontaDaSeta): Pt {
  const t = prender(p.t);
  switch (p.lado) {
    case 'cima': return { x: c.x + t * c.largura, y: c.y };
    case 'baixo': return { x: c.x + t * c.largura, y: c.y + c.altura };
    case 'esquerda': return { x: c.x, y: c.y + t * c.altura };
    case 'direita': return { x: c.x + c.largura, y: c.y + t * c.altura };
  }
}

/** Fator que leva o vetor `d` (a partir do centro) até o contorno do losango/elipse. */
function escalaAteOContorno(c: CaixaDoContorno, forma: Exclude<FormaDoContorno, 'retangulo'>, d: Pt): number {
  const a = c.largura / 2, b = c.altura / 2;
  if (!(a > 0) || !(b > 0)) return 0;
  const n = forma === 'losango' ? Math.abs(d.x) / a + Math.abs(d.y) / b : Math.hypot(d.x / a, d.y / b);
  return n > 0 ? 1 / n : 0;
}

/** Onde a ponta encosta na forma. */
export function pontoDoContorno(caixa: CaixaDoContorno, forma: FormaDoContorno, ponta: PontaDaSeta): Pt {
  const b = pontoDaCaixa(caixa, ponta);
  if (forma === 'retangulo') return b;
  const c = centro(caixa);
  const d = { x: b.x - c.x, y: b.y - c.y };
  const k = escalaAteOContorno(caixa, forma, d);
  return { x: c.x + d.x * k, y: c.y + d.y * k };
}

/** Ponto mais perto de `p` no segmento a–b. */
function noSegmento(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** (lado, t) do ponto `q` do contorno: o lado da caixa que o raio centro → q atravessa. */
function pontaPeloRaio(caixa: CaixaDoContorno, q: Pt): PontaDaSeta {
  const c = centro(caixa);
  const d = { x: q.x - c.x, y: q.y - c.y };
  const a = caixa.largura / 2, b = caixa.altura / 2;
  const eps = 1e-9;
  if (Math.abs(d.x) < eps && Math.abs(d.y) < eps) return { lado: 'direita', t: 0.5 };
  const kx = Math.abs(d.x) > eps ? a / Math.abs(d.x) : Infinity;
  const ky = Math.abs(d.y) > eps ? b / Math.abs(d.y) : Infinity;
  if (kx <= ky) {
    const y = c.y + d.y * kx;
    return { lado: d.x > 0 ? 'direita' : 'esquerda', t: prender(caixa.altura ? (y - caixa.y) / caixa.altura : 0.5) };
  }
  const x = c.x + d.x * ky;
  return { lado: d.y > 0 ? 'baixo' : 'cima', t: prender(caixa.largura ? (x - caixa.x) / caixa.largura : 0.5) };
}

/** A ponta do contorno mais perto de `p` (de fora ou de dentro da forma), coerente com
 *  `pontoDoContorno`: `pontoDoContorno(pontaMaisProxima(p))` é o ponto do contorno mais perto. */
export function pontaMaisProxima(caixa: CaixaDoContorno, forma: FormaDoContorno, p: Pt): PontaDaSeta {
  const { x, y, largura: w, altura: h } = caixa;
  if (forma === 'retangulo') {
    const lados: Array<[PontaDaSeta['lado'], Pt, Pt]> = [
      ['cima', { x, y }, { x: x + w, y }],
      ['direita', { x: x + w, y }, { x: x + w, y: y + h }],
      ['baixo', { x, y: y + h }, { x: x + w, y: y + h }],
      ['esquerda', { x, y }, { x, y: y + h }],
    ];
    let melhor: PontaDaSeta = { lado: 'direita', t: 0.5 };
    let menor = Infinity;
    for (const [lado, a, b] of lados) {
      const q = noSegmento(p, a, b);
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      if (dist < menor - 1e-9) {
        menor = dist;
        const t = lado === 'cima' || lado === 'baixo' ? (w ? (q.x - x) / w : 0.5) : (h ? (q.y - y) / h : 0.5);
        melhor = { lado, t: prender(t) };
      }
    }
    return melhor;
  }
  const c = centro(caixa);
  if (forma === 'circulo') {
    const d = { x: p.x - c.x, y: p.y - c.y };
    if (Math.hypot(d.x, d.y) < 1e-9) return { lado: 'direita', t: 0.5 };
    const k = escalaAteOContorno(caixa, forma, d);
    return pontaPeloRaio(caixa, { x: c.x + d.x * k, y: c.y + d.y * k });
  }
  if (Math.hypot(p.x - c.x, p.y - c.y) < 1e-9) return { lado: 'direita', t: 0.5 };
  const topo = { x: c.x, y }, dir = { x: x + w, y: c.y }, base = { x: c.x, y: y + h }, esq = { x, y: c.y };
  let q = topo;
  let menor = Infinity;
  for (const [a, b] of [[topo, dir], [dir, base], [base, esq], [esq, topo]] as const) {
    const r = noSegmento(p, a, b);
    const dist = Math.hypot(p.x - r.x, p.y - r.y);
    if (dist < menor) { menor = dist; q = r; }
  }
  return pontaPeloRaio(caixa, q);
}

const NA_VERTICAL: Record<PontaDaSeta['lado'], PontaDaSeta['lado']> = { cima: 'esquerda', esquerda: 'cima', baixo: 'direita', direita: 'baixo' };

/** Lógico → tela. Vertical: a direita vira a de baixo e o topo, a esquerda (o `t` fica). */
export function pontaParaTela(ponta: PontaDaSeta, o: Orientacao): PontaDaSeta {
  return o === 'vertical' ? { lado: NA_VERTICAL[ponta.lado], t: ponta.t } : { ...ponta };
}

/** Tela → lógico (a troca é a própria inversa). */
export function pontaDaTela(ponta: PontaDaSeta, o: Orientacao): PontaDaSeta {
  return pontaParaTela(ponta, o);
}

/** Direção (unitária) em que a seta sai do lado — e o contrário de por onde chega. */
export function normalDaPonta(ponta: PontaDaSeta): Pt {
  switch (ponta.lado) {
    case 'cima': return { x: 0, y: -1 };
    case 'baixo': return { x: 0, y: 1 };
    case 'esquerda': return { x: -1, y: 0 };
    case 'direita': return { x: 1, y: 0 };
  }
}

/** O lado no vocabulário do roteamento (`polilinhaDaSeta`). */
export function ladoDaSetaDaPonta(ponta: PontaDaSeta): LadoDaSeta {
  return ponta.lado === 'cima' ? 'topo' : ponta.lado === 'baixo' ? 'base' : ponta.lado;
}

/** A ponta automática de uma alça (`s-r`, `e-b`…): o meio do lado. */
export function pontaDaAlca(alca: string): PontaDaSeta {
  const l = alca.slice(-1);
  return { lado: l === 'r' ? 'direita' : l === 'l' ? 'esquerda' : l === 't' ? 'cima' : 'baixo', t: 0.5 };
}

export type PontaNaForma = { caixa: CaixaDoContorno; forma: FormaDoContorno; ponta: PontaDaSeta };

/** Traço ortogonal entre duas pontas (na mesma coordenada das caixas): sai perpendicular ao
 *  lado de `de` e chega perpendicular ao lado de `para`. */
export function rotaEntrePontas(de: PontaNaForma, para: PontaNaForma, desvio = 20): Pt[] {
  const s = pontoDoContorno(de.caixa, de.forma, de.ponta);
  const t = pontoDoContorno(para.caixa, para.forma, para.ponta);
  return polilinhaDaSeta(s, ladoDaSetaDaPonta(de.ponta), t, ladoDaSetaDaPonta(para.ponta), desvio);
}

/** Ponta automática na piscina externa: o lado que encara o outro ponto, alinhada a ele
 *  (presa um pouco para dentro das pontas da piscina). */
export function pontaNaPiscina(caixa: CaixaDoContorno, outro: Pt): PontaDaSeta {
  const alinhado = (v: number, ini: number, tam: number) => Math.min(0.97, Math.max(0.03, tam ? (v - ini) / tam : 0.5));
  if (outro.y < caixa.y) return { lado: 'cima', t: alinhado(outro.x, caixa.x, caixa.largura) };
  if (outro.y > caixa.y + caixa.altura) return { lado: 'baixo', t: alinhado(outro.x, caixa.x, caixa.largura) };
  if (outro.x < caixa.x) return { lado: 'esquerda', t: alinhado(outro.y, caixa.y, caixa.altura) };
  if (outro.x > caixa.x + caixa.largura) return { lado: 'direita', t: alinhado(outro.y, caixa.y, caixa.altura) };
  return { lado: 'cima', t: alinhado(outro.x, caixa.x, caixa.largura) };
}

/** Uma ponta da seta: a forma (com o contorno) ou a piscina externa (ponta automática). */
export type ContornoDaPonta = { caixa: CaixaDoContorno; forma: FormaDoContorno; piscina?: boolean };

/** Traço entre duas pontas, cada uma numa forma (`ponta` dada) ou numa piscina externa (a
 *  ponta encara a outra, `pontaNaPiscina`). Sem ponta numa forma, o meio da direita. */
export function rotaEntreContornos(a: ContornoDaPonta, pa: PontaDaSeta | null, b: ContornoDaPonta, pb: PontaDaSeta | null, desvio = 20): Pt[] {
  const meio: PontaDaSeta = { lado: 'direita', t: 0.5 };
  const naForma = (c: ContornoDaPonta, p: PontaDaSeta | null) => (c.piscina ? null : p ?? meio);
  let sa = naForma(a, pa), sb = naForma(b, pb);
  const ponto = (c: ContornoDaPonta, p: PontaDaSeta | null) => (p ? pontoDoContorno(c.caixa, c.forma, p) : centro(c.caixa));
  if (!sa) sa = pontaNaPiscina(a.caixa, ponto(b, sb));
  if (!sb) sb = pontaNaPiscina(b.caixa, ponto(a, sa));
  return rotaEntrePontas({ ...a, ponta: sa }, { ...b, ponta: sb }, desvio);
}
