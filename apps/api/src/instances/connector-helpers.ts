/** Helpers PUROS dos conectores de domínio (F5 estendida). Extraídos para serem
 *  testáveis sem banco: mapeiam variáveis do processo → payload das entidades.
 *  A execução (chamar ContractsService/PartnersService) fica no InstancesService. */

/** Coerção de variável de processo em string não-vazia (ou undefined). */
export const asStr = (v: unknown): string | undefined =>
  v == null || v === '' ? undefined : String(v)

/** Coerção em número finito (ou undefined). Campo vazio NÃO é zero — deixa por
 *  definir (senão um "valor" em branco viraria 0 e distorceria o contrato). */
export const asNum = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Resolve o id-alvo de um conector que atua sobre uma entidade existente
 *  (aditivo/distrato/ativação). Aceita os nomes de variável mais prováveis vindos
 *  do formulário da atividade OU produzidos por um conector anterior no mesmo fluxo
 *  (ex.: contracts.create devolve `contratoId`). */
export const resolveContractId = (v: Record<string, unknown>): string | undefined =>
  asStr(v.contratoId) ?? asStr(v.contractId) ?? asStr(v.contrato_id) ?? asStr(v.idContrato)

export const resolvePartnerId = (v: Record<string, unknown>): string | undefined =>
  asStr(v.partnerId) ?? asStr(v.parceiroId) ?? asStr(v.partner_id) ?? asStr(v.parceiro_id) ?? asStr(v.idParceiro)

/** Um termo aditivo montado a partir das variáveis do processo. Espelha o shape que
 *  a UI de Contrato grava no array `aditivos` (id/situacao/data/altera*). Nasce ATIVO
 *  por padrão — o processo já É a aprovação; se nada mudar, ainda registra o aditivo. */
export interface AditivoInput {
  id: string
  situacao: string
  data: string
  numero?: string
  alteraTermino?: boolean
  novoTermino?: string
  alteraValor?: boolean
  novoValor?: number
  novaParcela?: number
}

/** Constrói o aditivo a partir das variáveis. `id`/`hoje` são injetados (pureza:
 *  sem randomUUID/Date embutidos — o chamador fornece, o teste fixa). Convenção de
 *  nomes de variável documentada para o desenhista do processo. */
export function aditivoFromVars(
  vars: Record<string, unknown>,
  id: string,
  hoje: string,
): AditivoInput {
  const novoTermino = asStr(vars.aditivoNovoTermino ?? vars.novoTermino)
  // ATENÇÃO à semântica do domínio (espelha a UI "Acréscimo ao valor total"):
  //  • novoValor  = ACRÉSCIMO ao valor total (delta somado — valorVigente += novoValor);
  //  • novaParcela = valor ABSOLUTO da nova parcela (último vence — parcelaVigente = novaParcela).
  const novoValor = asNum(vars.aditivoAcrescimoValor ?? vars.aditivoNovoValor ?? vars.novoValor)
  const novaParcela = asNum(vars.aditivoNovaParcela ?? vars.novaParcela)
  const numero = asStr(vars.aditivoNumero ?? vars.numeroAditivo)
  // ATIVO por padrão; permite RASCUNHO explícito (revisão posterior no contrato).
  const situacao = asStr(vars.aditivoSituacao)?.toUpperCase() === 'RASCUNHO' ? 'RASCUNHO' : 'ATIVO'

  const a: AditivoInput = { id, situacao, data: hoje }
  if (numero) a.numero = numero
  if (novoTermino) { a.alteraTermino = true; a.novoTermino = novoTermino }
  if (novoValor != null) { a.alteraValor = true; a.novoValor = novoValor }
  if (novaParcela != null) { a.novaParcela = novaParcela }
  return a
}
