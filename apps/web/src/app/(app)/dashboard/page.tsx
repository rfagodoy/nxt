'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  FileText, Users, GitBranch, Database, Loader2, AlertTriangle,
  Clock, Plus, ArrowRight, TrendingUp, TrendingDown,
  CalendarClock, PauseCircle, Sparkles, CheckCircle2,
} from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'

/* ─────────────────────────── tipos (espelham o DashboardService) ─────────── */
interface Summary {
  contracts: {
    total: number
    byStatus: Record<string, number>
    valorAtivos: number
    series: number[]
    deltaPct: number | null
    expiring: { id: string; numero: string; titulo: string; terminoVigencia: string; daysLeft: number }[]
  }
  partners:  { total: number; byStatus: Record<string, number>; series: number[]; deltaPct: number | null }
  processes: { total: number; active: number }
  instances: { running: number; stuck: { id: string; processName: string; currentStep: string; daysStuck: number }[] }
  records:   { total: number }
  activity:  { id: string; kind: 'partner' | 'contract'; title: string; detail: string; user: string | null; at: string }[]
  attentionCount: number
}

/* ─────────────────────────── helpers ─────────────────────────────────────── */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const NUM = new Intl.NumberFormat('pt-BR')

const INDIGO = 'hsl(243 75% 58%)'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/** Anima um número de 0 ao alvo com easing — dá vida sem distrair. */
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / duration)
      setVal(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

/* ─────────────────────────── micro-componentes ───────────────────────────── */
function Sparkline({ data, color = INDIGO }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ i, v }))
  const id = useMemo(() => `sp-${Math.random().toString(36).slice(2)}`, [])
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
          fill={`url(#${id})`} isAnimationActive dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
      up ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400',
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  const rounded = Math.round(v)
  return <>{format ? format(rounded) : NUM.format(rounded)}</>
}

