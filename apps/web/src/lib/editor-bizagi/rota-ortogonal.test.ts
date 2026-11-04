import { describe, expect, it } from 'vitest';
import type { PontaDaSeta } from '@nxt/types';
import { polilinhaDaSeta } from '@/lib/desenho-bpmn';
import { pontaParaTela, pontasLivresNaTela, pontoDoContorno } from './contorno';
import { rotaOrtogonal, type ExtremoDaRota } from './rota-ortogonal';

type Pt = { x: number; y: number };
type Caixa = { x: number; y: number; largura: number; altura: number };
const D = 20;

const extremo = (caixa: Caixa, ponta: PontaDaSeta): ExtremoDaRota => ({ ponto: pontoDoContorno(caixa, 'retangulo', ponta), lado: ponta.lado, caixa });

/** O segmento a–b (eixo) passa por DENTRO da caixa (o contorno não conta). */
function cruza(a: Pt, b: Pt, c: Caixa): boolean {
  const eps = 0.5;
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x1 < c.x + c.largura - eps && x2 > c.x + eps && y1 < c.y + c.altura - eps && y2 > c.y + eps;
}

const NORMAL: Record<PontaDaSeta['lado'], Pt> = { cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 }, esquerda: { x: -1, y: 0 }, direita: { x: 1, y: 0 } };

/** Sai perpendicular e para fora; chega perpendicular, vindo de fora; ortogonal; não cruza as caixas. */
function conferir(r: Pt[], o: ExtremoDaRota, d: ExtremoDaRota) {
  expect(r[0]).toEqual(o.ponto);
  expect(r[r.length - 1]).toEqual(d.ponto);
  const n0 = NORMAL[o.lado], n1 = NORMAL[d.lado];
  const s = { x: r[1].x - r[0].x, y: r[1].y - r[0].y };
  expect(Math.sign(s.x)).toBe(n0.x); expect(Math.sign(s.y)).toBe(n0.y);
  const e = { x: r[r.length - 2].x - r[r.length - 1].x, y: r[r.length - 2].y - r[r.length - 1].y };
  expect(Math.sign(e.x)).toBe(n1.x); expect(Math.sign(e.y)).toBe(n1.y);
  for (let i = 1; i < r.length; i++) {
    expect(r[i].x === r[i - 1].x || r[i].y === r[i - 1].y).toBe(true);
    expect(cruza(r[i - 1], r[i], o.caixa)).toBe(false);
    expect(cruza(r[i - 1], r[i], d.caixa)).toBe(false);
  }
}
const dobras = (r: Pt[]) => r.length - 2;

const A: Caixa = { x: 100, y: 100, largura: 190, altura: 64 };

