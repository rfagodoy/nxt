/* Cores do TEMA para quem não lê CSS: o canvas da exportação e janelas HTML montadas à mão.
   As variáveis do tema vêm em três formas — trinca RGB (escalas: "12 20 16"), trinca HSL
   (tokens do shadcn: "154 76% 35%") ou cor pronta (#hex, rgb()) — e aqui viram cor usável. */

/** Valor de uma variável CSS → cor (rgb()/hsl()/hex). */
export function paraCor(valor: string, reserva = '#000000'): string {
  const v = valor.trim()
  if (!v) return reserva
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(v)) return `hsl(${v})`
  if (/^\d+\s+\d+\s+\d+$/.test(v)) return `rgb(${v})`
  return v
}

/** A mesma cor com transparência (para preenchimentos suaves). */
export function comAlfa(cor: string, alfa: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(cor)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alfa})`
  }
  const fn = /^(rgb|hsl)\((.*)\)$/.exec(cor)
  return fn ? `${fn[1]}(${fn[2]} / ${alfa})` : cor
}

/** Cor atual de uma variável do tema (no navegador; fora dele, a reserva). */
export function corDoTema(nome: string, reserva: string): string {
  if (typeof document === 'undefined') return reserva
  return paraCor(getComputedStyle(document.documentElement).getPropertyValue(nome), reserva)
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase()

/** Qualquer cor que `paraCor` devolve → #RRGGBB (o Excel só aceita hex). */
export function paraHex(cor: string, reserva = '#000000'): string {
  const c = cor.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(c)
  if (hex) return `#${hex[1].toUpperCase()}`
  const rgb = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c)
  if (rgb) return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}`
  const hsl = /^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(c)
  if (hsl) {
    const h = +hsl[1], s = +hsl[2] / 100, l = +hsl[3] / 100
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`
  }
  return reserva
}

/** Mistura dois hex (t = quanto de `b`): fundos suaves a partir da cor do tema. */
export function misturarHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(paraHex(a)), p(paraHex(b))]
  return `#${x.map((v, i) => hex2(v * (1 - t) + y[i] * t)).join('')}`
}
