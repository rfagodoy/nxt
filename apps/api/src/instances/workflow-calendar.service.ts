import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import {
  addBusinessTime, businessMinutesBetween, workdayMinutes, isBusinessDay,
  nationalHolidaysBR, DEFAULT_BUSINESS_CALENDAR, type BusinessCalendar,
} from '@nxt/workflow-core'

/** Chave do AppSetting (JSON por org) onde mora o calendário comercial. Sem tabela
 *  dedicada: expediente + feriados cabem no key-value que já existe. */
const KEY = 'workflow.businessCalendar'
/** Fuso padrão BRT (UTC-3): minutos a SOMAR ao UTC para obter o relógio de parede. */
const DEFAULT_TZ = -180

/** Um dia não útil, com nome e origem. O motor só precisa da data (`holidays`), mas
 *  a tela precisa saber o QUE é cada dia — sem isso, o usuário olha uma lista de
 *  datas sem nome e não sabe o que pode remover. */
export interface CalendarDay {
  /** 'YYYY-MM-DD' */
  date: string
  name: string
  /** NACIONAL = veio do cálculo; os demais o usuário cadastrou */
  kind: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL' | 'EMENDA' | 'FOLGA'
}

export interface StoredCalendar extends BusinessCalendar {
  /** Minutos a somar ao UTC para obter o relógio de parede da org. BRT = -180. */
  tzOffsetMinutes: number
  /** Dias não úteis com nome/tipo. `holidays` (do motor) é derivado daqui. */
  days: CalendarDay[]
}

const DEFAULT_STORED: StoredCalendar = { ...DEFAULT_BUSINESS_CALENDAR, tzOffsetMinutes: DEFAULT_TZ, days: [] }

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Calendário comercial da organização (expediente + intervalo + feriados + fuso).
 *  Fonte do prazo (dueAt) em dias/horas úteis das tarefas. Guardado no AppSetting. */
