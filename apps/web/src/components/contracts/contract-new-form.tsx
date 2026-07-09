'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, DollarSign, RefreshCw, Users, Paperclip, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/http'
import { getLogUser } from '@/hooks/use-partner-logs'
import { EntitySearchModal } from './entity-search-modal'
import {
  useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields,
  ReajustesFields, PartesFields, DocumentosFields, LancamentosFields,
} from './contract-fields'
import { emptyContractForm, contractToPayload, newCParte, temPagamentos, temRecebimentos, validateContract, validateLancamentos } from '@/lib/contract-options'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { PAPEIS_KEY, INIT_PAPEIS, validatePartes } from '@/lib/contract-roles'
import { cacheRead, pullSetting } from '@/lib/settings-store'
import { CONTRACT_NUMBERING_KEY, previewNumero, type NumberingCfg } from '@/lib/contract-numbering'

/* ─── seção colapsável ───────────────────────────────────── */
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
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)

  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [numbering,   setNumbering]   = useState<NumberingCfg | null>(null)
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string; excludeIds: string[] } | null>(null)
  const [open,        setOpen]        = useState<Set<string>>(new Set(['dados_gerais']))
  const [errors,      setErrors]      = useState<Set<string>>(new Set())
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [saving,      setSaving]      = useState<'draft' | 'active' | null>(null)

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

  /* parâmetros de numeração (Configurações › Tabelas › Parâmetros gerais) */
  useEffect(() => {
    setNumbering(cacheRead<NumberingCfg | null>(CONTRACT_NUMBERING_KEY, null))
    void pullSetting<NumberingCfg>(CONTRACT_NUMBERING_KEY).then(c => { if (c) setNumbering(c) })
  }, [])
  const autoNumero = numbering?.modo === 'AUTO'
  const numeroPreview = autoNumero ? previewNumero(numbering as NumberingCfg, new Date().getFullYear()) : ''

  const toggleSection = (k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  /* salva o contrato. 'EM_CADASTRO' = rascunho (validação leve); 'VIGENTE' = ativar (validação completa) */
  const submit = async (status: 'EM_CADASTRO' | 'VIGENTE') => {
    const err = new Set<string>()
    /* no modo automático o número é gerado no backend ao salvar (não exigir aqui) */
    if ((!autoNumero && !v.numero.trim()) || !v.titulo.trim()) err.add('dados_gerais')
    if (status === 'VIGENTE') {
      if (!v.tipo) err.add('dados_gerais')
      if (!v.inicioVigencia) err.add('vigencia')
      if (!v.partes[0]?.nome.trim()) err.add('partes')
    }
    setErrors(err)
    if (err.size > 0) { setOpen(prev => new Set([...prev, ...err])); return }

    /* lançamentos: Data/Valor/Forma obrigatórios em cada pagamento/recebimento */
    const lErr = validateLancamentos(v)
    if (lErr) { setSaveError(lErr.msg); setOpen(prev => new Set([...prev, lErr.field])); return }

    /* partes: sem entidade repetida no mesmo papel, nem a mesma como contratante e contratada */
    const pErr = validatePartes(v.partes, papeis.active)
    if (pErr) { setSaveError(pErr); setOpen(prev => new Set([...prev, 'partes'])); return }

    /* validações de negócio (vigência início≤término, reajuste com índice → data+periodicidade) */
    const bizErr = validateContract(v)
    if (bizErr) { setSaveError(bizErr); return }

    setSaveError(null)
    setSaving(status === 'VIGENTE' ? 'active' : 'draft')
    try {
      const res = await apiFetch(`/api/contracts`, {
        method: 'POST',
        body:   JSON.stringify(contractToPayload({ ...v, situacao: status }, { user: getLogUser() })),
      })
      if (res.ok) {
        let result: { id?: string } | undefined
        try { result = await res.json() as { id?: string } } catch { /* sem corpo */ }
        if (onSaved) onSaved(result)
        else router.push('/modules/contratos')
        return
      }
      setSaveError(`Erro ao salvar contrato (${res.status}).`)
    } catch {
      setSaveError('Não foi possível conectar ao servidor.')
    } finally {
      setSaving(null)
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

      <form className="space-y-2" onSubmit={e => e.preventDefault()}>
        <Section icon={FileText} title="Dados Gerais" isOpen={open.has('dados_gerais')} onToggle={() => toggleSection('dados_gerais')} hasError={errors.has('dados_gerais')}>
          <IdentificacaoFields form={form} autoNumero={autoNumero} numeroPreview={numeroPreview} />
        </Section>

        <Section icon={Users} title="Partes Envolvidas" isOpen={open.has('partes')} onToggle={() => toggleSection('partes')} hasError={errors.has('partes')}>
          <PartesFields form={form}
            onOpenSearch={(parteId, origem, excludeIds) => setSearchModal({ parteId, origem, excludeIds })}
            onNewPartner={() => router.push('/modules/parceiros/new?from=contratos')} />
        </Section>

        <Section icon={Calendar} title="Vigência" isOpen={open.has('vigencia')} onToggle={() => toggleSection('vigencia')} hasError={errors.has('vigencia')}>
          <VigenciaFields form={form} />
        </Section>

        <Section icon={DollarSign} title="Valores" isOpen={open.has('valores')} onToggle={() => toggleSection('valores')}>
          <ValoresFields form={form} />
        </Section>

        {temPagamentos(v.natureza) && (
          <Section icon={TrendingDown} title="Pagamentos realizados" isOpen={open.has('pagamentos')} onToggle={() => toggleSection('pagamentos')}>
            <LancamentosFields form={form} field="pagamentos" moedaCode={v.moeda} />
          </Section>
        )}

        {temRecebimentos(v.natureza) && (
          <Section icon={TrendingUp} title="Recebimentos realizados" isOpen={open.has('recebimentos')} onToggle={() => toggleSection('recebimentos')}>
            <LancamentosFields form={form} field="recebimentos" moedaCode={v.moeda} />
          </Section>
        )}

        <Section icon={RefreshCw} title="Reajuste" isOpen={open.has('reajuste')} onToggle={() => toggleSection('reajuste')}>
          <ReajustesFields form={form} />
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
            <button type="button" onClick={() => void submit('EM_CADASTRO')} disabled={saving !== null}
              className="inline-flex items-center h-7 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving === 'draft' ? 'Salvando...' : 'Salvar rascunho'}
            </button>
            <button type="button" onClick={() => void submit('VIGENTE')} disabled={saving !== null}
              className="inline-flex items-center h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving === 'active' ? 'Salvando...' : 'Ativar'}
            </button>
          </div>
        </div>
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
    </div>
  )
}
