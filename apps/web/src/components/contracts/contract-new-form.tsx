'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, DollarSign, RefreshCw, Users, Paperclip, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch, motivoDoErro } from '@/lib/http'
import { getLogUser } from '@/hooks/use-partner-logs'
import { useScreens, putScreenValues } from '@/hooks/use-screens'
import { pickDefaultScreen, resolveContractSections } from '@/lib/screen-contract-layout'
import { reconcileNative } from '@/lib/screen-native-structure'
import type { Screen } from '@/lib/screen-types'
import { ContractSectionNative, ContractCustomFields } from './contract-screen-body'
import { EntitySearchModal, type EntityRef } from './entity-search-modal'
import { NewPartnerPanel } from './new-partner-panel'
import {
  useContractForm, IdentificacaoFields, VigenciaFields, ValoresFields,
  ReajustesFields, PartesFields, DocumentosFields, LancamentosFields,
} from './contract-fields'
import { emptyContractForm, contractToPayload, newCParte, temPagamentos, temRecebimentos, validateContract, validateLancamentos } from '@/lib/contract-options'
import { useLookupTable } from '@/hooks/use-lookup-table'
import { PAPEIS_KEY, INIT_PAPEIS, validatePartes } from '@/lib/contract-roles'
import { cacheRead, pullSetting } from '@/lib/settings-store'
import { CONTRACT_NUMBERING_KEY, previewNumero, type NumberingCfg } from '@/lib/contract-numbering'
import { faltantesContrato, camposDaSecao, rotuloDeSecao, SECOES_CONTRATO, type AcaoSalvar } from '@/lib/campos-obrigatorios'
import { AvisoCamposFaltantes } from '@/components/forms/aviso-campos-faltantes'

/* ─── seção colapsável ───────────────────────────────────── */
function Section({ secao, icon: Icon, title, isOpen, onToggle, faltando, children }: {
  secao: string; icon: React.ElementType; title: string; isOpen: boolean; onToggle: () => void
  /** campos obrigatórios que faltam nesta seção — o cabeçalho diz QUAIS, não só "tem erro" */
  faltando?: string[]; children: React.ReactNode
}) {
  const hasError = !!faltando?.length
  return (
    <div id={`secao-${secao}`} className="rounded-xl border bg-card shadow-sm overflow-hidden scroll-mt-2">
      <button type="button" onClick={onToggle}
        className={cn('w-full px-4 py-2 flex items-center gap-2 transition-colors hover:bg-muted/40 bg-muted/30', isOpen && 'border-b')}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : 'text-muted-foreground')} />
        <h3 className={cn('text-xs font-semibold flex-1 text-left', hasError && 'text-red-500')}>{title}</h3>
        {hasError && <span className="max-w-[60%] truncate text-[11px] text-red-500 font-medium mr-1">Falta: {faltando!.join(', ')}</span>}
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
  /** Override: renderiza o cadastro dirigido por ESTA tela (uso no runtime de workflow).
   *  Ausente = tela padrão do sistema (comportamento normal do módulo). */
  screen?: Screen
}