@Injectable()
export class WorkflowCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lê o calendário da org (defaults quando ausente/parcial).
   *  Retrocompatível: instalação antiga guardava só `holidays: string[]` sem nome —
   *  esses dias viram entradas "Feriado" do tipo FOLGA em vez de sumirem da tela. */
  async get(organizationId: string): Promise<StoredCalendar> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key: KEY } },
    })
    const v = (row?.value as unknown as Partial<StoredCalendar> | null) ?? null
    if (!v) return DEFAULT_STORED

    const days: CalendarDay[] = Array.isArray(v.days)
      ? v.days.filter((d): d is CalendarDay => !!d && isDate(d.date))
      : (Array.isArray(v.holidays) ? v.holidays.filter(isDate).map((date) => ({ date, name: 'Feriado', kind: 'FOLGA' as const })) : [])

    const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
    return {
      workdays: Array.isArray(v.workdays) && v.workdays.length ? v.workdays : DEFAULT_STORED.workdays,
      startMinute: num(v.startMinute, DEFAULT_STORED.startMinute),
      endMinute: num(v.endMinute, DEFAULT_STORED.endMinute),
      breakStartMinute: typeof v.breakStartMinute === 'number' ? v.breakStartMinute : null,
      breakEndMinute: typeof v.breakEndMinute === 'number' ? v.breakEndMinute : null,
      // o motor lê daqui; a lista NOMEADA (`days`) é a fonte
      holidays: days.map((d) => d.date),
      tzOffsetMinutes: num(v.tzOffsetMinutes, DEFAULT_TZ),
      days,
    }
  }

  /** Grava o calendário da org, normalizando: dias ordenados, sem repetição, e
   *  `holidays` sempre derivado de `days` (uma fonte só — se as duas listas
   *  pudessem divergir, a tela mostraria um calendário e o motor usaria outro). */
  async put(organizationId: string, cal: Partial<StoredCalendar>): Promise<StoredCalendar> {
    const dedup = new Map<string, CalendarDay>()
    for (const d of cal.days ?? []) {
      if (isDate(d?.date)) dedup.set(d.date, { date: d.date, name: (d.name || 'Dia não útil').slice(0, 120), kind: d.kind ?? 'FOLGA' })
    }
    const days = [...dedup.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

    const clamp = (v: unknown, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(24 * 60, Math.max(0, Math.round(n))) : fallback
    }
    const startMinute = clamp(cal.startMinute, DEFAULT_STORED.startMinute)
    const endMinute = clamp(cal.endMinute, DEFAULT_STORED.endMinute)
    const temIntervalo = cal.breakStartMinute != null && cal.breakEndMinute != null

    const normalizado: StoredCalendar = {
      workdays: Array.isArray(cal.workdays) && cal.workdays.length
        ? [...new Set(cal.workdays.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
        : DEFAULT_STORED.workdays,
      startMinute,
      endMinute: endMinute > startMinute ? endMinute : DEFAULT_STORED.endMinute,
      breakStartMinute: temIntervalo ? clamp(cal.breakStartMinute, 12 * 60) : null,
      breakEndMinute: temIntervalo ? clamp(cal.breakEndMinute, 13 * 60) : null,
      tzOffsetMinutes: typeof cal.tzOffsetMinutes === 'number' ? cal.tzOffsetMinutes : DEFAULT_TZ,
      days,
      holidays: days.map((d) => d.date),
    }

    await this.prisma.appSetting.upsert({
      where: { organizationId_userId_key: { organizationId, userId: '', key: KEY } },
      create: { organizationId, userId: '', key: KEY, value: normalizado as never },
      update: { value: normalizado as never },
    })
    return normalizado
  }

  /** Feriados nacionais do ano que AINDA não estão no calendário — a tela mostra
   *  quais entrariam antes de o usuário confirmar a carga. */
  async missingNationalHolidays(organizationId: string, year: number): Promise<CalendarDay[]> {
    const cal = await this.get(organizationId)
    const jaTem = new Set(cal.days.map((d) => d.date))
    return nationalHolidaysBR(year)
      .filter((h) => !jaTem.has(h.date))
      .map((h) => ({ date: h.date, name: h.name, kind: 'NACIONAL' as const }))
  }

  /** Resumo do ano para a tela: quantos dias úteis sobram e quanto vale um dia. */
  summary(cal: StoredCalendar, year: number) {
    let uteis = 0
    const cursor = new Date(Date.UTC(year, 0, 1))
    while (cursor.getUTCFullYear() === year) {
      if (isBusinessDay(cursor, cal)) uteis++
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return {
      year,
      diasUteis: uteis,
      minutosPorDia: workdayMinutes(cal),
      naoUteis: cal.days.filter((d) => d.date.startsWith(String(year))).length,
    }
  }

  /** Instante-limite (dueAt) somando dias/horas úteis a `from`, aplicando o fuso da
   *  org (o cálculo puro opera em relógio de parede pelos componentes UTC do Date). */
  computeDue(from: Date, days: number, hours: number, cal: StoredCalendar): Date {
    const off = cal.tzOffsetMinutes ?? DEFAULT_TZ
    const wall = new Date(from.getTime() + off * 60_000)
    const dueWall = addBusinessTime(wall, days, hours, cal)
    return new Date(dueWall.getTime() - off * 60_000)
  }

  /** Minutos ÚTEIS entre dois instantes (0 quando `to` já passou). Os dois lados são
   *  levados ao relógio de parede da org antes da conta — é o expediente local que
   *  decide o que conta como tempo de trabalho. */
  businessMinutesUntil(from: Date, to: Date, cal: StoredCalendar): number {
    const off = cal.tzOffsetMinutes ?? DEFAULT_TZ
    return businessMinutesBetween(
      new Date(from.getTime() + off * 60_000),
      new Date(to.getTime() + off * 60_000),
      cal,
    )
  }
}
