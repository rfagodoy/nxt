import { describe, expect, it } from 'vitest';
import type { PontaDaSeta } from '@nxt/types';
import {
  ladoDaSetaDaPonta, normalDaPonta, pontaDaTela, pontaMaisProxima, pontaNaPiscina, pontaParaTela, pontoDoContorno, rotaEntreContornos, rotaEntrePontas,
  type FormaDoContorno,
} from './contorno';

const caixa = { x: 100, y: 40, largura: 200, altura: 80 };
const quadrada = { x: 0, y: 0, largura: 56, altura: 56 };
const perto = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(eps);
const noLosango = (p: { x: number; y: number }) => Math.abs(p.x - 28) / 28 + Math.abs(p.y - 28) / 28;

describe('pontoDoContorno', () => {
  it('retângulo: o ponto do lado, a partir do topo/esquerda', () => {
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'cima', t: 0.25 })).toEqual({ x: 150, y: 40 });
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'baixo', t: 1 })).toEqual({ x: 300, y: 120 });
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'esquerda', t: 0 })).toEqual({ x: 100, y: 40 });
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'direita', t: 0.5 })).toEqual({ x: 300, y: 80 });
  });

  it('t fora de [0, 1] é preso', () => {
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'cima', t: 2 })).toEqual({ x: 300, y: 40 });
    expect(pontoDoContorno(caixa, 'retangulo', { lado: 'direita', t: -1 })).toEqual({ x: 300, y: 40 });
  });

  it('losango: o meio do lado é o vértice; os outros pontos caem nas arestas', () => {
    perto(pontoDoContorno(quadrada, 'losango', { lado: 'direita', t: 0.5 }), { x: 56, y: 28 });
    perto(pontoDoContorno(quadrada, 'losango', { lado: 'cima', t: 0.5 }), { x: 28, y: 0 });
    // canto da caixa → meio da aresta do losango
    perto(pontoDoContorno(quadrada, 'losango', { lado: 'cima', t: 1 }), { x: 42, y: 14 });
    const p = pontoDoContorno(quadrada, 'losango', { lado: 'direita', t: 0.2 });
    expect(noLosango(p)).toBeCloseTo(1);
    expect(p.y).toBeLessThan(28);
  });

  it('círculo: a projeção a partir do centro', () => {
    perto(pontoDoContorno(quadrada, 'circulo', { lado: 'baixo', t: 0.5 }), { x: 28, y: 56 });
    perto(pontoDoContorno(quadrada, 'circulo', { lado: 'cima', t: 1 }), { x: 28 + 28 / Math.SQRT2, y: 28 - 28 / Math.SQRT2 });
  });
});

