/* Campos obrigatórios: QUAIS faltam, com o nome do campo e a seção onde ele mora.
 *
 * As telas de Contrato e Parceiro sabiam que faltava algo, mas diziam só "Preencha os
 * campos obrigatórios destacados." — e nada era destacado (o campo personalizado nem
 * tinha destaque), então a pessoa caçava o campo seção por seção. Pior: o Ativar do
 * DETALHE não conferia os campos nativos, e o cadastro novo conferia. Esta é a regra
 * única dos dois lugares; a tela só pinta o resultado (AvisoCamposFaltantes).
 *
 * Aqui só vive OBRIGATORIEDADE (vazio). Regra de negócio (término antes do início,
 * documento inválido, participação dos sócios) continua nas validações próprias. */
import type { ContractFormValues } from './contract-options'
import type { PartnerFormValues } from '@/components/partners/partner-fields'

export type AcaoSalvar = 'rascunho' | 'ativar'

export interface CampoFaltante {
  /** chave da seção (a mesma de open/tab: nativeKey, ou id da seção personalizada) */
  secao: string
  /** rótulo do campo, como aparece no formulário */
  campo: string
}

/** Seção com os campos personalizados que a tela capturou nela. */
export interface SecaoComCampos {
  key: string
  label?: string
  customFields: { id: string; label: string; required: boolean }[]
  /** campos nativos que a tela deixa visíveis nesta seção (ausente = todos) */
  screenVis?: (key: string) => boolean
}

export const SECOES_CONTRATO: Record<string, string> = {
  dados_gerais: 'Dados Gerais', partes: 'Partes Envolvidas', vigencia: 'Vigência',
  valor: 'Valor e Pagamento', valores: 'Valores', pagamentos: 'Pagamentos', recebimentos: 'Recebimentos',
  reajuste: 'Reajuste', aditivos: 'Aditivos', documentos: 'Documentos',
}

export const SECOES_PARCEIRO: Record<string, string> = {
  identificacao: 'Identificação', cnae: 'CNAE', contato: 'Contato', endereco: 'Endereço',
  bancario: 'Dados Bancários', socios: 'Quadro de Sócios',
}

/** Campos personalizados marcados como obrigatórios na tela e ainda vazios. */
export function personalizadosFaltantes(
  secoes: SecaoComCampos[] | null | undefined,
  valores: Record<string, string>,
): CampoFaltante[] {
  const out: CampoFaltante[] = []
  for (const s of secoes ?? [])
    for (const cf of s.customFields)
      if (cf.required && !(valores[cf.id] ?? '').trim()) out.push({ secao: s.key, campo: cf.label })
  return out
}

/** Rascunho exige só identificar o contrato; ativar exige o que o contrato precisa para valer. */
export function faltantesContrato(
  v: ContractFormValues,
  o: { acao: AcaoSalvar; autoNumero?: boolean; secoes?: SecaoComCampos[] | null; valores?: Record<string, string> },
): CampoFaltante[] {
  const out: CampoFaltante[] = []
  /* no modo automático o número nasce no backend ao salvar — não se cobra aqui */
  if (!o.autoNumero && !v.numero.trim()) out.push({ secao: 'dados_gerais', campo: 'Número' })
  if (!v.titulo.trim())                  out.push({ secao: 'dados_gerais', campo: 'Título' })
  if (o.acao === 'ativar') {
    if (!v.tipo)                       out.push({ secao: 'dados_gerais', campo: 'Tipo de contrato' })
    if (!v.inicioVigencia)             out.push({ secao: 'vigencia',     campo: 'Início da vigência' })
    if (!v.partes[0]?.nome.trim())     out.push({ secao: 'partes',       campo: 'Ao menos uma parte' })
    /* Valor total e nome dos documentos (decisão do PO, 13/09/2026): os dois tinham o
       asterisco e nunca eram cobrados. Só se cobra o que a tela deixa preencher. */
    if (visivelNaTela(o.secoes, 'valor', 'valor_total') && !String(v.valorTotal ?? '').trim())
      out.push({ secao: 'valor', campo: 'Valor total do contrato' })
    if (visivelNaTela(o.secoes, 'documentos'))
      v.documentos.forEach((d, i) => {
        if (!d.nome.trim()) out.push({ secao: 'documentos', campo: v.documentos.length > 1 ? `Nome do documento ${i + 1}` : 'Nome do documento' })
      })
    out.push(...personalizadosFaltantes(o.secoes, o.valores ?? {}))
  }
  return out
}

