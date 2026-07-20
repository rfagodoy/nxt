'use client'

import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500]

/** janela de páginas com reticências (1 … 4 5 6 … 20). */
export function pageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

/** Rodapé de paginação PADRÃO (linhas por página · N–M de T · navegação). Fonte única. */
export function TablePagination({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = PAGE_SIZE_OPTIONS }: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (s: number) => void
  pageSizeOptions?: number[]
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const first = (safePage - 1) * pageSize + 1
  const last = Math.min(safePage * pageSize, total)
  const navBtn = 'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
  return (
    <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Linhas por página:</span>
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-6 rounded border border-input bg-background px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {pageSizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-[11px] text-muted-foreground">{total === 0 ? '0' : `${first}–${last}`} de {total}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <button onClick={() => onPage(1)} disabled={safePage === 1} className={navBtn}><ChevronsLeft className="h-3.5 w-3.5" /></button>
        <button onClick={() => onPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className={navBtn}><ChevronLeft className="h-3.5 w-3.5" /></button>
        {pageWindow(safePage, totalPages).map((p, i) =>
          p === '...' ? <span key={`e${i}`} className="flex h-6 w-6 items-center justify-center text-[11px] text-muted-foreground">…</span>
          : <button key={p} onClick={() => onPage(p)} className={cn('flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium transition-colors', safePage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{p}</button>
        )}
        <button onClick={() => onPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} className={navBtn}><ChevronRight className="h-3.5 w-3.5" /></button>
        <button onClick={() => onPage(totalPages)} disabled={safePage === totalPages} className={navBtn}><ChevronsRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
