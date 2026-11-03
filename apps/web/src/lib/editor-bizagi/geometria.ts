import { GRADE } from '@/lib/desenho-bpmn';

/** x,y = canto superior esquerdo. Na coordenada lógica (sempre horizontal). */
export type Caixa = { id: string; x: number; y: number; largura: number; altura: number };
export type Orientacao = 'horizontal' | 'vertical';
export type ModoAlinhar = 'esquerda' | 'centroX' | 'topo' | 'centroY' | 'distribuirX' | 'distribuirY';

/** Lógico → tela. Vertical: o centro é transposto; o tamanho da forma não muda. */
export function paraTela(c: Caixa, o: Orientacao): Caixa {
  if (o === 'horizontal') return { ...c };
  const cx = c.x + c.largura / 2;
  const cy = c.y + c.altura / 2;
  return { ...c, x: cy - c.largura / 2, y: cx - c.altura / 2 };
}

/** Tela → lógico (inversa exata de `paraTela`; a transposição é uma involução). */
export function daTela(c: Caixa, o: Orientacao): Caixa {
  return paraTela(c, o);
}

/** Piscina, raia e fase: o retângulo inteiro é transposto (largura ↔ altura). */
export function retanguloParaTela(r: Caixa, o: Orientacao): Caixa {
  if (o === 'horizontal') return { ...r };
  return { ...r, x: r.y, y: r.x, largura: r.altura, altura: r.largura };
}

const naGrade = (v: number) => Math.round(v / GRADE) * GRADE;

/** Encaixa na grade e, se o centro de alguma outra estiver a ≤ tolerância, cola nele. */
export function encaixarComGuias(
  movendo: Caixa,
  outras: Caixa[],
  tolerancia = 6,
): { x: number; y: number; guias: Array<{ eixo: 'x' | 'y'; valor: number }> } {
  let x = naGrade(movendo.x);
  let y = naGrade(movendo.y);
  const guias: Array<{ eixo: 'x' | 'y'; valor: number }> = [];

  const centroX = x + movendo.largura / 2;
  const centroY = y + movendo.altura / 2;
  let melhorX: number | null = null;
  let melhorY: number | null = null;

  for (const o of outras) {
    const ox = o.x + o.largura / 2;
    const oy = o.y + o.altura / 2;
    if (Math.abs(ox - centroX) <= tolerancia && (melhorX === null || Math.abs(ox - centroX) < Math.abs(melhorX - centroX))) {
      melhorX = ox;
    }
    if (Math.abs(oy - centroY) <= tolerancia && (melhorY === null || Math.abs(oy - centroY) < Math.abs(melhorY - centroY))) {
      melhorY = oy;
    }
  }

  if (melhorX !== null) {
    x = melhorX - movendo.largura / 2;
    guias.push({ eixo: 'x', valor: melhorX });
  }
  if (melhorY !== null) {
    y = melhorY - movendo.altura / 2;
    guias.push({ eixo: 'y', valor: melhorY });
  }
  return { x, y, guias };
}

/** Opera em coordenadas de tela (o chamador converte). Devolve o canto superior esquerdo novo por id. */
export function alinhar(caixas: Caixa[], modo: ModoAlinhar): Record<string, { x: number; y: number }> {
  const saida: Record<string, { x: number; y: number }> = {};
  if (caixas.length < 2) {
    for (const c of caixas) saida[c.id] = { x: c.x, y: c.y };
    return saida;
  }

  const cx = (c: Caixa) => c.x + c.largura / 2;
  const cy = (c: Caixa) => c.y + c.altura / 2;

  switch (modo) {
    case 'esquerda': {
      const min = Math.min(...caixas.map((c) => c.x));
      for (const c of caixas) saida[c.id] = { x: min, y: c.y };
      break;
    }
    case 'topo': {
      const min = Math.min(...caixas.map((c) => c.y));
      for (const c of caixas) saida[c.id] = { x: c.x, y: min };
      break;
    }
    case 'centroX': {
      const media = caixas.reduce((s, c) => s + cx(c), 0) / caixas.length;
      for (const c of caixas) saida[c.id] = { x: media - c.largura / 2, y: c.y };
      break;
    }
    case 'centroY': {
      const media = caixas.reduce((s, c) => s + cy(c), 0) / caixas.length;
      for (const c of caixas) saida[c.id] = { x: c.x, y: media - c.altura / 2 };
      break;
    }
    case 'distribuirX': {
      const ordem = [...caixas].sort((a, b) => cx(a) - cx(b));
      const primeiro = cx(ordem[0]);
      const passo = (cx(ordem[ordem.length - 1]) - primeiro) / (ordem.length - 1);
      ordem.forEach((c, i) => {
        saida[c.id] = { x: primeiro + passo * i - c.largura / 2, y: c.y };
      });
      break;
    }
    case 'distribuirY': {
      const ordem = [...caixas].sort((a, b) => cy(a) - cy(b));
      const primeiro = cy(ordem[0]);
      const passo = (cy(ordem[ordem.length - 1]) - primeiro) / (ordem.length - 1);
      ordem.forEach((c, i) => {
        saida[c.id] = { x: c.x, y: primeiro + passo * i - c.altura / 2 };
      });
      break;
    }
  }
  return saida;
}

const FOLGA = 16;
const colide = (a: Omit<Caixa, 'id'>, b: Omit<Caixa, 'id'>) =>
  a.x < b.x + b.largura + FOLGA &&
  b.x < a.x + a.largura + FOLGA &&
  a.y < b.y + b.altura + FOLGA &&
  b.y < a.y + a.altura + FOLGA;

/** Lógico: à direita da base, centros alinhados em y; desce se colidir (até 8 vezes). */
export function posicaoDoProximo(
  base: Caixa,
  novo: { largura: number; altura: number },
  ocupadas: Caixa[],
): { x: number; y: number } {
  const x = naGrade(base.x + base.largura + 4 * GRADE);
  let y = naGrade(base.y + base.altura / 2 - novo.altura / 2);
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const candidato = { x, y, largura: novo.largura, altura: novo.altura };
    if (!ocupadas.some((o) => colide(candidato, o))) break;
    y += 6 * GRADE;
  }
  return { x, y };
}
