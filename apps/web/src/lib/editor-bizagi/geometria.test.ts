import { describe, expect, it } from 'vitest';
import {
  alinhar,
  daTela,
  encaixarComGuias,
  paraTela,
  posicaoDoProximo,
  retanguloParaTela,
  type Caixa,
} from './geometria';

const cy = (c: Caixa) => c.y + c.altura / 2;

describe('orientação', () => {
  const caixa: Caixa = { id: 'a', x: 320, y: 144, largura: 190, altura: 72 };

  it('paraTela e daTela são inversas nas duas orientações', () => {
    for (const o of ['horizontal', 'vertical'] as const) {
      expect(daTela(paraTela(caixa, o), o)).toEqual(caixa);
      expect(paraTela(daTela(caixa, o), o)).toEqual(caixa);
    }
  });

  it('vertical transpõe o centro, não o tamanho', () => {
    const c: Caixa = { id: 'a', x: 100, y: 40, largura: 190, altura: 72 };
    expect(paraTela(c, 'vertical')).toEqual({ id: 'a', x: -19, y: 159, largura: 190, altura: 72 });
    expect(paraTela(c, 'horizontal')).toEqual(c);
  });

  it('horizontal → vertical → horizontal devolve a posição', () => {
    expect(daTela(paraTela(caixa, 'vertical'), 'vertical')).toEqual(caixa);
  });

  it('retanguloParaTela transpõe o retângulo inteiro', () => {
    const r: Caixa = { id: 'p', x: 10, y: 20, largura: 800, altura: 200 };
    expect(retanguloParaTela(r, 'vertical')).toEqual({ id: 'p', x: 20, y: 10, largura: 200, altura: 800 });
    expect(retanguloParaTela(r, 'horizontal')).toEqual(r);
  });
});

describe('encaixarComGuias', () => {
  // movendo 100x60 em x=432 (já na grade) -> centro x 482
  const mov: Caixa = { id: 'm', x: 432, y: 0, largura: 100, altura: 60 };

  it('cola no centro vizinho a 5 px e devolve a guia', () => {
    const o: Caixa = { id: 'o', x: 427, y: 400, largura: 100, altura: 60 }; // centro 477
    const r = encaixarComGuias(mov, [o]);
    expect(r.x).toBe(427);
    expect(r.guias).toEqual([{ eixo: 'x', valor: 477 }]);
  });

  it('a 7 px só encaixa na grade', () => {
    const o: Caixa = { id: 'o', x: 425, y: 400, largura: 100, altura: 60 }; // centro 475
    const r = encaixarComGuias(mov, [o]);
    expect(r.x).toBe(432);
    expect(r.guias.filter((g) => g.eixo === 'x')).toEqual([]);
  });

  it('a tolerância é inclusiva (6 px)', () => {
    const o: Caixa = { id: 'o', x: 426, y: 400, largura: 100, altura: 60 }; // centro 476
    expect(encaixarComGuias(mov, [o]).x).toBe(426);
  });

  it('cola em y de forma independente', () => {
    const o: Caixa = { id: 'o', x: 0, y: 301, largura: 100, altura: 60 }; // centro y 331
    const r = encaixarComGuias({ id: 'm', x: 800, y: 304, largura: 100, altura: 60 }, [o]);
    expect(r.y).toBe(301);
    expect(r.guias).toEqual([{ eixo: 'y', valor: 331 }]);
  });

  it('escolhe o mais próximo quando vários qualificam', () => {
    const a: Caixa = { id: 'a', x: 0, y: 0, largura: 100, altura: 60 }; // centro x 50
    const b: Caixa = { id: 'b', x: 3, y: 100, largura: 100, altura: 60 }; // centro x 53
    const r = encaixarComGuias({ id: 'm', x: 0, y: 500, largura: 100, altura: 60 }, [a, b]);
    expect(r.x).toBe(0);
    expect(r.guias).toEqual([{ eixo: 'x', valor: 50 }]);
  });

  it('sem outras, só grade', () => {
    const r = encaixarComGuias({ id: 'm', x: 21, y: 35, largura: 100, altura: 60 }, []);
    expect(r).toEqual({ x: 16, y: 32, guias: [] });
  });
});

