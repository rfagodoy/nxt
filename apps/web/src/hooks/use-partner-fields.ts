'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { pushSetting, hydrateSetting } from '@/lib/settings-store'

export type FieldType  = 'text' | 'number' | 'date' | 'time' | 'datetime' | 'currency' | 'checkbox' | 'select'
export type SectionKey = 'identificacao' | 'contato' | 'endereco' | 'bancario'

export const SECTION_LABELS: Record<SectionKey, string> = {
  identificacao: 'Identificação',
  contato:       'Contato',
  endereco:      'Endereço',
  bancario:      'Dados Bancários',
}

export interface SelectOption { id: string; value: string; label: string }

export interface CustomField {
  id: string
  type: FieldType
  section: string
  name: string
  label: string
  maxLength?: number
  visible: 'form' | 'table' | 'both' | 'none'
  options?: SelectOption[]
}

/* ─── campos nativos ─────────────────────────────────────── */

export interface NativeField {
  key:      string
  label:    string
  section:  string
  hint?:    string
}

export const NATIVE_FIELDS: NativeField[] = [
  // Identificação
  { key: 'cnpj',            section: 'identificacao', label: 'CNPJ',                hint: 'PJ Brasileira'    },
  { key: 'cpf',             section: 'identificacao', label: 'CPF',                 hint: 'PF Brasileira'    },
  { key: 'codigo',          section: 'identificacao', label: 'Código / Documento',  hint: 'Estrangeiras'     },
  { key: 'razao_social',    section: 'identificacao', label: 'Razão Social / Nome'                           },
  { key: 'nome_fantasia',   section: 'identificacao', label: 'Nome Fantasia',       hint: 'Somente PJ'       },
  { key: 'data_abertura',   section: 'identificacao', label: 'Data de Abertura',    hint: 'Somente PJ'       },
  { key: 'natureza_juridica', section: 'identificacao', label: 'Natureza Jurídica', hint: 'Somente PJ'       },
  { key: 'ie',              section: 'identificacao', label: 'Inscrição Estadual',  hint: 'PJ Brasileira'    },
  { key: 'im',              section: 'identificacao', label: 'Inscrição Municipal', hint: 'PJ Brasileira'    },
  { key: 'rg',              section: 'identificacao', label: 'RG',                  hint: 'PF Brasileira'    },
  { key: 'orgao_expedidor', section: 'identificacao', label: 'Órgão Expedidor',     hint: 'PF Brasileira'    },
  { key: 'data_nascimento', section: 'identificacao', label: 'Data de Nascimento',  hint: 'Pessoa Física'    },
  { key: 'pais_origem',     section: 'identificacao', label: 'País de Origem',      hint: 'Estrangeiras'     },
  // CNAE
  { key: 'cnae_principal',    section: 'cnae', label: 'CNAE Principal',     hint: 'Somente PJ'  },
  { key: 'cnaes_secundarios', section: 'cnae', label: 'CNAEs Secundários',  hint: 'Somente PJ · quantidade'  },
  // Contato
  { key: 'con_email',       section: 'contato',       label: 'E-mail'                                        },
  { key: 'con_nome',        section: 'contato',       label: 'Nome do Contato'                               },
  { key: 'con_telefone',    section: 'contato',       label: 'Telefone'                                      },
  { key: 'con_celular',     section: 'contato',       label: 'Celular / WhatsApp'                            },
  { key: 'con_cargo',       section: 'contato',       label: 'Cargo do Contato'                              },
  { key: 'con_website',     section: 'contato',       label: 'Website',              hint: 'Somente PJ'      },
  // Endereço
  { key: 'end_cep',         section: 'endereco',      label: 'CEP',                  hint: 'Endereço BR'     },
  { key: 'end_estado',      section: 'endereco',      label: 'Estado / UF'                                   },
  { key: 'end_logradouro',  section: 'endereco',      label: 'Logradouro',           hint: 'Endereço BR'     },
  { key: 'end_numero',      section: 'endereco',      label: 'Número',               hint: 'Endereço BR'     },
  { key: 'end_complemento', section: 'endereco',      label: 'Complemento',          hint: 'Endereço BR'     },
  { key: 'end_bairro',      section: 'endereco',      label: 'Bairro',               hint: 'Endereço BR'     },
  { key: 'end_cidade',      section: 'endereco',      label: 'Cidade'                                        },
  { key: 'end_address1',    section: 'endereco',      label: 'Endereço — Linha 1',   hint: 'Endereço EST'    },
  { key: 'end_address2',    section: 'endereco',      label: 'Endereço — Linha 2',   hint: 'Endereço EST'    },
  { key: 'end_pais',        section: 'endereco',      label: 'País',                 hint: 'Endereço EST'    },
  // Bancário
  { key: 'ban_banco',       section: 'bancario',      label: 'Banco'                                         },
  { key: 'ban_tipo_conta',  section: 'bancario',      label: 'Tipo de Conta'                                 },
  { key: 'ban_agencia',     section: 'bancario',      label: 'Agência'                                       },
  { key: 'ban_conta',       section: 'bancario',      label: 'Conta'                                         },
  { key: 'ban_pix',         section: 'bancario',      label: 'Chave PIX'                                     },
  // Sócios
  { key: 'soc_nome',        section: 'socios',        label: 'Nome do Sócio'                                 },
  { key: 'soc_documento',   section: 'socios',        label: 'CPF / Documento'                               },
  { key: 'soc_participacao',section: 'socios',        label: 'Participação %'                                },
  { key: 'soc_cargo',       section: 'socios',        label: 'Cargo / Função'                                },
]