/* ─────────────────────────── card base ───────────────────────────────────── */
function Tile({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-4 shadow-sm transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─────────────────────────── página ──────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(false)

  const firstName = useMemo(() => {
    const n = session?.user?.name || session?.user?.email?.split('@')[0] || ''
    return n ? n.split(' ')[0].replace(/^./, c => c.toUpperCase()) : ''
  }, [session])

  useEffect(() => {
    mounted.current = true
    void (async () => {
      try {
        const res = await apiFetch('/api/dashboard/summary')
        if (res.ok && mounted.current) setData(await res.json() as Summary)
      } catch { /* silencioso — UI mostra estado vazio */ }
      finally { if (mounted.current) setLoading(false) }
    })()
    return () => { mounted.current = false }
  }, [])

  if (loading) return <DashboardSkeleton />

  const c = data?.contracts
  const p = data?.partners
  const attention = (data?.contracts.expiring.length ?? 0) + (data?.instances.stuck.length ?? 0)

  return (
    <div className="space-y-3">
      {/* grid bento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

        {/* ── Hero ── */}
        <div className="relative overflow-hidden rounded-xl p-5 text-white shadow-sm sm:col-span-2
                        bg-gradient-to-br from-[hsl(240_26%_36%)] to-[hsl(258_22%_31%)]">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 right-16 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="text-[11px] font-medium uppercase tracking-widest text-white/70">{todayLabel()}</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              {greeting()}{firstName ? `, ${firstName}` : ''} 👋
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
              {attention > 0
                ? <><AlertTriangle className="h-3.5 w-3.5" />{attention} {attention === 1 ? 'item pede' : 'itens pedem'} sua atenção</>
                : <><Sparkles className="h-3.5 w-3.5" />Tudo em dia por aqui</>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => router.push('/modules/contratos/new')}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-white/90 transition-colors">
                <Plus className="h-3.5 w-3.5" />Novo contrato
              </button>
              <button onClick={() => router.push('/modules/parceiros/new')}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 transition-colors">
                <Plus className="h-3.5 w-3.5" />Novo parceiro
              </button>
            </div>
          </div>
        </div>

        {/* ── Contratos (destaque, com sparkline) ── */}
        <Tile className="sm:col-span-2 flex flex-col" onClick={() => router.push('/modules/contratos')}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Contratos</p>
                <p className="text-[11px] text-muted-foreground/70">
                  {c?.byStatus.ATIVO ?? 0} ativos · {BRL.format(c?.valorAtivos ?? 0)} em vigência
                </p>
              </div>
            </div>
            <Delta pct={c?.deltaPct ?? null} />
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-bold tabular-nums leading-none">
              <CountUp value={c?.total ?? 0} />
            </p>
            <div className="h-12 flex-1 max-w-[180px]">
              {c && <Sparkline data={c.series} />}
            </div>
          </div>
        </Tile>

        {/* ── tiles menores ── */}
        <MiniStat
          icon={<Users className="h-4 w-4" />} label="Parceiros"
          value={p?.total ?? 0} delta={p?.deltaPct ?? null} series={p?.series}
          onClick={() => router.push('/modules/parceiros')}
          sub={`${p?.byStatus.ATIVO ?? 0} ativos`}
        />
        <MiniStat
          icon={<GitBranch className="h-4 w-4" />} label="Processos ativos"
          value={data?.processes.active ?? 0}
          onClick={() => router.push('/processes')}
          sub={`de ${data?.processes.total ?? 0} no total`}
        />
        <MiniStat
          icon={<Database className="h-4 w-4" />} label="Registros"
          value={data?.records.total ?? 0}
          sub="gerados pelos módulos"
        />
        <MiniStat
          icon={<Loader2 className="h-4 w-4" />} label="Em execução"
          value={data?.instances.running ?? 0}
          sub={(data?.instances.stuck.length ?? 0) > 0 ? `${data?.instances.stuck.length} parada(s)` : 'fluxos rodando'}
          subWarn={(data?.instances.stuck.length ?? 0) > 0}
        />

        {/* ── Precisa da sua atenção ── */}
        <Tile className="sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-xs font-semibold">Precisa da sua atenção</h2>
            {attention > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                {attention}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {c?.expiring.map(e => (
              <AttentionRow key={e.id}
                icon={<CalendarClock className="h-3.5 w-3.5 text-amber-500" />}
                title={e.titulo || `Contrato ${e.numero}`}
                badge={e.daysLeft === 0 ? 'vence hoje' : `vence em ${e.daysLeft}d`}
                badgeWarn
                onClick={() => router.push('/modules/contratos')}
              />
            ))}
            {data?.instances.stuck.map(s => (
              <AttentionRow key={s.id}
                icon={<PauseCircle className="h-3.5 w-3.5 text-orange-500" />}
                title={s.processName}
                sub={`parada em "${s.currentStep}"`}
                badge={`há ${s.daysStuck}d`}
                onClick={() => router.push('/processes')}
              />
            ))}
            {attention === 0 && (
              <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500/80" />
                <p className="text-xs text-muted-foreground">Nenhuma pendência. Tudo em dia! 🎉</p>
              </div>
            )}
          </div>
        </Tile>

        {/* ── Atividade recente ── */}
        <Tile className="sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold">Atividade recente</h2>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {data && data.activity.length > 0 ? data.activity.map(a => (
              <div key={`${a.kind}-${a.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/50 transition-colors">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  a.kind === 'partner' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
                  {a.kind === 'partner' ? <Users className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    {a.user
                      ? <><span className="font-medium">{a.user}</span> <span className="text-muted-foreground">{a.detail}</span> </>
                      : <span className="text-muted-foreground">Novo contrato · </span>}
                    <span className="font-medium text-foreground">{a.title}</span>
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{relativeTime(a.at)}</span>
              </div>
            )) : (
              <div className="py-6 text-center text-xs text-muted-foreground">Sem atividade ainda.</div>
            )}
          </div>
        </Tile>
      </div>
    </div>
  )
}

/* ─────────────────────────── sub-componentes ─────────────────────────────── */
function MiniStat({ icon, label, value, sub, subWarn, delta, series, onClick }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; subWarn?: boolean
  delta?: number | null; series?: number[]; onClick?: () => void
}) {
  return (
    <Tile onClick={onClick} className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {delta !== undefined && <Delta pct={delta ?? null} />}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums leading-none"><CountUp value={value} /></p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {sub && <p className={cn('text-[10px]', subWarn ? 'text-orange-500 font-medium' : 'text-muted-foreground/70')}>{sub}</p>}
        </div>
        {series && <div className="h-7 w-16 shrink-0"><Sparkline data={series} /></div>}
      </div>
    </Tile>
  )
}

function AttentionRow({ icon, title, sub, badge, badgeWarn, onClick }: {
  icon: React.ReactNode; title: string; sub?: string; badge: string; badgeWarn?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/50 transition-colors">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{title}</p>
        {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
      </div>
      <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        badgeWarn ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
        {badge}
      </span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </button>
  )
}

/* ─────────────────────────── skeleton ────────────────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
      <div className="h-36 rounded-xl bg-muted/60 sm:col-span-2" />
      <div className="h-36 rounded-xl bg-muted/60 sm:col-span-2" />
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted/60" />)}
      <div className="h-44 rounded-xl bg-muted/60 sm:col-span-2" />
      <div className="h-44 rounded-xl bg-muted/60 sm:col-span-2" />
    </div>
  )
}