describe('alinhar', () => {
  const caixas: Caixa[] = [
    { id: 'a', x: 0, y: 0, largura: 100, altura: 40 }, // centro 50, 20
    { id: 'b', x: 200, y: 100, largura: 60, altura: 80 }, // centro 230, 140
    { id: 'c', x: 500, y: 50, largura: 200, altura: 20 }, // centro 600, 60
  ];

  it('esquerda e topo', () => {
    expect(alinhar(caixas, 'esquerda')).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, c: { x: 0, y: 50 } });
    expect(alinhar(caixas, 'topo')).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 500, y: 0 } });
  });

  it('centroX leva todos à média dos centros', () => {
    const m = (50 + 230 + 600) / 3;
    const r = alinhar(caixas, 'centroX');
    expect(r.a).toEqual({ x: m - 50, y: 0 });
    expect(r.b).toEqual({ x: m - 30, y: 100 });
    expect(r.c).toEqual({ x: m - 100, y: 50 });
  });

  it('centroY leva todos à média dos centros', () => {
    const m = (20 + 140 + 60) / 3;
    const r = alinhar(caixas, 'centroY');
    expect(r.a).toEqual({ x: 0, y: m - 20 });
    expect(r.b).toEqual({ x: 200, y: m - 40 });
    expect(r.c).toEqual({ x: 500, y: m - 10 });
  });

  it('distribuirX mantém extremos e iguala os intervalos entre centros', () => {
    // centros 50, 230, 600 -> o do meio vai para 325
    const r = alinhar(caixas, 'distribuirX');
    expect(r.a).toEqual({ x: 0, y: 0 });
    expect(r.c).toEqual({ x: 500, y: 50 });
    expect(r.b).toEqual({ x: 325 - 30, y: 100 });
  });

  it('distribuirY ordena por centro y', () => {
    // centros y: a 20, c 60, b 140 -> c (do meio) vai para 80 -> y = 70
    const r = alinhar(caixas, 'distribuirY');
    expect(r.a).toEqual({ x: 0, y: 0 });
    expect(r.b).toEqual({ x: 200, y: 100 });
    expect(r.c).toEqual({ x: 500, y: 70 });
  });

  it('menos de 2 caixas devolve a posição atual', () => {
    expect(alinhar([caixas[1]], 'esquerda')).toEqual({ b: { x: 200, y: 100 } });
    expect(alinhar([], 'topo')).toEqual({});
    expect(alinhar([caixas[1]], 'distribuirX')).toEqual({ b: { x: 200, y: 100 } });
  });
});

describe('posicaoDoProximo', () => {
  const base: Caixa = { id: 'b', x: 160, y: 144, largura: 190, altura: 72 };
  const novo = { largura: 100, altura: 40 };

  it('fica ao lado da base, na grade, com centros alinhados em y', () => {
    const p = posicaoDoProximo(base, novo, []);
    expect(p.x).toBe(416); // 160 + 190 + 64 = 414 -> grade
    expect(p.x % 16).toBe(0);
    expect(p.y % 16).toBe(0);
    expect(Math.abs(cy({ id: 'n', ...p, ...novo }) - cy(base))).toBeLessThanOrEqual(8);
  });

  it('desce quando o lugar está ocupado', () => {
    const livre = posicaoDoProximo(base, novo, []);
    const ocupada: Caixa = { id: 'o', ...livre, ...novo };
    expect(posicaoDoProximo(base, novo, [ocupada])).toEqual({ x: livre.x, y: livre.y + 96 });
  });

  it('para depois de 8 tentativas', () => {
    const livre = posicaoDoProximo(base, novo, []);
    const ocupadas: Caixa[] = [];
    for (let i = 0; i <= 12; i++) {
      ocupadas.push({ id: `o${i}`, x: livre.x, y: livre.y + i * 96, largura: 100, altura: 40 });
    }
    expect(posicaoDoProximo(base, novo, ocupadas)).toEqual({ x: livre.x, y: livre.y + 8 * 96 });
  });
});
