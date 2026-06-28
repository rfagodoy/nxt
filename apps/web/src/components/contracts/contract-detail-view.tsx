'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Users, Calendar, Banknote, TrendingUp, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields, ReajustesFields, PartesFields, DocumentosFields } from '@/components/contracts/contract-fields'
import { emptyContractForm, contractFromApi, contractToPayload, effectiveSituacao, normalizeSituacao, TIPOS_KEY, INIT_TIPOS } from '@/lib/contract-options'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { EntitySearchModal } from '@/components/contracts/entity-search-modal'
import { getLogUser } from '@/hooks/use-partner-logs'

/* ─── linha da listagem (espelha o toRow() do backend) — compartilhada com a página ─── */
export interface Row {
  id: string
  numero: string
  titulo: string
  tipo: string
  parte_principal: string
  inicio: string
  termino: string | null
  valor_total: number
  situacao: string
  documento: string
  papel: string
  data_assinatura: string
  moeda: string
  valor_parcela: number
  condicao_pagamento: string
  objeto?: string[]
  contratante_nome?: string; contratante_doc?: string
  contratada_nome?: string;  contratada_doc?: string
}

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export const SIT_CLS: Record<string, string> = {
  EM_CADASTRO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  VIGENTE:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  VENCIDO:     'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ENCERRADO:   'bg-muted text-muted-foreground',
  RESCINDIDO:  'bg-red-500/10 text-red-600 dark:text-red-400',
}
export const SIT_LABEL: Record<string, string> = {
  EM_CADASTRO: 'Em cadastro/revisão', VIGENTE: 'Vigente', VENCIDO: 'Vencido',
  ENCERRADO: 'Encerrado', RESCINDIDO: 'Rescindido',
}
export const SIT_DOT_CLS: Record<string, string> = {
  EM_CADASTRO: 'bg-blue-500 animate-pulse',
  VIGENTE:     'bg-emerald-500',
  VENCIDO:     'bg-amber-500',
  ENCERRADO:   'bg-muted-foreground/50',
  RESCINDIDO:  'bg-red-500',
}

