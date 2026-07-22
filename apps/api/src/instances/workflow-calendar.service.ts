import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { addBusinessTime, DEFAULT_BUSINESS_CALENDAR, type BusinessCalendar } from '@nxt/workflow-core'

/** Chave do AppSetting (JSON por org) onde mora o calendário comercial. Sem tabela
 *  dedicada: expediente + feriados cabem no key-value que já existe. */
const KEY = 'workflow.businessCalendar'
/** Fuso padrão BRT (UTC-3): minutos a SOMAR ao UTC para obter o relógio de parede. */
const DEFAULT_TZ = -180

export interface StoredCalendar extends BusinessCalendar {
  /** Minutos a somar ao UTC para obter o relógio de parede da org. BRT = -180. */
  tzOffsetMinutes: number
}

const DEFAULT_STORED: StoredCalendar = { ...DEFAULT_BUSINESS_CALENDAR, tzOffsetMinutes: DEFAULT_TZ }

/** Calendário comercial da organização (expediente + feriados + fuso). Fonte do
 *  prazo (dueAt) em dias/horas úteis das tarefas. Guardado no AppSetting como JSON. */
@Injectable()
export class WorkflowCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lê o calendário da org (defaults quando ausente/parcial). */
  async get(organizationId: string): Promise<StoredCalendar> {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId: '', key: KEY } },
    })
    const v = (row?.value as unknown as Partial<StoredCalendar> | null) ?? null
    if (!v) return DEFAULT_STORED
    return {
      workdays: Array.isArray(v.workdays) && v.workdays.length ? v.workdays : DEFAULT_STORED.workdays,
      startMinute: typeof v.startMinute === 'number' ? v.startMinute : DEFAULT_STORED.startMinute,
      endMinute: typeof v.endMinute === 'number' ? v.endMinute : DEFAULT_STORED.endMinute,
      holidays: Array.isArray(v.holidays) ? v.holidays.filter((d): d is string => typeof d === 'string') : [],
      tzOffsetMinutes: typeof v.tzOffsetMinutes === 'number' ? v.tzOffsetMinutes : DEFAULT_TZ,
    }
  }

  /** Grava o calendário da org. */
  async put(organizationId: string, cal: StoredCalendar): Promise<StoredCalendar> {
    await this.prisma.appSetting.upsert({
      where: { organizationId_userId_key: { organizationId, userId: '', key: KEY } },
      create: { organizationId, userId: '', key: KEY, value: cal as never },
      update: { value: cal as never },
    })
    return cal
  }

  /** Instante-limite (dueAt) somando dias/horas úteis a `from`, aplicando o fuso da
   *  org (o cálculo puro opera em relógio de parede pelos componentes UTC do Date). */
  computeDue(from: Date, days: number, hours: number, cal: StoredCalendar): Date {
    const off = cal.tzOffsetMinutes ?? DEFAULT_TZ
    const wall = new Date(from.getTime() + off * 60_000)
    const dueWall = addBusinessTime(wall, days, hours, cal)
    return new Date(dueWall.getTime() - off * 60_000)
  }
}
