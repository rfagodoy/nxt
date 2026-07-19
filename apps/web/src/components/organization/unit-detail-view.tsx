'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, UserCog, ChevronDown, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { getLogUser } from '@/hooks/use-partner-logs'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { TIPOS_UNIDADE_KEY, INIT_TIPOS_UNIDADE, CLASS_COLOR } from '@/lib/unit-types'
import { ResponsaveisSection } from '@/components/responsaveis/responsaveis-section'

export interface Unit {
  id: string; natureza: string; codigo?: string | null; nome: string
  responsavel?: string | null; status: string
  groupCompanyId?: string; childrenCount?: number
}

const inputCls = 'flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors'
const STATUS = [{ value: 'ATIVA', label: 'Ativa' }, { value: 'INATIVA', label: 'Inativa' }]
const alnum15 = (v: string) => v.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)

function Field({ label, required, span2, children }: { label: string; required?: boolean; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-0.5', span2 && 'col-span-2')}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

/* Seção accordion — mesmo chrome do cadastro de Parceiros/Empresas. */
function Section({ icon: Icon, title, isOpen, onToggle, hasError, children }: {
  icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  hasError?: boolean; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

/* Detalhe/edição da unidade — mesmo padrão das demais telas (seções accordion). */
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
  const [open, setOpen] = useState<Set<string>>(new Set(['dados', 'partes']))
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const [nome,      setNome]      = useState(unit?.nome ?? '')
  const [codigo,    setCodigo]    = useState(unit?.codigo ?? '')
  const [natureza,  setNatureza]  = useState(unit?.natureza ?? '')
  const [status,    setStatus]    = useState(unit?.status ?? 'ATIVA')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const cleanRef = useRef('')

  const snap = () => JSON.stringify({ nome, codigo, natureza, status })

  /* tipo default quando a lookup carrega (novo) */
  useEffect(() => { if (!natureza && tipos.active.length) setNatureza(tipos.active[0].id) }, [tipos.active, natureza])

  /* detalhe: busca o registro completo */
  useEffect(() => {
    if (mode !== 'detail' || !unit) return
    let cancel = false
    void (async () => {
      try {
        const res = await apiFetch(`/api/org-units/${unit.id}`)
        if (!res.ok || cancel) return
        const u = await res.json() as Unit
        setNome(u.nome ?? ''); setCodigo(u.codigo ?? ''); setNatureza(u.natureza ?? ''); setStatus(u.status ?? 'ATIVA')
        cleanRef.current = JSON.stringify({ nome: u.nome ?? '', codigo: u.codigo ?? '', natureza: u.natureza ?? '', status: u.status ?? 'ATIVA' })
      } catch { /* mantém o resumo da árvore */ }
    })()
    return () => { cancel = true }
  }, [mode, unit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* indicador de "não salvo" */
  useEffect(() => {
    if (cleanRef.current === '') { if (mode === 'new') cleanRef.current = snap(); else return }
    onDirtyChange?.(snap() !== cleanRef.current)
  }, [nome, codigo, natureza, status, onDirtyChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!nome.trim()) { setSaveError('Informe o nome da unidade.'); setOpen(prev => new Set(prev).add('dados')); return }
    setSaving(true); setSaveError(null)
    const body = { nome: nome.trim(), codigo: codigo?.trim() || undefined, natureza, status, user: getLogUser() }
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

      {/* Dados */}
      <Section icon={Building2} title="Dados" isOpen={open.has('dados')} onToggle={() => toggle('dados')} hasError={!!saveError && !nome.trim()}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" required span2><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da unidade" className={inputCls} autoFocus /></Field>
          <Field label="Código"><input value={codigo ?? ''} onChange={e => setCodigo(alnum15(e.target.value))} maxLength={15} placeholder="Alfanum. (até 15)" className={cn(inputCls, 'font-mono uppercase')} /></Field>
          <Field label="Tipo de unidade">
            <select value={natureza} onChange={e => setNatureza(e.target.value)} className={inputCls}>
              {natureza && !tipos.active.some(t => t.id === natureza) && <option value={natureza}>{tipo?.label ?? natureza}</option>}
              {tipos.active.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        </div>
      </Section>

      {/* Partes envolvidas (papel de pessoa → usuário) */}
      <Section icon={UserCog} title="Partes envolvidas" isOpen={open.has('partes')} onToggle={() => toggle('partes')}>
        <ResponsaveisSection entityType="UNIDADE" entityId={mode === 'detail' ? unit?.id : undefined} />
      </Section>
    </div>
  )
}
