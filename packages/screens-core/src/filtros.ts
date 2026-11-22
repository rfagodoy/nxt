/* Campos testados nos FILTROS das escolhas do workflow × obrigatórios das telas (PO,
 * 22/11/2026). A escolha lê o contrato do processo na hora da decisão; campo em branco
 * não casa com filtro nenhum e o processo segue pelo caso contrário sem avisar. Por isso
 * a ativação confere se o campo testado é cobrado antes da escolha.
 *
 * O filtro chama o campo pelo nome do REGISTRO (`contrato.maoDeObra`) e a tela pela chave
 * NATIVA (`mao_de_obra`); o personalizado é `contrato.<chave do campo>` nos dois. */
import { CONTRATO_PROPS } from './conferencia'
import { abasDaAtividade, travasDaEtapa } from './tarefa'
import { resolveContractSections } from './layout-contract'
import { buildNativeSeed } from './native'
import { fieldValueKey, type Screen } from './types'
import type { StepFormSchema } from '@nxt/types'

const PREFIXO = 'contrato.'

/** Nativos que o filtro oferece, mas a tela não deixa marcar como obrigatórios: Situação e
 *  Prazo indeterminado sempre têm valor; "Onde a equipe trabalha" só fica vazio quando não
 *  há mão de obra, e aí o vazio já é a resposta. */
const SEM_MARCA_NO_FILTRO = new Set(['situacao', 'prazoIndeterminado', 'maoDeObraLocal'])

/** Chave do filtro de um campo nativo de Contrato (`contrato.valorTotal`). */
const chaveDoNativo = (nativeKey: string): string | null => {
  const prop = CONTRATO_PROPS[nativeKey]?.[0]
  return prop ? PREFIXO + prop : null
}

/** O campo do filtro pode (e deve) ser exigido numa tela? Só campos do contrato entram;
 *  campo de formulário próprio da atividade (legado) e os nativos sem marca ficam de fora. */
export function campoDoFiltroExigivel(chave: string): boolean {
  if (!chave.startsWith(PREFIXO)) return false
  return !SEM_MARCA_NO_FILTRO.has(chave.slice(PREFIXO.length))
}

/**
 * Campos que "Concluir tarefa" cobra nesta atividade, na chave do filtro. A mesma leitura de
 * `faltantesDaTarefa`: só as abas que editam o contrato, sem os campos ocultos ou travados.
 * Sem natureza: campo das seções de Pagamentos/Recebimentos só aparece em parte dos
 * contratos, então não garante valor. `telas` já vêm reconciliadas.
 */
export function camposCobradosAoConcluir(
  step: Pick<StepFormSchema, 'screenRef' | 'screenSubject' | 'entityMode' | 'extraScreens' | 'lockedFields'>,
  telas: readonly Screen[],
): Set<string> {
  const out = new Set<string>()
  if (!step.screenRef || step.screenSubject !== 'CONTRATO' || step.entityMode === 'VIEW') return out
  for (const aba of abasDaAtividade(step)) {
    const tela = telas.find(t => t.id === aba.screenRef)
    const lock = travasDaEtapa(step, aba.screenRef)
    if (!aba.editavel || !tela || !lock || tela.subjectType !== 'CONTRATO') continue
    for (const s of resolveContractSections(tela, '', 'detail', lock)) {
      for (const n of s.nativosObrigatorios) {
        const chave = chaveDoNativo(n.key)
        if (chave) out.add(chave)
      }
      for (const cf of s.customFields) if (cf.required && !cf.locked) out.add(PREFIXO + fieldValueKey(cf))
    }
  }
  return out
}

/** Nome de cada campo do filtro, como a tela o mostra: os nativos pelo cadastro padrão e os
 *  personalizados pelas telas de Contrato dadas. */
export function rotulosDosCamposDoFiltro(telas: readonly Screen[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const f of buildNativeSeed('CONTRATO').fields) {
    const chave = f.nativeKey ? chaveDoNativo(f.nativeKey) : null
    if (chave) out.set(chave, f.label)
  }
  for (const t of telas) {
    if (t.subjectType !== 'CONTRATO') continue
    for (const f of t.fields) if (f.source === 'CUSTOM' && !out.has(PREFIXO + fieldValueKey(f))) out.set(PREFIXO + fieldValueKey(f), f.label)
  }
  return out
}
