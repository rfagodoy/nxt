'use client'

/**
 * R2 — corpo de uma seção do cadastro de Fornecedor dirigido pela tela.
 * Renderiza o componente NATIVO real da seção (respeitando a visibilidade da tela)
 * seguido dos campos PERSONALIZADOS capturados naquela seção (persistidos via
 * /api/screen-values). Usado tanto no cadastro novo (accordion) quanto no detalhe (abas).
 */
import {
  Field,
  IdentificacaoFields, ContatoFields, EnderecoFields, BancarioFields, SociosFields, CnaeFields,
  type PartnerForm,
} from './partner-fields'
import { ScreenCustomInput } from '@/components/screens/screen-renderer'
import type { ResolvedPartnerSection } from '@/lib/screen-partner-layout'

export function PartnerSectionBody({ section, form, ro, screenValues, onScreenChange }: {
  section:        ResolvedPartnerSection
  form:           PartnerForm
  ro?:            boolean
  screenValues:   Record<string, string>
  onScreenChange: (fieldId: string, value: string) => void
}) {
  const { nativeKey, screenVis, customFields } = section

  const native = () => {
    switch (nativeKey) {
      case 'identificacao': return <IdentificacaoFields form={form} ro={ro} isVisible={screenVis} />
      case 'contato':       return <ContatoFields      form={form} ro={ro} isVisible={screenVis} />
      case 'endereco':      return <EnderecoFields     form={form} ro={ro} isVisible={screenVis} />
      case 'bancario':      return <BancarioFields     form={form} ro={ro} isVisible={screenVis} />
      case 'socios':        return <SociosFields       form={form} ro={ro} isVisible={screenVis} />
      case 'cnae':          return <CnaeFields         form={form} ro={ro} isVisible={screenVis} />
      default:              return null
    }
  }

  return (
    <>
      {native()}
      {customFields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          {customFields.map(f => (
            <div key={f.id} className={f.type === 'textarea' ? 'col-span-2' : ''}>
              <Field label={f.label} required={f.required && !ro}>
                <ScreenCustomInput field={f} value={screenValues[f.id] ?? ''} ro={ro} onChange={v => onScreenChange(f.id, v)} />
              </Field>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
