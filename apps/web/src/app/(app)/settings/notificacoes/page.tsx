'use client'

import { useState, useEffect } from 'react'
import { CalendarClock, RefreshCw, Gauge, RotateCw, Save, ShieldAlert, Check, CloudDownload, Play, Loader2, Eye, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'
import { apiFetch } from '@/lib/http'
import { emitContractsChanged } from '@/lib/contract-events'

const KEY = 'nxt:settings:notificacoes'

interface Params {
  vigencia: { enabled: boolean; dias: number[] }
  reajuste: { enabled: boolean; dias: number }
  consumo:  { enabled: boolean; percentuais: number[] }
  renovacaoAutomatica: boolean
  indicesAutoImport: boolean
  /** freio de emergência — quem autoriza o reajuste automático é a linha do contrato */
  reajustePausado: boolean
}
const DEFAULT: Params = {
  vigencia: { enabled: true, dias: [60, 30, 7] },
  reajuste: { enabled: true, dias: 15 },
  consumo:  { enabled: true, percentuais: [80, 100] },
  renovacaoAutomatica: true,
  indicesAutoImport: true,
  reajustePausado: false,
}

/** Resumo retornado por POST /api/notifications/run */
interface ReajusteAplicado {
  numero: string; indice: string; competencia: string; percentual: number; base: 'total' | 'parcela'
  valorAnterior: number; valorNovo: number; parcelaAnterior: number; parcelaNova: number
  parcelasReajustadas: number; pagasAlcancadas: number; diferencaNaoCobrada: number
}
/** Reajuste devido que o motor NÃO aplicou. Sem isto a execução devolvia "0 reajustes"
 *  sem dizer por quê, e descobrir o motivo exigia ler o banco. */
interface ReajustePendente {
  numero: string; indice: string; competencia: string; percentual: number
  motivo: 'PAUSADO' | 'INTERROMPIDO' | 'MANUAL' | 'SEM_SERIE' | 'JANELA_INCOMPLETA' | 'SEM_AGENDA' | 'NAO_VENCIDO'
}
interface RunResult {
  dryRun: boolean; indices: number; renovados: number; encerrados: number
  notificacoes: number; resolvidas: number; reajustes: number
  detalhe: ReajusteAplicado[]; pendentes: ReajustePendente[]
}
const BRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mesAno = (iso: string) => (iso ? iso.slice(0, 7).split('-').reverse().join('/') : '—')

/* O motivo é a mensagem — escrito para quem opera, não para quem escreveu o motor.
   Cada texto diz ONDE está a chave: um motivo que não indica o lugar manda quem lê procurar. */
const MOTIVO: Record<ReajustePendente['motivo'], { texto: string; acao: string }> = {
  PAUSADO:           { texto: 'Motor de reajuste pausado', acao: 'Um administrador acionou o freio de emergência. Despause no cartão abaixo (e Salvar).' },
  MANUAL:            { texto: 'Aplicação “Manual” no contrato', acao: 'No contrato, aba Reajustes, mude Aplicação para “Automática (Motor aplica)”.' },
  SEM_SERIE:         { texto: 'Índice do período não publicado', acao: 'Aguarde a divulgação ou lance o valor na tabela de índices.' },
  JANELA_INCOMPLETA: { texto: 'Índice do período publicado só em parte', acao: 'O motor tenta de novo quando o período fechar.' },
  SEM_AGENDA:        { texto: 'Linha sem índice ou sem data base', acao: 'Complete o cadastro do reajuste no contrato.' },
  INTERROMPIDO:      { texto: 'Renovação não pôde avançar', acao: 'Verifique o prazo de renovação do contrato.' },
  NAO_VENCIDO:       { texto: 'Competência ainda no futuro', acao: '' },
}

/* parse "60, 30, 7" → [60,30,7] (positivos, únicos, ordenados desc) */
const parseList = (s: string) => [...new Set(s.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => b - a)

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} role="switch" aria-checked={on}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}

