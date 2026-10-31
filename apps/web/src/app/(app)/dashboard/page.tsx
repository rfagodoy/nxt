'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { Plus, ListChecks, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch, apiJson } from '@/lib/http'
import { useAoVivo } from '@/lib/realtime'
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
      proximos: { id: string; numero: string; titulo: string; inicio: string; termino: string; valor: number; contraparte: string | null }[]
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
type Vencimentos = NonNullable<Summary['carteira']>['vencimentos']
type Concentracao = NonNullable<Summary['carteira']>['concentracao']
type Proximo = Vencimentos['proximos'][number]

/* ─────────────────────────── helpers ─────────────────────────────────────── */
const NUM = new Intl.NumberFormat('pt-BR')
const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const DIA = 86_400_000
const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const MES_CURTO = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return m === 1 ? `${nome} ${String(a).slice(2)}` : nome
}
/** meia-noite local de uma data YYYY-MM-DD — as contas de dias não sofrem com fuso */
const diaLocal = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getTime() }

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
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

function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  const rounded = Math.round(v)
  return <>{format ? format(rounded) : NUM.format(rounded)}</>
}

/* ─────────────────────────── visual (mockup "Bento + Floresta", PO 27/10/2026) ──
   Cinco painéis numa tela só, sem abas: Contratos e Valor que vence por mês em cima,
   Vencem em breve e Concentração embaixo, e "Sua caixa" (o que pede ação) na coluna
   da direita, de cima a baixo. No lg+ a grade ocupa a altura da área e cabe em
   1366×768 sem rolar; abaixo do mínimo de cada linha só a área de conteúdo rola —
   menu lateral e faixa do topo já são fixos no shell.
   Paleta "Neutro calmo": cartões opacos e neutros; cada significado tem uma cor,
   a mesma nos dois temas (só a claridade se ajusta). A Lima fica como acento
   pequeno — número e botão da caixa, links no escuro. O vidro é MÉDIO (75% / 70%):
   deixa o degradê aparecer de leve atrás dos cartões, como nas ilhas do shell.
   No hover o cartão sobe 2px, fica mais opaco, ganha borda esmeralda e sombra maior;
   a sombra repete o realce interno do .vidro, que o utilitário substituiria. */
