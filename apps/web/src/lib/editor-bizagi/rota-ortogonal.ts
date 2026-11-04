/* ─── Rota ortogonal das setas com pontas livres (PO, 03/11/2026) ───────────────
   Puro. A seta SAI perpendicular ao lado escolhido, para fora, e CHEGA perpendicular ao
   lado de chegada, vindo de fora — nunca volta por dentro da própria forma. Do ponto do
   contorno sai um toco até `desvio` além da caixa; entre os dois tocos, testa os traçados
   em L, Z e U (e os de 3–4 dobras que contornam as caixas) e fica com o que não atravessa
   nenhuma das duas formas, com menos dobras e, empatado, o mais curto. */
import type { PontaDaSeta } from '@nxt/types';

type Pt = { x: number; y: number };
type Caixa = { x: number; y: number; largura: number; altura: number };
/** Uma ponta da rota: o ponto no contorno, o lado por onde sai/chega e a caixa da forma. */
export type ExtremoDaRota = { ponto: Pt; lado: PontaDaSeta['lado']; caixa: Caixa };

const NORMAL: Record<PontaDaSeta['lado'], Pt> = { cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 }, esquerda: { x: -1, y: 0 }, direita: { x: 1, y: 0 } };
const EPS = 0.5;

/** O toco: do ponto, na direção do lado, até `desvio` além da borda da caixa. */
function toco(e: ExtremoDaRota, desvio: number): Pt {
  const c = e.caixa;
  switch (e.lado) {
    case 'cima': return { x: e.ponto.x, y: Math.min(e.ponto.y, c.y) - desvio };
    case 'baixo': return { x: e.ponto.x, y: Math.max(e.ponto.y, c.y + c.altura) + desvio };
    case 'esquerda': return { x: Math.min(e.ponto.x, c.x) - desvio, y: e.ponto.y };
    case 'direita': return { x: Math.max(e.ponto.x, c.x + c.largura) + desvio, y: e.ponto.y };
  }
}

const direcao = (a: Pt, b: Pt): Pt => ({ x: Math.sign(Math.round(b.x - a.x)), y: Math.sign(Math.round(b.y - a.y)) });
const igual = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Tira pontos repetidos e junta trechos seguidos na MESMA direção. `null` se algum trecho
 *  não for ortogonal ou voltar sobre o anterior. */
function simplificar(pts: Pt[]): Pt[] | null {
  const sem: Pt[] = [];
  for (const p of pts) if (!sem.length || !igual(sem[sem.length - 1], p)) sem.push(p);
  const out: Pt[] = [sem[0]];
  for (let i = 1; i < sem.length; i++) {
    const a = out[out.length - 1], b = sem[i];
    if (Math.abs(a.x - b.x) >= EPS && Math.abs(a.y - b.y) >= EPS) return null;
    if (out.length >= 2) {
      const d0 = direcao(out[out.length - 2], a), d1 = direcao(a, b);
      if (d0.x === d1.x && d0.y === d1.y) { out[out.length - 1] = b; continue; }
      if (d0.x === -d1.x && d0.y === -d1.y) return null; // volta sobre si
    }
    out.push(b);
  }
  return out;
}

/** O trecho a–b passa por DENTRO da caixa (encostar na borda não conta). */
function cruza(a: Pt, b: Pt, c: Caixa): boolean {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x1 < c.x + c.largura - EPS && x2 > c.x + EPS && y1 < c.y + c.altura - EPS && y2 > c.y + EPS;
}

const comprimento = (r: Pt[]) => r.reduce((s, p, i) => (i ? s + Math.abs(p.x - r[i - 1].x) + Math.abs(p.y - r[i - 1].y) : 0), 0);

export function rotaOrtogonal(origem: ExtremoDaRota, destino: ExtremoDaRota, desvio = 20): Pt[] {
  const p0 = origem.ponto, q0 = destino.ponto;
  const p1 = toco(origem, desvio), q1 = toco(destino, desvio);
  const nO = NORMAL[origem.lado], nD = NORMAL[destino.lado];
  const A = origem.caixa, B = destino.caixa;
  const meio = (a: number, b: number) => (a + b) / 2;
  const xs = [...new Set([p1.x, q1.x, meio(p1.x, q1.x), Math.min(A.x, B.x) - desvio, Math.max(A.x + A.largura, B.x + B.largura) + desvio,
    meio(A.x + A.largura, B.x), meio(B.x + B.largura, A.x)])];
  const ys = [...new Set([p1.y, q1.y, meio(p1.y, q1.y), Math.min(A.y, B.y) - desvio, Math.max(A.y + A.altura, B.y + B.altura) + desvio,
    meio(A.y + A.altura, B.y), meio(B.y + B.altura, A.y)])];

  // os miolos possíveis entre p1 e q1
  const miolos: Pt[][] = [[]];
  for (const x of xs) {
    miolos.push([{ x, y: p1.y }, { x, y: q1.y }]);
    for (const y of ys) {
      miolos.push([{ x, y: p1.y }, { x, y }, { x: q1.x, y }]);
      for (const x2 of xs) miolos.push([{ x, y: p1.y }, { x, y }, { x: x2, y }, { x: x2, y: q1.y }]);
    }
  }
  for (const y of ys) {
    miolos.push([{ x: p1.x, y }, { x: q1.x, y }]);
    for (const x of xs) {
      miolos.push([{ x: p1.x, y }, { x, y }, { x, y: q1.y }]);
      for (const y2 of ys) miolos.push([{ x: p1.x, y }, { x, y }, { x, y: y2 }, { x: q1.x, y: y2 }]);
    }
  }
  miolos.push([{ x: q1.x, y: p1.y }], [{ x: p1.x, y: q1.y }]);

  let melhor: Pt[] | null = null;
  let nota = Infinity;
  for (const miolo of miolos) {
    const r = simplificar([p0, p1, ...miolo, q1, q0]);
    if (!r || r.length < 2) continue;
    // sai na direção do lado e chega vindo de fora (a ponta da seta aponta para dentro)
    const s = direcao(r[0], r[1]), e = direcao(r[r.length - 1], r[r.length - 2]);
    if (s.x !== nO.x || s.y !== nO.y || e.x !== nD.x || e.y !== nD.y) continue;
    let cruzamentos = 0;
    for (let i = 1; i < r.length; i++) {
      // o 1º trecho sai de dentro da caixa de origem (losango, círculo) e o último entra na de destino
      if (i > 1 && cruza(r[i - 1], r[i], A)) cruzamentos++;
      if (i < r.length - 1 && cruza(r[i - 1], r[i], B)) cruzamentos++;
    }
    const v = cruzamentos * 1e9 + (r.length - 2) * 1e5 + comprimento(r);
    if (v < nota) { nota = v; melhor = r; }
  }
  return melhor ?? [p0, p1, q1, q0];
}
