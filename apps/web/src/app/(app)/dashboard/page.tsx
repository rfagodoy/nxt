'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import {
  FileText, Users, Loader2, Plus, ListChecks,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { dueInfo, type Task } from '@/lib/tasks-ui'
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

  /* A faixa mostra o ESTADO da caixa, não a caixa: quantas esperam, quantas já
     venceram e qual é a mais urgente. O detalhe vive em /tarefas. */
  const atrasadas = minhasTarefas.filter((t) => dueInfo(t.dueAt).grp === 'crit').length
  const maisUrgente = (() => {
    const primeira = [...minhasTarefas]
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0]
    return primeira ? dueInfo(primeira.dueAt).label : ''
  })()

  if (loading) return <DashboardSkeleton />

  const c = data?.contracts
  const p = data?.partners

  return (
    /* Duas faixas finas — saudação e estado da caixa de trabalho — e os gráficos
       recebendo TODA a altura restante. O Dashboard é o painel de gestão: os gráficos
       são o conteúdo, não um rodapé. Abaixo de lg o layout volta a fluir. */
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:h-full lg:min-h-[520px] lg:[grid-template-rows:auto_auto_minmax(0,1fr)]">

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

        {/* ── Faixa de trabalho ──
            O Dashboard é painel de GESTÃO; a caixa de trabalho é a tela de Tarefas.
            Aqui fica só o gatilho: quantas esperam e quantas já venceram, com o
            caminho para lá. Uma linha em vez de doze — a lista inteira aqui
            duplicaria /tarefas, e duas telas para a mesma pergunta significam que
            nenhuma delas é a fonte. */}
        <button
          type="button"
          onClick={() => router.push('/tarefas')}
          className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 sm:col-span-2 lg:col-span-4"
        >
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            atrasadas > 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-primary/10 text-primary')}>
            <ListChecks className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight">
              {minhasTarefas.length === 0
                ? 'Nenhuma tarefa aguardando você'
                : `${minhasTarefas.length} tarefa${minhasTarefas.length > 1 ? 's' : ''} na sua caixa`}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {minhasTarefas.length === 0 ? 'Tudo em dia por aqui.'
                : atrasadas > 0 ? `${atrasadas} já ${atrasadas > 1 ? 'venceram' : 'venceu'} · a mais antiga: ${maisUrgente}`
                : `A mais próxima ${maisUrgente}`}
            </span>
          </span>
          {minhasTarefas.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
              Abrir tarefas
            </span>
          )}
        </button>

        {/* ── Composição da carteira ──
            Três cards de mesmo peso, abaixo de "Seu trabalho" e visivelmente menores:
            eles respondem "como está a carteira?", que é pergunta de acompanhamento,
            não de ação. Cada um mostra o TOTAL grande e a composição em rosca — o
            número sozinho não diz se 128 contratos são saúde ou problema. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:col-span-2 lg:col-span-4 lg:min-h-0">
          <Composicao
            icon={<FileText className="h-4 w-4" />}
            label="Contratos"
            hint="Contratos cancelados não entram na carteira — por isso este total pode ser menor que o da listagem."
            tipo="barras"
            total={c?.total ?? 0}
            onClick={() => router.push('/modules/contratos')}
            fatias={[
              { nome: 'Vigentes',    valor: c?.byStatus.VIGENTE ?? 0,     cor: 'hsl(154 70% 40%)' },
              { nome: 'Vencidos',    valor: c?.byStatus.VENCIDO ?? 0,     cor: 'hsl(38 92% 50%)'  },
              { nome: 'Em cadastro', valor: c?.byStatus.EM_CADASTRO ?? 0, cor: 'hsl(210 90% 55%)' },
              { nome: 'Encerrados',  valor: c?.byStatus.ENCERRADO ?? 0,   cor: 'hsl(215 15% 55%)' },
              { nome: 'Rescindidos', valor: c?.byStatus.RESCINDIDO ?? 0,  cor: 'hsl(0 72% 55%)'   },
              /* Sem "Cancelados": o cancelado nunca chegou a valer e por decisão do PO
                 (28/07) não entra na carteira — nem no Total, nem na composição. Ele
                 continua na listagem de Contratos, que é onde se procura um registro. */
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
          <MedidorSaude
            icon={<Loader2 className="h-4 w-4" />}
            label="Processos"
            emDia={data?.instances.emAndamentoNoPrazo ?? 0}
            atrasados={data?.instances.emAndamentoAtrasadas ?? 0}
            onClick={() => router.push('/processos')}
            rodape={[
              { nome: 'concluídos', valor: data?.instances.concluidas ?? 0 },
              { nome: 'com erro',   valor: data?.instances.comErro ?? 0, alerta: true },
              { nome: 'cancelados', valor: data?.instances.canceladas ?? 0 },
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
function Composicao({ icon, label, hint, total, fatias, onClick, tipo = 'rosca' }: {
  icon: React.ReactNode; label: string; total: number; fatias: Fatia[]
  /** Explica no hover uma diferença que o número sozinho não conta (ex.: por que o
   *  Total daqui não bate com o da listagem). */
  hint?: string
  onClick?: () => void
  /** Rosca para POUCAS categorias (parte/todo); barras quando são muitas — com seis
   *  fatias a rosca vira um mosaico de lascas que ninguém consegue comparar. */
  tipo?: 'rosca' | 'barras'
}) {
  const visiveis = fatias.filter((f) => f.valor > 0)
  const soma = visiveis.reduce((acc, f) => acc + f.valor, 0)
  const maior = Math.max(1, ...visiveis.map((f) => f.valor))

  return (
    <Tile onClick={onClick} highlight className="flex flex-col gap-2 lg:min-h-0">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
          <p className="truncate text-xs font-medium text-muted-foreground" title={hint}>{label}</p>
        </div>
        {/* Nas barras o total sai do miolo do gráfico e vem para o cabeçalho. */}
        {tipo === 'barras' && soma > 0 && (
          <p className="shrink-0 text-xl font-bold leading-none tabular-nums"><CountUp value={total} /></p>
        )}
      </div>

      {soma === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center">
          <p className="text-3xl font-bold leading-none tabular-nums text-muted-foreground/40">0</p>
          <p className="text-[11px] text-muted-foreground">Nenhum registro ainda.</p>
        </div>
      ) : tipo === 'rosca' ? (
        <div className="flex flex-1 flex-col gap-2 lg:min-h-0">
          {/* Raios em % para o gráfico ESCALAR com a altura do card. */}
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
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold leading-none tabular-nums"><CountUp value={total} /></span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">total</span>
            </div>
          </div>
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
      ) : (
        /* Barras horizontais em CSS: o rótulo fica LEGÍVEL ao lado do valor (numa rosca
           com seis fatias ele vira legenda, e a pessoa passa a comparar cores em vez de
           grandezas). Proporcionais à MAIOR fatia, não ao total — o que se compara aqui
           é uma situação com a outra. */
        <div className="flex flex-1 flex-col justify-center gap-1.5 lg:min-h-0">
          {visiveis.map((f) => (
            <div key={f.nome} className="flex items-center gap-2 text-[11px]">
              <span className="w-[86px] shrink-0 truncate text-muted-foreground" title={f.nome}>{f.nome}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/60">
                <span className="block h-full rounded-sm transition-all duration-500"
                  style={{ width: `${Math.max(4, (f.valor / maior) * 100)}%`, background: f.cor }} />
              </span>
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums">{f.valor}</span>
            </div>
          ))}
        </div>
      )}
    </Tile>
  )
}

/** Medidor de saúde dos processos EM ANDAMENTO.
 *
 *  Aqui a rosca de composição não servia: "em dia x atrasado" não é uma repartição
 *  para contemplar — é um indicador com meta implícita (quanto mais perto de 100%,
 *  melhor). O arco comunica isso de relance; a composição, não.
 *
 *  Concluídos, cancelados e com erro NÃO entram no cálculo: são casos encerrados, e
 *  incluí-los diluiria o atraso — mil processos concluídos fariam seis atrasados
 *  sumirem numa porcentagem bonita. Eles ficam no rodapé, como contexto.
 */
function MedidorSaude({ icon, label, emDia, atrasados, rodape, onClick }: {
  icon: React.ReactNode
  label: string
  emDia: number
  atrasados: number
  rodape?: Array<{ nome: string; valor: number; alerta?: boolean }>
  onClick?: () => void
}) {
  const andamento = emDia + atrasados
  const pct = andamento === 0 ? 0 : Math.round((emDia / andamento) * 100)

  /* A COR é o diagnóstico: um medidor sempre verde vira enfeite. */
  const cor = pct >= 90 ? 'hsl(154 70% 40%)' : pct >= 70 ? 'hsl(38 92% 50%)' : 'hsl(0 72% 55%)'

  /* Semicírculo de raio 50 → comprimento π·50 ≈ 157. O quanto do arco fica "apagado"
     é o que falta para 100%. */
  const ARCO = 157
  const restante = ARCO * (1 - pct / 100)

  return (
    <Tile onClick={onClick} highlight className="flex flex-col gap-2 lg:min-h-0">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      {andamento === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-center">
          <p className="text-3xl font-bold leading-none tabular-nums text-muted-foreground/40">—</p>
          <p className="text-[11px] text-muted-foreground">Nenhum processo em andamento.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 lg:min-h-0">
          <svg viewBox="0 0 120 66" className="w-full max-w-[190px]" role="img"
               aria-label={`${pct}% dos processos em andamento estão em dia`}>
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="currentColor"
                  className="text-muted" strokeWidth="11" strokeLinecap="round" />
            <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke={cor}
                  strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={ARCO} strokeDashoffset={restante}
                  style={{ transition: 'stroke-dashoffset .7s ease-out' }} />
            <text x="60" y="52" textAnchor="middle" fontSize="22" fontWeight="800" fill="currentColor">{pct}%</text>
          </svg>

          <p className="text-[11.5px] font-medium">
            <span className="tabular-nums">{emDia}</span> de <span className="tabular-nums">{andamento}</span> em dia
          </p>
          {atrasados > 0 ? (
            <p className="text-[11.5px] font-semibold text-red-600 dark:text-red-400">
              <span className="tabular-nums">{atrasados}</span> atrasado{atrasados > 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">Nenhum atrasado</p>
          )}

          {/* Casos encerrados: contexto, fora da conta do indicador. */}
          {rodape && rodape.some((r) => r.valor > 0) && (
            <p className="mt-1 flex flex-wrap justify-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
              {rodape.filter((r) => r.valor > 0).map((r) => (
                <span key={r.nome} className={cn(r.alerta && 'text-amber-600 dark:text-amber-400 font-medium')}>
                  <span className="font-semibold tabular-nums">{r.valor}</span> {r.nome}
                </span>
              ))}
            </p>
          )}
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
