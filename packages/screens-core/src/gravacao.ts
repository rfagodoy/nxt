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
import type { StepFormSchema } from '@nxt/types'
import { faltantesContrato, faltantesParceiro, nativosFaltantes, personalizadosFaltantes, type AcaoSalvar, type CampoFaltante } from './obrigatorios'
import { resolveContractSections } from './layout-contract'
import { resolvePartnerSections } from './layout-partner'
import type { LockContext } from './locks'
import { abasDaAtividade, travasDaEtapa } from './tarefa'
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

/**
 * Obrigatórios cobrados ao CONCLUIR uma atividade de Contrato (PO, 09/11/2026): o que as
 * abas editáveis da atividade marcam como obrigatório, com o contrato ainda em rascunho.
 * Só vale para o que a pessoa consegue preencher nesta atividade: campo oculto, travado
 * ou em aba de consulta não é cobrado. `telas` já vêm reconciliadas.
 */
export function faltantesDaTarefa(e: {
  step: Pick<StepFormSchema, 'screenRef' | 'screenSubject' | 'entityMode' | 'extraScreens' | 'lockedFields'>
  telas: Screen[]
  registro: Obj
  valores: Record<string, string>
}): CampoFaltante[] {
  if (e.step.screenSubject !== 'CONTRATO') return []
  const v = contractFromApi(e.registro)
  const out: CampoFaltante[] = []
  for (const aba of abasDaAtividade(e.step)) {
    const tela = e.telas.find(t => t.id === aba.screenRef)
    const lock = travasDaEtapa(e.step, aba.screenRef)
    if (!aba.editavel || !tela || !lock) continue
    for (const s of resolveContractSections(tela, v.natureza, 'detail', lock))
      for (const f of [...nativosFaltantes([s], v), ...personalizadosFaltantes([s], e.valores)])
        if (!out.some(x => x.campo === f.campo)) out.push(f)
  }
  return out
}

/** Mensagem única, em português, com os campos que faltam (agrupados pela regra da tela). */
export function fraseDosFaltantes(itens: CampoFaltante[], acao: AcaoSalvar | 'concluir' | null): string {
  const campos = [...new Set(itens.map(i => `“${i.campo}”`))]
  const verbo = acao === 'ativar' ? 'Para ativar, preencha' : acao === 'concluir' ? 'Para concluir, preencha' : 'Para salvar, preencha'
  return campos.length === 1 ? `${verbo} ${campos[0]}.` : `${verbo}: ${campos.join(', ')}.`
}
