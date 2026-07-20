/**
 * Aplicabilidade INTRÍNSECA dos campos nativos do Fornecedor por TIPO de parceiro
 * (PJ_BR, PJ_EST, PF_BR, PF_EST). É a "camada 1": qual campo faz sentido para qual
 * tipo — CNPJ só PJ_BR, CPF só PF_BR, Natureza Jurídica só PJ_BR, etc. NÃO é
 * configurável (é o significado do campo). Espelha os `if`s de categoria dos
 * componentes nativos (partner-fields.tsx) numa tabela única.
 *
 * A "camada 2" (visibilidade escolhida pelo usuário, por tipo) vive em
 * `ScreenField.hiddenCategories` e é aplicada por cima desta.
 */
import type { PartnerCategory, ScreenField } from './screen-types'

const ALL: PartnerCategory[] = ['PJ_BR', 'PJ_EST', 'PF_BR', 'PF_EST']
const PJ:  PartnerCategory[] = ['PJ_BR', 'PJ_EST']
const PF:  PartnerCategory[] = ['PF_BR', 'PF_EST']
const BR:  PartnerCategory[] = ['PJ_BR', 'PF_BR']
const EST: PartnerCategory[] = ['PJ_EST', 'PF_EST']

/** nativeKey → tipos em que o campo aparece no cadastro (intrínseco). Ausente = todos. */
const NATIVE_APPLIES: Record<string, PartnerCategory[]> = {
  // Identificação
  razao_social: ALL,
  cnpj: ['PJ_BR'], cpf: ['PF_BR'], codigo: EST,          // documento por tipo
  nome_fantasia: PJ, data_abertura: PJ,
  natureza_juridica: ['PJ_BR'], ie: ['PJ_BR'], im: ['PJ_BR'],
  rg: ['PF_BR'], orgao_expedidor: ['PF_BR'],
  data_nascimento: PF,
  pais_origem: ['PF_BR', 'PJ_EST', 'PF_EST'],            // todos menos PJ_BR
  // CNAE — classificação nacional
  cnae_principal: ['PJ_BR'], cnaes_secundarios: ['PJ_BR'],
  // Contato
  con_email: ALL, con_nome: ALL, con_telefone: ALL, con_celular: ALL, con_cargo: ALL,
  con_website: PJ,
  // Endereço
  end_cep: ALL, end_estado: ALL, end_cidade: ALL,
  end_logradouro: BR, end_numero: BR, end_complemento: BR, end_bairro: BR,   // formato nacional
  end_address1: EST, end_address2: EST, end_pais: EST,                       // formato internacional
  // Bancário
  ban_banco: ALL, ban_tipo_conta: ALL, ban_agencia: ALL, ban_conta: ALL, ban_pix: ALL,
  // Sócios
  soc_nome: PJ, soc_documento: PJ, soc_participacao: PJ, soc_cargo: PJ,
}

/** O campo nativo faz sentido para este tipo? (camada intrínseca). Chave desconhecida = todos. */
export function nativeAppliesTo(nativeKey: string | undefined, category: PartnerCategory): boolean {
  if (!nativeKey) return true
  const cats = NATIVE_APPLIES[nativeKey]
  return cats ? cats.includes(category) : true
}

/** O campo (nativo OU personalizado) faz sentido para este tipo? Personalizado = todos. */
export function fieldAppliesTo(f: Pick<ScreenField, 'source' | 'nativeKey'>, category: PartnerCategory): boolean {
  return f.source === 'NATIVE' ? nativeAppliesTo(f.nativeKey, category) : true
}

/**
 * Visibilidade EFETIVA do campo para um tipo: precisa (1) fazer sentido para o tipo,
 * (2) não estar globalmente desligado (`visible`), e (3) não estar oculto naquele tipo
 * (`hiddenCategories`). É a regra única usada pelo cadastro e pelo construtor.
 */
export function fieldVisibleFor(f: ScreenField, category: PartnerCategory): boolean {
  if (!fieldAppliesTo(f, category)) return false
  if (f.visible === false) return false
  return !(f.hiddenCategories ?? []).includes(category)
}

/**
 * Obrigatoriedade EFETIVA do campo para um tipo. Um campo invisível para o tipo
 * NUNCA é exigido nele. Quando `requiredCategories` está definido (mesmo vazio),
 * é a fonte por tipo; ausente/null cai no `required` global (retrocompatível com
 * campos antigos que só tinham o booleano).
 */
export function requiredFor(f: ScreenField, category: PartnerCategory): boolean {
  if (!fieldVisibleFor(f, category)) return false
  const rc = f.requiredCategories
  if (rc != null) return rc.includes(category)
  return !!f.required
}