/* conjunto de chaves de campos nativos — usado para forçar visibilidade no formulário */
const NATIVE_FIELD_KEYS = new Set(NATIVE_FIELDS.map(f => f.key))

/* campos nativos já representados nas colunas padrão da tabela (marcados como "padrão") */
export const CORE_TABLE_KEYS = new Set([
  'razao_social', 'cnpj', 'cpf', 'codigo', 'end_cidade', 'end_estado', 'con_nome',
])

/* ─── colunas padrão da tabela ───────────────────────────── */
/* sempre marcadas como "padrão"; o usuário pode ocultá-las da listagem,
   mas elas continuam disponíveis em filtros e exportação. */

export interface BaseColumn {
  key: string
  label: string
  section: string     // seção onde a coluna padrão é exibida na tela de Configurações
  coreKeys: string[]  // campos nativos que esta coluna representa (excluídos da lista da seção)
}

export const BASE_TABLE_COLUMNS: BaseColumn[] = [
  { key: 'nome',          label: 'Nome / Razão Social', section: 'identificacao', coreKeys: ['razao_social']          },
  { key: 'categoria',     label: 'Categoria',           section: 'identificacao', coreKeys: []                        },
  { key: 'identificador', label: 'Identificador',       section: 'identificacao', coreKeys: ['cnpj', 'cpf', 'codigo'] },
  { key: 'status',        label: 'Status',              section: 'identificacao', coreKeys: []                        },
  { key: 'cidade',        label: 'Localização',         section: 'endereco',      coreKeys: ['end_cidade', 'end_estado'] },
  { key: 'contato',       label: 'Contato',             section: 'contato',       coreKeys: ['con_nome']              },
]

const BASECOL_KEY          = 'nxt:columns:parceiros:hidden'
const BASECOL_CHANGE_EVENT = 'nxt:columns:parceiros:hidden:change'

/* evento de reset da ordem das colunas (a ordem em si é gerida pela página) */
export const COLUMN_ORDER_RESET_EVENT = 'nxt:columns:parceiros:order:reset'

function readHiddenBaseCols(): string[] {
  try {
    const raw = localStorage.getItem(BASECOL_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function writeHiddenBaseCols(keys: string[]) {
  pushSetting(BASECOL_KEY, keys)
}

export function useDefaultColumns() {
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
    writeHiddenBaseCols(next)
    setHidden(next)
    window.dispatchEvent(new Event(BASECOL_CHANGE_EVENT))
  }, [])

  /* define todas as colunas padrão como visíveis (true) ou ocultas (false) */
  const setAllColumns = useCallback((visible: boolean) => {
    const next = visible ? [] : BASE_TABLE_COLUMNS.map(c => c.key)
    writeHiddenBaseCols(next)
    setHidden(next)
    window.dispatchEvent(new Event(BASECOL_CHANGE_EVENT))
  }, [])

  return { hiddenColumns: hidden, isColumnVisible, toggleColumn, setAllColumns }
}

/* ─── custom fields hook ─────────────────────────────────── */

const STORAGE_KEY  = 'nxt:fields:parceiros'
const CHANGE_EVENT = 'nxt:fields:parceiros:change'

function migrateVisible(v: string): CustomField['visible'] {
  if (v === 'form_and_table') return 'both'
  if (v === 'form' || v === 'table' || v === 'both' || v === 'none') return v
  return 'form'
}

function readStorage(): CustomField[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomField[]
    return parsed.map(f => ({ ...f, visible: migrateVisible(f.visible as string) }))
  } catch { return [] }
}

