'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Users, Calendar, Banknote, TrendingUp, TrendingDown, RefreshCw, Paperclip, FilePlus2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { CONTRACTS_CHANGED_EVENT } from '@/lib/contract-events'
import { useScreens, getScreenValues, putScreenValues } from '@/hooks/use-screens'
import { pickDefaultScreen, resolveContractSections } from '@/lib/screen-contract-layout'
import { reconcileNative } from '@/lib/screen-native-structure'
import type { Screen } from '@/lib/screen-types'
import { ContractSectionNative, ContractCustomFields } from '@/components/contracts/contract-screen-body'
import { useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields, ReajustesFields, PartesFields, DocumentosFields, LancamentosFields, AditivosFields } from '@/components/contracts/contract-fields'
import { emptyContractForm, contractFromApi, contractToPayload, effectiveSituacao, normalizeSituacao, temPagamentos, temRecebimentos, terminoVigente, validateContract, validateLancamentos, TIPOS_KEY, INIT_TIPOS, type CAditivo } from '@/lib/contract-options'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { PAPEIS_KEY, INIT_PAPEIS, validatePartes } from '@/lib/contract-roles'
import { EntitySearchModal } from '@/components/contracts/entity-search-modal'
import { ContractHistory } from '@/components/contracts/contract-history'
import { getLogUser } from '@/hooks/use-partner-logs'
import { SaveStatus } from '@/components/save-status'

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
  return <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">{children}</div>
}

