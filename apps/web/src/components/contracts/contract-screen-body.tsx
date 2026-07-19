'use client'

/**
 * R3 — corpo de uma seção do cadastro de Contrato dirigido pela tela.
 * `ContractSectionNative` renderiza o componente NATIVO real da seção (seções de campos
 * respeitam a visibilidade da tela via `screenVis`; seções-bloco são atômicas), e
 * `ContractCustomFields` renderiza os campos PERSONALIZADOS capturados naquela seção
 * (persistidos via /api/screen-values). Usado no cadastro novo (accordion) e no detalhe (abas).
 */
import {
  Field,
  IdentificacaoFields, VigenciaFields, ValoresFields,
  ReajustesFields, DocumentosFields, LancamentosFields, AditivosFields,
  type ContractForm,
} from './contract-fields'
import { PartesEResponsaveis } from './partes-responsaveis'
import { ContractHistory } from './contract-history'
import { ScreenCustomInput } from '@/components/screens/screen-renderer'
import type { ResolvedContractSection } from '@/lib/screen-contract-layout'
import type { ScreenField } from '@/lib/screen-types'

/** Contexto com tudo que as seções nativas podem precisar (callbacks, flags). Campos
 *  opcionais: cada seção usa só o que lhe cabe. */
export interface ContractNativeCtx {
  form:                ContractForm
  ro?:                 boolean          // contrato travado (detalhe) → leitura
  dualView?:           boolean          // grade de pagamentos com visões Planejar/Baixas (só no cadastro novo)
  autoNumero?:         boolean          // numeração automática (cadastro novo)
  numeroPreview?:      string
  moedaCode:           string
  contractId?:         string           // Histórico (auditoria) só no detalhe
  reloadKey?:          number
  onOpenSearch?:       (parteId: string, origem: string, excludeIds: string[]) => void
  onNewPartner?:       () => void
  onOpenCessaoSearch?: (aditivoId: string, cessaoId: string, origem: string) => void
  onActivate?:         (id: string) => void
  onRevise?:           (id: string) => void
}

export function ContractSectionNative({ section, ctx }: { section: ResolvedContractSection; ctx: ContractNativeCtx }) {
  const { nativeKey, screenVis } = section
  const { form, ro } = ctx
  switch (nativeKey) {
    case 'dados_gerais':
      return <IdentificacaoFields form={form} ro={ro} isVisible={screenVis} autoNumero={ctx.autoNumero} numeroPreview={ctx.numeroPreview} />
    case 'vigencia':
      return <VigenciaFields form={form} ro={ro} isVisible={screenVis} />
    case 'valor':
      return <ValoresFields form={form} ro={ro} isVisible={screenVis} />
    case 'partes':
      return <PartesEResponsaveis form={form} ro={ro} contractId={ctx.contractId} onOpenSearch={ctx.onOpenSearch!} onNewPartner={ctx.onNewPartner!} />
    case 'pagamentos':
      return <LancamentosFields form={form} field="pagamentos" moedaCode={ctx.moedaCode} travado={ro} dualView={ctx.dualView} />
    case 'recebimentos':
      return <LancamentosFields form={form} field="recebimentos" moedaCode={ctx.moedaCode} travado={ro} dualView={ctx.dualView} />
    case 'reajuste':
      return <ReajustesFields form={form} ro={ro} />
    case 'aditivos':
      return <AditivosFields form={form} onOpenCessaoSearch={ctx.onOpenCessaoSearch!} onActivate={ctx.onActivate!} onRevise={ctx.onRevise!} />
    case 'documentos':
      return <DocumentosFields form={form} ro={ro} />
    case 'historico':
      return ctx.contractId ? <ContractHistory contractId={ctx.contractId} reloadKey={ctx.reloadKey ?? 0} /> : null
    default:
      return null // seção 100% personalizada: só os campos custom (abaixo)
  }
}

export function ContractCustomFields({ fields, screenValues, onScreenChange, ro }: {
  fields:         ScreenField[]
  screenValues:   Record<string, string>
  onScreenChange: (fieldId: string, value: string) => void
  ro?:            boolean
}) {
  if (fields.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-3 pt-1">
      {fields.map(f => (
        <div key={f.id} className={f.type === 'textarea' ? 'col-span-2' : ''}>
          <Field label={f.label} required={f.required && !ro}>
            <ScreenCustomInput field={f} value={screenValues[f.id] ?? ''} ro={ro} onChange={v => onScreenChange(f.id, v)} />
          </Field>
        </div>
      ))}
    </div>
  )
}
