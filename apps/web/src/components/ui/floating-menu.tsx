'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Menu flutuante ancorado num botão e desenhado no <body>.
 *
 * Por que existe: um menu `absolute` fica PRESO à caixa rolável (ou com zoom) em que o
 * botão mora — perto da borda, ele sai cortado, e o que está cortado não se escolhe.
 * Desenhado no body com posição fixa, ele só respeita a janela: abre embaixo do botão,
 * sobe quando não cabe embaixo e escorrega para dentro nas laterais.
 *
 * Fecha em clique fora (o botão âncora não conta — ele mesmo alterna), Esc e reposiciona
 * ao rolar ou redimensionar.
 */
export function FloatingMenu({ anchor, onClose, align = 'start', matchWidth, className, style, children, ...rest }: {
  anchor: React.RefObject<HTMLElement | null>
  onClose: () => void
  /** Borda do botão com que o menu se alinha. */
  align?: 'start' | 'center' | 'end'
  /** Lista de um campo (combo): no mínimo a largura do próprio campo. */
  matchWidth?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const fechar = useRef(onClose)
  fechar.current = onClose

  const posicionar = useCallback(() => {
    const a = anchor.current, m = ref.current
    if (!a || !m) return
    const r = a.getBoundingClientRect()
    const w = m.offsetWidth, h = m.offsetHeight
    const MARGEM = 8, FOLGA = 4
    const vw = window.innerWidth, vh = window.innerHeight
    let left = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left
    left = Math.max(MARGEM, Math.min(left, vw - w - MARGEM))
    let top = r.bottom + FOLGA
    // sem espaço embaixo e com espaço em cima: abre para cima
    if (top + h > vh - MARGEM && r.top - FOLGA - h >= MARGEM) top = r.top - FOLGA - h
    top = Math.max(MARGEM, Math.min(top, vh - h - MARGEM))
    const width = Math.round(r.width)
    setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }))
  }, [anchor, align])

  useLayoutEffect(() => { posicionar() }, [posicionar])

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (ref.current?.contains(alvo) || anchor.current?.contains(alvo)) return
      fechar.current()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar.current() }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(posicionar) : null
    if (ro && ref.current) ro.observe(ref.current)
    return () => {
      window.removeEventListener('pointerdown', fora, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
      ro?.disconnect()
    }
  }, [posicionar, anchor])

  return createPortal(
    <div ref={ref} {...rest} className={cn('fixed z-[80]', className)}
      style={{
        ...style,
        top: pos?.top ?? 0, left: pos?.left ?? 0,
        ...(matchWidth && pos ? { minWidth: pos.width } : {}),
        visibility: pos ? 'visible' : 'hidden',
      }}>
      {children}
    </div>,
    document.body,
  )
}