const CARTAO = cn(
  'vidro flex min-w-0 flex-col rounded-2xl bg-[var(--dash-cartao)] p-4 [--vidro-solido:var(--dash-cartao-solido)] lg:px-5',
  'transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  'hover:border-[#159D62]/35 hover:bg-white/90 hover:shadow-[inset_0_1px_0_var(--vidro-spec),0_18px_36px_-14px_rgba(12,40,26,0.28)]',
  'dark:hover:border-[#3DD68C]/40 dark:hover:bg-[#1E2723]/90 dark:hover:shadow-[inset_0_1px_0_var(--vidro-spec),0_18px_40px_-12px_rgba(0,0,0,0.6)]',
)
const LINK = 'text-xs font-bold text-[var(--marca-link)] hover:underline'

function CabecalhoCartao({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className="text-[15px] font-bold">{titulo}</h2>
      <span className="flex-1" />
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

  /* Carga do painel — a primeira e as recargas ao vivo. Depois da primeira, o esqueleto
     não volta: só os números mudam, sem a tela piscar. */
  const carregar = useCallback(async () => {
    try {
      /* As DUAS perguntas de quem abre o sistema, lado a lado: "como está a
         carteira?" (resumo) e "o que preciso fazer?" (tarefas). */
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

  const novoContrato = () => ws.open({ id: 'contract:new', kind: 'contract', mode: 'new', label: 'Novo contrato' })
  const abrirContrato = (e: Proximo) => ws.open({ id: `contract:${e.id}`, kind: 'contract', mode: 'detail', label: e.numero, data: { id: e.id, numero: e.numero, titulo: e.titulo, tipo: '', parte_principal: e.contraparte ?? '', inicio: e.inicio, termino: e.termino, valor_total: e.valor, situacao: 'VIGENTE', documento: '', papel: '', data_assinatura: '', moeda: '', valor_parcela: 0, condicao_pagamento: '' } })

  if (loading) return <DashboardSkeleton />

  return (
    <div className="flex min-h-full flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-0.5">
        <h1 className="text-[19px] font-extrabold tracking-tight">
          {greeting()}{firstName ? `, ${firstName}` : ''}
        </h1>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => ws.open({ id: 'partner:new', kind: 'partner', mode: 'new', label: 'Novo parceiro' })}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
            <Plus className="h-3.5 w-3.5" />Novo parceiro
          </button>
          <StartProcessButton variant="outline" />
          <button onClick={novoContrato}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--acao)] px-3 py-1.5 text-xs font-semibold text-[var(--acao-tinta)] shadow-sm hover:bg-[var(--acao-hover)] transition-colors">
            <Plus className="h-3.5 w-3.5" />Novo contrato
          </button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-[minmax(270px,1fr)_minmax(270px,1fr)]">
        <CartaoContratos className="lg:col-span-4" dados={data?.contracts} vencimentos={data?.carteira?.vencimentos}
          onAbrir={() => router.push('/modules/contratos')} onNovo={novoContrato} />
        <CartaoValorPorMes className="lg:col-span-5" dados={data?.carteira?.vencimentos} />
        <CartaoCaixa className="order-first lg:order-none lg:col-span-3 lg:col-start-10 lg:row-span-2 lg:row-start-1"
          tarefas={minhasTarefas}
          onAbrirTarefa={(t) => ws.open({ id: `task:${t.id}`, kind: 'task', mode: 'detail', label: t.name || t.nodeId, data: t })}
          onAbrirCaixa={() => router.push('/tarefas')} />
        <CartaoVencemEmBreve className="lg:col-span-5" dados={data?.carteira?.vencimentos}
          onAbrirContrato={abrirContrato} onVerTodos={() => router.push('/modules/contratos')} />
        <CartaoConcentracao className="lg:col-span-4" dados={data?.carteira?.concentracao} />
      </div>
    </div>
  )
}

/* ─────────────────────────── Contratos ───────────────────────────────────── */

/* Fatias da rosca. A MATIZ diz o que é; a CLARIDADE separa uma fatia da outra (em
   escala de cinza continuam distintas). Cada tema tem a sua escada: no escuro a Lima
   assume os vigentes, o que mais importa. Fatia nova entra num degrau livre.
   Sem "Cancelados": o cancelado nunca chegou a valer e por decisão do PO (28/07) não
   entra na carteira — nem no total, nem na composição. */
const FATIAS = [
  { chave: 'VIGENTE',     nome: 'Vigentes',    traco: 'stroke-[var(--marca)]', ponto: 'bg-[var(--marca)]' },
  { chave: 'VENCIDO',     nome: 'Vencidos',    traco: 'stroke-[#C2410C] dark:stroke-[#F59E0B]', ponto: 'bg-[#C2410C] dark:bg-[#F59E0B]' },
  { chave: 'EM_CADASTRO', nome: 'Em cadastro', traco: 'stroke-[#2F7FD6] dark:stroke-[#5FA8F0]', ponto: 'bg-[#2F7FD6] dark:bg-[#5FA8F0]' },
  { chave: 'ENCERRADO',   nome: 'Encerrados',  traco: 'stroke-[#A3B0A9] dark:stroke-[#5E6B64]', ponto: 'bg-[#A3B0A9] dark:bg-[#5E6B64]' },
  { chave: 'RESCINDIDO',  nome: 'Rescindidos', traco: 'stroke-[#C2416B] dark:stroke-[#F07A9F]', ponto: 'bg-[#C2416B] dark:bg-[#F07A9F]' },
] as const

function CartaoContratos({ className, dados, vencimentos, onAbrir, onNovo }: {
  className?: string
  dados?: Summary['contracts']
  vencimentos?: Vencimentos
  onAbrir: () => void
  onNovo: () => void
}) {
  const total = dados?.total ?? 0
  /* Fatia zerada sai do gráfico e da legenda: uma situação sem registro é ruído. */
  const fatias = FATIAS.map((f) => ({ ...f, valor: dados?.byStatus[f.chave] ?? 0 })).filter((f) => f.valor > 0)
  const R = 80
  const C = 2 * Math.PI * R
  const folga = fatias.length > 1 ? 4 : 0
  let acumulado = 0
  const arcos = fatias.map((f) => {
    const tam = (f.valor / Math.max(1, total)) * C
    const arco = { ...f, dash: `${Math.max(0, tam - folga)} ${C}`, offset: -acumulado }
    acumulado += tam
    return arco
  })
  const vencidos = vencimentos?.vencidos
  const prox90 = vencimentos?.prox90

  return (
    <section className={cn(CARTAO, 'gap-3', className)}>
      <CabecalhoCartao titulo="Contratos">
        <button type="button" onClick={onAbrir} className={LINK}>Abrir lista</button>
      </CabecalhoCartao>
      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">Nenhum contrato na carteira ainda.</p>
          <button type="button" onClick={onNovo} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Cadastrar contrato</button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <div className="relative h-[150px] w-[150px] shrink-0">
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img"
              aria-label={`${total} contratos: ${fatias.map((f) => `${f.valor} ${f.nome.toLowerCase()}`).join(', ')}`}>
              <circle cx="100" cy="100" r={R} fill="none" strokeWidth="24" className="stroke-[var(--dash-trilho)]" />
              {arcos.map((a) => (
                <circle key={a.chave} cx="100" cy="100" r={R} fill="none" strokeWidth="24"
                  strokeDasharray={a.dash} strokeDashoffset={a.offset} className={cn(a.traco, 'transition-all duration-700')} />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[34px] font-bold leading-none tabular-nums"><CountUp value={total} /></span>
              <span className="mt-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">CONTRATOS</span>
            </div>
          </div>
          <div className="flex min-w-[170px] flex-1 flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground" title="Vigentes e vencidos ainda não renovados — o que a organização tem em mãos.">Valor vigente</p>
              <p className="mt-0.5 whitespace-nowrap font-mono text-[26px] font-bold leading-tight tracking-tight">
                <CountUp value={dados?.valorAtivos ?? 0} format={(n) => BRL_CURTO.format(n)} />
              </p>
              {vencidos && vencidos.qtd > 0 ? (
                <span className="mt-1.5 inline-block rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[11.5px] font-extrabold text-[#8A5200] dark:bg-orange-400/15 dark:text-orange-300">
                  {vencidos.qtd} vencido{vencidos.qtd === 1 ? '' : 's'} sem renovação
                </span>
              ) : prox90 && prox90.qtd > 0 ? (
                <span className="mt-1.5 inline-block rounded-full bg-[#EEF6F1] px-2 py-0.5 text-[11.5px] font-extrabold text-[var(--marca-texto)] dark:bg-[#3DD68C]/15">
                  {prox90.qtd} vence{prox90.qtd === 1 ? '' : 'm'} em 90 dias
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {fatias.map((f) => (
                <li key={f.chave} className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', f.ponto)} />
                  <span className="flex-1">{f.nome}</span>
                  <b className="font-mono tabular-nums">{NUM.format(f.valor)}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

/* ─────────────────────────── Valor que vence por mês ─────────────────────── */

/* Os 3 primeiros meses (≈ 90 dias) vão em destaque e o cabeçalho diz isso: a cor
   nunca carrega sozinha. O maior mês ganha rótulo, mesmo fora dos 90 dias. */
const BARRA_FORTE = 'bg-[var(--marca)]'
const BARRA_FRACA = 'bg-[var(--dash-barra-fraca)]'

function CartaoValorPorMes({ className, dados }: { className?: string; dados?: Vencimentos }) {
  const meses = dados?.meses ?? []
  const maior = Math.max(1, ...meses.map((m) => m.valor))
  const vazio = meses.every((m) => m.valor === 0)
  return (
    <section className={cn(CARTAO, 'gap-2', className)}>
      <CabecalhoCartao titulo="Valor que vence por mês">
        {dados && dados.prox90.valor > 0 && (
          <span className="text-[12.5px] text-muted-foreground">
            <b className="font-mono text-foreground">{BRL_CURTO.format(dados.prox90.valor)}</b> em 90 dias
          </span>
        )}
      </CabecalhoCartao>
      {vazio ? (
        <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">Nenhum contrato vigente vence nos próximos 12 meses.</p>
      ) : (
        <>
          <div className="flex min-h-[150px] flex-1 gap-1.5 border-b border-foreground/15" role="img"
            aria-label={`Valor que vence por mês: ${meses.map((m) => `${MES_CURTO(m.mes)} ${BRL_CURTO.format(m.valor)}`).join(', ')}`}>
            {meses.map((m, i) => {
              const perto = i < 3
              const pico = m.valor === maior
              const rotulo = m.valor > 0 && (perto || pico)
              return (
                <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${MES_CURTO(m.mes)}: ${m.qtd} contrato${m.qtd === 1 ? '' : 's'} · ${BRL_CURTO.format(m.valor)}`}>
                  {rotulo && (
                    <span className={cn('whitespace-nowrap font-mono text-[10px] font-bold tabular-nums',
                      perto ? 'text-[var(--marca-texto)]' : 'rounded bg-[#142420] px-1 text-white dark:bg-[#F1F5F2] dark:text-[#0E1210]')}>
                      {BRL_CURTO.format(m.valor).replace('R$', '').trim()}
                    </span>
                  )}
                  <div className={cn('w-full max-w-[52px] rounded-t-md transition-all duration-700', perto ? BARRA_FORTE : BARRA_FRACA)}
                    style={{ height: m.valor > 0 ? `${Math.max(3, (m.valor / maior) * 84)}%` : '0' }} />
                </div>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            {meses.map((m) => <span key={m.mes} className="min-w-0 flex-1 truncate text-center text-[10.5px] text-muted-foreground">{MES_CURTO(m.mes)}</span>)}
          </div>
        </>
      )}
    </section>
  )
}

/* ─────────────────────────── Sua caixa ───────────────────────────────────── */

/** O que pede ação, na superfície cheia de Lima. As 4 mais urgentes: atrasadas
 *  primeiro e, depois, pelo prazo; o resto vira "+ N outras" (decisão do PO, 27/10). */
function CartaoCaixa({ className, tarefas, onAbrirTarefa, onAbrirCaixa }: {
  className?: string
  tarefas: Task[]
  onAbrirTarefa: (t: Task) => void
  onAbrirCaixa: () => void
}) {
  const ordenadas = [...tarefas].sort((a, b) =>
    (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))
  const visiveis = ordenadas.slice(0, 4)
  const outras = ordenadas.length - visiveis.length
  return (
    <section className={cn(CARTAO, 'gap-3 lg:p-5', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Sua caixa</h2>
        <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      {tarefas.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-[var(--marca)]" aria-hidden />
          <p className="text-sm font-bold">Nada esperando por você</p>
          <p className="text-xs text-muted-foreground">Quando um processo chegar a você, ele aparece aqui.</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="rounded-lg bg-[var(--destaque)] px-1.5 font-mono text-[56px] font-bold leading-none tracking-tighter text-[var(--destaque-tinta)] tabular-nums"><CountUp value={tarefas.length} /></span>
            <span className="text-sm font-bold leading-snug">{tarefas.length === 1 ? 'tarefa espera' : 'tarefas esperam'}<br />por você</span>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {visiveis.map((t) => {
              const prazo = dueInfo(t.dueAt)
              const titulo = [t.name || t.nodeId, t.assunto?.titulo].filter(Boolean).join(' · ')
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => onAbrirTarefa(t)} title={titulo}
                    className="w-full rounded-xl bg-[var(--dash-item)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--dash-item-hover)]">
                    <span className="block truncate text-[13px] font-bold">{titulo}</span>
                    <span className={cn('mt-0.5 block text-xs font-bold', prazo.grp === 'crit' ? 'text-[#B42318] dark:text-[#FF9B8C]' : 'text-muted-foreground')}>{prazo.label}</span>
                  </button>
                </li>
              )
            })}
            {outras > 0 && (
              <li>
                <button type="button" onClick={onAbrirCaixa} className="px-1 text-xs font-bold text-muted-foreground hover:underline">
                  + {outras} outra{outras === 1 ? '' : 's'}
                </button>
              </li>
            )}
          </ul>
        </>
      )}
      <button type="button" onClick={onAbrirCaixa}
        className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--botao-forte-bg)] text-[13.5px] font-bold text-[var(--botao-forte-fg)] transition-opacity hover:opacity-90">
        Abrir minhas tarefas
      </button>
    </section>
  )
}

/* ─────────────────────────── Vencem em breve ─────────────────────────────── */

/** Urgência pelos dias que faltam: até 7 vermelho, até 15 laranja, depois verde. */
function urgencia(dias: number) {
  if (dias <= 7) return { barra: 'bg-[#D64535] dark:bg-[#FF7A6B]', texto: 'text-[#B42318] dark:text-[#FF9B8C]' }
  if (dias <= 15) return { barra: 'bg-[#E08A2C] dark:bg-[#F2B544]', texto: 'text-[#8A5200] dark:text-[#F2B544]' }
  return { barra: 'bg-[var(--marca)]', texto: 'text-muted-foreground' }
}

/** Os 4 que vencem primeiro. A barra é quanto do prazo do contrato já passou (do início
 *  da vigência ao término vigente) — sem início cadastrado, fica só o trilho. */
function CartaoVencemEmBreve({ className, dados, onAbrirContrato, onVerTodos }: {
  className?: string
  dados?: Vencimentos
  onAbrirContrato: (e: Proximo) => void
  onVerTodos: () => void
}) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const lista = (dados?.proximos ?? []).slice(0, 4)
  const totalAno = (dados?.meses ?? []).reduce((s, m) => s + m.qtd, 0)
  return (
    <section className={cn(CARTAO, 'gap-1', className)}>
      <CabecalhoCartao titulo="Vencem em breve">
        {totalAno > lista.length && <button type="button" onClick={onVerTodos} className={LINK}>Ver os {totalAno}</button>}
      </CabecalhoCartao>
      {lista.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">Nenhum contrato vigente vence nos próximos 12 meses.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col justify-evenly">
          {lista.map((e) => {
            const fim = diaLocal(e.termino)
            const dias = Math.max(0, Math.round((fim - hoje.getTime()) / DIA))
            const ini = e.inicio ? diaLocal(e.inicio) : null
            const decorrido = ini != null && fim > ini ? Math.min(100, Math.max(0, ((hoje.getTime() - ini) / (fim - ini)) * 100)) : null
            const u = urgencia(dias)
            return (
              <li key={e.id} className="border-t border-foreground/[0.08] first:border-t-0">
                <button type="button" onClick={() => onAbrirContrato(e)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-foreground/[0.04]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{e.contraparte ?? e.titulo}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{[e.numero, e.titulo].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="h-1.5 w-[22%] shrink-0 rounded-full bg-foreground/[0.08]" role="img"
                    aria-label={decorrido == null ? 'Início da vigência não informado' : `${Math.round(decorrido)}% do prazo já passou`}>
                    {decorrido != null && <span className={cn('block h-1.5 rounded-full', u.barra)} style={{ width: `${decorrido}%` }} />}
                  </span>
                  <span className={cn('w-[54px] shrink-0 text-right text-xs font-extrabold', u.texto)}>
                    {dias === 0 ? 'hoje' : `${dias} dia${dias === 1 ? '' : 's'}`}
                  </span>
                  <span className="w-[74px] shrink-0 text-right font-mono text-xs tabular-nums">{BRL_CURTO.format(e.valor)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ─────────────────────────── Concentração ────────────────────────────────── */

/* Uma cor distinta por parceiro do top 5 (matiz, não só claridade); "outros" com
   TEXTURA listrada — distingue-se por forma, não só por tom. */
const COR_PARCEIRO = [
  'bg-[var(--marca)]',
  'bg-[#2F7FD6] dark:bg-[#5FA8F0]',
  'bg-[#C77A0A] dark:bg-[#F2B544]',
  'bg-[#7C8B83] dark:bg-[#8A9A92]',
  'bg-[#C2416B] dark:bg-[#F07A9F]',
]
const TEXTURA_OUTROS = 'bg-[repeating-linear-gradient(135deg,hsl(var(--foreground)/0.22)_0_3px,hsl(var(--foreground)/0.07)_3px_7px)]'

function CartaoConcentracao({ className, dados }: { className?: string; dados?: Concentracao }) {
  const vazio = !dados || dados.total === 0
  const n = Math.min(3, dados?.parceiros.length ?? 0)
  return (
    <section className={cn(CARTAO, 'gap-3', className)}>
      <CabecalhoCartao titulo="Concentração">
        {!vazio && (
          <span className="text-[12.5px] text-muted-foreground"
            title={dados.semParceiro > 0 ? `${dados.semParceiro} contrato${dados.semParceiro === 1 ? '' : 's'} sem parceiro externo ${dados.semParceiro === 1 ? 'fica' : 'ficam'} fora desta conta.` : undefined}>
            {n === 1 ? 'maior' : `top ${n}`} = <b className="font-mono text-foreground">{pctFmt(dados.top3Pct)}</b>
          </span>
        )}
      </CabecalhoCartao>
      {vazio ? (
        <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">Nenhum contrato em mãos tem parceiro como contraparte.</p>
      ) : (
        <>
          <div className="flex h-[22px] shrink-0 gap-[3px] overflow-hidden rounded-lg" role="img"
            aria-label={`Participação na carteira: ${dados.parceiros.map((p) => `${p.nome} ${pctFmt(p.pct)}`).join(', ')}${dados.outros.qtd ? `, outros ${pctFmt(dados.outros.pct)}` : ''}`}>
            {dados.parceiros.map((p, i) => <span key={p.id} className={COR_PARCEIRO[i]} style={{ flex: p.pct }} />)}
            {dados.outros.pct > 0 && <span className={TEXTURA_OUTROS} style={{ flex: dados.outros.pct }} />}
          </div>
          <ol className="flex min-h-0 flex-1 flex-col justify-evenly text-[12.5px]" aria-label="Maiores parceiros por valor vigente">
            {dados.parceiros.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', COR_PARCEIRO[i])} />
                <span className="min-w-0 flex-1 truncate" title={p.nome}>{p.nome}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">{BRL_CURTO.format(p.valor)}</span>
                <b className="w-10 text-right tabular-nums">{pctFmt(p.pct)}</b>
              </li>
            ))}
            {dados.outros.qtd > 0 && (
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', TEXTURA_OUTROS)} />
                <span className="min-w-0 flex-1 truncate">Outros {dados.outros.qtd} parceiro{dados.outros.qtd === 1 ? '' : 's'}</span>
                <span className="font-mono text-[11.5px] tabular-nums">{BRL_CURTO.format(dados.outros.valor)}</span>
                <b className="w-10 text-right tabular-nums text-foreground">{pctFmt(dados.outros.pct)}</b>
              </li>
            )}
          </ol>
        </>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-full flex-col gap-3 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-muted/60" />
      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-[minmax(270px,1fr)_minmax(270px,1fr)]">
        <div className="h-64 rounded-2xl bg-muted/60 lg:col-span-4 lg:h-auto" />
        <div className="h-64 rounded-2xl bg-muted/60 lg:col-span-5 lg:h-auto" />
        <div className="h-64 rounded-2xl bg-muted/60 lg:col-span-3 lg:col-start-10 lg:row-span-2 lg:row-start-1 lg:h-auto" />
        <div className="h-64 rounded-2xl bg-muted/60 lg:col-span-5 lg:h-auto" />
        <div className="h-64 rounded-2xl bg-muted/60 lg:col-span-4 lg:h-auto" />
      </div>
    </div>
  )
}