export default function ContractNewForm({ embedded = false, onSaved, onCancel, screen }: ContractNewFormProps) {
  const form = useContractForm({ ...emptyContractForm(), partes: [newCParte('')] })
  const v = form.values
  const router = useRouter()
  const papeis = useLookupTable(PAPEIS_KEY, INIT_PAPEIS)

  const [empresas,    setEmpresas]    = useState<{ id: string; nome: string; documento: string }[]>([])
  const [numbering,   setNumbering]   = useState<NumberingCfg | null>(null)
  const [searchModal, setSearchModal] = useState<{ parteId: string; origem: string; excludeIds: string[] } | null>(null)
  /* cadastro de parceiro sobre o contrato; `parteId` guarda a parte que espera a
     entidade (vazio = veio do rodapé da seção, sem parte de destino definida) */
  const [newPartner, setNewPartner] = useState<{ parteId: string } | null>(null)
  const [open,        setOpen]        = useState<Set<string>>(new Set(['dados_gerais']))
  /* A última ação tentada que esbarrou em campo obrigatório. A LISTA é recalculada a cada
     render: conforme a pessoa preenche, o aviso encolhe, e some quando não falta nada. */
  const [tentativa,   setTentativa]   = useState<AcaoSalvar | null>(null)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [saving,      setSaving]      = useState<'draft' | 'active' | null>(null)

  /** Liga o parceiro recém-criado a uma parte: à parte que pediu o cadastro, senão à
   *  primeira parte ainda sem entidade, senão numa parte nova. O que não pode é o
   *  parceiro voltar e o contrato fingir que nada aconteceu. */
  const attachPartner = (e: EntityRef) => {
    const alvo = newPartner?.parteId || v.partes.find((p) => !p.ref_id)?.id
    if (alvo) form.setParteEntity(alvo, e)
    else form.set('partes', [...v.partes, { ...newCParte(''), ...e }])
    setNewPartner(null)
  }

  /* R3 — a tela padrão (isDefault/ACTIVE) desenha o cadastro: seções, ordem, rótulos e
     campos personalizados capturados nas seções. Sem tela padrão → form nativo (fallback). */
  const { screens, loading: screensLoading } = useScreens('CONTRATO')
  const defaultScreen  = useMemo(() => screen ? reconcileNative(screen) : pickDefaultScreen(screens), [screen, screens])
  const screenDriven   = !!defaultScreen
  const screenSections = useMemo(
    () => defaultScreen ? resolveContractSections(defaultScreen, v.natureza, 'new') : [],
    [defaultScreen, v.natureza],
  )
  const [screenValues, setScreenValues] = useState<Record<string, string>>({})
  const onScreenChange = (fieldId: string, value: string) =>
    setScreenValues(p => ({ ...p, [fieldId]: value }))
  const [openInit, setOpenInit] = useState(false)
  useEffect(() => {
    if (screensLoading || openInit || !screenDriven) return
    setOpenInit(true)
    setOpen(new Set(screenSections.filter(s => s.defaultOpen).map(s => s.key)))
  }, [screensLoading, openInit, screenDriven, screenSections])

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

  const calcFaltantes = (acao: AcaoSalvar) =>
    faltantesContrato(v, { acao, autoNumero, secoes: screenDriven ? screenSections : null, valores: screenValues })
  const faltantes   = tentativa ? calcFaltantes(tentativa) : []
  /* sem tela, os títulos do cadastro novo diferem das abas do detalhe em duas seções */
  const rotuloSecao = rotuloDeSecao(SECOES_CONTRATO, screenDriven ? screenSections
    : [{ key: 'valor', label: 'Valores' }, { key: 'documentos', label: 'Documentos do contrato' }])
  const irParaSecao = (key: string) => {
    setOpen(prev => new Set([...prev, key]))
    requestAnimationFrame(() => document.getElementById(`secao-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  /* salva o contrato. 'EM_CADASTRO' = rascunho (validação leve); 'VIGENTE' = ativar (validação completa) */
  const submit = async (status: 'EM_CADASTRO' | 'VIGENTE') => {
    const acao: AcaoSalvar = status === 'VIGENTE' ? 'ativar' : 'rascunho'
    const itens = calcFaltantes(acao)
    if (itens.length > 0) {
      setTentativa(acao); setSaveError(null)
      setOpen(prev => new Set([...prev, ...itens.map(i => i.secao)]))
      return
    }
    setTentativa(null)

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
        /* R3 — grava os valores dos campos personalizados da tela ligados ao novo contrato */
        if (screenDriven && result?.id) {
          const entries = Object.entries(screenValues).map(([fieldId, value]) => ({ fieldId, value }))
          if (entries.length) await putScreenValues('CONTRACT', result.id, entries)
        }
        if (onSaved) onSaved(result)
        else router.push('/modules/contratos')
        return
      }
      setSaveError(await motivoDoErro(res, 'Não foi possível salvar o contrato'))
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
        {screenDriven ? (
          screenSections.map(s => (
            <Section key={s.id} secao={s.key} icon={s.icon} title={s.label}
              isOpen={open.has(s.key)} onToggle={() => toggleSection(s.key)} faltando={camposDaSecao(faltantes, s.key)}>
              <ContractSectionNative section={s} ctx={{
                form, moedaCode: v.moeda, autoNumero, numeroPreview, dualView: true,
                onOpenSearch: (parteId, origem, excludeIds) => setSearchModal({ parteId, origem, excludeIds }),
                onNewPartner: () => setNewPartner({ parteId: '' }),
              }} />
              <ContractCustomFields fields={s.customFields} screenValues={screenValues} onScreenChange={onScreenChange} />
            </Section>
          ))
        ) : (<>
        <Section secao="dados_gerais" icon={FileText} title="Dados Gerais" isOpen={open.has('dados_gerais')} onToggle={() => toggleSection('dados_gerais')} faltando={camposDaSecao(faltantes, 'dados_gerais')}>
          <IdentificacaoFields form={form} autoNumero={autoNumero} numeroPreview={numeroPreview} />
        </Section>

        <Section secao="partes" icon={Users} title="Partes Envolvidas" isOpen={open.has('partes')} onToggle={() => toggleSection('partes')} faltando={camposDaSecao(faltantes, 'partes')}>
          <PartesFields form={form}
            onOpenSearch={(parteId, origem, excludeIds) => setSearchModal({ parteId, origem, excludeIds })}
            onNewPartner={() => setNewPartner({ parteId: '' })} />
        </Section>

        <Section secao="vigencia" icon={Calendar} title="Vigência" isOpen={open.has('vigencia')} onToggle={() => toggleSection('vigencia')} faltando={camposDaSecao(faltantes, 'vigencia')}>
          <VigenciaFields form={form} />
        </Section>

        <Section secao="valor" icon={DollarSign} title="Valores" isOpen={open.has('valor')} onToggle={() => toggleSection('valor')} faltando={camposDaSecao(faltantes, 'valor')}>
          <ValoresFields form={form} />
        </Section>

        {temPagamentos(v.natureza) && (
          <Section secao="pagamentos" icon={TrendingDown} title="Pagamentos realizados" isOpen={open.has('pagamentos')} onToggle={() => toggleSection('pagamentos')}>
            <LancamentosFields form={form} field="pagamentos" moedaCode={v.moeda} dualView />
          </Section>
        )}

        {temRecebimentos(v.natureza) && (
          <Section secao="recebimentos" icon={TrendingUp} title="Recebimentos realizados" isOpen={open.has('recebimentos')} onToggle={() => toggleSection('recebimentos')}>
            <LancamentosFields form={form} field="recebimentos" moedaCode={v.moeda} dualView />
          </Section>
        )}

        <Section secao="reajuste" icon={RefreshCw} title="Reajuste" isOpen={open.has('reajuste')} onToggle={() => toggleSection('reajuste')}>
          <ReajustesFields form={form} />
        </Section>

        <Section secao="documentos" icon={Paperclip} title="Documentos do contrato" isOpen={open.has('documentos')} onToggle={() => toggleSection('documentos')} faltando={camposDaSecao(faltantes, 'documentos')}>
          <DocumentosFields form={form} />
        </Section>
        </>)}

        {tentativa && (
          <AvisoCamposFaltantes itens={faltantes} acao={tentativa} rotuloSecao={rotuloSecao} onIrParaSecao={irParaSecao} />
        )}
        {saveError && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">{saveError}</div>
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
            {/* Dentro de uma ATIVIDADE esta ação deixa de ser primária: quem entrega a
                etapa é o "Concluir tarefa" do rodapé da atividade. Dois botões verdes
                empilhados faziam a pessoa não saber qual encerrava o passo. Fora do
                workflow (cadastro avulso) ela continua sendo a ação principal. */}
            <button type="button" onClick={() => void submit('VIGENTE')} disabled={saving !== null}
              className={cn('inline-flex items-center h-7 rounded-md px-3 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                embedded
                  ? 'border hover:bg-muted'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
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
          onNewPartner={() => { const parteId = searchModal.parteId; setSearchModal(null); setNewPartner({ parteId }) }}
        />
      )}

      {newPartner && <NewPartnerPanel onCreated={attachPartner} onClose={() => setNewPartner(null)} />}
    </div>
  )
}
