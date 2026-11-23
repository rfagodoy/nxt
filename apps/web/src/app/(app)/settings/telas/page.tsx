'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LayoutTemplate, Search, Star, Lock } from 'lucide-react'
import { DENS_CEL, DENS_CAB, DENS_TABELA } from '@/lib/densidade'
import { cn } from '@/lib/utils'
import { SELO } from '@/components/list/selo'
import { Indicadores } from '@/components/list/indicadores'
import { MenuDeAcoes } from '@/components/list/menu-de-acoes'
import { useScreens, deleteScreen, duplicateScreen, saveScreen, useUsoDasTelas, dicaDoUso } from '@/hooks/use-screens'
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
  /* "Usada em" (PO, 23/11/2026): workflows que abrem cada tela */
  const uso = useUsoDasTelas()
  const [mounted, setMounted]       = useState(false)
  useEffect(() => setMounted(true), [])

  const [search, setSearch]     = useState('')
  const [subj,   setSubj]       = useState<'ALL' | ScreenSubject>('ALL')
  const [status, setStatus]     = useState<'ALL' | ScreenStatus>('ALL')
  /* Indicadores no topo, como nas outras listas: o clique filtra. */
  const [indicador, setIndicador] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)
  const router = useRouter()

  /* Garante as telas padrão do SISTEMA (Parceiro + Contrato), pré-carregadas com toda a
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

  const remove = async (id: string) => { await deleteScreen(id); void reload() }
  /* Duplicar leva direto para a cópia: quem duplica quer mexer nela agora. */
  const duplicar = async (id: string) => {
    if (duplicando) return
    setDuplicando(id)
    /* `finally`: sem ele, uma falha deixava `duplicando` preso e o botão desabilitado
       até recarregar a página. */
    try {
      const nova = await duplicateScreen(id)
      if (nova) { router.push(`/settings/telas/${nova.id}`); return }
      void reload()
    } finally {
      setDuplicando(null)
    }
  }
  const custom = (s: Screen) => (s.fields ?? []).filter(f => f.source === 'CUSTOM').length

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return screens.filter(s =>
      (subj === 'ALL' || s.subjectType === subj) &&
      (status === 'ALL' || s.status === status) &&
      (!indicador || (indicador === 'CONSULTA' ? s.readOnly : indicador === 'DRAFT' ? s.status === 'DRAFT' : s.subjectType === indicador)) &&
      (!q || s.name.toLowerCase().includes(q) || (s.code ?? '').toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)),
    )
  }, [screens, search, subj, status, indicador])

  const selCls = 'h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <div className="space-y-3">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou código..."
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

      {mounted && !loading && (
        <Indicadores className="grid-cols-2 sm:grid-cols-5" ativo={indicador} onSelect={setIndicador} itens={[
          { label: 'Total', valor: screens.length, cls: 'text-foreground', filtro: null },
          { label: 'Contrato', valor: screens.filter((s) => s.subjectType === 'CONTRATO').length, cls: 'text-purple-600 dark:text-purple-400', filtro: 'CONTRATO' },
          { label: 'Parceiro', valor: screens.filter((s) => s.subjectType === 'FORNECEDOR').length, cls: 'text-teal-600 dark:text-teal-400', filtro: 'FORNECEDOR' },
          { label: 'Somente consulta', valor: screens.filter((s) => s.readOnly).length, cls: 'text-amber-600 dark:text-amber-400', filtro: 'CONSULTA' },
          { label: 'Rascunho', valor: screens.filter((s) => s.status === 'DRAFT').length, cls: 'text-blue-600 dark:text-blue-400', filtro: 'DRAFT' },
        ]} />
      )}

      {/* tabela */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto rolagem-visivel max-h-[calc(100vh-13rem)]">
          <table className={cn('w-full', DENS_TABELA)}>
            <thead className="sticky top-0 z-10 [&_th]:bg-muted">
              <tr className="border-b">
                <th className={'text-left ' + DENS_CAB + ' font-medium text-muted-foreground w-32'}>Código</th>
                <th className={'text-left ' + DENS_CAB + ' font-medium text-muted-foreground'}>Nome</th>
                <th className={'text-left ' + DENS_CAB + ' font-medium text-muted-foreground w-32'}>Aplica-se a</th>
                <th className={'text-left ' + DENS_CAB + ' font-medium text-muted-foreground w-28'}>Situação</th>
                <th className={'text-center ' + DENS_CAB + ' font-medium text-muted-foreground w-20'}>Padrão</th>
                <th className={'text-left ' + DENS_CAB + ' font-medium text-muted-foreground w-40 whitespace-nowrap'}>Usada em</th>
                <th className={'text-center ' + DENS_CAB + ' font-medium text-muted-foreground w-24'}>Campos</th>
                <th className={'text-right ' + DENS_CAB + ' font-medium text-muted-foreground w-28'}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  {screens.length === 0 ? 'Nenhuma tela criada. Clique em "Nova tela".' : 'Nenhuma tela para o filtro.'}
                </td></tr>
              ) : shown.map(s => (
                <tr key={s.id} onClick={() => router.push(`/settings/telas/${s.id}`)} title="Abrir a tela"
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors group/row cursor-pointer">
                  <td className={cn(DENS_CEL, 'whitespace-nowrap font-mono text-[11px] text-muted-foreground')}>{s.code ?? '—'}</td>
                  <td className={DENS_CEL}>
                    {/* Fluxo de texto, não flex: a etiqueta é parte da frase e tem de seguir a
                        ÚLTIMA palavra do nome. Em flex com `items-center`, um nome que quebra em
                        duas linhas deixava a etiqueta boiando no meio da altura da linha. */}
                    <div className="celula-2l">
                      <span className="block">
                        <Link href={`/settings/telas/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary transition-colors">{s.name}</Link>
                        {s.isSystem && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-slate-500/10 text-slate-600 dark:text-slate-300"><Lock className="h-2.5 w-2.5" />Sistema</span>}
                        {s.readOnly && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400" title="Nenhum campo é editável e nada é gravado por esta tela"><Lock className="h-2.5 w-2.5" />Somente consulta</span>}
                      </span>
                      {s.description && <p className="text-[11px] text-muted-foreground truncate max-w-md">{s.description}</p>}
                    </div>
                  </td>
                  <td className={DENS_CEL}><span className={cn(SELO, SUBJECT_CLS[s.subjectType])}>{SUBJECT_LABELS[s.subjectType]}</span></td>
                  <td className={DENS_CEL}><span className={cn(SELO, STATUS_CLS[s.status])}>{STATUS_LABELS[s.status]}</span></td>
                  <td className={cn(DENS_CEL, 'text-center')}>{s.isDefault ? <Star className="h-3.5 w-3.5 text-primary inline fill-primary" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className={DENS_CEL}>
                    {(() => {
                      const lista = uso?.[s.id] ?? []
                      if (!uso) return <span className="text-muted-foreground">…</span>
                      if (!lista.length) return <span className="text-muted-foreground" title="Nenhum workflow usa esta tela">—</span>
                      return <span title={dicaDoUso(lista)} className="whitespace-nowrap">{lista.length === 1 ? lista[0].workflow : `${lista.length} workflows`}</span>
                    })()}
                  </td>
                  <td className={cn(DENS_CEL, 'text-center text-muted-foreground tabular-nums')}>{custom(s)} pers.</td>
                  <td className={cn(DENS_CEL, 'cursor-default')} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/settings/telas/${s.id}`} className="inline-flex h-[var(--lista-acao)] items-center rounded-md border px-2 text-[11px] font-medium hover:bg-muted transition-colors">Editar</Link>
                      <MenuDeAcoes rotulo={`Mais ações da tela ${s.name}`} acoes={[
                        { rotulo: duplicando === s.id ? 'Duplicando…' : 'Duplicar', onClick: () => void duplicar(s.id), desabilitada: !!duplicando },
                        s.isSystem
                          ? { rotulo: 'Excluir', onClick: () => {}, perigo: true, desabilitada: true, motivo: 'tela do sistema' }
                          : uso?.[s.id]?.length
                            ? { rotulo: 'Excluir', onClick: () => {}, perigo: true, desabilitada: true, motivo: 'usada em workflow' }
                            : { rotulo: 'Excluir', onClick: () => void remove(s.id), perigo: true, confirmar: 'Confirmar exclusão' },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mounted && !loading && (
          <div className="flex items-center gap-3 border-t px-3 py-1.5 bg-muted/20 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{shown.length} tela{shown.length !== 1 ? 's' : ''}</span>
            {shown.length !== screens.length && <span className="tabular-nums">de {screens.length}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
