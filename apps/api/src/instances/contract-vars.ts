/* Variável `contrato` do processo (construtor de condições, 2026-08-23).
 *
 * As atividades de Tela concluem enviando só o id da entidade — os CAMPOS do
 * contrato (nativos e personalizados) nunca entravam nas variáveis, e o losango
 * não tinha o que ler. A cada conclusão de tarefa de usuário, o serviço carrega o
 * contrato e monta esta variável: nativos curados por nome de coluna + campos
 * personalizados por `fieldId` (id estável — renomear o campo na Tela não quebra
 * a condição). É um RETRATO no momento da conclusão: uma ação automática que
 * altere o contrato depois (ex.: aditivo) só reflete na PRÓXIMA conclusão de
 * tarefa humana — decisão auditável, não valor "vivo".
 */

export interface ContratoParaVars {
  situacao?: string | null
  tipo?: string | null
  natureza?: string | null
  moeda?: string | null
  valorTotal?: number | null
  valorParcela?: number | null
  qtdParcelas?: number | null
  prazoIndeterminado?: boolean | null
  maoDeObra?: boolean | null
  maoDeObraLocal?: string | null
  inicioVigencia?: string | null
  terminoVigencia?: string | null
  condicaoPagamento?: string | null
  formaPagamento?: string | null
  dataAssinatura?: string | null
}

export function montarVariavelContrato(
  contrato: ContratoParaVars,
  valoresCustom: Array<{ fieldId: string; value: string | null }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    situacao:           contrato.situacao ?? '',
    tipo:               contrato.tipo ?? '',
    natureza:           contrato.natureza ?? '',
    moeda:              contrato.moeda ?? '',
    valorTotal:         contrato.valorTotal ?? 0,
    valorParcela:       contrato.valorParcela ?? 0,
    qtdParcelas:        contrato.qtdParcelas ?? 0,
    prazoIndeterminado: !!contrato.prazoIndeterminado,
    maoDeObra:          !!contrato.maoDeObra,
    maoDeObraLocal:     contrato.maoDeObraLocal ?? '',
    inicioVigencia:     contrato.inicioVigencia ?? '',
    terminoVigencia:    contrato.terminoVigencia ?? '',
    condicaoPagamento:  contrato.condicaoPagamento ?? '',
    formaPagamento:     contrato.formaPagamento ?? '',
    dataAssinatura:     contrato.dataAssinatura ?? '',
  }
  /* personalizados por cima — um custom nunca colide com os nativos (chave é cuid) */
  for (const v of valoresCustom) {
    if (v.fieldId) out[v.fieldId] = v.value ?? ''
  }
  return out
}
