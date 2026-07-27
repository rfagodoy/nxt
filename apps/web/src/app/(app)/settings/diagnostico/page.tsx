'use client'

/* Diagnóstico da instalação.
 *
 * Existe para o suporte remoto: numa instalação on-premise ninguém do nosso lado tem
 * acesso à máquina, e "o sistema está estranho" não é diagnóstico. Aqui o cliente abre
 * uma tela, tira um print e a conversa começa do problema, não da adivinhação.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Loader2, Copy, Check } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'

type Estado = 'ok' | 'atencao' | 'falha'
type Item = { item: string; estado: Estado; detalhe: string; acao?: string }
type Diagnostico = {
  estado: Estado
  versao: string
  ambiente: string
  node: string
  noArDesde: string
  uptimeSegundos: number
  itens: Item[]
}

const ICONE: Record<Estado, typeof CheckCircle2> = { ok: CheckCircle2, atencao: AlertTriangle, falha: XCircle }
const COR: Record<Estado, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  atencao: 'text-amber-600 dark:text-amber-400',
  falha: 'text-red-600 dark:text-red-400',
}
const FAIXA: Record<Estado, string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  atencao: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  falha: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
}
const RESUMO: Record<Estado, string> = {
  ok: 'Tudo funcionando.',
  atencao: 'Funcionando, com pontos de atenção.',
  falha: 'Há falha que precisa de ação.',
}

const duracao = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

export default function DiagnosticoPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [dados, setDados] = useState<Diagnostico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setDados(await apiJson<Diagnostico>('/api/health/diagnostico').catch(() => null))
    setCarregando(false)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  /* Copiar como texto: é o que vai colado no chamado. Sem isto, o suporte recebe um
     print cortado e pede o resto por partes. */
  const copiar = async () => {
    if (!dados) return
    const linhas = [
      `Nxt ${dados.versao} · ${dados.ambiente} · Node ${dados.node}`,
      `No ar há ${duracao(dados.uptimeSegundos)} (desde ${new Date(dados.noArDesde).toLocaleString('pt-BR')})`,
      `Estado geral: ${dados.estado.toUpperCase()}`,
      '',
      ...dados.itens.map((i) => `[${i.estado.toUpperCase()}] ${i.item}: ${i.detalhe}${i.acao ? ` → ${i.acao}` : ''}`),
    ]
    await navigator.clipboard.writeText(linhas.join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (!isAdmin) return <p className="text-xs text-muted-foreground">Somente administradores podem ver o diagnóstico.</p>

  if (carregando && !dados) {
    return <div className="flex items-center justify-center py-16 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Verificando…</div>
  }

  if (!dados) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        Não foi possível obter o diagnóstico. Se a tela carregou mas isto falhou, a API está fora do ar.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Diagnóstico</h1>
          <p className="text-[11px] text-muted-foreground">
            Nxt {dados.versao} · {dados.ambiente} · Node {dados.node} · no ar há {duracao(dados.uptimeSegundos)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copiar}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors">
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar para o chamado'}
          </button>
          <button type="button" onClick={carregar} disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-60">
            <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} />Verificar de novo
          </button>
        </div>
      </div>

      <div className={cn('rounded-xl border px-3 py-2 flex items-center gap-2 text-[12px]', FAIXA[dados.estado])}>
        {(() => { const I = ICONE[dados.estado]; return <I className="h-4 w-4 shrink-0" /> })()}
        <span>{RESUMO[dados.estado]}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 flex-1 min-h-0 overflow-y-auto content-start">
        {dados.itens.map((i) => {
          const I = ICONE[i.estado]
          return (
            <section key={i.item} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <I className={cn('h-4 w-4 shrink-0 mt-0.5', COR[i.estado])} />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold">{i.item}</p>
                  <p className="text-[11px] text-muted-foreground">{i.detalhe}</p>
                  {i.acao && <p className="text-[11px] font-medium">{i.acao}</p>}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