function writeStorage(fields: CustomField[]) {
  pushSetting(STORAGE_KEY, fields)
}

export function usePartnerFields() {
  const ref   = useRef<CustomField[]>([])
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

  /* define a visibilidade na tabela de todos os campos personalizados (preserva o form) */
  const setAllTableVisible = useCallback((visible: boolean) => {
    const next = ref.current.map(f => {
      const inForm = f.visible === 'form' || f.visible === 'both'
      const v: CustomField['visible'] =
        inForm && visible ? 'both' : visible ? 'table' : inForm ? 'form' : 'none'
      return { ...f, visible: v }
    })
    commit(next)
  }, [commit])

  return { fields, addField, removeField, updateField, fieldsForSection, setAllTableVisible }
}

/* ─── field visibility hook ──────────────────────────────── */

export interface FieldVisibility { form: boolean; table: boolean }

const VIS_KEY          = 'nxt:fields:parceiros:visibility'
const VIS_CHANGE_EVENT = 'nxt:fields:parceiros:visibility:change'
const LEGACY_HIDDEN    = 'nxt:fields:parceiros:hidden'

function readVisibility(): Record<string, FieldVisibility> {
  try {
    const raw = localStorage.getItem(VIS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, FieldVisibility>
    /* migração do modelo antigo (Set de hidden) */
    const oldRaw = localStorage.getItem(LEGACY_HIDDEN)
    const hiddenSet = new Set<string>(oldRaw ? (JSON.parse(oldRaw) as string[]) : [])
    const migrated: Record<string, FieldVisibility> = {}
    hiddenSet.forEach(k => { migrated[k] = { form: false, table: false } })
    return migrated
  } catch { return {} }
}

function writeVisibility(vis: Record<string, FieldVisibility>) {
  pushSetting(VIS_KEY, vis)
}

export function useFieldVisibility() {
  const [visibility, setVis] = useState<Record<string, FieldVisibility>>({})

  useEffect(() => {
    setVis(readVisibility())
    void hydrateSetting(VIS_KEY, VIS_CHANGE_EVENT)
    const handler = () => setVis(readVisibility())
    window.addEventListener(VIS_CHANGE_EVENT, handler)
    return () => window.removeEventListener(VIS_CHANGE_EVENT, handler)
  }, [])

  const setFieldVisibility = useCallback((key: string, patch: Partial<FieldVisibility>) => {
    const current = readVisibility()
    const prev    = current[key] ?? { form: true, table: false }
    const next    = { ...current, [key]: { ...prev, ...patch } }
    writeVisibility(next)
    setVis(next)
    window.dispatchEvent(new Event(VIS_CHANGE_EVENT))
  }, [])

  /* define a visibilidade na tabela de vários campos de uma vez (preserva o form) */
  const setTableForKeys = useCallback((keys: string[], visible: boolean) => {
    const current = readVisibility()
    const next    = { ...current }
    keys.forEach(k => { next[k] = { form: current[k]?.form ?? true, table: visible } })
    writeVisibility(next)
    setVis(next)
    window.dispatchEvent(new Event(VIS_CHANGE_EVENT))
  }, [])

  /* Campos nativos SEMPRE aparecem no formulário. O toggle de visibilidade "form"
     dos campos nativos foi removido da UI ativa (o SettingsDrawer só controla a
     coluna/tabela); então um valor antigo `{ form: false }` ainda no cache/localStorage
     — ex.: o herdado de `nome_fantasia` — esconderia o campo permanentemente, sem o
     usuário ter como reverter. Ignorar a flag para chaves nativas elimina essa armadilha
     e mantém cadastro e edição consistentes. (A visibilidade de campos personalizados
     continua respeitada normalmente.) */
  const isVisibleInForm  = useCallback((key: string): boolean =>
    NATIVE_FIELD_KEYS.has(key) ? true : (visibility[key]?.form ?? true), [visibility])

  const isVisibleInTable = useCallback((key: string): boolean =>
    visibility[key]?.table ?? false, [visibility])

  /* backward compat — usado em partner-new-form */
  const isVisible        = isVisibleInForm
  const toggleVisibility = useCallback((key: string) => {
    const cur = readVisibility()[key] ?? { form: true, table: false }
    setFieldVisibility(key, { form: !cur.form })
  }, [setFieldVisibility])

  return { visibility, setFieldVisibility, setTableForKeys, isVisibleInForm, isVisibleInTable, isVisible, toggleVisibility }
}