const inputCls = 'h-8 w-40 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function Card({ icon: Icon, color, title, desc, on, onToggle, children }: {
  icon: React.ElementType; color: string; title: string; desc: string
  on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', color)}><Icon className="h-4.5 w-4.5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{title}</p>
            <Toggle on={on} onChange={onToggle} />
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
          {on && children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}

export default function NotificacoesParams() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [p, setP] = useState<Params>(() => cacheRead<Params>(KEY, DEFAULT))
  const [saved, setSaved] = useState(false)
  const [mounted, setMounted] = useState(false)
  /* Espelho do que está GRAVADO. O motor roda no backend e lê o banco, não este formulário:
     ligar um cartão sem salvar e clicar em Simular produziria um relatório que contradiz a
     tela. `dirty` existe para avisar antes que isso aconteça. */
  const [persistido, setPersistido] = useState<Params | null>(null)
  const dirty = persistido !== null && JSON.stringify(p) !== JSON.stringify(persistido)

  /* execução manual do motor de datas (admin) */
  const [running,   setRunning]   = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [runError,  setRunError]  = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    void (async () => {
      const r = await pullSetting<Params>(KEY)
      /* `reajuste.automatico` do modelo antigo é descartado: era o gate global, hoje a
         decisão é da linha do contrato. Reaproveitá-lo como "pausado" herdaria um default
         como se fosse escolha de alguém. */
      const { enabled, dias } = { ...DEFAULT.reajuste, ...r?.reajuste }
      const merged: Params = r
        ? { ...DEFAULT, ...r, vigencia: { ...DEFAULT.vigencia, ...r.vigencia }, reajuste: { enabled, dias }, consumo: { ...DEFAULT.consumo, ...r.consumo }, reajustePausado: r.reajustePausado ?? false }
        : DEFAULT
      setP(merged)
      setPersistido(merged)
    })()
  }, [])

  const save = () => { pushSetting(KEY, p); setPersistido(p); setSaved(true); setTimeout(() => setSaved(false), 2000) }

  /** `dryRun` calcula tudo e não grava nada — serve para conferir o que o motor faria. */
  const runNow = async (dryRun = false) => {
    setRunning(true); setRunError(null); setRunResult(null)
    try {
      const res = await apiFetch(`/api/notifications/run${dryRun ? '?dryRun=1' : ''}`, { method: 'POST' })
      if (res.ok) {
        const r = await res.json() as RunResult
        setRunResult(r)
        /* o motor pode ter alterado contratos — quem está com um aberto precisa saber */
        if (!dryRun && (r.renovados || r.encerrados || r.reajustes)) emitContractsChanged()
      }
      else if (res.status === 403) setRunError('Apenas administradores podem executar o motor.')
      else setRunError(`Falha ao executar (${res.status}).`)
    } catch {
      setRunError('Não foi possível conectar ao servidor.')
    } finally {
      setRunning(false)
    }
  }

  if (!mounted) return null
  if (!isAdmin) return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-500" />
      <p className="mt-3 text-sm font-semibold">Acesso restrito</p>
      <p className="mt-1 text-xs text-muted-foreground">As regras de notificação são definidas pelo administrador do sistema.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Notificações</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Regras de alerta do sistema — aplicadas a todos os contratos da organização.</p>
        </div>
        <button onClick={save} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          {saved ? <><Check className="h-3.5 w-3.5" />Salvo</> : <><Save className="h-3.5 w-3.5" />Salvar</>}
        </button>
      </div>

      {/* Execução manual do motor de datas */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><Play className="h-4.5 w-4.5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Executar motor de datas agora</p>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => void runNow(true)} disabled={running}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                  <Eye className="h-3.5 w-3.5" />Simular
                </button>
                <button onClick={() => void runNow()} disabled={running}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed">
                  {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Executando...</> : <><Play className="h-3.5 w-3.5" />Executar agora</>}
                </button>
              </div>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Roda imediatamente a rotina que normalmente executa de madrugada: import dos índices (BCB), reajuste e renovação/encerramento automáticos e geração das notificações. <strong className="font-medium text-foreground">Simular</strong> calcula tudo e não grava nada — use sempre antes de executar.
            </p>
            {dirty && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                Há alterações não salvas. O motor lê os parâmetros <strong className="font-semibold">gravados</strong> — clique em <strong className="font-semibold">Salvar</strong> antes de simular ou executar, senão o relatório vai refletir a configuração antiga.
              </p>
            )}
            {runResult && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                {runResult.dryRun
                  ? <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400"><Eye className="h-3 w-3" />Ensaio — nada foi gravado</span>
                  : <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" />Concluído</span>}
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.reajustes} reajuste(s)</span>
                {runResult.pendentes?.length > 0 && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400">
                    {runResult.pendentes.length} reajuste(s) não aplicado(s)
                  </span>
                )}
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.renovados} renovado(s)</span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.encerrados} encerrado(s)</span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.notificacoes} notificação(ões) ativa(s)</span>
                {!runResult.dryRun && <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.resolvidas} resolvida(s)</span>}
                {!runResult.dryRun && <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.indices} índice(s) atualizado(s)</span>}
              </div>
            )}
            {runResult && runResult.detalhe?.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-md border">
                <div className="grid grid-cols-[7rem_5.5rem_5rem_4rem_1fr_1fr] gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Contrato</span><span>Competência</span><span>Índice</span><span>%</span><span>Ant. → novo</span><span>Parcelas</span>
                </div>
                <div className="divide-y divide-border/50">
                  {runResult.detalhe.map((d, i) => (
                    <div key={i} className="grid grid-cols-[7rem_5.5rem_5rem_4rem_1fr_1fr] items-center gap-2 px-3 py-1.5 text-[11px]">
                      <span className="truncate font-medium">{d.numero}</span>
                      <span className="tabular-nums">{mesAno(d.competencia)}</span>
                      <span className="truncate text-muted-foreground">{d.indice}</span>
                      <span className="tabular-nums">{d.percentual.toFixed(2).replace('.', ',')}%</span>
                      <span className="tabular-nums">
                        {d.base === 'parcela' ? `${BRL(d.parcelaAnterior)} → ${BRL(d.parcelaNova)}` : `${BRL(d.valorAnterior)} → ${BRL(d.valorNovo)}`}
                      </span>
                      <span className="text-muted-foreground">
                        {d.parcelasReajustadas} reprecificada(s)
                        {d.pagasAlcancadas > 0 && (
                          <span className="ml-1 text-amber-600 dark:text-amber-400" title="Parcelas já pagas alcançadas pela competência — a diferença NÃO é cobrada">
                            · {d.pagasAlcancadas} paga(s), {BRL(d.diferencaNaoCobrada)} não cobrado
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {runResult && runResult.pendentes?.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-md border border-amber-200 dark:border-amber-900">
                <div className="grid grid-cols-[7rem_5.5rem_5rem_4rem_1fr] gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                  <span>Contrato</span><span>Competência</span><span>Índice</span><span>%</span><span>Não aplicado porque</span>
                </div>
                <div className="divide-y divide-border/50">
                  {runResult.pendentes.map((d, i) => (
                    <div key={i} className="grid grid-cols-[7rem_5.5rem_5rem_4rem_1fr] items-center gap-2 px-3 py-1.5 text-[11px]">
                      <span className="truncate font-medium">{d.numero}</span>
                      <span className="tabular-nums">{mesAno(d.competencia)}</span>
                      <span className="truncate text-muted-foreground">{d.indice}</span>
                      <span className="tabular-nums text-muted-foreground">{d.percentual ? `${d.percentual.toFixed(2).replace('.', ',')}%` : '—'}</span>
                      <span>
                        {MOTIVO[d.motivo]?.texto ?? d.motivo}
                        {MOTIVO[d.motivo]?.acao && <span className="ml-1 text-muted-foreground">· {MOTIVO[d.motivo].acao}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {runError && <p className="mt-3 text-[11px] font-medium text-red-600 dark:text-red-400">{runError}</p>}
          </div>
        </div>
      </div>

      <Card icon={RotateCw} color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title="Renovação automática" desc="Ao vencer, contratos com ação 'Renovar' têm a vigência estendida pelo prazo definido em cada contrato (registrado no Histórico, sem gerar aditivo)."
        on={p.renovacaoAutomatica} onToggle={v => setP({ ...p, renovacaoAutomatica: v })} />

      <Card icon={CloudDownload} color="bg-rose-500/10 text-rose-600 dark:text-rose-400"
        title="Atualização automática de índices (BCB)" desc="Diariamente, importa do Banco Central a série mensal dos índices com Código SGS cadastrado. Desligue em ambientes sem internet (a tabela manual continua valendo)."
        on={p.indicesAutoImport} onToggle={v => setP({ ...p, indicesAutoImport: v })} />

      <Card icon={CalendarClock} color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        title="Alerta de vigência" desc="Notifica quando o término da vigência se aproxima. Informe as faixas de antecedência — quanto menor o prazo restante, mais crítico o alerta."
        on={p.vigencia.enabled} onToggle={v => setP({ ...p, vigencia: { ...p.vigencia, enabled: v } })}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Faixas de antecedência (dias):
          <input className={inputCls} defaultValue={p.vigencia.dias.join(', ')} onBlur={e => { const d = parseList(e.target.value); setP({ ...p, vigencia: { ...p.vigencia, dias: d.length ? d : DEFAULT.vigencia.dias } }) }} placeholder="60, 30, 7" />
        </label>
      </Card>

      <Card icon={RefreshCw} color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        title="Alerta de reajuste" desc="Notifica quando a data-base de um reajuste se aproxima (lembrete para aplicar manualmente)."
        on={p.reajuste.enabled} onToggle={v => setP({ ...p, reajuste: { ...p.reajuste, enabled: v } })}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Antecedência (dias):
          <input type="number" className={cn(inputCls, 'w-24')} value={p.reajuste.dias} onChange={e => setP({ ...p, reajuste: { ...p.reajuste, dias: Math.max(0, Number(e.target.value) || 0) } })} />
        </label>
      </Card>

      {/* FREIO, não configuração. Quem decide se um reajuste é automático é a linha do
          contrato. Este cartão nasce despausado e só deve ser tocado em emergência —
          por isso o rótulo é um verbo de exceção, e não um "ligar/desligar" que convide
          a ser confundido com o campo Aplicação do contrato. */}
      <Card icon={PauseCircle} color="bg-red-500/10 text-red-600 dark:text-red-400"
        title="Pausar motor de reajuste"
        desc="Freio de emergência: impede o motor de aplicar QUALQUER reajuste automático, em todos os contratos, sem precisar editá-los um a um. Use se um índice vier errado do BCB ou o motor se comportar de forma inesperada. Fora isso, mantenha despausado — quem autoriza cada reajuste é o campo Aplicação do contrato."
        on={p.reajustePausado} onToggle={v => setP({ ...p, reajustePausado: v })}>
        <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Motor pausado. Nenhum reajuste automático será aplicado enquanto isto estiver ligado — os avisos e as renovações continuam funcionando normalmente.
        </p>
      </Card>

      <Card icon={Gauge} color="bg-purple-500/10 text-purple-600 dark:text-purple-400"
        title="Alerta de consumo" desc="Notifica quando os lançamentos atingem um percentual do valor do contrato (despesas nos pagamentos, receitas nos recebimentos)."
        on={p.consumo.enabled} onToggle={v => setP({ ...p, consumo: { ...p.consumo, enabled: v } })}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Limites (%):
          <input className={inputCls} defaultValue={p.consumo.percentuais.join(', ')} onBlur={e => { const d = parseList(e.target.value); setP({ ...p, consumo: { ...p.consumo, percentuais: d.length ? d : DEFAULT.consumo.percentuais } }) }} placeholder="80, 100" />
        </label>
      </Card>
    </div>
  )
}