/* ══════════════════════════════════════════════════════════════ */
export function ContractDetailView({ row, onClose, onSaved, onDirtyChange, screen }: { row: Row; onClose: () => void; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void; screen?: Screen }) {
  const form = useContractForm({
    ...emptyContractForm(),
    numero: row.numero, titulo: row.titulo, tipo: row.tipo, situacao: normalizeSituacao(row.situacao),
    valorTotal: String(row.valor_total ?? ''), objeto: row.objeto ?? [],
  })
  const v = form.values
  const router  = useRouter()
  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string; excludeIds: string[] } | null>(null)
  const [cessaoSearch, setCessaoSearch] = useState<{ aditivoId: string; cessaoId: string; origem: string } | null>(null)
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
  const [staleAviso,   setStaleAviso]   = useState(false)  // motor alterou o contrato e há edição não salva
  const [dirty,        setDirtyLocal]   = useState(false)  // há edição não salva (para o selo de estado)
  const [justSaved,    setJustSaved]    = useState(false)  // "Salvo" verde por instantes após salvar
  const [auditVersion, setAuditVersion] = useState(0)      // muda a cada save → recarrega a aba Histórico
  const cleanRef = useRef('')  // snapshot "limpo" para detectar edição não salva

  /* R3 — a tela padrão (isDefault/ACTIVE) dirige as abas/seções e captura campos
     personalizados persistidos (via /api/screen-values). Sem tela → abas nativas (fallback). */
  const { screens } = useScreens('CONTRATO')
  const defaultScreen  = useMemo(() => screen ? reconcileNative(screen) : pickDefaultScreen(screens), [screen, screens])
  const screenDriven   = !!defaultScreen
  const screenSections = useMemo(
    () => defaultScreen ? resolveContractSections(defaultScreen, v.natureza, 'detail') : [],
    [defaultScreen, v.natureza],
  )
  const [screenValues, setScreenValues] = useState<Record<string, string>>({})
  const [screenClean,  setScreenClean]  = useState('{}')
  const screenDirty = JSON.stringify(screenValues) !== screenClean
  const onScreenChange = (fieldId: string, value: string) => setScreenValues(p => ({ ...p, [fieldId]: value }))
  /* carrega os valores personalizados ligados a este contrato */
  useEffect(() => {
    void (async () => {
      const vals = await getScreenValues('CONTRACT', row.id)
      const map: Record<string, string> = {}
      vals.forEach(x => { map[x.fieldId] = x.value })
      setScreenValues(map)
      setScreenClean(JSON.stringify(map))
    })()
  }, [row.id])

  /* carrega o registro completo (a Row da listagem é só um resumo) */
  const recarregar = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/contracts/${row.id}`)
      if (!res.ok) return
      const c = await res.json() as Record<string, unknown>
      const full = contractFromApi(c)
      form.setValues(full)
      cleanRef.current = JSON.stringify(full)
      setStaleAviso(false)
    } catch { /* mantém o fallback vindo da Row */ }
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void recarregar() }, [recarregar])

  /* o motor de datas roda no servidor e pode renovar/encerrar este contrato.
     Sem edição pendente, recarrega em silêncio; com edição, avisa — nunca descarta. */
  useEffect(() => {
    const handler = () => {
      const sujo = cleanRef.current !== '' && JSON.stringify(form.values) !== cleanRef.current
      if (sujo) setStaleAviso(true)
      else void recarregar()
    }
    window.addEventListener(CONTRACTS_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CONTRACTS_CHANGED_EVENT, handler)
  }) // sem deps: o handler precisa enxergar o form.values do render atual

  /* reporta "não salvo" comparando o estado atual com o snapshot limpo — para a aba (workspace)
     e para o selo de estado no cabeçalho */
  useEffect(() => {
    const d = (cleanRef.current !== '' && JSON.stringify(v) !== cleanRef.current) || screenDirty
    setDirtyLocal(d)
    onDirtyChange?.(d)
  }, [v, onDirtyChange, screenDirty])
  /* aba ativa sempre aponta para uma seção existente da tela (evita aba "morta") */
  useEffect(() => {
    if (screenDriven && screenSections.length && !screenSections.some(s => s.key === tab)) setTab(screenSections[0].key)
  }, [screenDriven, screenSections, tab])
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(t)
  }, [justSaved])

  /* estado persistido (EM_CADASTRO | VIGENTE | ENCERRADO | RESCINDIDO) e situação exibida (resolve VENCIDO) */
  const stored = normalizeSituacao(v.situacao)
  /* situação considera o término VIGENTE (com aditivos): prorrogou → não fica "Vencido" */
  const sit    = effectiveSituacao(v.situacao, v.prazoIndeterminado ? '' : terminoVigente(v))
  const locked = stored !== 'EM_CADASTRO'

  /* o contrato guarda o ID do tipo (resolução ao vivo); exibir o RÓTULO, não o id */
  const tipos     = useLookupTable(TIPOS_KEY, INIT_TIPOS)
  const tipoLabel = tipos.entries.find(t => t.id === v.tipo)?.label ?? v.tipo
  const papeis    = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)

  const sectionTabs = [
    { id: 'dados_gerais', label: 'Dados Gerais',      icon: FileText },
    { id: 'partes',       label: 'Partes envolvidas', icon: Users },
    { id: 'vigencia',     label: 'Vigência',          icon: Calendar },
    { id: 'valor',        label: 'Valor e Pagamento', icon: Banknote },
    ...(temPagamentos(v.natureza)   ? [{ id: 'pagamentos',   label: 'Pagamentos',   icon: TrendingDown }] : []),
    ...(temRecebimentos(v.natureza) ? [{ id: 'recebimentos', label: 'Recebimentos', icon: TrendingUp }]   : []),
    { id: 'reajuste',     label: 'Reajuste',          icon: RefreshCw },
    { id: 'aditivos',     label: 'Aditivos',          icon: FilePlus2 },
    { id: 'documentos',   label: 'Documentos',        icon: Paperclip },
    { id: 'historico',    label: 'Histórico',         icon: Clock },
  ]
  /* abas: a tela padrão manda (ordem/rótulos/quais aparecem); sem tela → abas nativas.
     "Responsáveis" (pessoas por papel) é aba fixa, fora da tela customizável. */
  const tabs = screenDriven ? screenSections.map(s => ({ id: s.key, label: s.label, icon: s.icon })) : sectionTabs

  const handleSave = async (statusOverride?: string, motivoTexto?: string, aditivosOverride?: CAditivo[]) => {
    /* A obrigatoriedade da data de assinatura é validada na ATIVAÇÃO de cada aditivo
       (validarAtivacao em AditivosFields). Não bloqueamos o save/transição do contrato:
       um rascunho pode ficar incompleto, e um aditivo ATIVO sem data só existe por legado. */
    const isAditivoOp  = aditivosOverride !== undefined
    const isPlainSave  = statusOverride === undefined
    const isActivation = statusOverride === 'VIGENTE'
    /* Lançamentos exigem Data/Valor/Forma sempre que persistem — inclusive no save do
       contrato travado, que é justamente quando se registram pagamentos/recebimentos. */
    if (!isAditivoOp && (isPlainSave || isActivation)) {
      const lErr = validateLancamentos(v)
      if (lErr) { setSaveError(lErr.msg); setTab(lErr.field); return }
    }
    /* Validações de negócio (vigência, reajustes, partes) só ao ativar ou salvar um
       contrato destravado — NÃO em transições (revisão/encerrar) nem em operações de
       aditivo, para não travar a reabertura/correção. */
    if (!isAditivoOp && (isActivation || (isPlainSave && !locked))) {
      const pErr = validatePartes(v.partes, papeis.active)
      if (pErr) { setSaveError(pErr); setTab('partes'); return }
      const bizErr = validateContract(v)
      if (bizErr) { setSaveError(bizErr); return }
    }
    // campos personalizados obrigatórios da tela, vazios → bloqueia ATIVAR
    if (isActivation && screenDriven) {
      const missing = screenSections.find(s => s.customFields.some(cf => cf.required && !(screenValues[cf.id] ?? '').trim()))
      if (missing) { setTab(missing.key); setSaveError('Preencha os campos obrigatórios destacados.'); return }
    }
    setSaving(true); setSaveError(null)
    const nextSit = statusOverride ?? v.situacao
    const vals = { ...v, situacao: nextSit, ...(aditivosOverride ? { aditivos: aditivosOverride } : {}) }
    try {
      const res = await apiFetch(`/api/contracts/${row.id}`, {
        method: 'PATCH',
        body:   JSON.stringify(contractToPayload(vals, { user: getLogUser(), motivo: motivoTexto })),
      })
      if (res.ok) {
        /* R3 — grava os valores dos campos personalizados da tela junto do save do contrato */
        if (screenDriven) {
          const entries = Object.entries(screenValues).map(([fieldId, value]) => ({ fieldId, value }))
          await putScreenValues('CONTRACT', row.id, entries)
          setScreenClean(JSON.stringify(screenValues))
        }
        if (statusOverride) form.set('situacao', statusOverride); cleanRef.current = JSON.stringify(vals); setDirtyLocal(false); setJustSaved(true); setAuditVersion(x => x + 1); onDirtyChange?.(false); onSaved?.()
      }
      else setSaveError(`Erro ao salvar contrato (${res.status}).`)
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    } finally {
      setSaving(false)
    }
  }

  /* ativar/abrir-para-revisão de um aditivo: muda situação e persiste imediatamente (override evita estado obsoleto) */
  const activateAditivo = (id: string) => {
    const novos = v.aditivos.map(x => x.id === id ? { ...x, situacao: 'ATIVO' } : x)
    form.set('aditivos', novos); void handleSave(undefined, undefined, novos)
  }
  const reviseAditivo = (id: string) => {
    const novos = v.aditivos.map(x => x.id === id ? { ...x, situacao: 'RASCUNHO' } : x)
    form.set('aditivos', novos); void handleSave(undefined, undefined, novos)
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
    <div className="flex flex-col h-full min-h-0">

      {/* cabeçalho fixo: identidade + ações + abas (padrão do sistema) */}
      <div className="shrink-0 space-y-3">

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
          {!showMotivo && <SaveStatus dirty={dirty} saving={saving} justSaved={justSaved} className="mr-1" />}
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Fechar</button>

          {/* Salvar sempre disponível: permite registrar pagamentos/recebimentos mesmo com o contrato travado */}
          {!showMotivo && (
            <button type="button" onClick={() => { void handleSave() }} disabled={saving}
              className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 transition-colors">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}

          {stored === 'EM_CADASTRO' && !showMotivo && (
            <button type="button" onClick={() => { void handleSave('VIGENTE') }} disabled={saving}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? 'Salvando...' : 'Ativar'}
            </button>
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

      {staleAviso && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          <span>O motor de datas alterou este contrato no servidor. Suas alterações não salvas ainda estão aqui — salve-as, ou recarregue para ver o estado atual.</span>
          <button type="button" onClick={() => void recarregar()} className="shrink-0 rounded border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40">
            Descartar e recarregar
          </button>
        </div>
      )}

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
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      </div>{/* fim do cabeçalho fixo */}

      <form className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-3" onSubmit={e => e.preventDefault()}>
        {screenDriven ? (
          screenSections.map(s => (
            <DSection key={s.id} active={tab === s.key}>
              <ContractSectionNative section={s} ctx={{
                form, ro: locked, moedaCode: v.moeda, contractId: row.id, reloadKey: auditVersion,
                onOpenSearch: (parteId, origem, excludeIds) => setSearchModal({ parteId, origem, excludeIds }),
                onNewPartner: () => router.push('/modules/parceiros/new?from=contratos'),
                onOpenCessaoSearch: (aditivoId, cessaoId, origem) => setCessaoSearch({ aditivoId, cessaoId, origem }),
                onActivate: activateAditivo, onRevise: reviseAditivo,
              }} />
              <ContractCustomFields fields={s.customFields} screenValues={screenValues} onScreenChange={onScreenChange} ro={locked} />
            </DSection>
          ))
        ) : (<>
        <DSection active={tab === 'dados_gerais'}><IdentificacaoFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'partes'}>
          <PartesFields form={form} ro={locked} contractId={row.id}
            onOpenSearch={(parteId, origem, excludeIds) => setSearchModal({ parteId, origem, excludeIds })}
            onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')} />
        </DSection>
        <DSection active={tab === 'vigencia'}><VigenciaFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'valor'}><ValoresFields form={form} ro={locked} /></DSection>
        {temPagamentos(v.natureza)   && <DSection active={tab === 'pagamentos'}><LancamentosFields form={form} field="pagamentos" moedaCode={v.moeda} travado={locked} /></DSection>}
        {temRecebimentos(v.natureza) && <DSection active={tab === 'recebimentos'}><LancamentosFields form={form} field="recebimentos" moedaCode={v.moeda} travado={locked} /></DSection>}
        <DSection active={tab === 'reajuste'}><ReajustesFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'aditivos'}><AditivosFields form={form} onOpenCessaoSearch={(aditivoId, cessaoId, origem) => setCessaoSearch({ aditivoId, cessaoId, origem })} onActivate={activateAditivo} onRevise={reviseAditivo} /></DSection>
        <DSection active={tab === 'documentos'}><DocumentosFields form={form} ro={locked} /></DSection>
        <DSection active={tab === 'historico'}><ContractHistory contractId={row.id} reloadKey={auditVersion} /></DSection>
        </>)}
      </form>

      {searchModal && (
        <EntitySearchModal
          origem={searchModal.origem}
          empresas={empresas}
          excludeIds={searchModal.excludeIds}
          onSelect={(e) => { form.setParteEntity(searchModal.parteId, e); setSearchModal(null) }}
          onClose={() => setSearchModal(null)}
          onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')}
        />
      )}

      {cessaoSearch && (
        <EntitySearchModal
          origem={cessaoSearch.origem}
          empresas={empresas}
          onSelect={(e) => { form.patchCessao(cessaoSearch.aditivoId, cessaoSearch.cessaoId, { ref_tipo: e.ref_tipo, ref_id: e.ref_id, nome: e.nome, documento: e.documento }); setCessaoSearch(null) }}
          onClose={() => setCessaoSearch(null)}
          onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')}
        />
      )}
    </div>
  )
}