/** Um campo só pode ser cobrado se a pessoa consegue vê-lo. Sem tela configurada, o
 *  formulário nativo mostra tudo; com tela, a seção precisa existir e o campo, estar visível. */
function visivelNaTela(secoes: SecaoComCampos[] | null | undefined, secao: string, campo?: string): boolean {
  if (!secoes) return true
  const s = secoes.find(x => x.key === secao)
  if (!s) return false
  return campo && s.screenVis ? s.screenVis(campo) : true
}

/** Rótulo do documento conforme o tipo de parceiro (o mesmo do formulário). */
export const rotuloDocumento = (categoria: string) =>
  categoria === 'PJ_BR' ? 'CNPJ' : categoria === 'PF_BR' ? 'CPF' : 'Código'

export function faltantesParceiro(
  v: PartnerFormValues,
  o: { acao: AcaoSalvar; secoes?: SecaoComCampos[] | null; valores?: Record<string, string> },
): CampoFaltante[] {
  const cat  = v.category
  const isPJ = cat === 'PJ_BR' || cat === 'PJ_EST'
  const isPF = cat === 'PF_BR' || cat === 'PF_EST'
  const isBR = cat === 'PJ_BR' || cat === 'PF_BR'
  const out: CampoFaltante[] = []
  if (!v.razaoSocial.trim()) out.push({ secao: 'identificacao', campo: isPJ ? 'Razão Social' : 'Nome Completo' })
  if (o.acao === 'ativar') {
    if (!v.documento.trim())                          out.push({ secao: 'identificacao', campo: rotuloDocumento(cat) })
    if (isPF && !v.dataNascimento.trim())             out.push({ secao: 'identificacao', campo: 'Data de Nascimento' })
    if (!isBR && !v.paisOrigem.trim())                out.push({ secao: 'identificacao', campo: 'País de Origem' })
    /* endereço: exigido só o PRIMEIRO (os demais são opcionais, como no formulário) */
    const e0 = (v.enderecos[0] ?? {}) as unknown as Record<string, string | undefined>
    const exigidos: [string, string][] = isBR
      ? [['cep', 'CEP'], ['estado', 'Estado'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['bairro', 'Bairro'], ['cidade', 'Cidade']]
      : [['address1', 'Endereço — Linha 1'], ['cidade', 'Cidade'], ['pais_endereco', 'País']]
    for (const [k, rotulo] of exigidos) if (!(e0[k] ?? '').trim()) out.push({ secao: 'endereco', campo: rotulo })
    out.push(...personalizadosFaltantes(o.secoes, o.valores ?? {}))
  }
  return out
}

/** Nome da seção: o que a TELA deu a ela, senão o nome padrão, senão a própria chave. */
export function rotuloDeSecao(padrao: Record<string, string>, secoes?: { key: string; label: string }[] | null) {
  return (key: string) => secoes?.find(s => s.key === key)?.label ?? padrao[key] ?? key
}

/** Agrupa por seção mantendo a ordem em que as seções aparecem na lista. */
export function agruparPorSecao(itens: CampoFaltante[], rotulo: (key: string) => string) {
  const grupos: { secao: string; rotulo: string; campos: string[] }[] = []
  for (const i of itens) {
    let g = grupos.find(x => x.secao === i.secao)
    if (!g) { g = { secao: i.secao, rotulo: rotulo(i.secao), campos: [] }; grupos.push(g) }
    if (!g.campos.includes(i.campo)) g.campos.push(i.campo)
  }
  return grupos
}

/** Campos que faltam numa seção (para o cabeçalho da seção dizer quais). */
export const camposDaSecao = (itens: CampoFaltante[], secao: string) =>
  itens.filter(i => i.secao === secao).map(i => i.campo)
