/* Onde desenhar um menu flutuante (FloatingMenu), em coordenadas da janela. Puro, para
   testar sem DOM. Embaixo do botão por padrão; `lado: 'esquerda'` é o submenu que abre ao
   lado do item (ex.: Tema no menu do usuário) — sem espaço à esquerda vai para a direita,
   e sem espaço dos dois lados (celular) cai embaixo do item, como um menu comum. */

const MARGEM = 8, FOLGA = 4

interface Caixa { left: number; top: number; right: number; bottom: number; width: number; height: number }

export function posicaoDoMenu({ ancora: r, menu, janela, align = 'start', lado = 'baixo' }: {
  ancora: Caixa
  menu: { largura: number; altura: number }
  janela: { largura: number; altura: number }
  align?: 'start' | 'center' | 'end'
  lado?: 'baixo' | 'esquerda'
}): { top: number; left: number } {
  const { largura: w, altura: h } = menu
  const { largura: vw, altura: vh } = janela
  const caberVertical = (top: number) => Math.max(MARGEM, Math.min(top, vh - h - MARGEM))

  if (lado === 'esquerda') {
    const esquerda = r.left - FOLGA - w
    if (esquerda >= MARGEM) return { top: caberVertical(r.top), left: esquerda }
    const direita = r.right + FOLGA
    if (direita + w <= vw - MARGEM) return { top: caberVertical(r.top), left: direita }
    // nenhum dos lados: segue como menu comum, embaixo e alinhado pelo início do item
  }

  let left = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left
  left = Math.max(MARGEM, Math.min(left, vw - w - MARGEM))
  let top = r.bottom + FOLGA
  // sem espaço embaixo e com espaço em cima: abre para cima
  if (top + h > vh - MARGEM && r.top - FOLGA - h >= MARGEM) top = r.top - FOLGA - h
  return { top: caberVertical(top), left }
}
