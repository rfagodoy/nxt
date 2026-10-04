'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { CampoDisponivel } from '@/lib/flow-conditions'
import { FloatingMenu } from '@/components/ui/floating-menu'
import { cn } from '@/lib/utils'

const TIPO_LABEL: Record<CampoDisponivel['tipo'], string> = {
  texto: 'texto', numero: 'número', data: 'data', selecao: 'lista', booleano: 'sim/não',
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** origem dos campos NATIVOS (ver CAMPOS_NATIVOS_CONTRATO) — vai para o fim da lista */
const ORIGEM_NATIVA = 'Contrato'

/**
 * Escolha do campo de uma regra. Um seletor simples não dava conta: a lista passava do fim
 * da tela (os campos da TELA, que vinham por último, sumiam — achado do PO, 04/10/2026) e não
 * havia como procurar. Aqui: busca, os campos da tela da atividade PRIMEIRO, os dados do
 * contrato depois, lista rolável e o tipo de cada campo à direita.
 */
export function CampoPicker({ campos, value, onChange, ariaLabel }: {
  campos: CampoDisponivel[]
  value: string
  onChange: (key: string) => void
  ariaLabel: string
}) {
  const ancora = useRef<HTMLButtonElement>(null)
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = campos.find((c) => c.key === value)

  const grupos = useMemo(() => {
    const q = semAcento(busca.trim())
    const m = new Map<string, CampoDisponivel[]>()
    for (const c of campos) {
      if (q && !semAcento(`${c.label} ${c.origem}`).includes(q)) continue
      m.set(c.origem, [...(m.get(c.origem) ?? []), c])
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === ORIGEM_NATIVA ? 1 : 0) - (b === ORIGEM_NATIVA ? 1 : 0))
      .map(([origem, itens]) => ({ titulo: origem === ORIGEM_NATIVA ? 'Dados do contrato' : `Campos da tela “${origem}”`, itens }))
  }, [campos, busca])
  const primeiro = grupos[0]?.itens[0]

  const escolher = (key: string) => { onChange(key); setAberto(false); setBusca('') }

  return (
    <>
      <button ref={ancora} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={cn('flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-xs shadow-sm',
          'hover:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring', aberto && 'ring-1 ring-ring')}>
        <span className={cn('truncate', !sel && 'text-muted-foreground')}>{sel ? sel.label : 'Escolha o campo…'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {aberto && (
        <FloatingMenu anchor={ancora} onClose={() => { setAberto(false); setBusca('') }} matchWidth
          className="w-[380px] max-w-[92vw] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar campo…" aria-label="Buscar campo"
              onKeyDown={(e) => { if (e.key === 'Enter' && primeiro) { e.preventDefault(); escolher(primeiro.key) } }}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div role="listbox" aria-label="Campos" className="max-h-[min(340px,50vh)] overflow-y-auto py-1">
            {grupos.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum campo com “{busca}”.</p>
            ) : grupos.map((g) => (
              <div key={g.titulo}>
                <p className="sticky top-0 z-10 bg-card/95 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">{g.titulo}</p>
                {g.itens.map((c) => (
                  <button key={c.key} type="button" role="option" aria-selected={c.key === value} onClick={() => escolher(c.key)}
                    className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent', c.key === value && 'bg-primary/5')}>
                    <Check className={cn('h-3.5 w-3.5 shrink-0 text-primary', c.key === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 truncate font-medium" title={c.label}>{c.label}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{TIPO_LABEL[c.tipo]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </FloatingMenu>
      )}
    </>
  )
}
