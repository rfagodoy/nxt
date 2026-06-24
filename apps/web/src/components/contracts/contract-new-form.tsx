'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, DollarSign, RefreshCw, Users, Paperclip, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'
import { getLogUser } from '@/hooks/use-partner-logs'
import { EntitySearchModal } from './entity-search-modal'
import {
  useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields,
  ReajustesFields, PartesFields, DocumentosFields,
} from './contract-fields'
import { emptyContractForm, contractToPayload, newCParte, type ContractFormValues } from '@/lib/contract-options'

const ORG = () => process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'
const DRAFT_KEY = 'primeapps:contratos:rascunho'
interface ContractDraft { savedAt?: string; values?: ContractFormValues }

/* ─── seção colapsável ───────────────────────────────────── */
function Section({ icon: Icon, title, isOpen, onToggle, hasError, children }: {
  icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  hasError?: boolean; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        {hasError && <span className="text-[11px] text-red-500 font-medium mr-1">Campos obrigatórios</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

/* ─── formulário de novo contrato ────────────────────────── */
interface ContractNewFormProps {
  embedded?: boolean
  onSaved?:  (result?: { id?: string }) => void
  onCancel?: () => void
}

export default function ContractNewForm({ embedded = false, onSaved, onCancel }: ContractNewFormProps) {
  const form = useContractForm({ ...emptyContractForm(), partes: [newCParte('')] })
  const v = form.values
  const router = useRouter()

  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string } | null>(null)
  const [open,        setOpen]        = useState<Set<string>>(new Set(['basicos']))
  const [errors,      setErrors]      = useState<Set<string>>(new Set())
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null)
  const [draftToast,  setDraftToast]  = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/group-companies?organizationId=${ORG()}`)
        if (res.ok) {
          const data = await res.json() as { rows: { id: string; razaoSocial: string; nomeFantasia?: string | null; cnpj?: string | null }[] }
          setEmpresas((data.rows ?? []).map(c => ({ id: c.id, nome: c.nomeFantasia || c.razaoSocial, documento: c.cnpj ?? '' })))
        }
      } catch {}
    })()
  }, [])

  useEffect(() => {
    const showBanner = (d: ContractDraft | null) => { if (d?.savedAt) setDraftBanner({ savedAt: d.savedAt }) }
    showBanner(cacheRead<ContractDraft | null>(DRAFT_KEY, null))
    void pullSetting<ContractDraft>(DRAFT_KEY).then(showBanner)
  }, [])

  const toggleSection = (k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const handleSaveDraft = () => {
    pushSetting(DRAFT_KEY, { savedAt: new Date().toISOString(), values: v })
    setDraftToast(true); setTimeout(() => setDraftToast(false), 3000)
  }
  const handleRestoreDraft = () => {
    const d = cacheRead<ContractDraft | null>(DRAFT_KEY, null)
    if (d?.values) {
      form.setValues({ ...emptyContractForm(), ...d.values })
      setOpen(new Set(['basicos', 'valores', 'reajuste', 'partes', 'documentos']))
    }
    setDraftBanner(null)
  }
  const handleDiscardDraft = () => { pushSetting(DRAFT_KEY, null); setDraftBanner(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = new Set<string>()
    if (!v.numero.trim() || !v.titulo.trim() || !v.tipo || !v.inicioVigencia) err.add('basicos')
    if (!v.partes[0]?.nome.trim()) err.add('partes')
    setErrors(err)
    if (err.size > 0) { setOpen(prev => new Set([...prev, ...err])); return }
    setSaveError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(contractToPayload(v, { organizationId: ORG(), user: getLogUser() })),
      })
      if (res.ok) {
        pushSetting(DRAFT_KEY, null)
        let result: { id?: string } | undefined
        try { result = await res.json() as { id?: string } } catch { /* sem corpo */ }
        if (onSaved) onSaved(result)
        else router.push('/modules/contratos')
        return
      }
      setSaveError(`Erro ao salvar contrato (${res.status}).`)
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    }
  }

  return (
    <div className={cn('space-y-4', !embedded && 'max-w-3xl mx-auto')}>

      {!embedded && (
        <div className="flex items-center gap-3">
          <Link href="/modules/contratos" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Novo contrato</h1>
            <p className="text-[11px] text-muted-foreground">Preencha os dados do contrato</p>
          </div>
        </div>
      )}

      {draftBanner && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Rascunho salvo encontrado</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{new Date(draftBanner.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleRestoreDraft} className="h-7 rounded-md bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-700 transition-colors">Restaurar</button>
            <button type="button" onClick={handleDiscardDraft} className="h-7 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors">Descartar</button>
          </div>
        </div>
      )}

      <form className="space-y-2" onSubmit={handleSubmit}>
        <Section icon={FileText} title="Dados Básicos" isOpen={open.has('basicos')} onToggle={() => toggleSection('basicos')} hasError={errors.has('basicos')}>
          <IdentificacaoFields form={form} />
          <VigenciaFields form={form} />
        </Section>

        <Section icon={DollarSign} title="Valores" isOpen={open.has('valores')} onToggle={() => toggleSection('valores')}>
          <ValoresFields form={form} />
        </Section>

        <Section icon={RefreshCw} title="Reajuste" isOpen={open.has('reajuste')} onToggle={() => toggleSection('reajuste')}>
          <ReajustesFields form={form} />
        </Section>

        <Section icon={Users} title="Partes Envolvidas" isOpen={open.has('partes')} onToggle={() => toggleSection('partes')} hasError={errors.has('partes')}>
          <PartesFields form={form}
            onOpenSearch={(parteId, origem) => setSearchModal({ parteId, origem })}
            onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')} />
        </Section>

        <Section icon={Paperclip} title="Documentos do contrato" isOpen={open.has('documentos')} onToggle={() => toggleSection('documentos')}>
          <DocumentosFields form={form} />
        </Section>

        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">{saveError}</div>
        )}

        <div className="flex items-center justify-between pt-1 pb-6">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
          ) : (
            <Link href="/modules/contratos" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancelar</Link>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveDraft} className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors">Salvar rascunho</button>
            <button type="submit" className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Salvar contrato</button>
          </div>
        </div>
      </form>

      {draftToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-lg text-xs font-medium">
          <Check className="h-3.5 w-3.5 text-green-500" />Rascunho salvo
        </div>
      )}

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