/* painel de aba: só renderiza quando a aba está ativa */
export function DSection({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null
  return <div className="rounded-lg border bg-card p-4 space-y-3">{children}</div>
}

/* ══════════════════════════════════════════════════════════════ */
export function ContractDetailView({ row, onClose, onSaved, onDirtyChange }: { row: Row; onClose: () => void; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const form = useContractForm({
    ...emptyContractForm(),
    numero: row.numero, titulo: row.titulo, tipo: row.tipo, situacao: normalizeSituacao(row.situacao),
    valorTotal: String(row.valor_total ?? ''), objeto: row.objeto ?? [],
  })
  const v = form.values
  const router  = useRouter()
  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string } | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(`/api/group-companies`)
        if (res.ok) {
          const data = await res.json() as { rows: { id: string; razaoSocial: string; nomeFantasia?: string | null; cnpj?: string | null }[] }
          setEmpresas((data.rows ?? []).map(c => ({ id: c.id, nome: c.nomeFantasia || c.razaoSocial, documento: c.cnpj ?? '' })))
        }
      } catch {}
    })()
  }, [])

  const [tab,          setTab]          = useState<string>('dados_gerais')
  const [showMotivo,   setShowMotivo]   = useState(false)
  const [motivoAction, setMotivoAction] = useState('')
  const [motivo,       setMotivo]       = useState('')
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const cleanRef = useRef('')  // snapshot "limpo" para detectar edição não salva

  /* carrega o registro completo (a Row da listagem é só um resumo) */
  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const res = await apiFetch(`/api/contracts/${row.id}`)
        if (!res.ok || cancel) return
        const c = await res.json() as Record<string, unknown>
        const full = contractFromApi(c)
        form.setValues(full)
        cleanRef.current = JSON.stringify(full)
      } catch { /* mantém o fallback vindo da Row */ }
    })()
    return () => { cancel = true }
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* reporta "não salvo" comparando o estado atual com o snapshot limpo */
  useEffect(() => {
    onDirtyChange?.(cleanRef.current !== '' && JSON.stringify(v) !== cleanRef.current)
  }, [v, onDirtyChange])

  /* estado persistido (EM_CADASTRO | VIGENTE | ENCERRADO | RESCINDIDO) e situação exibida (resolve VENCIDO) */
  const stored = normalizeSituacao(v.situacao)
  const sit    = effectiveSituacao(v.situacao, v.prazoIndeterminado ? '' : v.terminoVigencia)
  const locked = stored !== 'EM_CADASTRO'

  /* o contrato guarda o ID do tipo (resolução ao vivo); exibir o RÓTULO, não o id */
  const tipos     = useLookupTable(TIPOS_KEY, INIT_TIPOS)
  const tipoLabel = tipos.entries.find(t => t.id === v.tipo)?.label ?? v.tipo

  const sectionTabs = [
    { id: 'dados_gerais', label: 'Dados Gerais',      icon: FileText },
    { id: 'partes',       label: 'Partes',            icon: Users },
    { id: 'vigencia',     label: 'Vigência',          icon: Calendar },
    { id: 'valor',        label: 'Valor e Pagamento', icon: Banknote },
    { id: 'reajuste',     label: 'Reajuste',          icon: TrendingUp },
    { id: 'documentos',   label: 'Documentos',        icon: Paperclip },
  ]

  const handleSave = async (statusOverride?: string, motivoTexto?: string) => {
    setSaving(true); setSaveError(null)
    const nextSit = statusOverride ?? v.situacao
    try {
      const res = await apiFetch(`/api/contracts/${row.id}`, {
        method: 'PATCH',
        body:   JSON.stringify(contractToPayload({ ...v, situacao: nextSit }, { user: getLogUser(), motivo: motivoTexto })),
      })
      if (res.ok) { if (statusOverride) form.set('situacao', statusOverride); cleanRef.current = JSON.stringify({ ...v, situacao: nextSit }); onDirtyChange?.(false); onSaved?.() }
      else setSaveError(`Erro ao salvar contrato (${res.status}).`)
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    } finally {
      setSaving(false)
    }
  }

  const confirmAction = () => {
    const map: Record<string, string> = { revisao: 'EM_CADASTRO', encerrar: 'ENCERRADO', rescindir: 'RESCINDIDO' }
    const newStatus   = map[motivoAction]
    const motivoTexto = motivo.trim()
    setShowMotivo(false); setMotivo(''); setMotivoAction('')
    if (newStatus) void handleSave(newStatus, motivoTexto)
  }

  const motivoLabels: Record<string, string> = {
    revisao:   'Motivo da abertura para revisão',
    encerrar:  'Motivo do encerramento',
    rescindir: 'Motivo da rescisão',
  }

  return (
    <div className="space-y-3 pb-6">

      {/* cabeçalho de identidade */}
      <div className="rounded-xl border bg-card px-4 py-3 flex items-start justify-between gap-4 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate max-w-[460px]">{v.titulo || row.titulo || 'Sem título'}</h2>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', SIT_CLS[sit])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', SIT_DOT_CLS[sit] ?? 'bg-muted-foreground/50')} />
              {SIT_LABEL[sit]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-mono">{v.numero}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{tipoLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>

          {stored === 'EM_CADASTRO' && !showMotivo && (
            <>
              <button type="button" onClick={() => { void handleSave() }} disabled={saving}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => { void handleSave('VIGENTE') }} disabled={saving}
                className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {saving ? 'Salvando...' : 'Ativar'}
              </button>
            </>
          )}

          {stored === 'VIGENTE' && !showMotivo && (
            <>
              <button type="button" onClick={() => { setMotivoAction('revisao'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">
                Abrir para revisão
              </button>
              <button type="button" onClick={() => { setMotivoAction('encerrar'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-gray-300 text-gray-600 px-3 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                Encerrar
              </button>
              <button type="button" onClick={() => { setMotivoAction('rescindir'); setShowMotivo(true) }}
                className="inline-flex items-center h-7 rounded-md border border-red-200 text-red-600 px-3 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                Rescindir
              </button>
            </>
          )}

          {(stored === 'ENCERRADO' || stored === 'RESCINDIDO') && !showMotivo && (
            <button type="button" onClick={() => { setMotivoAction('revisao'); setShowMotivo(true) }}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              Abrir para revisão
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
          {saveError}
        </div>
      )}

      {showMotivo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{motivoLabels[motivoAction]}</p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder="Descreva o motivo..." autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setShowMotivo(false); setMotivo('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={confirmAction} disabled={!motivo.trim()}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Confirmar</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap border-b pb-2">
        {sectionTabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      <form className="space-y-2" onSubmit={e => e.preventDefault()}>
        <DSection active={tab === 'dados_gerais'}><IdentificacaoFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'partes'}>
          <PartesFields form={form} ro={locked}
            onOpenSearch={(parteId, origem) => setSearchModal({ parteId, origem })}
            onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')} />
        </DSection>
        <DSection active={tab === 'vigencia'}><VigenciaFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'valor'}><ValoresFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'reajuste'}><ReajustesFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'documentos'}><DocumentosFields form={form} ro={locked} /></DSection>
      </form>

      {searchModal && (
        <EntitySearchModal
          origem={searchModal.origem}
          empresas={empresas}
          onSelect={(e) => { form.setParteEntity(searchModal.parteId, e); setSearchModal(null) }}
          onClose={() => setSearchModal(null)}
          onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')}
        />
      )}
    </div>
  )
}