describe('pontaMaisProxima', () => {
  const ida = (forma: FormaDoContorno, c: typeof caixa, p: { x: number; y: number }) => pontoDoContorno(c, forma, pontaMaisProxima(c, forma, p));

  it('retângulo, ponto de fora: o lado mais perto e a posição nele', () => {
    expect(pontaMaisProxima(caixa, 'retangulo', { x: 150, y: 0 })).toEqual({ lado: 'cima', t: 0.25 });
    expect(pontaMaisProxima(caixa, 'retangulo', { x: 400, y: 60 })).toEqual({ lado: 'direita', t: 0.25 });
    const canto = pontaMaisProxima(caixa, 'retangulo', { x: 500, y: 500 });
    perto(pontoDoContorno(caixa, 'retangulo', canto), { x: 300, y: 120 });
  });

  it('retângulo, ponto de dentro: o lado mais perto', () => {
    expect(pontaMaisProxima(caixa, 'retangulo', { x: 120, y: 80 })).toEqual({ lado: 'esquerda', t: 0.5 });
    expect(pontaMaisProxima(caixa, 'retangulo', { x: 250, y: 115 })).toEqual({ lado: 'baixo', t: 0.75 });
  });

  it('ida e volta no retângulo, cantos inclusive', () => {
    for (const lado of ['cima', 'direita', 'baixo', 'esquerda'] as const) {
      for (const t of [0, 0.3, 1]) {
        const q = pontoDoContorno(caixa, 'retangulo', { lado, t });
        perto(ida('retangulo', caixa, q), q);
      }
    }
  });

  it('losango: o ponto da aresta mais perto, de fora e de dentro', () => {
    // de fora, perto da aresta de cima-direita: cai nela, no pé da perpendicular
    const q = ida('losango', quadrada, { x: 50, y: 6 });
    expect(noLosango(q)).toBeCloseTo(1);
    perto(q, { x: 42, y: 14 });
    perto(ida('losango', quadrada, { x: 80, y: 28 }), { x: 56, y: 28 });
    // de dentro, logo abaixo do vértice de cima: a aresta mais perto
    expect(noLosango(ida('losango', quadrada, { x: 28, y: 20 }))).toBeCloseTo(1);
    for (const lado of ['cima', 'direita', 'baixo', 'esquerda'] as const) {
      for (const t of [0, 0.2, 0.5, 0.9]) {
        const p = pontoDoContorno(quadrada, 'losango', { lado, t });
        perto(ida('losango', quadrada, p), p);
      }
    }
  });

  it('círculo: a projeção radial', () => {
    perto(ida('circulo', quadrada, { x: 100, y: 28 }), { x: 56, y: 28 });
    perto(ida('circulo', quadrada, { x: 28, y: 10 }), { x: 28, y: 0 });
    perto(ida('circulo', quadrada, { x: 100, y: -44 }), { x: 28 + 28 / Math.SQRT2, y: 28 - 28 / Math.SQRT2 });
  });

  it('no centro exato: a direita, no meio', () => {
    expect(pontaMaisProxima(quadrada, 'circulo', { x: 28, y: 28 })).toEqual({ lado: 'direita', t: 0.5 });
  });

  it('t sempre em [0, 1]', () => {
    for (const forma of ['retangulo', 'losango', 'circulo'] as const) {
      for (const p of [{ x: -999, y: -999 }, { x: 999, y: 3 }, { x: 28, y: 999 }]) {
        const { t } = pontaMaisProxima(quadrada, forma, p);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('pontas na orientação', () => {
  const pontas: PontaDaSeta[] = [{ lado: 'cima', t: 0.2 }, { lado: 'direita', t: 0.7 }, { lado: 'baixo', t: 0 }, { lado: 'esquerda', t: 1 }];
  it('horizontal é a identidade', () => {
    for (const p of pontas) { expect(pontaParaTela(p, 'horizontal')).toEqual(p); expect(pontaDaTela(p, 'horizontal')).toEqual(p); }
  });
  it('vertical: a direita vira a de baixo, o topo vira a esquerda (t igual)', () => {
    expect(pontaParaTela({ lado: 'direita', t: 0.7 }, 'vertical')).toEqual({ lado: 'baixo', t: 0.7 });
    expect(pontaParaTela({ lado: 'cima', t: 0.2 }, 'vertical')).toEqual({ lado: 'esquerda', t: 0.2 });
  });
  it('ida e volta', () => {
    for (const p of pontas) {
      expect(pontaDaTela(pontaParaTela(p, 'vertical'), 'vertical')).toEqual(p);
      expect(pontaParaTela(pontaDaTela(p, 'vertical'), 'vertical')).toEqual(p);
    }
  });
});

describe('direção do lado e rota', () => {
  it('a normal aponta para fora da forma', () => {
    expect(normalDaPonta({ lado: 'cima', t: 0 })).toEqual({ x: 0, y: -1 });
    expect(normalDaPonta({ lado: 'direita', t: 0 })).toEqual({ x: 1, y: 0 });
    expect(normalDaPonta({ lado: 'baixo', t: 0 })).toEqual({ x: 0, y: 1 });
    expect(normalDaPonta({ lado: 'esquerda', t: 0 })).toEqual({ x: -1, y: 0 });
    expect(ladoDaSetaDaPonta({ lado: 'cima', t: 0 })).toBe('topo');
    expect(ladoDaSetaDaPonta({ lado: 'baixo', t: 0 })).toBe('base');
  });
  it('a rota começa e termina nos pontos do contorno, saindo e chegando perpendicular ao lado', () => {
    const a = { caixa: { x: 0, y: 0, largura: 100, altura: 60 }, forma: 'retangulo' as const, ponta: { lado: 'baixo' as const, t: 0.25 } };
    const b = { caixa: { x: 300, y: 200, largura: 100, altura: 60 }, forma: 'retangulo' as const, ponta: { lado: 'cima' as const, t: 0.75 } };
    const r = rotaEntrePontas(a, b);
    expect(r[0]).toEqual({ x: 25, y: 60 });
    expect(r[r.length - 1]).toEqual({ x: 375, y: 200 });
    expect(r[1].x).toBe(25); expect(r[1].y).toBeGreaterThan(60);
    expect(r[r.length - 2].x).toBe(375); expect(r[r.length - 2].y).toBeLessThan(200);
    for (let i = 1; i < r.length; i++) expect(r[i].x === r[i - 1].x || r[i].y === r[i - 1].y).toBe(true);
  });
});

describe('pontaNaPiscina', () => {
  const piscina = { x: 0, y: 400, largura: 1000, altura: 160 };
  it('o lado que encara o outro ponto, alinhado a ele', () => {
    expect(pontaNaPiscina(piscina, { x: 250, y: 100 })).toEqual({ lado: 'cima', t: 0.25 });
    expect(pontaNaPiscina(piscina, { x: 500, y: 900 })).toEqual({ lado: 'baixo', t: 0.5 });
    expect(pontaNaPiscina({ x: 400, y: 0, largura: 160, altura: 1000 }, { x: 100, y: 300 })).toEqual({ lado: 'esquerda', t: 0.3 });
  });
  it('preso para dentro das pontas', () => {
    expect(pontaNaPiscina(piscina, { x: -50, y: 0 }).t).toBeCloseTo(0.03);
  });
});

describe('rotaEntreContornos', () => {
  it('a ponta na piscina encara a da forma e fica alinhada a ela', () => {
    const forma = { caixa: { x: 100, y: 0, largura: 100, altura: 60 }, forma: 'retangulo' as const };
    const piscina = { caixa: { x: 0, y: 300, largura: 1000, altura: 160 }, forma: 'retangulo' as const, piscina: true };
    const r = rotaEntreContornos(forma, { lado: 'baixo', t: 0.5 }, piscina, null);
    expect(r[0]).toEqual({ x: 150, y: 60 });
    expect(r[r.length - 1]).toEqual({ x: 150, y: 300 });
  });
});
