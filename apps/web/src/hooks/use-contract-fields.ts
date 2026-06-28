'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pushSetting, hydrateSetting } from '@/lib/settings-store'

export type FieldType  = 'text' | 'number' | 'date' | 'time' | 'datetime' | 'currency' | 'checkbox' | 'select'
export type SectionKey = 'dados_gerais' | 'vigencia_valor'

export const SECTION_LABELS: Record<SectionKey, string> = {
  dados_gerais:    'Dados Gerais',
  vigencia_valor:  'Vigência e Valor',
}

export interface SelectOption { id: string; value: string; label: string }

export interface CustomField {
  id: string
  type: FieldType
  section: string
  name: string
  label: string
  maxLength?: number
  visible: 'form' | 'form_and_table'
  options?: SelectOption[]
}

const STORAGE_KEY  = 'nxt:fields:contratos'
const CHANGE_EVENT = 'nxt:fields:contratos:change'

function readStorage(): CustomField[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CustomField[]) : []
  } catch { return [] }
}

function writeStorage(fields: CustomField[]) {
  pushSetting(STORAGE_KEY, fields)
}

export function useContractFields() {
  const ref = useRef<CustomField[]>([])
  const [fields, setFieldsState] = useState<CustomField[]>([])

  const commit = useCallback((next: CustomField[]) => {
    ref.current = next
    writeStorage(next)
    setFieldsState(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  useEffect(() => {
    const initial = readStorage()
    ref.current = initial
    setFieldsState(initial)
    void hydrateSetting(STORAGE_KEY, CHANGE_EVENT)

    const handler = () => {
      const fresh = readStorage()
      ref.current = fresh
      setFieldsState(fresh)
    }
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  }, [])

  const addField = useCallback((field: CustomField) => {
    commit([...ref.current, field])
  }, [commit])

  const removeField = useCallback((id: string) => {
    commit(ref.current.filter(f => f.id !== id))
  }, [commit])

  const updateField = useCallback((id: string, updated: CustomField) => {
    commit(ref.current.map(f => f.id === id ? updated : f))
  }, [commit])

  const fieldsForSection = useCallback(
    (section: string) => fields.filter(f => f.section === section),
    [fields],
  )

  /* define a visibilidade na tabela de todos os campos personalizados */
  const setAllTableVisible = useCallback((visible: boolean) => {
    const next = ref.current.map(f => ({ ...f, visible: (visible ? 'form_and_table' : 'form') as CustomField['visible'] }))
    commit(next)
  }, [commit])

  return { fields, addField, removeField, updateField, fieldsForSection, setAllTableVisible }
}

/* ─── colunas padrão da tabela (visibilidade) ─────────────── */
/* sempre marcadas como "padrão"; o usuário pode ocultá-las da listagem,
   mas continuam disponíveis em filtros e exportação. */

export interface BaseColumn { key: string; label: string }

export const BASE_TABLE_COLUMNS: BaseColumn[] = [
  { key: 'numero',          label: 'Número'      },
  { key: 'titulo',          label: 'Título'      },
  { key: 'tipo',            label: 'Tipo'        },
  { key: 'parte_principal', label: 'Parte'       },
  { key: 'inicio',          label: 'Início'      },
  { key: 'termino',         label: 'Término'     },
  { key: 'valor_total',     label: 'Valor total' },
  { key: 'situacao',        label: 'Situação'    },
]

const BASECOL_KEY          = 'nxt:columns:contratos:hidden'
const BASECOL_CHANGE_EVENT = 'nxt:columns:contratos:hidden:change'
export const COLUMN_ORDER_RESET_EVENT = 'nxt:columns:contratos:order:reset'

function readHiddenBaseCols(): string[] {
  try { const raw = localStorage.getItem(BASECOL_KEY); return raw ? (JSON.parse(raw) as string[]) : [] } catch { return [] }
}
function writeHiddenBaseCols(keys: string[]) {
  pushSetting(BASECOL_KEY, keys)
}

export function useContractDefaultColumns() {
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    setHidden(readHiddenBaseCols())
    void hydrateSetting(BASECOL_KEY, BASECOL_CHANGE_EVENT)
    const handler = () => setHidden(readHiddenBaseCols())
    window.addEventListener(BASECOL_CHANGE_EVENT, handler)
    return () => window.removeEventListener(BASECOL_CHANGE_EVENT, handler)
  }, [])

  const isColumnVisible = useCallback((key: string): boolean => !hidden.includes(key), [hidden])

  const toggleColumn = useCallback((key: string) => {
    const cur  = readHiddenBaseCols()
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
    writeHiddenBaseCols(next); setHidden(next); window.dispatchEvent(new Event(BASECOL_CHANGE_EVENT))
  }, [])

  const setAllColumns = useCallback((visible: boolean) => {
    const next = visible ? [] : BASE_TABLE_COLUMNS.map(c => c.key)
    writeHiddenBaseCols(next); setHidden(next); window.dispatchEvent(new Event(BASECOL_CHANGE_EVENT))
  }, [])

  return { hiddenColumns: hidden, isColumnVisible, toggleColumn, setAllColumns }
}

/* ─── campos nativos do cadastro (configuráveis como coluna) ─── */
/* a chave do campo === a propriedade na linha da listagem (row[key]) */

export interface NativeField { key: string; label: string }

export const NATIVE_FIELDS: NativeField[] = [
  { key: 'documento',          label: 'CNPJ / CPF / Código'   },
  { key: 'papel',              label: 'Papel da parte'        },
  { key: 'data_assinatura',    label: 'Data de assinatura'    },
  { key: 'moeda',              label: 'Moeda'                 },
  { key: 'valor_parcela',      label: 'Valor da parcela'      },
  { key: 'condicao_pagamento', label: 'Condição de pagamento' },
]

const NATVIS_KEY   = 'nxt:fields:contratos:nativevis'
const NATVIS_EVENT = 'nxt:fields:contratos:nativevis:change'

function readNativeVis(): Record<string, boolean> {
  try { const raw = localStorage.getItem(NATVIS_KEY); return raw ? (JSON.parse(raw) as Record<string, boolean>) : {} } catch { return {} }
}
function writeNativeVis(v: Record<string, boolean>) {
  pushSetting(NATVIS_KEY, v)
}

export function useContractFieldVisibility() {
  const [vis, setVis] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setVis(readNativeVis())
    void hydrateSetting(NATVIS_KEY, NATVIS_EVENT)
    const handler = () => setVis(readNativeVis())
    window.addEventListener(NATVIS_EVENT, handler)
    return () => window.removeEventListener(NATVIS_EVENT, handler)
  }, [])

  const isVisibleInTable = useCallback((key: string): boolean => vis[key] ?? false, [vis])

  const setFieldVisibility = useCallback((key: string, visible: boolean) => {
    const next = { ...readNativeVis(), [key]: visible }
    writeNativeVis(next); setVis(next); window.dispatchEvent(new Event(NATVIS_EVENT))
  }, [])

  const setTableForKeys = useCallback((keys: string[], visible: boolean) => {
    const next = { ...readNativeVis() }
    keys.forEach(k => { next[k] = visible })
    writeNativeVis(next); setVis(next); window.dispatchEvent(new Event(NATVIS_EVENT))
  }, [])

  return { isVisibleInTable, setFieldVisibility, setTableForKeys }
}
