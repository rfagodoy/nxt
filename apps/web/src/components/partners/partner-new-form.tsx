'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Phone, MapPin, CreditCard, Users,
  ChevronDown, Layers, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { usePartnerFields, useFieldVisibility, type CustomField } from '@/hooks/use-partner-fields'
import { usePartnerSections } from '@/hooks/use-partner-sections'
import { getLogUser } from '@/hooks/use-partner-logs'
import {
  usePartnerForm, emptyPartnerForm, newPSoc, CategoryTabs, CustomFieldsGrid,
  IdentificacaoFields, ContatoFields, EnderecoFields, BancarioFields, SociosFields,
  type PartnerCategory, type PartnerFormValues,
} from './partner-fields'

export interface PartnerSaveResult { id: string; razaoSocial: string }

/* ─── seção accordion (chrome do cadastro) ───────────────── */

function Section({ icon: Icon, title, isOpen, onToggle, hasError, children }: {
  icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  hasError?: boolean; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        {hasError && <span className="text-[11px] text-red-500 font-medium mr-1">Campos obrigatórios</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>
      {isOpen && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

/* ─── props ──────────────────────────────────────────────── */

interface PartnerNewFormProps {
  embedded?: boolean
  onSaved?:  (result?: PartnerSaveResult) => void
  onCancel?: () => void
}

/* ─── componente principal ───────────────────────────────── */

export default function PartnerNewForm({ embedded = false, onSaved, onCancel }: PartnerNewFormProps) {
  const router               = useRouter()
  const form                 = usePartnerForm(emptyPartnerForm('PJ_BR'))
  const v                    = form.values
  const { fieldsForSection } = usePartnerFields()
  const { isVisible }        = useFieldVisibility()
  const { sections: customSections, sectionOrder, sectionDefaultOpen, loaded: sectionsLoaded } = usePartnerSections()

  const [open,          setOpen]          = useState<Set<string>>(new Set<string>())
  const [errors,        setErrors]        = useState<Set<string>>(new Set())
  const [fromContratos, setFromContratos] = useState(false)
  const [saving,        setSaving]        = useState<'draft' | 'active' | null>(null)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const openInit                          = useRef(false)

  const isPJ = v.category === 'PJ_BR' || v.category === 'PJ_EST'
  const isBR = v.category === 'PJ_BR' || v.category === 'PF_BR'

  useEffect(() => {
    if (embedded) return
    const params = new URLSearchParams(window.location.search)
    setFromContratos(params.get('from') === 'contratos')
  }, [embedded])

  useEffect(() => {
    if (!sectionsLoaded || openInit.current) return
    openInit.current = true
    const ids = ['identificacao', 'contato', 'endereco', 'bancario', 'socios', ...customSections.map(s => s.id)]
    const openSet = new Set<string>()
    for (const id of ids) {
      const defaultOpen = sectionDefaultOpen[id] ?? (id === 'identificacao')
      if (defaultOpen) openSet.add(id)
    }
    setOpen(openSet)
  }, [sectionsLoaded, sectionDefaultOpen, customSections])

  /* ao abrir a seção Sócios para PJ, garante uma linha em branco */
  useEffect(() => {
    if (open.has('socios') && isPJ && v.socios.length === 0) {
      form.set('socios', [newPSoc()])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPJ])

  const allSectionIds = ['identificacao', 'contato', 'endereco', 'bancario', 'socios', ...customSections.map(s => s.id)]
  const resolvedOrder = [
    ...sectionOrder.filter(id => allSectionIds.includes(id)),
    ...allSectionIds.filter(id => !sectionOrder.includes(id)),
  ]

  /* campos personalizados visíveis no formulário, por seção */
  const vfs = (section: string): CustomField[] => fieldsForSection(section).filter(f =>
    (f.visible === 'form' || f.visible === 'both') && isVisible(f.id)
  )

  const toggle = (key: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  /* ─── payload ───────────────────────────────────────────── */
  const buildPayload = (status: string) => {
    const opt = (val: string) => val.trim() || undefined
    return {
      categoria:      v.category,
      status,
      documento:      opt(v.documento),
      razaoSocial:    v.razaoSocial.trim(),
      nomeFantasia:   opt(v.nomeFantasia),
      ie:             opt(v.ie),
      im:             opt(v.im),
      rg:             opt(v.rg),
      orgaoExpedidor: opt(v.orgaoExpedidor),
      dataNascimento: opt(v.dataNascimento),
      paisOrigem:     opt(v.paisOrigem),
      contatos:  v.contatos,
      enderecos: v.enderecos,
      bancos:    v.bancos,
      socios:    v.socios,
      user:      getLogUser(),
    }
  }

  const afterSave = (result?: PartnerSaveResult) => {
    if (onSaved) { onSaved(result) } else { router.push('/modules/parceiros') }
  }

  /* ─── salvar rascunho ───────────────────────────────────── */
  const handleSaveDraft = async () => {
    const razaoSocial = v.razaoSocial.trim()
    if (!razaoSocial) {
      setErrors(new Set(['identificacao']))
      setOpen(prev => { const n = new Set(prev); n.add('identificacao'); return n })
      return
    }
    setSaving('draft'); setSaveError(null)
    try {
      const res = await apiFetch(`/api/partners`, {
        method: 'POST',
        body: JSON.stringify(buildPayload('EM_CADASTRAMENTO')),
      })
      if (!res.ok) { setSaveError(`Erro ao salvar (${res.status}). Verifique a conexão com o servidor.`); return }
      const created = await res.json() as { id?: string }
      if (created.id) { afterSave({ id: created.id, razaoSocial }) } else { afterSave() }
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Verifique se o serviço está disponível.')
    } finally { setSaving(null) }
  }

  /* ─── ativar parceiro ───────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const razaoSocial = v.razaoSocial.trim()
    const err         = new Set<string>()

    if (!v.documento.trim())  err.add('identificacao')
    if (!razaoSocial)         err.add('identificacao')
    if ((v.category === 'PF_BR' || v.category === 'PF_EST') && !v.dataNascimento.trim()) err.add('identificacao')
    if ((v.category === 'PJ_EST' || v.category === 'PF_EST') && !v.paisOrigem.trim())    err.add('identificacao')

    const e0 = v.enderecos[0]
    if (isBR) {
      if (!e0?.cep || !e0?.estado || !e0?.logradouro || !e0?.numero || !e0?.bairro || !e0?.cidade) err.add('endereco')
    } else {
      if (!e0?.address1 || !e0?.cidade || !e0?.pais_endereco) err.add('endereco')
    }

    setErrors(err)
    if (err.size > 0) {
      setOpen(prev => { const n = new Set(prev); err.forEach(k => n.add(k)); return n })
      return
    }

    if (!embedded && fromContratos) {
      const novoParceiro = { id: `p_${Date.now()}`, nome: razaoSocial, documento: v.documento.trim() }
      sessionStorage.setItem('nxt:contract:newParceiro', JSON.stringify(novoParceiro))
      router.push('/modules/contratos/new')
      return
    }

    setSaving('active'); setSaveError(null)
    try {
      const res = await apiFetch(`/api/partners`, {
        method: 'POST',
        body: JSON.stringify(buildPayload('ATIVO')),
      })
      if (!res.ok) { setSaveError(`Erro ao ativar (${res.status}). Verifique a conexão com o servidor.`); return }
      const created = await res.json() as { id?: string }
      if (created.id) { afterSave({ id: created.id, razaoSocial }) } else { afterSave() }
    } catch {
      setSaveError('Não foi possível conectar ao servidor. Verifique se o serviço está disponível.')
    } finally { setSaving(null) }
  }

  /* ─── renderizador de seção por chave ────────────────────── */
  const renderSection = (key: string): React.ReactNode => {
    if (key === 'identificacao') return (
      <Section key="identificacao" icon={Building2} title="Identificação"
        isOpen={open.has('identificacao')} onToggle={() => toggle('identificacao')} hasError={errors.has('identificacao')}>
        <IdentificacaoFields form={form} isVisible={isVisible} customFields={vfs('identificacao')} />
      </Section>
    )
    if (key === 'contato') return (
      <Section key="contato" icon={Phone} title="Contato" isOpen={open.has('contato')} onToggle={() => toggle('contato')}>
        <ContatoFields form={form} isVisible={isVisible} customFields={vfs('contato')} />
      </Section>
    )
    if (key === 'endereco') return (
      <Section key="endereco" icon={MapPin} title="Endereço"
        isOpen={open.has('endereco')} onToggle={() => toggle('endereco')} hasError={errors.has('endereco')}>
        <EnderecoFields form={form} isVisible={isVisible} customFields={vfs('endereco')} />
      </Section>
    )
    if (key === 'bancario') return (
      <Section key="bancario" icon={CreditCard} title="Dados Bancários" isOpen={open.has('bancario')} onToggle={() => toggle('bancario')}>
        <BancarioFields form={form} isVisible={isVisible} customFields={vfs('bancario')} />
      </Section>
    )
    if (key === 'socios') {
      if (!isPJ) return null
      return (
        <Section key="socios" icon={Users} title="Quadro de Sócios" isOpen={open.has('socios')} onToggle={() => toggle('socios')}>
          <SociosFields form={form} isVisible={isVisible} />
        </Section>
      )
    }
    const cs = customSections.find(s => s.id === key)
    if (cs) return (
      <Section key={cs.id} icon={Layers} title={cs.label} isOpen={open.has(cs.id)} onToggle={() => toggle(cs.id)}>
        {vfs(cs.id).length === 0
          ? <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum campo nesta seção.</p>
          : <CustomFieldsGrid fields={vfs(cs.id)} />}
      </Section>
    )
    return null
  }

  /* ─── render ─────────────────────────────────────────────── */

  return (
    <div className={cn('space-y-4', !embedded && 'max-w-3xl mx-auto')}>

      {!embedded && (
        <div className="flex items-center gap-3">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link href={fromContratos ? '/modules/contratos/new' : '/modules/parceiros'}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div>
            <h1 className="text-base font-semibold tracking-tight">Novo parceiro</h1>
            <p className="text-[11px] text-muted-foreground">Preencha os dados do parceiro</p>
          </div>
        </div>
      )}

      {!embedded && fromContratos && (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
          <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Você está cadastrando um parceiro para vincular a um contrato.
            Após salvar, você será redirecionado de volta ao formulário do contrato.
          </p>
        </div>
      )}

      <CategoryTabs value={v.category} onChange={(c: PartnerCategory) => form.setCategory(c)} />

      <form className="space-y-2" onSubmit={handleSubmit}>

        {resolvedOrder.map(key => renderSection(key))}

        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 pb-6">
          {onCancel ? (
            <button type="button" onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          ) : (
            <Link href={fromContratos ? '/modules/contratos/new' : '/modules/parceiros'}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </Link>
          )}
          <div className="flex items-center gap-2">
            {!fromContratos && (
              <button type="button" onClick={() => { void handleSaveDraft() }} disabled={saving !== null}
                className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
              </button>
            )}
            <button type="submit" disabled={saving !== null}
              className="inline-flex items-center gap-1.5 h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving === 'active' ? 'Salvando...' : fromContratos ? 'Salvar e vincular ao contrato' : 'Ativar parceiro'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export type { PartnerFormValues }
