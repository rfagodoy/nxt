'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, Users as UsersIcon, Plus, Trash2, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { getLogUser } from '@/hooks/use-partner-logs'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE, CLASS_COLOR } from '@/lib/unit-types'

export interface UnitUser { id: string; nome: string; email: string; papel: string }
export interface Unit {
  id: string; natureza: string; codigo?: string | null; nome: string
  responsavel?: string | null; status: string; usuarios?: UnitUser[]
  groupCompanyId?: string; childrenCount?: number
}

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const STATUS = [{ value: 'ATIVA', label: 'Ativa' }, { value: 'INATIVA', label: 'Inativa' }]
const alnum15 = (v: string) => v.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)
let _seq = 0
const newUser = (): UnitUser => ({ id: `u_${Date.now()}_${++_seq}`, nome: '', email: '', papel: '' })

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

/* Detalhe/edição da unidade na área de trabalho — Dados + Usuários (estrutura pronta p/ Histórico). */
export function UnitDetailView({ mode, unit, companyId, parentId, parentName, onClose, onSaved, onDirtyChange }: {
  mode: 'detail' | 'new'
  unit?: Unit
  companyId?: string
  parentId?: string | null
  parentName?: string | null
  onClose: () => void
  onSaved?: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const tipos = useLookupTable(TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE)
  const [tab, setTab] = useState<'dados' | 'usuarios'>('dados')

  const [nome,        setNome]        = useState(unit?.nome ?? '')
  const [codigo,      setCodigo]      = useState(unit?.codigo ?? '')
  const [natureza,    setNatureza]    = useState(unit?.natureza ?? '')
  const [responsavel, setResponsavel] = useState(unit?.responsavel ?? '')
  const [status,      setStatus]      = useState(unit?.status ?? 'ATIVA')
  const [usuarios,    setUsuarios]    = useState<UnitUser[]>(unit?.usuarios ?? [])
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const cleanRef = useRef('')

  const snap = () => JSON.stringify({ nome, codigo, natureza, responsavel, status, usuarios })

  /* tipo default quando a lookup carrega (novo) */
  useEffect(() => { if (!natureza && tipos.active.length) setNatureza(tipos.active[0].id) }, [tipos.active, natureza])

  /* detalhe: busca o registro completo (inclui usuários) */
  useEffect(() => {
    if (mode !== 'detail' || !unit) return
    let cancel = false
    void (async () => {
      try {
        const res = await apiFetch(`/api/org-units/${unit.id}`)
        if (!res.ok || cancel) return
        const u = await res.json() as Unit
        setNome(u.nome ?? ''); setCodigo(u.codigo ?? ''); setNatureza(u.natureza ?? '')
        setResponsavel(u.responsavel ?? ''); setStatus(u.status ?? 'ATIVA'); setUsuarios(u.usuarios ?? [])
        cleanRef.current = JSON.stringify({ nome: u.nome ?? '', codigo: u.codigo ?? '', natureza: u.natureza ?? '', responsavel: u.responsavel ?? '', status: u.status ?? 'ATIVA', usuarios: u.usuarios ?? [] })
      } catch { /* mantém o resumo da árvore */ }
    })()
    return () => { cancel = true }
  }, [mode, unit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* indicador de "não salvo" */
  useEffect(() => {
    if (cleanRef.current === '') { if (mode === 'new') cleanRef.current = snap(); else return }
    onDirtyChange?.(snap() !== cleanRef.current)
  }, [nome, codigo, natureza, responsavel, status, usuarios, onDirtyChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const addUser = () => setUsuarios(p => [...p, newUser()])
  const updUser = (id: string, k: keyof Omit<UnitUser, 'id'>, v: string) => setUsuarios(p => p.map(u => u.id === id ? { ...u, [k]: v } : u))
  const remUser = (id: string) => setUsuarios(p => p.filter(u => u.id !== id))

  const handleSave = async () => {
    if (!nome.trim()) { setSaveError('Informe o nome da unidade.'); setTab('dados'); return }
    setSaving(true); setSaveError(null)
    const body = {
      nome: nome.trim(), codigo: codigo?.trim() || undefined, natureza,
      responsavel: responsavel?.trim() || undefined, status,
      usuarios: usuarios.filter(u => u.nome.trim() || u.email.trim() || u.papel.trim()),
      user: getLogUser(),
    }
    try {
      const res = mode === 'detail' && unit
        ? await apiFetch(`/api/org-units/${unit.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch(`/api/org-units`, { method: 'POST', body: JSON.stringify({ groupCompanyId: companyId, parentId: parentId ?? undefined, ...body }) })
      if (!res.ok) { setSaveError(`Erro ao salvar (${res.status}).`); return }
      cleanRef.current = snap(); onDirtyChange?.(false); onSaved?.()
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    } finally {
      setSaving(false)
    }
  }

  const tipo = tipos.entries.find(t => t.id === natureza)
  const cls  = CLASS_COLOR[tipo?.classificacao ?? 'NEUTRO'] ?? CLASS_COLOR.NEUTRO

  return (
    <div className="space-y-3 pb-6">

      {/* cabeçalho de identidade */}
      <div className="rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-4 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate max-w-[460px]">{nome.trim() || (mode === 'new' ? 'Nova unidade' : 'Unidade')}</h2>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
              status === 'ATIVA' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>
              {status === 'ATIVA' ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            {codigo && <><span className="font-mono">{codigo}</span><span className="text-muted-foreground/40">·</span></>}
            <span className="inline-flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', cls.dot)} />{tipo?.label ?? '—'}</span>
            {parentName && <><span className="text-muted-foreground/40">·</span><span className="inline-flex items-center gap-1"><CornerDownRight className="h-3 w-3" />sob {parentName}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
            {saving ? 'Salvando...' : mode === 'new' ? 'Criar unidade' : 'Salvar'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">{saveError}</div>
      )}

      {/* sub-abas */}
      <div className="flex items-center gap-1 flex-wrap border-b pb-2">
        {([{ id: 'dados', label: 'Dados', icon: Building2 }, { id: 'usuarios', label: 'Usuários', icon: UsersIcon }] as const).map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
            {t.id === 'usuarios' && usuarios.length > 0 && <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{usuarios.length}</span>}
          </button>
        ))}
      </div>

      {/* Dados */}
      {tab === 'dados' && (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome" required span2><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da unidade" className={inputCls} autoFocus /></Field>
            <Field label="Código"><input value={codigo ?? ''} onChange={e => setCodigo(alnum15(e.target.value))} maxLength={15} placeholder="Alfanum. (até 15)" className={cn(inputCls, 'font-mono uppercase')} /></Field>
            <Field label="Tipo de unidade">
              <select value={natureza} onChange={e => setNatureza(e.target.value)} className={inputCls}>
                {natureza && !tipos.active.some(t => t.id === natureza) && <option value={natureza}>{tipo?.label ?? natureza}</option>}
                {tipos.active.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Responsável"><input value={responsavel ?? ''} onChange={e => setResponsavel(e.target.value)} placeholder="Responsável pela unidade" className={inputCls} /></Field>
            <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          </div>
        </div>
      )}

      {/* Usuários (lista livre) */}
      {tab === 'usuarios' && (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
          {usuarios.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum usuário envolvido. Adicione abaixo.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_10rem_1.5rem] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Nome</span><span>E-mail</span><span>Papel / Função</span><span />
              </div>
              {usuarios.map(u => (
                <div key={u.id} className="grid grid-cols-[1fr_1fr_10rem_1.5rem] gap-2 items-center">
                  <input value={u.nome} onChange={e => updUser(u.id, 'nome', e.target.value)} placeholder="Nome" className={inputCls} />
                  <input type="email" value={u.email} onChange={e => updUser(u.id, 'email', e.target.value)} placeholder="email@empresa.com" className={inputCls} />
                  <input value={u.papel} onChange={e => updUser(u.id, 'papel', e.target.value)} placeholder="Ex: Gestor" className={inputCls} />
                  <button type="button" onClick={() => remUser(u.id)} title="Remover" className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addUser} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="h-3.5 w-3.5" />Adicionar usuário</button>
        </div>
      )}
    </div>
  )
}
