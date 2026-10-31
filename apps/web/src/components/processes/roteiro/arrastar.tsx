'use client'

/* ─── Roteiro: arrastar itens na lista (spec §3) ──────────────────────────────
   Pointer Events, sem biblioteca. Cada item da lista é um alvo marcado com
   `data-alvo-ref` / `data-alvo-indice` (onde ele mora); passar na metade de cima solta
   ANTES dele, na de baixo, DEPOIS. O "+ etapa neste caminho" (data-alvo-fim) é o fim da
   lista. A linha fica verde onde o motor aceita e vermelha, com o motivo, onde não. */
import { useCallback, useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Destino = { ref: string; indice: number }
export type Avaliacao = { ok: true } | { ok: false; motivo: string }

interface Arrasto { id: string; destino: Destino | null; avaliacao: Avaliacao | null; linha: { top: number; left: number; width: number } | null }

function destinoSob(x: number, y: number): { destino: Destino; el: HTMLElement; depois: boolean } | null {
  const el = (document.elementFromPoint(x, y) as Element | null)?.closest<HTMLElement>('[data-alvo-ref]')
  if (!el) return null
  const ref = el.dataset.alvoRef!, indice = Number(el.dataset.alvoIndice)
  if (el.hasAttribute('data-alvo-fim')) return { destino: { ref, indice }, el, depois: false }
  const r = el.getBoundingClientRect()
  const depois = y > r.top + r.height / 2
  return { destino: { ref, indice: depois ? indice + 1 : indice }, el, depois }
}

export function useArrastar({ lista, avaliar, mover }: {
  lista: RefObject<HTMLElement | null>
  avaliar: (id: string, destino: Destino) => Avaliacao
  mover: (id: string, destino: Destino) => void
}) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const atual = useRef<Arrasto | null>(null)
  atual.current = arrasto

  const iniciar = useCallback((id: string) => setArrasto({ id, destino: null, avaliacao: null, linha: null }), [])

  useEffect(() => {
    if (!arrasto) return
    const mexeu = (e: PointerEvent) => {
      const a = atual.current, box = lista.current
      if (!a || !box) return
      const sob = destinoSob(e.clientX, e.clientY)
      if (!sob) { setArrasto({ ...a, destino: null, avaliacao: null, linha: null }); return }
      const r = sob.el.getBoundingClientRect(), b = box.getBoundingClientRect()
      const top = (sob.depois ? r.bottom : r.top) - b.top + box.scrollTop
      setArrasto({ ...a, destino: sob.destino, avaliacao: avaliar(a.id, sob.destino), linha: { top, left: r.left - b.left, width: r.width } })
    }
    const soltou = () => {
      const a = atual.current
      setArrasto(null)
      if (a?.destino && a.avaliacao?.ok) mover(a.id, a.destino)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setArrasto(null) }
    const antes = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', mexeu)
    window.addEventListener('pointerup', soltou)
    window.addEventListener('keydown', tecla)
    return () => {
      document.body.style.userSelect = antes
      window.removeEventListener('pointermove', mexeu)
      window.removeEventListener('pointerup', soltou)
      window.removeEventListener('keydown', tecla)
    }
  }, [arrasto !== null]) // eslint-disable-line react-hooks/exhaustive-deps -- liga ao começar e desliga ao terminar; o resto vem de `atual`

  return { arrasto, iniciar }
}

/** Alça ⋮⋮ de uma linha. */
export function Alca({ rotulo, onIniciar }: { rotulo: string; onIniciar: () => void }): JSX.Element {
  return (
    <span role="button" tabIndex={-1} aria-label={`Arrastar ${rotulo}`} title="Arrastar para mudar de lugar"
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); onIniciar() }}
      className="mt-0.5 flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing">
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  )
}

/** A linha onde o item vai cair: verde (aceita) ou vermelha com o motivo. */
export function LinhaDeSoltar({ arrasto }: { arrasto: Arrasto | null }): JSX.Element | null {
  if (!arrasto?.linha || !arrasto.avaliacao) return null
  const ok = arrasto.avaliacao.ok
  return (
    <div className="pointer-events-none absolute z-20" style={{ top: arrasto.linha.top - 1, left: arrasto.linha.left, width: arrasto.linha.width }}>
      <div className={cn('h-[3px] rounded-full', ok ? 'bg-primary' : 'bg-destructive')} />
      {!arrasto.avaliacao.ok && (
        <p className="mt-1 max-w-[440px] rounded-md bg-destructive px-2 py-1 text-[11.5px] font-medium leading-snug text-destructive-foreground shadow">
          {arrasto.avaliacao.motivo}
        </p>
      )}
    </div>
  )
}
