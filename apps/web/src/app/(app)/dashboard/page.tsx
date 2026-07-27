'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import {
  FileText, Users, Loader2, Plus, Sparkles, ListChecks,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { dueInfo, DUE_CHIP, valorCurto, type Task } from '@/lib/tasks-ui'
import { useWorkspace } from '@/contexts/workspace-context'
import { StartProcessButton } from '@/components/processes/start-process-button'

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
  instances: {
    running: number
    stuck: { id: string; processName: string; currentStep: string; daysStuck: number }[]
    total: number
    emAndamentoNoPrazo: number
    emAndamentoAtrasadas: number
    concluidas: number
    canceladas: number
    comErro: number
  }
  activity:  { id: string; kind: 'partner' | 'contract'; title: string; detail: string; user: string | null; at: string }[]
  attentionCount: number
}

/* ─────────────────────────── helpers ─────────────────────────────────────── */
const NUM = new Intl.NumberFormat('pt-BR')


function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
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
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  const rounded = Math.round(v)
  return <>{format ? format(rounded) : NUM.format(rounded)}</>
}

/* ─────────────────────────── card base ───────────────────────────────────── */
function Tile({ className, children, onClick, highlight }: { className?: string; children: React.ReactNode; onClick?: () => void; highlight?: boolean }) {
  // Realce de hover (liquid glass) desacoplado do clique: aplica-se aos cards de
  // estatística (highlight) e aos navegáveis (onClick); o cursor-pointer só nos que navegam.
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-4 shadow-sm transition-all duration-200',
        (onClick || highlight) && 'hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30',
        onClick && 'cursor-pointer',
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
  const ws = useWorkspace()
  const { data: session } = useSession()
  const [data, setData] = useState<Summary | null>(null)
  const [minhasTarefas, setMinhasTarefas] = useState<Task[]>([])
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
        /* As DUAS perguntas de quem abre o sistema, lado a lado: "como está a
           carteira?" (resumo) e "o que preciso fazer?" (tarefas). A segunda vinha
           sendo respondida só uma tela adiante. */
        const [res, tarefas] = await Promise.all([
          apiFetch('/api/dashboard/summary'),
          apiJson<Task[]>('/api/instances/tasks').catch(() => []),
        ])
        if (res.ok && mounted.current) setData(await res.json() as Summary)
        if (mounted.current) setMinhasTarefas(tarefas ?? [])
      } catch { /* silencioso — UI mostra estado vazio */ }
      finally { if (mounted.current) setLoading(false) }
    })()
    return () => { mounted.current = false }
  }, [])

  /* Urgentes primeiro. O teto é generoso porque o painel agora ESTICA e rola por
     dentro: numa tela grande cabem doze sem empurrar nada. Ainda existe teto — o
     board é que responde "o que eu tenho?", com agrupamento por prazo e filtros; o
     dashboard responde "o que é mais urgente agora?" e não deve virar a segunda
     tela de tarefas. */
  const tarefasUrgentes = [...minhasTarefas]
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))
    .slice(0, 12)

  if (loading) return <DashboardSkeleton />

  const c = data?.contracts
  const p = data?.partners

  return (
    /* Três faixas: hero (fina) e duas ELÁSTICAS — "Seu trabalho" e a composição da
       carteira — repartindo a altura em ~55/45.
       Não é 50/50 exato de propósito: o painel de trabalho tem conteúdo VARIÁVEL (mais
       altura = mais tarefas visíveis), enquanto o card de composição tem conteúdo FIXO
       (um gráfico e sua legenda). Metade rígida para conteúdo fixo não mostraria mais
       nada — só criaria vazio DENTRO do card, que é pior que vazio no rodapé porque
       fica disfarçado. Abaixo de lg tudo volta a fluir e rolar normalmente. */
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:h-full lg:min-h-[520px] lg:[grid-template-rows:auto_minmax(0,1.15fr)_minmax(0,1fr)]">

      {/* ── Hero ──
          Faixa fina de largura total. Ele entrega saudação e três atalhos; ocupar
          metade da primeira dobra para isso era espaço tirado do único bloco
          ACIONÁVEL da tela. */}
        <div className="relative overflow-hidden rounded-xl px-5 py-3.5 text-white shadow-sm lg:col-span-4
                        bg-gradient-to-r from-[hsl(156_42%_11%)] to-[hsl(150_44%_6%)]">
          <div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-white/60">{todayLabel()}</p>
              <h1 className="text-base font-semibold tracking-tight leading-tight">
                {greeting()}{firstName ? `, ${firstName}` : ''} 👋
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => ws.open({ id: 'contract:new', kind: 'contract', mode: 'new', label: 'Novo contrato' })}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-white/90 transition-colors">
                <Plus className="h-3.5 w-3.5" />Novo contrato
              </button>
              <button onClick={() => ws.open({ id: 'partner:new', kind: 'partner', mode: 'new', label: 'Novo parceiro' })}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 transition-colors">
                <Plus className="h-3.5 w-3.5" />Novo parceiro
              </button>
              <StartProcessButton variant="hero" />
            </div>
          </div>
        </div>

        {/* ── Seu trabalho ──
            Vem antes da carteira de propósito: quem abre o sistema de manhã pergunta
            "o que preciso fazer hoje?", não "como está a carteira?". A resposta existia,
            mas só uma tela adiante — e esta é a única tela que todo usuário vê todo dia. */}
        <div className="rounded-xl border bg-card p-4 shadow-sm sm:col-span-2 lg:col-span-4 flex flex-col gap-2.5 lg:min-h-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold tracking-tight">Seu trabalho</p>
              <p className="text-[11px] text-muted-foreground">
                {minhasTarefas.length === 0 ? 'Nenhuma tarefa aguardando você' : `${minhasTarefas.length} tarefa${minhasTarefas.length > 1 ? 's' : ''} na sua caixa`}
              </p>
            </div>
            {minhasTarefas.length > 0 && (
              <button onClick={() => router.push('/tarefas')}
                className="text-[11px] font-medium text-primary hover:underline shrink-0">ver todas</button>
            )}
          </div>

          {tarefasUrgentes.length === 0 ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />Tudo em dia por aqui.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2 lg:flex-1 lg:min-h-0 lg:content-start lg:overflow-y-auto">
              {tarefasUrgentes.map((t) => {
                const info = dueInfo(t.dueAt)
                const valor = valorCurto(t.assunto?.valor, t.assunto?.moeda)
                return (
                  <button key={t.id} onClick={() => ws.open({ id: `task:${t.id}`, kind: 'task', mode: 'detail', label: t.name || t.nodeId, data: t })}
                    className="group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/50">
                    <span className={cn('h-6 w-[3px] rounded-full shrink-0', info.grp === 'crit' ? 'bg-red-500' : info.grp === 'warn' ? 'bg-amber-500' : 'bg-muted-foreground/30')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{t.name || t.nodeId}</span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        {t.assunto?.contraparte ?? t.instance?.processDefinition?.name ?? 'Processo'}
                        {valor && <span className="ml-1.5 font-semibold text-foreground/70 tabular-nums">{valor}</span>}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', DUE_CHIP[info.grp])}>{info.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Composição da carteira ──
            Três cards de mesmo peso, abaixo de "Seu trabalho" e visivelmente menores:
            eles respondem "como está a carteira?", que é pergunta de acompanhamento,
            não de ação. Cada um mostra o TOTAL grande e a composição em rosca — o
            número sozinho não diz se 128 contratos são saúde ou problema. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:col-span-2 lg:col-span-4 lg:min-h-0">
          <Composicao
            icon={<FileText className="h-4 w-4" />}
            label="Contratos"
            total={c?.total ?? 0}
            onClick={() => router.push('/modules/contratos')}
            fatias={[
              { nome: 'Vigentes',    valor: c?.byStatus.VIGENTE ?? 0,     cor: 'hsl(154 70% 40%)' },
              { nome: 'Vencidos',    valor: c?.byStatus.VENCIDO ?? 0,     cor: 'hsl(38 92% 50%)'  },
              { nome: 'Em cadastro', valor: c?.byStatus.EM_CADASTRO ?? 0, cor: 'hsl(210 90% 55%)' },
              { nome: 'Encerrados',  valor: c?.byStatus.ENCERRADO ?? 0,   cor: 'hsl(215 15% 55%)' },
              { nome: 'Rescindidos', valor: c?.byStatus.RESCINDIDO ?? 0,  cor: 'hsl(0 72% 55%)'   },
              { nome: 'Cancelados',  valor: c?.byStatus.CANCELADO ?? 0,   cor: 'hsl(215 12% 40%)' },
            ]}
          />
          <Composicao
            icon={<Users className="h-4 w-4" />}
            label="Parceiros"
            total={p?.total ?? 0}
            onClick={() => router.push('/modules/parceiros')}
            fatias={[
              { nome: 'Ativos',        valor: p?.byStatus.ATIVO ?? 0,             cor: 'hsl(154 70% 40%)' },
              { nome: 'Em cadastro',   valor: p?.byStatus.EM_CADASTRAMENTO ?? 0,  cor: 'hsl(210 90% 55%)' },
              { nome: 'Inativos',      valor: p?.byStatus.INATIVO ?? 0,           cor: 'hsl(215 15% 55%)' },
            ]}
          />
          <Composicao
            icon={<Loader2 className="h-4 w-4" />}
            label="Processos"
            total={data?.instances.total ?? 0}
            onClick={() => router.push('/processos')}
            fatias={[
              { nome: 'Em dia',     valor: data?.instances.emAndamentoNoPrazo ?? 0,   cor: 'hsl(154 70% 40%)' },
              { nome: 'Atrasados',  valor: data?.instances.emAndamentoAtrasadas ?? 0, cor: 'hsl(0 72% 55%)'   },
              { nome: 'Concluídos', valor: data?.instances.concluidas ?? 0,           cor: 'hsl(215 15% 55%)' },
              { nome: 'Com erro',   valor: data?.instances.comErro ?? 0,              cor: 'hsl(24 90% 50%)'  },
              { nome: 'Cancelados', valor: data?.instances.canceladas ?? 0,           cor: 'hsl(215 12% 40%)' },
            ]}
          />
        </div>

    </div>
  )
}


/* ─────────────────────────── sub-componentes ─────────────────────────────── */

interface Fatia { nome: string; valor: number; cor: string }

/** Card de composição: o total em número grande e a repartição em rosca.
 *
 *  Rosca (e não barra ou pizza cheia) por dois motivos: o buraco do meio abriga o
 *  total, então o número e a composição ocupam o mesmo espaço; e a leitura aqui é
 *  "quanto de cada", não "qual é maior" — comparação fina fica na tela do módulo.
 *
 *  Fatia zerada é OMITIDA do gráfico e da legenda: uma situação sem nenhum registro
 *  não é informação, é ruído — e com seis situações possíveis a legenda ficaria mais
 *  alta que o próprio gráfico. */
function Composicao({ icon, label, total, fatias, onClick }: {
  icon: React.ReactNode; label: string; total: number; fatias: Fatia[]; onClick?: () => void
}) {
  const visiveis = fatias.filter((f) => f.valor > 0)
  const soma = visiveis.reduce((acc, f) => acc + f.valor, 0)

  return (
    <Tile onClick={onClick} highlight className="flex flex-col gap-2 lg:min-h-0">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      {soma === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center">
          <p className="text-3xl font-bold leading-none tabular-nums text-muted-foreground/40">0</p>
          <p className="text-[11px] text-muted-foreground">Nenhum registro ainda.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 lg:min-h-0">
          {/* O gráfico ocupa a altura livre do card e ESCALA com ela: raios em % em vez
              de pixels, senão o card cresce e o donut fica pequeno no meio do vazio. */}
          <div className="relative min-h-[104px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visiveis} dataKey="valor" nameKey="nome"
                  innerRadius="58%" outerRadius="88%" paddingAngle={visiveis.length > 1 ? 2 : 0}
                  stroke="none" isAnimationActive
                >
                  {visiveis.map((f) => <Cell key={f.nome} fill={f.cor} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* total no miolo: o dado principal no centro do gráfico, não ao lado */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold leading-none tabular-nums"><CountUp value={total} /></span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">total</span>
            </div>
          </div>

          {/* Legenda EMBAIXO, em duas colunas. Ao lado do gráfico ela espremeria os
              dois: o card agora é mais alto que largo. */}
          <ul className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-0.5">
            {visiveis.map((f) => (
              <li key={f.nome} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.cor }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.nome}</span>
                <span className="shrink-0 font-semibold tabular-nums">{f.valor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}

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
