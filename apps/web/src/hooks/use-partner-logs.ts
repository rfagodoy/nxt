'use client'

import { useState, useEffect, useCallback } from 'react'

export type LogEvent =
  | 'EM_CADASTRAMENTO'
  | 'ATIVADO'
  | 'INATIVADO'
  | 'REATIVADO'
  | 'CAMPO_ALTERADO'

export const LOG_EVENT_LABEL: Record<LogEvent, string> = {
  EM_CADASTRAMENTO: 'Em cadastramento',
  ATIVADO:          'Ativado',
  INATIVADO:        'Inativado',
  REATIVADO:        'Reativado',
  CAMPO_ALTERADO:   'Campo alterado',
}

export const LOG_EVENT_CLS: Record<LogEvent, string> = {
  EM_CADASTRAMENTO: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ATIVADO:          'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  INATIVADO:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  REATIVADO:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  CAMPO_ALTERADO:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

export interface LogChange {
  field:  string
  label:  string
  before: string
  after:  string
}

export interface LogEntry {
  id:          string
  ts:          string    // ISO timestamp
  user:        string
  event:       LogEvent
  description: string
  changes?:    LogChange[]
}

const storageKey = (partnerId: string) => `nxt:logs:parceiros:${partnerId}`

function readLogs(partnerId: string): LogEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(partnerId))
    return raw ? (JSON.parse(raw) as LogEntry[]) : []
  } catch { return [] }
}

function writeLogs(partnerId: string, entries: LogEntry[]) {
  try { localStorage.setItem(storageKey(partnerId), JSON.stringify(entries)) } catch {}
}

export function getLogUser(): string {
  try { return localStorage.getItem('nxt:user:name') ?? 'Usuário do sistema' } catch { return 'Usuário do sistema' }
}

export function addPartnerLog(partnerId: string, entry: Omit<LogEntry, 'id' | 'ts'>) {
  const current = readLogs(partnerId)
  const newEntry: LogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
  }
  writeLogs(partnerId, [...current, newEntry])
}

export function usePartnerLogs(partnerId: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])

  const refresh = useCallback(() => {
    if (partnerId) setLogs(readLogs(partnerId))
  }, [partnerId])

  useEffect(() => { refresh() }, [refresh])

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    if (!partnerId) return
    addPartnerLog(partnerId, entry)
    setLogs(readLogs(partnerId))
  }, [partnerId])

  return { logs, addLog, refresh }
}
