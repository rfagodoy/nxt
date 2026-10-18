'use client'

/* Filtro NA COLUNA (padrão planilha, PO 18/10/2026): uma linha de campos sob o cabeçalho,
   ligada/desligada por um botão. "Contém" sobre o que a célula MOSTRA e sempre somado
   em E aos Filtros avançados. O liga/desliga é preferência PESSOAL (`nxt:me:`). */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'

export interface FiltroColunaAtivo { col: string; value: string }

/** Estado do filtro na coluna de uma lista. `ativos` já vem com espera (300ms), pronto
 *  para ir ao servidor ou para filtrar no navegador. */
export function useFiltroColuna(lista: string) {
  const chave = `nxt:me:lista:filtro-coluna:${lista}`
  const [ligado, setLigado] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [comEspera, setComEspera] = useState<Record<string, string>>({})
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setLigado(cacheRead<boolean>(chave, false))
    void pullSetting<boolean>(chave).then((v) => { if (typeof v === 'boolean') setLigado(v) })
  }, [chave])

  const alternar = () => {
    const v = !ligado
    setLigado(v)
    pushSetting(chave, v)
    // desligar a linha também solta o recorte — filtro escondido confunde
    if (!v) { setValores({}); setComEspera({}) }
  }

  const mudar = (col: string, value: string) => {
    const next = { ...valores, [col]: value }
    setValores(next)
    clearTimeout(espera.current)
    espera.current = setTimeout(() => setComEspera(next), 300)
  }

  const ativos = useMemo<FiltroColunaAtivo[]>(
    () => Object.entries(comEspera).filter(([, v]) => v.trim()).map(([col, value]) => ({ col, value })),
    [comEspera],
  )

  return { ligado, alternar, valores, mudar, ativos }
}

/** Botão da barra de ferramentas que liga/desliga a linha de filtros. */
export function BotaoFiltroColuna({ ligado, onClick }: { ligado: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ligado}
      title="Mostrar uma linha de filtro embaixo do título de cada coluna"
      className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors',
        ligado ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
      <Filter className="h-3.5 w-3.5" />Filtro na coluna{ligado && <span className="text-[10px] font-semibold">· ligado</span>}
    </button>
  )
}

/** Linha de campos sob o cabeçalho. `sobra` = colunas sem filtro no fim (ex.: Ações). */
export function LinhaFiltroColuna({ colunas, valores, onChange, primeiraFixa, sobra = 0 }: {
  colunas: { key: string; label: string }[]
  valores: Record<string, string>
  onChange: (col: string, value: string) => void
  primeiraFixa?: boolean
  sobra?: number
}) {
  return (
    <tr className="border-b">
      {colunas.map((col, idx) => (
        <th key={col.key} className={cn('bg-muted px-[var(--lista-px)] pb-1.5 pt-0 font-normal', primeiraFixa && idx === 0 && 'sticky left-0 z-20')}>
          <input value={valores[col.key] ?? ''} onChange={(e) => onChange(col.key, e.target.value)}
            aria-label={`Filtrar ${col.label}`} placeholder="contém…"
            className="h-6 w-full min-w-[80px] rounded border border-input bg-background px-1.5 text-[11px] font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </th>
      ))}
      {Array.from({ length: sobra }, (_, i) => <th key={`sobra${i}`} className="bg-muted" />)}
    </tr>
  )
}