describe('rotaOrtogonal', () => {
  it('base → esquerda (alvo à direita e abaixo): um cotovelo', () => {
    const B = { x: 500, y: 300, largura: 190, altura: 64 };
    const o = extremo(A, { lado: 'baixo', t: 0.5 }), d = extremo(B, { lado: 'esquerda', t: 0.5 });
    const r = rotaOrtogonal(o, d);
    conferir(r, o, d);
    expect(r).toEqual([{ x: 195, y: 164 }, { x: 195, y: 332 }, { x: 500, y: 332 }]);
  });

  it('o caso do navegador: base da tarefa → Fim à direita na mesma altura (não volta por dentro)', () => {
    const fim = { x: 520, y: 105, largura: 32, altura: 32 };
    const o = extremo(A, { lado: 'baixo', t: 0.5 }), d = extremo(fim, { lado: 'esquerda', t: 0.5 });
    const r = rotaOrtogonal(o, d);
    conferir(r, o, d);
    expect(r[1]).toEqual({ x: 195, y: 164 + D });
  });

  it('base → topo com o alvo ACIMA: dá a volta (U)', () => {
    const B = { x: 140, y: -200, largura: 190, altura: 64 };
    const o = extremo(A, { lado: 'baixo', t: 0.5 }), d = extremo(B, { lado: 'cima', t: 0.5 });
    const r = rotaOrtogonal(o, d);
    conferir(r, o, d);
  });

  it('direita → direita: U pela direita', () => {
    const B = { x: 120, y: 300, largura: 120, altura: 64 };
    const o = extremo(A, { lado: 'direita', t: 0.5 }), d = extremo(B, { lado: 'direita', t: 0.5 });
    const r = rotaOrtogonal(o, d);
    conferir(r, o, d);
    expect(dobras(r)).toBe(2);
    expect(Math.max(...r.map((p) => p.x))).toBe(290 + D);
  });

  it('topo → base com o alvo acima: reto quando alinhado', () => {
    const B = { x: 100, y: -200, largura: 190, altura: 64 };
    const o = extremo(A, { lado: 'cima', t: 0.5 }), d = extremo(B, { lado: 'baixo', t: 0.5 });
    const r = rotaOrtogonal(o, d);
    conferir(r, o, d);
    expect(r).toEqual([{ x: 195, y: 100 }, { x: 195, y: -136 }]);
  });

  it('nunca atravessa as formas: grade de casos', () => {
    const lados = ['cima', 'direita', 'baixo', 'esquerda'] as const;
    for (const dx of [-500, -150, 0, 150, 500]) {
      for (const dy of [-300, -90, 0, 90, 300]) {
        if (Math.abs(dx) < 200 && Math.abs(dy) < 80) continue; // as caixas se sobrepõem
        const B = { x: A.x + dx, y: A.y + dy, largura: 120, altura: 56 };
        for (const lo of lados) for (const ld of lados) {
          for (const t of [0.2, 0.5]) {
            const o = extremo(A, { lado: lo, t }), d = extremo(B, { lado: ld, t: 1 - t });
            conferir(rotaOrtogonal(o, d), o, d);
          }
        }
      }
    }
  });

  it('vertical: a rota na tela é a da ponta transposta (base lógica → direita na tela)', () => {
    const B = { x: 500, y: 300, largura: 190, altura: 64 };
    const pa = pontaParaTela({ lado: 'direita', t: 0.5 }, 'vertical'), pb = pontaParaTela({ lado: 'cima', t: 0.5 }, 'vertical');
    expect(pa.lado).toBe('baixo');
    const o = extremo(A, pa), d = extremo(B, pb);
    conferir(rotaOrtogonal(o, d), o, d);
  });
});

describe('sem pontas, nada muda', () => {
  it('pontasLivresNaTela devolve undefined: a seta segue no traço automático de sempre', () => {
    expect(pontasLivresNaTela({}, 's-r', 'e-l', 'horizontal')).toBeUndefined();
    expect(pontasLivresNaTela({ saida: undefined, entrada: undefined }, 's-b', 'e-b', 'vertical')).toBeUndefined();
  });
  it('com uma ponta, a outra é a da alça (transposta na vertical)', () => {
    expect(pontasLivresNaTela({ saida: { lado: 'baixo', t: 0.3 } }, 's-r', 'e-l', 'horizontal'))
      .toEqual({ saida: { lado: 'baixo', t: 0.3 }, entrada: { lado: 'esquerda', t: 0.5 } });
    expect(pontasLivresNaTela({ entrada: { lado: 'cima', t: 0.1 } }, 's-r', 'e-l', 'vertical'))
      .toEqual({ saida: { lado: 'baixo', t: 0.5 }, entrada: { lado: 'esquerda', t: 0.1 } });
  });
  it('o traço automático (polilinhaDaSeta) continua o mesmo', () => {
    expect(polilinhaDaSeta({ x: 0, y: 0 }, 'direita', { x: 200, y: 80 }, 'esquerda')).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 80 }]);
    expect(polilinhaDaSeta({ x: 300, y: 0 }, 'base', { x: 0, y: 0 }, 'base')).toEqual([{ x: 300, y: 0 }, { x: 300, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }]);
    expect(polilinhaDaSeta({ x: 0, y: 0 }, 'topo', { x: 200, y: -80 }, 'esquerda')).toEqual([{ x: 0, y: 0 }, { x: 0, y: -80 }, { x: 200, y: -80 }]);
  });
});
