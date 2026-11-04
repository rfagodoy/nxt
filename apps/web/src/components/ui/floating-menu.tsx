'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { posicaoDoMenu } from '@/lib/posicao-do-menu'

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
export function FloatingMenu({ anchor, onClose, align = 'start', lado = 'baixo', matchWidth, className, style, children, ...rest }: {
  anchor: React.RefObject<HTMLElement | null>
  onClose: () => void
  /** Borda do botão com que o menu se alinha. */
  align?: 'start' | 'center' | 'end'
  /** 'esquerda': submenu ao lado do item (ver `posicaoDoMenu`). */
  lado?: 'baixo' | 'esquerda'
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
    const { top, left } = posicaoDoMenu({
      ancora: r, menu: { largura: m.offsetWidth, altura: m.offsetHeight },
      janela: { largura: window.innerWidth, altura: window.innerHeight }, align, lado,
    })
    const width = Math.round(r.width)
    setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }))
  }, [anchor, align, lado])

  useLayoutEffect(() => { posicionar() }, [posicionar])

  /* O menu nasce INVISÍVEL até medir a posição — e o navegador não foca elemento
     invisível, então o `autoFocus` do React se perdia (a busca da lista abria sem
     cursor e o que se digitava ia para lugar nenhum). Foca ao aparecer: marque o campo
     com `data-autofocus`. */
  const visivel = !!pos
  useEffect(() => {
    if (!visivel) return
    const alvo = ref.current?.querySelector<HTMLElement>('[data-autofocus]')
    if (alvo && !ref.current?.contains(document.activeElement)) alvo.focus()
  }, [visivel])

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (ref.current?.contains(alvo) || anchor.current?.contains(alvo)) return
      /* lista de um seletor ABERTA DE DENTRO do menu (o Radix a desenha num portal, fora
         dele): escolher uma opção não é "clicar fora" */
      if ((alvo as Element).closest?.('[data-radix-popper-content-wrapper],[role="listbox"]')) return
      // menu ABERTO DE DENTRO deste (ex.: escolha de campo dentro do balão da condição)
      if ((alvo as Element).closest?.('[data-floating-menu]') && !ref.current?.contains(alvo)) return
      fechar.current()
    }
    /* Esc com uma lista (Select) aberta DENTRO do menu fecha só a lista. Captura: lê o DOM
       antes de a lista se desmontar. */
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[data-radix-popper-content-wrapper] [role="listbox"]')) return
      // menu aberto DE DENTRO deste (submenu): o Esc fecha só ele, o de cima
      const menus = document.querySelectorAll('[data-floating-menu]')
      if (menus.length && menus[menus.length - 1] !== ref.current) return
      fechar.current()
    }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('keydown', esc, true)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(posicionar) : null
    if (ro && ref.current) ro.observe(ref.current)
    return () => {
      window.removeEventListener('pointerdown', fora, true)
      window.removeEventListener('keydown', esc, true)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
      ro?.disconnect()
    }
  }, [posicionar, anchor])

  return createPortal(
    <div ref={ref} data-floating-menu {...rest} className={cn('fixed z-[80]', className)}
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
