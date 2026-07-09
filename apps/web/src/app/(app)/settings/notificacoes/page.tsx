'use client'

import { useState, useEffect } from 'react'
import { CalendarClock, RefreshCw, Gauge, RotateCw, Save, ShieldAlert, Check, CloudDownload, Play, Loader2, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'
import { apiFetch } from '@/lib/http'
import { emitContractsChanged } from '@/lib/contract-events'

const KEY = 'nxt:settings:notificacoes'

interface Params {
  vigencia: { enabled: boolean; dias: number[] }
  reajuste: { enabled: boolean; dias: number; automatico: boolean }
  consumo:  { enabled: boolean; percentuais: number[] }
  renovacaoAutomatica: boolean
  indicesAutoImport: boolean
}
const DEFAULT: Params = {
  vigencia: { enabled: true, dias: [60, 30, 7] },
  reajuste: { enabled: true, dias: 15, automatico: false },
  consumo:  { enabled: true, percentuais: [80, 100] },
  renovacaoAutomatica: true,
  indicesAutoImport: true,
}

/** Resumo retornado por POST /api/notifications/run */
interface ReajusteAplicado {
  numero: string; indice: string; competencia: string; percentual: number; base: 'total' | 'parcela'
  valorAnterior: number; valorNovo: number; parcelaAnterior: number; parcelaNova: number
  parcelasReajustadas: number; pagasAlcancadas: number; diferencaNaoCobrada: number
}
interface RunResult {
  dryRun: boolean; indices: number; renovados: number; encerrados: number
  notificacoes: number; resolvidas: number; reajustes: number; detalhe: ReajusteAplicado[]
}
const BRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mesAno = (iso: string) => (iso ? iso.slice(0, 7).split('-').reverse().join('/') : '—')

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

  /* execução manual do motor de datas (admin) */
  const [running,   setRunning]   = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [runError,  setRunError]  = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    void (async () => { const r = await pullSetting<Params>(KEY); if (r) setP({ ...DEFAULT, ...r, vigencia: { ...DEFAULT.vigencia, ...r.vigencia }, reajuste: { ...DEFAULT.reajuste, ...r.reajuste }, consumo: { ...DEFAULT.consumo, ...r.consumo } }) })()
  }, [])

  const save = () => { pushSetting(KEY, p); setSaved(true); setTimeout(() => setSaved(false), 2000) }

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
              Roda imediatamente a rotina que normalmente executa de madrugada: import dos índices (BCB), reajuste e renovação/encerramento automáticos e geração das notificações. <strong className="font-medium text-foreground">Simular</strong> calcula tudo e não grava nada — use antes de ligar o reajuste automático.
            </p>
            {runResult && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                {runResult.dryRun
                  ? <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400"><Eye className="h-3 w-3" />Ensaio — nada foi gravado</span>
                  : <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" />Concluído</span>}
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{runResult.reajustes} reajuste(s)</span>
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

      <Card icon={Play} color="bg-teal-500/10 text-teal-600 dark:text-teal-400"
        title="Reajuste automático"
        desc="Quando a competência vence e o índice do período já está publicado, o motor aplica o reajuste e reprecifica as parcelas a vencer. Só age nas linhas marcadas como 'Automática' no contrato. Parcelas já pagas não são reprecificadas — a diferença vira um alerta."
        on={p.reajuste.automatico} onToggle={v => setP({ ...p, reajuste: { ...p.reajuste, automatico: v } })}>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          Ligar isto sobre uma base com contratos antigos aplica os reajustes represados de uma vez. Rode o ensaio (&quot;Simular&quot;) antes.
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
