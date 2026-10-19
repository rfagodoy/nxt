'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import {
  FileText, Users, Loader2, Plus, ListChecks, CalendarClock, PieChart as PieIcon, AlertTriangle,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { useAoVivo } from '@/lib/realtime'
import { dueInfo, type Task } from '@/lib/tasks-ui'
import { useWorkspace } from '@/contexts/workspace-context'
import { StartProcessButton } from '@/components/processes/start-process-button'
import { useFaixaVisivel } from '@/components/layout/workspace-bar'
import { NotificationBell } from '@/components/layout/notification-bell'
import { UserMenu } from '@/components/layout/user-menu'

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
    semConclusao: number
  }
  activity:  { id: string; kind: 'partner' | 'contract'; title: string; detail: string; user: string | null; at: string }[]
  attentionCount: number
  /** opção C (PO, 11/10/2026): vencimentos por mês e concentração por parceiro */
  carteira?: {
    vencimentos: {
      meses: { mes: string; qtd: number; valor: number }[]
      prox90: { qtd: number; valor: number }
      vencidos: { qtd: number; valor: number }
      proximos: { id: string; numero: string; titulo: string; termino: string; valor: number; contraparte: string | null }[]
    }
    concentracao: {
      total: number
      parceiros: { id: string; nome: string; valor: number; pct: number }[]
      outros: { qtd: number; valor: number; pct: number }
      top3Pct: number
      semParceiro: number
    }
  }
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

/** Anima um número até o alvo com easing — dá vida sem distrair.
 *  Parte do valor que JÁ está na tela, não de 0: com o painel ao vivo, uma recarga que
 *  muda 7 para 8 desliza de 7 a 8. Partindo de 0, cada gravação de qualquer pessoa
 *  derrubava o número a zero e o fazia subir de novo. Na primeira carga, a tela mostra
 *  0, então a entrada continua subindo do zero. */
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  const atual = useRef(0)
  useEffect(() => {
    const from = atual.current
    if (from === target) return
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / duration)
      const v = p < 1 ? from + (target - from) * (1 - Math.pow(1 - p, 3)) : target
      atual.current = v
      setVal(v)
      if (p < 1) raf = requestAnimationFrame(tick)
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

const ABAS = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'vencimentos', rotulo: 'Vencimentos' },
  { id: 'concentracao', rotulo: 'Concentração por parceiro' },
] as const
type AbaId = (typeof ABAS)[number]['id']
const ABA_KEY = 'nxt:dashboard:aba'

