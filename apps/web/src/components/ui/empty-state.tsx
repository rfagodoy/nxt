import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Estado vazio PADRÃO do sistema: ícone discreto + título + subtítulo muted + ação opcional.
 *  Fonte única — evita que cada tela reinvente (com bloco gradiente, emojis demais, etc.). */
export function EmptyState({ icon: Icon, title, description, tone = 'muted', size = 'md', action, className }: {
  icon: LucideIcon
  title: string
  description?: string
  /** 'muted' = neutro; 'success' = tom emerald (ex.: caixa zerada / sem erros). */
  tone?: 'muted' | 'success'
  size?: 'sm' | 'md' | 'lg'
  action?: React.ReactNode
  className?: string
}) {
  const iconCls = size === 'sm' ? 'h-8 w-8 mb-2' : size === 'lg' ? 'h-11 w-11 mb-3' : 'h-10 w-10 mb-3'
  const padCls = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-16' : 'py-12'
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6', padCls, className)}>
      <Icon className={cn(iconCls, tone === 'success' ? 'text-emerald-500/70' : 'text-muted-foreground/40')} />
      <h3 className={cn('font-semibold tracking-tight', size === 'sm' ? 'text-sm' : 'text-base')}>{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
