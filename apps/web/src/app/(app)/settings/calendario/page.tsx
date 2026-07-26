'use client'

/* Calendário comercial: expediente, intervalo e dias não úteis do ano.
   É este calendário que define o prazo de cada atividade do workflow — "2 dias
   úteis" só significa alguma coisa depois que alguém disse quais dias são úteis.

   A grade do ano inteiro existe porque calendário é informação espacial: numa lista
   de datas ninguém percebe que emendou a quinta e esqueceu a sexta. Clicar no dia
   marca/desmarca. */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarDays, Loader2, Save, Check, Download, Trash2, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, apiJson } from '@/lib/http'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-context'

type Kind = 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'EMENDA' | 'FOLGA'
interface Day { date: string; name: string; kind: Kind }
interface Calendar {
  workdays: number[]
  startMinute: number
  endMinute: number
  breakStartMinute: number | null
  breakEndMinute: number | null
  tzOffsetMinutes: number
  days: Day[]
  holidays: string[]
}
interface Summary { year: number; diasUteis: number; minutosPorDia: number; naoUteis: number }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const KIND_LABEL: Record<Kind, string> = {
  NACIONAL: 'Feriado nacional', ESTADUAL: 'Feriado estadual', MUNICIPAL: 'Feriado municipal',
  EMENDA: 'Emenda', FOLGA: 'Folga',
}
const KIND_CLS: Record<Kind, string> = {
  NACIONAL: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  ESTADUAL: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  MUNICIPAL: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  EMENDA:    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  FOLGA:     'bg-muted text-muted-foreground',
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const fmtBR = (s: string) => s.split('-').reverse().join('/')

/** Um mês da grade anual. Dia não útil aparece pintado pelo tipo; dia fora do
 *  expediente semanal (fim de semana, na configuração padrão) fica apagado. */
function Month({ year, month, workdays, byDate, onToggle }: {
  year: number; month: number; workdays: number[]
  byDate: Map<string, Day>; onToggle: (date: string) => void
}) {
  const primeiro = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const celulas: (number | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]

  return (
    <div className="rounded-lg border bg-card p-2">
      <p className="text-[11px] font-semibold text-center mb-1">{MESES[month]}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {DIAS.map((d) => <span key={d} className="text-[9px] text-muted-foreground text-center">{d[0]}</span>)}
        {celulas.map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />
          const date = iso(year, month, dia)
          const marcado = byDate.get(date)
          const semanal = workdays.includes(new Date(Date.UTC(year, month, dia)).getUTCDay())
          return (
            <button
              key={date} type="button" onClick={() => onToggle(date)}
              title={marcado ? `${marcado.name} (${KIND_LABEL[marcado.kind]})` : semanal ? 'Dia útil — clique para marcar como não útil' : 'Fora do expediente semanal'}
              className={cn(
                'h-6 rounded text-[10px] tabular-nums transition-colors',
                marcado ? cn('font-semibold', KIND_CLS[marcado.kind])
                  : semanal ? 'hover:bg-muted text-foreground'
                  : 'text-muted-foreground/40 hover:bg-muted/50',
              )}
            >
              {dia}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarioPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [cal, setCal] = useState<Calendar | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingHolidays, setLoadingHolidays] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await apiJson<{ calendar: Calendar; summary: Summary }>(`/api/workflow-calendar?year=${year}`)
    if (data) { setCal(data.calendar); setSummary(data.summary) }
  }, [year])
  useEffect(() => { void load() }, [load])

  const byDate = useMemo(() => new Map((cal?.days ?? []).map((d) => [d.date, d])), [cal])
  const doAno = useMemo(
    () => (cal?.days ?? []).filter((d) => d.date.startsWith(String(year))),
    [cal, year],
  )

  const patch = (p: Partial<Calendar>) => setCal((c) => (c ? { ...c, ...p } : c))

  /* Clique no dia: marca como FOLGA (ou EMENDA, quando o dia está encostado num
     feriado — é exatamente esse o caso da ponte) e desmarca se já estiver marcado. */
  const toggleDay = (date: string) => {
    if (!cal) return
    if (byDate.has(date)) {
      patch({ days: cal.days.filter((d) => d.date !== date) })
      return
    }
    const vizinho = (delta: number) => {
      const d = new Date(`${date}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + delta)
      return byDate.has(d.toISOString().slice(0, 10))
    }
    const ehEmenda = vizinho(-1) || vizinho(1)
    patch({ days: [...cal.days, { date, name: ehEmenda ? 'Emenda de feriado' : 'Folga', kind: ehEmenda ? 'EMENDA' : 'FOLGA' }] })
  }

  const carregarFeriados = async () => {
    setLoadingHolidays(true); setAviso(null)
    try {
      const faltantes = await apiJson<Day[]>(`/api/workflow-calendar/national-holidays?year=${year}`)
      if (!faltantes?.length) { setAviso(`Os feriados nacionais de ${year} já estão no calendário.`); return }
      patch({ days: [...(cal?.days ?? []), ...faltantes] })
      setAviso(`${faltantes.length} feriado(s) nacional(is) de ${year} adicionados — salve para valer.`)
    } finally { setLoadingHolidays(false) }
  }

  const save = async () => {
    if (!cal) return
    setSaving(true); setAviso(null)
    try {
      const res = await apiFetch(`/api/workflow-calendar?year=${year}`, { method: 'PUT', body: JSON.stringify(cal) })
      if (!res.ok) { setAviso('Não foi possível salvar o calendário.'); return }
      const data = await res.json() as { calendar: Calendar; summary: Summary }
      setCal(data.calendar); setSummary(data.summary)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  if (!cal) {
    return <div className="flex items-center justify-center py-16 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando calendário…</div>
  }

  const temIntervalo = cal.breakStartMinute != null && cal.breakEndMinute != null
  /* Calculado AQUI, não no resumo do servidor: o resumo só muda depois de salvar, e
     quem acabou de ligar o intervalo precisa ver o dia útil encurtar na hora — senão
     parece que a configuração não pegou. Mesma regra do núcleo (`dayWindows`). */
  const minutosDia = (() => {
    const { startMinute: ini, endMinute: fim, breakStartMinute: bi, breakEndMinute: bf } = cal
    if (fim <= ini) return 0
    const intervaloValido = bi != null && bf != null && bf > bi && bi > ini && bf < fim
    return (fim - ini) - (intervaloValido ? bf - bi : 0)
  })()
  const horasDia = (minutosDia / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Calendário comercial</h1>
          <p className="text-[11px] text-muted-foreground">Define o que conta como tempo útil nos prazos das atividades do workflow</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Salvo' : 'Salvar'}
          </Button>
        )}
      </div>

      {aviso && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-[12px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">{aviso}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: `Dias úteis em ${year}`, value: summary?.diasUteis ?? '—', cls: 'text-foreground' },
          { label: 'Horas por dia útil', value: horasDia, cls: 'text-primary' },
          { label: `Dias não úteis em ${year}`, value: doAno.length, cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Dias da semana', value: cal.workdays.length, cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between shadow-sm">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('text-sm font-bold tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Expediente */}
      <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Expediente</h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {DIAS.map((d, i) => (
            <button key={d} type="button" disabled={!isAdmin}
              onClick={() => patch({ workdays: cal.workdays.includes(i) ? cal.workdays.filter((x) => x !== i) : [...cal.workdays, i].sort() })}
              className={cn('h-7 px-3 rounded-md border text-xs font-medium transition-colors disabled:opacity-60',
                cal.workdays.includes(i) ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground hover:bg-muted')}>
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Das
            <input type="time" disabled={!isAdmin} value={hhmm(cal.startMinute)} onChange={(e) => patch({ startMinute: toMin(e.target.value) })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            às
            <input type="time" disabled={!isAdmin} value={hhmm(cal.endMinute)} onChange={(e) => patch({ endMinute: toMin(e.target.value) })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" disabled={!isAdmin} className="h-3.5 w-3.5 accent-primary" checked={temIntervalo}
              onChange={(e) => patch(e.target.checked
                ? { breakStartMinute: 12 * 60, breakEndMinute: 13 * 60 }
                : { breakStartMinute: null, breakEndMinute: null })} />
            Intervalo
          </label>
          {temIntervalo && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="time" disabled={!isAdmin} value={hhmm(cal.breakStartMinute!)} onChange={(e) => patch({ breakStartMinute: toMin(e.target.value) })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              às
              <input type="time" disabled={!isAdmin} value={hhmm(cal.breakEndMinute!)} onChange={(e) => patch({ breakEndMinute: toMin(e.target.value) })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </label>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Um &quot;dia útil&quot; de prazo vale <span className="font-medium text-foreground">{horasDia}h</span> —
          é a conta que o motor usa para transformar &quot;2 dias úteis&quot; numa data.
        </p>
      </section>

      {/* Ano */}
      <section className="rounded-xl border bg-card p-4 shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Dias não úteis</h2>
            <div className="flex items-center gap-1 ml-2">
              <button type="button" onClick={() => setYear((y) => y - 1)} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="text-xs font-semibold tabular-nums w-10 text-center">{year}</span>
              <button type="button" onClick={() => setYear((y) => y + 1)} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={carregarFeriados} disabled={loadingHolidays}>
              {loadingHolidays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Carregar feriados nacionais de {year}
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid gap-3 lg:grid-cols-[1fr_18rem]">
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 content-start">
            {Array.from({ length: 12 }, (_, m) => (
              <Month key={m} year={year} month={m} workdays={cal.workdays} byDate={byDate}
                onToggle={isAdmin ? toggleDay : () => {}} />
            ))}
          </div>

          <div className="rounded-lg border bg-muted/20 overflow-hidden flex flex-col min-h-0">
            <p className="px-3 py-2 text-[11px] font-medium text-muted-foreground border-b">
              {doAno.length} dia(s) não útil(eis) em {year}
            </p>
            <ul className="divide-y overflow-y-auto">
              {doAno.length === 0 && <li className="px-3 py-4 text-center text-[11px] text-muted-foreground">Nenhum dia marcado. Clique num dia da grade ou carregue os feriados nacionais.</li>}
              {doAno.map((d) => (
                <li key={d.date} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                  <span className="tabular-nums text-muted-foreground w-16 shrink-0">{fmtBR(d.date)}</span>
                  <span className="flex-1 min-w-0 truncate" title={d.name}>{d.name}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0', KIND_CLS[d.kind])}>{KIND_LABEL[d.kind]}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => toggleDay(d.date)} title="Remover" className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
