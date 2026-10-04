/**
 * Obrigatórios cobrados NA GRAVAÇÃO (servidor). A regra é a mesma de `obrigatorios.ts`
 * — a que a tela usa para pintar o aviso —; aqui só se descobre, a partir do que estava
 * gravado e do que chegou, QUAL ação a pessoa fez (rascunho × ativar) e se monta o
 * registro no formato que a regra lê.
 *
 * Espelha os botões da tela:
 *  - Contrato: ir para VIGENTE cobra "ativar"; salvar um contrato que continua EM_CADASTRO
 *    cobra "rascunho"; o resto (aditivo, encerrar, salvar contrato vigente) não cobra.
 *  - Parceiro: ir para ATIVO (ativar ou reativar) cobra "ativar"; salvar sem trocar a
 *    situação cobra "rascunho"; inativar e habilitar para alteração não cobram.
 */
import { contractFromApi, normalizeSituacao } from '@nxt/contracts-core'
import { faltantesContrato, faltantesParceiro, type AcaoSalvar, type CampoFaltante } from './obrigatorios'
import { resolveContractSections } from './layout-contract'
import { resolvePartnerSections } from './layout-partner'
import type { LockContext } from './locks'
import type { PartnerCategory, Screen, ScreenSubject } from './types'

type Obj = Record<string, unknown>

export interface EntradaObrigatorios {
  subject: Exclude<ScreenSubject, 'GENERICA'>
  /** tela que vale (reconciliada); null = sem tela padrão → só os obrigatórios do sistema */
  screen: Screen | null
  lock?: LockContext
  antes: Obj | null
  depois: Obj
  customAntes?: Record<string, string>
  customDepois?: Record<string, string>
  /** numeração automática: o número nasce no servidor, não se cobra */
  autoNumero?: boolean
}

export function acaoDaGravacao(subject: EntradaObrigatorios['subject'], antes: Obj | null, depois: Obj): AcaoSalvar | null {
  if (subject === 'CONTRATO') {
    const sitA = antes ? normalizeSituacao(String(antes.situacao ?? 'EM_CADASTRO')) : null
    const sitD = normalizeSituacao(String(depois.situacao ?? antes?.situacao ?? 'EM_CADASTRO'))
    if (sitD === 'VIGENTE' && sitA !== 'VIGENTE') return 'ativar'
    if (sitD === 'EM_CADASTRO' && (sitA === null || sitA === 'EM_CADASTRO')) return 'rascunho'
    return null
  }
  const stA = antes ? String(antes.status ?? '') : null
  const stD = String(depois.status ?? antes?.status ?? 'EM_CADASTRAMENTO')
  if (stD === 'ATIVO' && stA !== 'ATIVO') return 'ativar'
  if (stA === null || stA === stD) return 'rascunho'
  return null
}

const txt = (v: unknown) => (v == null ? '' : String(v))

export function faltantesDaGravacao(e: EntradaObrigatorios): CampoFaltante[] {
  const acao = acaoDaGravacao(e.subject, e.antes, e.depois)
  if (!acao) return []
  const reg: Obj = { ...(e.antes ?? {}), ...e.depois }
  const valores = { ...(e.customAntes ?? {}), ...(e.customDepois ?? {}) }
  const modo = e.antes ? 'detail' : 'new'

  if (e.subject === 'CONTRATO') {
    const v = contractFromApi(reg)
    const secoes = e.screen ? resolveContractSections(e.screen, v.natureza, modo, e.lock) : null
    return faltantesContrato(v, { acao, autoNumero: e.autoNumero, secoes, valores })
  }
  const categoria = txt(reg.categoria) as PartnerCategory
  const secoes = e.screen ? resolvePartnerSections(e.screen, categoria, modo, e.lock) : null
  return faltantesParceiro({
    category:       categoria,
    razaoSocial:    txt(reg.razaoSocial),
    documento:      txt(reg.documento),
    dataNascimento: txt(reg.dataNascimento),
    paisOrigem:     txt(reg.paisOrigem),
    enderecos:      Array.isArray(reg.enderecos) ? (reg.enderecos as object[]) : [],
  }, { acao, secoes, valores })
}

/** Mensagem única, em português, com os campos que faltam (agrupados pela regra da tela). */
export function fraseDosFaltantes(itens: CampoFaltante[], acao: AcaoSalvar | null): string {
  const campos = [...new Set(itens.map(i => `“${i.campo}”`))]
  const verbo = acao === 'ativar' ? 'Para ativar, preencha' : 'Para salvar, preencha'
  return campos.length === 1 ? `${verbo} ${campos[0]}.` : `${verbo}: ${campos.join(', ')}.`
}
