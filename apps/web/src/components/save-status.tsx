'use client'

import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'

/**
 * Selo de estado de salvamento — mostra, onde a pessoa trabalha, se há algo por salvar.
 * Some o "tenho que lembrar de salvar" / "será que salvou?": o estado fica sempre visível,
 * e o salvar tem resposta (o "Salvo" verde pisca por instantes via `justSaved`).
 *
 * Precedência: Salvando > Alterações não salvas > Salvo agora (verde) > Salvo (neutro).
 * O âmbar casa com o ponto da aba (workspace-bar); o verde é a esmeralda da marca.
 */
export function SaveStatus({ dirty, saving, justSaved, className }: {
  dirty: boolean; saving: boolean; justSaved?: boolean; className?: string
}) {
  const base = 'inline-flex items-center gap-1 text-[11px] font-medium select-none transition-colors'
  if (saving) return <span className={cn(base, 'text-muted-foreground', className)}><Loader2 className="h-3 w-3 animate-spin" />Salvando…</span>
  if (dirty)  return <span className={cn(base, 'text-amber-600 dark:text-amber-500', className)}><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Alterações não salvas</span>
  if (justSaved) return <span className={cn(base, 'text-emerald-600 dark:text-emerald-500', className)}><Check className="h-3 w-3" />Salvo</span>
  return <span className={cn(base, 'text-muted-foreground/50', className)}><Check className="h-3 w-3" />Salvo</span>
}
