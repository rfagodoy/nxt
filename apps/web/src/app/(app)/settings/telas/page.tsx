'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Plus, LayoutTemplate, Search, Pencil, Trash2, Check, X, Star, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScreens, deleteScreen, saveScreen } from '@/hooks/use-screens'
import { buildNativeSeed } from '@/lib/screen-native-structure'
import { SUBJECT_LABELS, STATUS_LABELS, type Screen, type ScreenSubject, type ScreenStatus } from '@/lib/screen-types'

/** Tipos que têm tela padrão DO SISTEMA (cadastro base). */
const SYSTEM_SUBJECTS: ScreenSubject[] = ['FORNECEDOR', 'CONTRATO']

const STATUS_CLS: Record<string, string> = {
  ACTIVE:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  DRAFT:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
}
const SUBJECT_CLS: Record<string, string> = {
  FORNECEDOR: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  CONTRATO:   'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  GENERICA:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

export default function TelasPage() {
  const { screens, loading, reload } = useScreens()
  const [mounted, setMounted]       = useState(false)
  useEffect(() => setMounted(true), [])

  const [search, setSearch]     = useState('')
  const [subj,   setSubj]       = useState<'ALL' | ScreenSubject>('ALL')
  const [status, setStatus]     = useState<'ALL' | ScreenStatus>('ALL')
  const [confirming, setConfirming] = useState<string | null>(null)

  /* Garante as telas padrão do SISTEMA (Fornecedor + Contrato), pré-carregadas com toda a
     estrutura nativa. Criadas uma única vez se ainda não existirem. */
  const ensuredRef = useRef(false)
  useEffect(() => {
    if (loading || ensuredRef.current) return
    ensuredRef.current = true
    void (async () => {
      let created = false
      for (const subject of SYSTEM_SUBJECTS) {
        if (screens.some(s => s.isSystem && s.subjectType === subject)) continue
        const seed = buildNativeSeed(subject)
        const hasDefault = screens.some(s => s.subjectType === subject && s.isDefault)
        await saveScreen(null, {
          name: `Cadastro de ${SUBJECT_LABELS[subject]} (padrão do sistema)`,
          subjectType: subject, status: 'ACTIVE', isDefault: !hasDefault, isSystem: true,
          sections: seed.sections, fields: seed.fields,
        })
        created = true
      }
      if (created) void reload()
    })()
  }, [loading, screens, reload])

  const remove = async (id: string) => { await deleteScreen(id); setConfirming(null); void reload() }
  const custom = (s: Screen) => (s.fields ?? []).filter(f => f.source === 'CUSTOM').length

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return screens.filter(s =>
      (subj === 'ALL' || s.subjectType === subj) &&
      (status === 'ALL' || s.status === status) &&
      (!q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)),
    )
  }, [screens, search, subj, status])

  const selCls = 'h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10"><LayoutTemplate className="h-4 w-4 text-primary" /></div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Telas</h1>
            <p className="text-[11px] text-muted-foreground">Telas personalizadas, reutilizáveis por perfis de acesso e etapas de processo.</p>
          </div>
        </div>
        <Link href="/settings/telas/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />Nova tela
        </Link>
      </div>

      {/* toolbar */}
      {mounted && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome..."
              className="flex h-7 w-full rounded-md border border-input bg-background pl-7 pr-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors" />
          </div>
          <select value={subj} onChange={e => setSubj(e.target.value as typeof subj)} className={selCls}>
            <option value="ALL">Todos os tipos</option>
            {(Object.keys(SUBJECT_LABELS) as ScreenSubject[]).map(v => <option key={v} value={v}>{SUBJECT_LABELS[v]}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className={selCls}>
            <option value="ALL">Todas as situações</option>
            {(Object.keys(STATUS_LABELS) as ScreenStatus[]).map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}
          </select>
        </div>
      )}

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-13rem)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 [&_th]:bg-muted">
              <tr className="border-b">
                <th className="text-left px-4 py-1.5 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-32">Aplica-se a</th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-28">Situação</th>
                <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-20">Padrão</th>
                <th className="text-center px-3 py-1.5 font-medium text-muted-foreground w-24">Campos</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {screens.length === 0 ? 'Nenhuma tela criada. Clique em "Nova tela".' : 'Nenhuma tela para o filtro.'}
                </td></tr>
              ) : shown.map(s => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group/row">
                  <td className="px-4 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Link href={`/settings/telas/${s.id}`} className="font-medium hover:text-primary transition-colors">{s.name}</Link>
                      {s.isSystem && <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-slate-500/10 text-slate-600 dark:text-slate-300"><Lock className="h-2.5 w-2.5" />Sistema</span>}
                    </span>
                    {s.description && <p className="text-[11px] text-muted-foreground truncate max-w-md">{s.description}</p>}
                  </td>
                  <td className="px-3 py-1.5"><span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', SUBJECT_CLS[s.subjectType])}>{SUBJECT_LABELS[s.subjectType]}</span></td>
                  <td className="px-3 py-1.5"><span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_CLS[s.status])}>{STATUS_LABELS[s.status]}</span></td>
                  <td className="px-3 py-1.5 text-center">{s.isDefault ? <Star className="h-3.5 w-3.5 text-primary inline fill-primary" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-1.5 text-center text-muted-foreground tabular-nums">{custom(s)} pers.</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/settings/telas/${s.id}`} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover/row:opacity-100 transition-all"><Pencil className="h-3.5 w-3.5" /></Link>
                      {s.isSystem ? (
                        <span title="Tela do sistema — não pode ser excluída" className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground/40"><Lock className="h-3 w-3" /></span>
                      ) : confirming === s.id ? (
                        <>
                          <button onClick={() => void remove(s.id)} title="Confirmar" className="h-6 w-6 inline-flex items-center justify-center rounded text-destructive hover:bg-destructive/10"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirming(null)} title="Cancelar" className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <button onClick={() => setConfirming(s.id)} className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mounted && !loading && (
        <p className="text-[11px] text-muted-foreground text-center">{shown.length} tela{shown.length !== 1 ? 's' : ''}{shown.length !== screens.length ? ` de ${screens.length}` : ''}</p>
      )}
    </div>
  )
}
