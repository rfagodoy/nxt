/**
 * R3 — cadastro do Contrato DIRIGIDO pela tela padrão (isDefault + ACTIVE).
 * Espelha screen-partner-layout: resolve a tela numa lista ordenada de seções prontas
 * para render. Seções de CAMPOS (dados_gerais, vigencia, valor) carregam o predicado de
 * visibilidade dos campos nativos (`screenVis`); seções-BLOCO (partes, lançamentos,
 * reajuste, aditivos, documentos, histórico) são componentes atômicos — a tela controla
 * só se a seção aparece. O discriminador do Contrato é a NATUREZA (DESPESA/RECEITA/AMBOS),
 * análogo à `category` do parceiro: Pagamentos só em DESPESA/AMBOS, Recebimentos só em
 * RECEITA/AMBOS. Campos personalizados capturados na seção vêm da própria tela.
 */
import {
  FileText, Users, Calendar, Banknote, TrendingDown, TrendingUp,
  RefreshCw, FilePlus2, Paperclip, Clock, Layers, type LucideIcon,
} from 'lucide-react'
import type { Screen, ScreenField } from './screen-types'
import { reconcileNative } from './screen-native-structure'
import { temPagamentos, temRecebimentos } from './contract-options'

export type ContractVisFn = (key: string) => boolean

/** Ícone por seção nativa do Contrato (mesma linguagem visual do cadastro atual). */
const NATIVE_ICON: Record<string, LucideIcon> = {
  dados_gerais: FileText,     partes:       Users,
  vigencia:     Calendar,     valor:        Banknote,
  pagamentos:   TrendingDown, recebimentos: TrendingUp,
  reajuste:     RefreshCw,    aditivos:     FilePlus2,
  documentos:   Paperclip,    historico:    Clock,
}

/** Seções-BLOCO: componente nativo atômico (sem toggle campo a campo); nunca somem por
 *  "0 campos visíveis" — o conteúdo é o próprio componente. */
export const CONTRACT_BLOCK_SECTIONS = new Set([
  'partes', 'pagamentos', 'recebimentos', 'reajuste', 'aditivos', 'documentos', 'historico',
])

/** Seções que só existem no DETALHE (adita-se/auditoria de contrato já existente). */
const DETAIL_ONLY = new Set(['aditivos', 'historico'])

export interface ResolvedContractSection {
  id:           string
  key:          string        // nativeKey (estado open/tab) ou id p/ custom
  label:        string
  nativeKey:    string | null
  icon:         LucideIcon
  defaultOpen:  boolean
  order:        number
  screenVis:    ContractVisFn // campos nativos visíveis segundo a tela
  customFields: ScreenField[] // campos personalizados desta seção (persistidos)
}

/** Escolhe a tela que comanda o cadastro: a padrão ATIVA (reconciliada com a estrutura
 *  nativa viva). Retorna null quando não há tela padrão → cai no form nativo. */
export function pickDefaultScreen(screens: Screen[]): Screen | null {
  const def = screens.find(s => s.status === 'ACTIVE' && s.isDefault)
  return def ? reconcileNative(def) : null
}

/**
 * Resolve as seções da tela em ordem, para uma NATUREZA e um MODO (`new` = cadastro novo,
 * `detail` = detalhe/edição). Aditivos e Histórico só no detalhe; Pagamentos/Recebimentos
 * conforme a natureza. Seção de campos esvaziada (0 nativos visíveis e nenhum custom) some;
 * seção-bloco é atômica; seção 100% custom sem campo não aparece.
 */
export function resolveContractSections(
  screen: Screen,
  natureza: string,
  mode: 'new' | 'detail',
): ResolvedContractSection[] {
  const customBySection = new Map<string, ScreenField[]>()
  screen.fields
    .filter(f => f.source === 'CUSTOM' && f.visible !== false)
    .sort((a, b) => a.order - b.order)
    .forEach(f => {
      const k = f.sectionId ?? '__loose__'
      const arr = customBySection.get(k) ?? []
      arr.push(f)
      customBySection.set(k, arr)
    })

  const nativeByKey = new Map(
    screen.fields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]),
  )

  // campos nativos VISÍVEIS em cada seção (para não exibir seção de campos vazia)
  const visibleNativeBySection = new Map<string, number>()
  screen.fields
    .filter(f => f.source === 'NATIVE' && f.sectionId && f.visible !== false)
    .forEach(f => visibleNativeBySection.set(f.sectionId!, (visibleNativeBySection.get(f.sectionId!) ?? 0) + 1))

  const out: ResolvedContractSection[] = []
  for (const s of [...screen.sections].filter(s => s.visible !== false).sort((a, b) => a.order - b.order)) {
    const nativeKey = s.source === 'NATIVE' ? (s.nativeKey ?? null) : null
    // gating por modo e natureza
    if (nativeKey && DETAIL_ONLY.has(nativeKey) && mode === 'new') continue
    if (nativeKey === 'pagamentos'   && !temPagamentos(natureza))   continue
    if (nativeKey === 'recebimentos' && !temRecebimentos(natureza)) continue

    const custom  = customBySection.get(s.id) ?? []
    const isBlock = nativeKey ? CONTRACT_BLOCK_SECTIONS.has(nativeKey) : false
    // seção de campos nativa esvaziada → não exibe; seção-bloco nunca some por contagem
    if (nativeKey && !isBlock && (visibleNativeBySection.get(s.id) ?? 0) === 0 && custom.length === 0) continue
    // seção 100% custom sem nenhum campo → não exibe
    if (!nativeKey && custom.length === 0) continue

    out.push({
      id:          s.id,
      key:         nativeKey ?? s.id,
      label:       s.label,
      nativeKey,
      icon:        nativeKey ? (NATIVE_ICON[nativeKey] ?? Layers) : Layers,
      defaultOpen: s.defaultOpen,
      order:       s.order,
      // visibilidade do campo nativo segundo a tela; ausente na tela → visível
      screenVis:   (key: string) => {
        const f = nativeByKey.get(key)
        return f ? f.visible !== false : true
      },
      customFields: custom,
    })
  }
  return out
}