/* ─────────────────────────── página ──────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter()
  const ws = useWorkspace()
  /* sem a faixa do topo (nenhuma aba aberta), o painel é o topo: leva sino e usuário */
  const faixa = useFaixaVisivel()
  const { data: session } = useSession()
  const [data, setData] = useState<Summary | null>(null)
  const [minhasTarefas, setMinhasTarefas] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const mounted = useRef(false)

  const firstName = useMemo(() => {
    const n = session?.user?.name || session?.user?.email?.split('@')[0] || ''
    return n ? n.split(' ')[0].replace(/^./, c => c.toUpperCase()) : ''
  }, [session])

  /* Carga do painel — a primeira e as recargas ao vivo. Depois da primeira, o esqueleto
     não volta: só os números mudam, sem a tela piscar. */
  const carregar = useCallback(async () => {
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
    } catch { /* silencioso — mantém o que já está na tela */ }
    finally { if (mounted.current) setLoading(false) }
  }, [])

  useEffect(() => {
    mounted.current = true
    void carregar()
    return () => { mounted.current = false }
  }, [carregar])

  /* Tempo real. O painel fica montado por baixo das abas de documento: prorrogar um
     contrato numa aba e voltar para cá não o remontava, e os números ficavam velhos até
     atualizar o navegador. Agora recarrega quando qualquer gravação da organização
     acontece — desta aba, de outro usuário ou do motor de datas. */
  useAoVivo(() => { void carregar() })

  /* A faixa mostra o ESTADO da caixa, não a caixa: quantas esperam, quantas já
     venceram e qual é a mais urgente. O detalhe vive em /tarefas. */
  const atrasadas = minhasTarefas.filter((t) => dueInfo(t.dueAt).grp === 'crit').length
  const maisUrgente = (() => {
    const primeira = [...minhasTarefas]
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0]
    return primeira ? dueInfo(primeira.dueAt).label : ''
  })()

  /* Aba ativa, lembrada neste navegador (preferência de visualização, não dado). */
  const [aba, setAba] = useState<AbaId>('geral')
  useEffect(() => {
    try { const v = localStorage.getItem(ABA_KEY) as AbaId | null; if (v && ABAS.some((a) => a.id === v)) setAba(v) } catch { /* sem storage */ }
  }, [])
  const escolherAba = (id: AbaId) => { setAba(id); try { localStorage.setItem(ABA_KEY, id) } catch { /* sem storage */ } }

  if (loading) return <DashboardSkeleton />

  const c = data?.contracts
  const p = data?.partners

  return (
    /* Opção B dos mockups (PO, 11/10/2026): a tela empilhava sete blocos e nenhum
       gráfico tinha espaço. Agora: cabeçalho FIXO (saudação, resumo das tarefas e os
       atalhos de criação — sempre à mão ao rolar) e ABAS, cada uma com a altura toda. */
    <div className="flex min-h-full flex-col gap-3 lg:h-full">

      {/* lg:h-14 = a MESMA altura da linha do logo no menu lateral, e os dois começam no
          mesmo topo (pt-2 do shell = p-2 da ilha): logo e saudação na mesma linha. */}
      <header className="sticky top-0 z-20 shrink-0 overflow-hidden rounded-xl px-5 py-2 text-white shadow-md lg:flex lg:h-14 lg:items-center lg:py-0
                         bg-gradient-to-r from-[hsl(156_42%_11%)] to-[hsl(150_44%_6%)]">
        <div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
        <div className="relative flex w-full flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-white/60">{todayLabel()}</p>
            <h1 className="text-base font-semibold tracking-tight leading-tight">
              {greeting()}{firstName ? `, ${firstName}` : ''} 👋
            </h1>
          </div>
          {/* O resumo da caixa de trabalho mora no cabeçalho: era uma faixa inteira só
              para dizer quantas tarefas esperam. O detalhe continua em /tarefas. */}
          <button type="button" onClick={() => router.push('/tarefas')}
            title={minhasTarefas.length ? (atrasadas > 0 ? `A mais antiga: ${maisUrgente}` : `A mais próxima ${maisUrgente}`) : 'Abrir a caixa de tarefas'}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20">
            <ListChecks className="h-3.5 w-3.5" />
            {minhasTarefas.length === 0 ? <span>Nenhuma tarefa aguardando</span> : (
              <span>
                <span className="font-semibold">{minhasTarefas.length} tarefa{minhasTarefas.length > 1 ? 's' : ''}</span>
                {atrasadas > 0 && <> · <span className="font-semibold text-orange-300">{atrasadas} vencida{atrasadas > 1 ? 's' : ''}</span></>}
              </span>
            )}
          </button>
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
          {!faixa && (
            <div className="flex items-center gap-1 border-l border-white/15 pl-3">
              <NotificationBell sobreEscuro />
              <UserMenu sobreEscuro />
            </div>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Painéis do dashboard" className="vidro flex shrink-0 gap-1 self-start rounded-lg bg-[var(--vidro-cartao)] p-1">
        {ABAS.map((a) => {
          const vencidos = a.id === 'vencimentos' ? data?.carteira?.vencimentos.vencidos.qtd ?? 0 : 0
          return (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => escolherAba(a.id)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                aba === a.id ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground')}>
              {a.rotulo}
              {vencidos > 0 && (
                <span className="rounded-full bg-orange-500/15 px-1.5 py-px text-[10.5px] font-semibold text-[hsl(25_90%_27%)] dark:text-orange-300">
                  {vencidos} vencido{vencidos > 1 ? 's' : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="flex min-h-[420px] flex-1 flex-col lg:min-h-0">
        {aba === 'geral' && (
          /* Composição da carteira: o TOTAL grande e a repartição — o número sozinho não
             diz se 128 contratos são saúde ou problema. Agora com a altura da aba. */
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:min-h-0">
            <Composicao
              icon={<FileText className="h-4 w-4" />}
              label="Contratos"
              hint="Contratos cancelados não entram na carteira — por isso este total pode ser menor que o da listagem."
              tipo="barras"
              total={c?.total ?? 0}
              onClick={() => router.push('/modules/contratos')}
              ctaVazio={{ rotulo: 'Cadastrar contrato', acao: () => ws.open({ id: 'contract:new', kind: 'contract', mode: 'new', label: 'Novo contrato' }) }}
              fatias={[
                { nome: 'Vigentes',    valor: c?.byStatus.VIGENTE ?? 0,     cor: COR_FATIA.emDia      },
                { nome: 'Vencidos',    valor: c?.byStatus.VENCIDO ?? 0,     cor: COR_FATIA.vencido    },
                { nome: 'Em cadastro', valor: c?.byStatus.EM_CADASTRO ?? 0, cor: COR_FATIA.emCadastro },
                { nome: 'Encerrados',  valor: c?.byStatus.ENCERRADO ?? 0,   cor: COR_FATIA.encerrado  },
                { nome: 'Rescindidos', valor: c?.byStatus.RESCINDIDO ?? 0,  cor: COR_FATIA.rompido    },
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
              ctaVazio={{ rotulo: 'Cadastrar parceiro', acao: () => ws.open({ id: 'partner:new', kind: 'partner', mode: 'new', label: 'Novo parceiro' }) }}
              fatias={[
                { nome: 'Ativos',        valor: p?.byStatus.ATIVO ?? 0,             cor: COR_FATIA.emDia      },
                { nome: 'Em cadastro',   valor: p?.byStatus.EM_CADASTRAMENTO ?? 0,  cor: COR_FATIA.emCadastro },
                { nome: 'Inativos',      valor: p?.byStatus.INATIVO ?? 0,           cor: COR_FATIA.encerrado  },
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
                { nome: 'sem conclusão', valor: data?.instances.semConclusao ?? 0 },
              ]}
            />
          </div>
        )}
        {aba === 'vencimentos' && (
          <CartaoVencimentos dados={data?.carteira?.vencimentos}
            onAbrirContrato={(e) => ws.open({ id: `contract:${e.id}`, kind: 'contract', mode: 'detail', label: e.numero, data: { id: e.id, numero: e.numero, titulo: e.titulo, tipo: '', parte_principal: e.contraparte ?? '', inicio: '', termino: e.termino, valor_total: e.valor, situacao: 'VIGENTE', documento: '', papel: '', data_assinatura: '', moeda: '', valor_parcela: 0, condicao_pagamento: '' } })} />
        )}
        {aba === 'concentracao' && (
          <CartaoConcentracao dados={data?.carteira?.concentracao} />
        )}
      </div>

    </div>
  )
}


/* ─────────────────────────── sub-componentes ─────────────────────────────── */

/* Paleta das fatias. A MATIZ diz o que é (verde = em dia, vermelho = rompido); a
   CLARIDADE é que separa uma fatia da outra, em degraus de ~12 pontos de L*.
   Antes as cinco variavam quase só em matiz — "Encerrados" e "Em cadastro" tinham 1,0
   de diferença em L* —, então para quem não distingue as matizes a rosca virava um
   disco de uma cor só e não dava para casar fatia com legenda.
   Em escala de cinza elas agora viram 34%, 46%, 58%, 70% e 82%: uma escada.

   O PESO segue a urgência, não o acaso: "Vencidos" ocupa o degrau mais ESCURO — é o que
   exige ação — e "Rescindidos" o mais claro, porque já é assunto encerrado. A primeira
   versão tinha o oposto e deixava o vencido num âmbar pálido, suave demais para o que ele
   quer dizer. A matiz do vencido também saiu do âmbar (38) para o laranja queimado (25):
   âmbar escuro vira marrom e lê como sujeira, não como urgência.
   ⚠️ Fatia nova entra ENCAIXANDO num degrau livre, não escolhendo uma cor bonita. */
const COR_FATIA = {
  vencido:    'hsl(25 90% 27%)',  // L* 34 — Vencidos (laranja queimado)
  encerrado:  'hsl(215 14% 44%)', // L* 46 — Encerrados, Inativos
  emDia:      'hsl(154 62% 38%)', // L* 58 — Vigentes, Ativos
  emCadastro: 'hsl(210 88% 69%)', // L* 70 — Em cadastro
  rompido:    'hsl(0 48% 84%)',   // L* 82 — Rescindidos (rosa acinzentado)
} as const

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
function Composicao({ icon, label, hint, total, fatias, onClick, tipo = 'rosca', ctaVazio }: {
  icon: React.ReactNode; label: string; total: number; fatias: Fatia[]
  /** Explica no hover uma diferença que o número sozinho não conta (ex.: por que o
   *  Total daqui não bate com o da listagem). */
  hint?: string
  onClick?: () => void
  /** Rosca para POUCAS categorias (parte/todo); barras quando são muitas — com seis
   *  fatias a rosca vira um mosaico de lascas que ninguém consegue comparar. */
  tipo?: 'rosca' | 'barras'
  /** Primeiro passo quando o card está zerado (ex.: "Cadastrar contrato"). */
  ctaVazio?: { rotulo: string; acao: () => void }
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
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-2 text-center">
          <p className="text-3xl font-bold leading-none tabular-nums text-muted-foreground/40">0</p>
          <p className="text-[11px] text-muted-foreground">Nenhum registro ainda.</p>
          {/* O vazio aponta o primeiro passo — o card inteiro navega para a LISTA;
             este botão vai direto ao FORMULÁRIO (por isso o stopPropagation). */}
          {ctaVazio && (
            <button type="button" onClick={(e) => { e.stopPropagation(); ctaVazio.acao() }}
              className="mt-1 inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors">
              <Plus className="h-3 w-3" />{ctaVazio.rotulo}
            </button>
          )}
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

/* ─────────────────────────── vencimentos e concentração ───────────────────── */

const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const MES_CURTO = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return m === 1 ? `${nome} ${String(a).slice(2)}` : nome
}
/* Uma cor só (Esmeralda), validada no claro e no escuro (validador dataviz: o primário
   do tema escuro, mais claro, sai da faixa — por isso o tom fixo). Os 3 primeiros meses
   (≈ 90 dias) vão mais fortes e o texto diz isso: a cor nunca carrega sozinha. */
const BARRA_FORTE = 'bg-[#159d62] dark:bg-[#1fa565]'
const BARRA_FRACA = 'bg-[#159d62]/40 dark:bg-[#1fa565]/45'
/* "outros" com TEXTURA listrada: distingue-se por forma, não só por tom */
const TEXTURA_OUTROS = 'bg-[repeating-linear-gradient(135deg,hsl(var(--foreground)/0.22)_0_3px,hsl(var(--foreground)/0.07)_3px_7px)]'

function CabecalhoCartao({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

/** Vencimentos: quanto vence nos próximos 90 dias (o número), a forma dos 12 meses
 *  (barras por VALOR) e os já vencidos à parte, com ícone + texto. */
function CartaoVencimentos({ dados, onAbrirContrato }: {
  dados?: NonNullable<Summary['carteira']>['vencimentos']
  onAbrirContrato: (c: NonNullable<Summary['carteira']>['vencimentos']['proximos'][number]) => void
}) {
  const meses = dados?.meses ?? []
  const maior = Math.max(1, ...meses.map((m) => m.valor))
  const vazio = !dados || (meses.every((m) => m.qtd === 0) && dados.vencidos.qtd === 0)
  const dataCurta = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
  return (
    <Tile className="flex flex-1 flex-col gap-3 lg:min-h-0">
      <CabecalhoCartao icon={<CalendarClock className="h-4 w-4" />} label="Vencimentos" />
      {vazio || !dados ? (
        <p className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">Nenhum contrato vigente vence nos próximos 12 meses.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[260px] flex-col gap-2">
            <div className="shrink-0">
              <p className="text-2xl font-bold leading-none tabular-nums">{BRL_CURTO.format(dados.prox90.valor)}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                vencem nos próximos 90 dias (barras em destaque) · <span className="font-semibold text-foreground">{dados.prox90.qtd} contrato{dados.prox90.qtd === 1 ? '' : 's'}</span>
              </p>
            </div>
            <div className="flex min-h-0 flex-1 items-end gap-1.5 border-b border-foreground/15" role="img"
              aria-label={`Valor que vence por mês: ${meses.map((m) => `${MES_CURTO(m.mes)} ${BRL_CURTO.format(m.valor)}`).join(', ')}`}>
              {meses.map((m, i) => (
                <div key={m.mes} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${MES_CURTO(m.mes)}: ${m.qtd} contrato${m.qtd === 1 ? '' : 's'} · ${BRL_CURTO.format(m.valor)}`}>
                  {m.valor > 0 && <span className="text-[10.5px] font-semibold tabular-nums">{BRL_CURTO.format(m.valor)}</span>}
                  <div className={cn('w-full max-w-[56px] rounded-t-[3px]', i < 3 ? BARRA_FORTE : BARRA_FRACA)}
                    style={{ height: m.valor > 0 ? `${Math.max(4, (m.valor / maior) * 85)}%` : '0' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              {meses.map((m) => <span key={m.mes} className="flex-1 truncate text-center text-[11px] text-muted-foreground">{MES_CURTO(m.mes)}</span>)}
            </div>
            {dados.vencidos.qtd > 0 && (
              <p className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-[hsl(25_90%_27%)] dark:text-orange-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold">{dados.vencidos.qtd} já vencido{dados.vencidos.qtd === 1 ? '' : 's'}</span> sem renovação · {BRL_CURTO.format(dados.vencidos.valor)}</span>
              </p>
            )}
          </div>
          {/* A lista transforma o gráfico em ação: cada linha abre o contrato. */}
          <aside className="flex min-h-0 flex-col gap-1 lg:border-l lg:pl-5">
            <p className="text-xs font-semibold">Vencem primeiro</p>
            {dados.proximos.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum nos próximos 12 meses.</p> : dados.proximos.map((e) => (
              <button key={e.id} type="button" onClick={() => onAbrirContrato(e)}
                className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-baseline gap-2 rounded px-1.5 py-1.5 text-left text-[11.5px] hover:bg-muted">
                <span className="font-mono text-[10.5px] text-muted-foreground">{dataCurta(e.termino)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{e.numero}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">{e.contraparte ?? e.titulo}</span>
                </span>
                <span className="font-semibold tabular-nums">{BRL_CURTO.format(e.valor)}</span>
              </button>
            ))}
          </aside>
        </div>
      )}
    </Tile>
  )
}

/** Concentração: quanto da carteira está nos maiores parceiros (o número), a barra de
 *  100% em três grupos (o "outros" com TEXTURA, não só cor) e, ao lado, o ranking com uma
 *  barra por parceiro — proporcional ao MAIOR, para comparar um com o outro. */
function CartaoConcentracao({ dados }: { dados?: NonNullable<Summary['carteira']>['concentracao'] }) {
  if (!dados || dados.total === 0) return (
    <Tile className="flex flex-1 flex-col gap-2 lg:min-h-0">
      <CabecalhoCartao icon={<PieIcon className="h-4 w-4" />} label="Concentração por parceiro" />
      <p className="flex flex-1 items-center justify-center text-center text-[11px] text-muted-foreground">Nenhum contrato em mãos tem parceiro como contraparte.</p>
    </Tile>
  )
  const n = Math.min(3, dados.parceiros.length)
  const grupoMeio = dados.parceiros.slice(3).reduce((s, p) => s + p.pct, 0)
  const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  const quem = n === 1 ? 'no maior parceiro' : `nos ${n} maiores parceiros`
  const valorTop = dados.parceiros.slice(0, 3).reduce((s, p) => s + p.valor, 0)
  const maiorParceiro = Math.max(1, ...dados.parceiros.map((p) => p.valor))
  const grupos = [
    { chave: 'top', pct: dados.top3Pct, rotulo: n === 1 ? 'maior' : `${n} maiores`, cls: 'bg-[#0f7a4c] dark:bg-[#1fa565]' },
    { chave: 'meio', pct: grupoMeio, rotulo: '4º–5º', cls: BARRA_FRACA },
    { chave: 'outros', pct: dados.outros.pct, rotulo: `outros ${dados.outros.qtd}`, cls: TEXTURA_OUTROS },
  ].filter((g) => g.pct > 0)
  return (
    <Tile className="flex flex-1 flex-col gap-3 lg:min-h-0">
      <CabecalhoCartao icon={<PieIcon className="h-4 w-4" />} label="Concentração por parceiro" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-3xl font-bold leading-none tabular-nums">{pctFmt(dados.top3Pct)}</p>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              da carteira está <span className="font-semibold text-foreground">{quem}</span> · {BRL_CURTO.format(valorTop)} de {BRL_CURTO.format(dados.total)}
            </p>
          </div>
          <div>
            <div className="flex h-5 gap-0.5 overflow-hidden rounded" role="img"
              aria-label={`Participação na carteira: ${grupos.map((g) => `${g.rotulo} ${pctFmt(g.pct)}`).join(', ')}`}>
              {grupos.map((g) => <div key={g.chave} className={g.cls} style={{ width: `${g.pct}%` }} />)}
            </div>
            <div className="mt-1 flex gap-0.5 text-[10.5px]">
              {grupos.map((g) => (
                <span key={g.chave} className="truncate" style={{ width: `${g.pct}%`, minWidth: '4rem' }}>
                  <span className="font-semibold">{g.rotulo}</span> <span className="text-muted-foreground">{pctFmt(g.pct)}</span>
                </span>
              ))}
            </div>
          </div>
          {dados.semParceiro > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {dados.semParceiro} contrato{dados.semParceiro === 1 ? '' : 's'} sem parceiro externo {dados.semParceiro === 1 ? 'fica' : 'ficam'} fora desta conta.
            </p>
          )}
        </div>
        <ol className="flex min-h-0 flex-col gap-2.5 lg:border-l lg:pl-8" aria-label="Maiores parceiros por valor vigente">
          {dados.parceiros.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-1 text-[12px]">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate" title={p.nome}><span className="text-muted-foreground">{i + 1} ·</span> {p.nome}</span>
                <span className="shrink-0 tabular-nums"><span className="font-semibold">{pctFmt(p.pct)}</span> · {BRL_CURTO.format(p.valor)}</span>
              </div>
              <div className="h-2 rounded bg-foreground/[0.06]">
                <div className={cn('h-2 rounded', i < 3 ? 'bg-[#0f7a4c] dark:bg-[#1fa565]' : BARRA_FRACA)} style={{ width: `${(p.valor / maiorParceiro) * 100}%` }} />
              </div>
            </li>
          ))}
          {dados.outros.qtd > 0 && (
            <li className="flex items-baseline gap-2 border-t pt-2 text-[12px] text-muted-foreground">
              <span className="min-w-0 flex-1">outros {dados.outros.qtd} parceiro{dados.outros.qtd === 1 ? '' : 's'}</span>
              <span className="shrink-0 tabular-nums"><span className="font-semibold text-foreground">{pctFmt(dados.outros.pct)}</span> · {BRL_CURTO.format(dados.outros.valor)}</span>
            </li>
          )}
        </ol>
      </div>
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
