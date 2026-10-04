/**
 * R2 — cadastro do Fornecedor DIRIGIDO pela tela padrão.
 * Resolve a tela padrão (isDefault + ACTIVE) numa lista ordenada de seções prontas
 * para render: cada seção nativa aponta o componente real (via `nativeKey`) e carrega
 * o predicado de visibilidade dos seus campos nativos (`screenVis`) + os campos
 * personalizados capturados ali dentro. Seções/campos CUSTOM vêm da própria tela.
 */
import type { Screen, ScreenField, PartnerCategory } from './types'
import { fieldVisibleFor, nativeAppliesTo, requiredFor } from './categories'
import { nativeLockFn, fieldLocked, lockCtx, sectionIsLocked, type LockContext } from './locks'

export type PartnerVisFn = (key: string) => boolean

/** Seções-BLOCO: componente atômico (sem toggle campo a campo); nunca somem por "0 campos". */
export const PARTNER_BLOCK_SECTIONS = new Set(['historico'])
/** Seções que só existem no DETALHE (auditoria de parceiro já existente). */
const PARTNER_DETAIL_ONLY = new Set(['historico'])

export interface ResolvedPartnerSection {
  id:           string       // id da seção da tela (chave estável)
  key:          string       // chave para estado (open/tab/erros): nativeKey, ou id p/ custom
  label:        string       // rótulo definido na tela
  nativeKey:    string | null // seção nativa (identificacao, contato, …) ou null se CUSTOM
  defaultOpen:  boolean
  order:        number
  screenVis:    PartnerVisFn  // campos nativos visíveis segundo a tela
  screenLock:   PartnerVisFn  // campos nativos TRAVADOS (tela + seção + etapa do workflow)
  /** Seção INTEIRA em consulta (tela em consulta, ou a própria seção travada). */
  locked:       boolean
  customFields: ScreenField[] // campos personalizados desta seção (persistidos)
}

/**
 * Resolve as seções da tela em ordem PARA UM TIPO de parceiro. A visibilidade de cada
 * campo é a EFETIVA para o tipo (`fieldVisibleFor`): faz sentido para o tipo (intrínseco)
 * + não desligado globalmente + não oculto naquele tipo (`hiddenCategories`). O gating
 * de seção (CNAE só PJ_BR; Sócios só PJ) e o "esvaziou → some" também são por tipo.
 */
export function resolvePartnerSections(
  screen: Screen,
  category: PartnerCategory,
  mode: 'new' | 'detail' = 'detail',
  lock: LockContext = {},
): ResolvedPartnerSection[] {
  const isPJ   = category === 'PJ_BR' || category === 'PJ_EST'
  const isPJBR = category === 'PJ_BR'
  // Camadas montadas uma vez: tela (piso) → seções travadas → etapa do workflow (aperta).
  const ctx: LockContext = lockCtx(screen, lock)
  const nativeLock = nativeLockFn(screen, ctx)

  const customBySection = new Map<string, ScreenField[]>()
  screen.fields
    .filter(f => f.source === 'CUSTOM' && fieldVisibleFor(f, category))
    .sort((a, b) => a.order - b.order)
    .forEach(f => {
      const k = f.sectionId ?? '__loose__'
      const arr = customBySection.get(k) ?? []
      // bakeia a obrigatoriedade EFETIVA para o tipo e a TRAVA efetiva (tela + etapa) →
      // downstream lê `required`/`locked` sem precisar conhecer as camadas
      arr.push({ ...f, required: requiredFor(f, category), locked: fieldLocked(f, ctx) })
      customBySection.set(k, arr)
    })

  const nativeByKey = new Map(
    screen.fields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]),
  )

  // campos nativos VISÍVEIS PARA O TIPO em cada seção (para não exibir seção vazia)
  const visibleNativeBySection = new Map<string, number>()
  screen.fields
    .filter(f => f.source === 'NATIVE' && f.sectionId && fieldVisibleFor(f, category))
    .forEach(f => visibleNativeBySection.set(f.sectionId!, (visibleNativeBySection.get(f.sectionId!) ?? 0) + 1))

  const out: ResolvedPartnerSection[] = []
  for (const s of [...screen.sections].filter(s => s.visible !== false).sort((a, b) => a.order - b.order)) {
    const nativeKey = s.source === 'NATIVE' ? (s.nativeKey ?? null) : null
    // gating de modo (Histórico só no detalhe) e de categoria
    if (nativeKey && PARTNER_DETAIL_ONLY.has(nativeKey) && mode === 'new') continue
    if (nativeKey === 'socios' && !isPJ)   continue
    if (nativeKey === 'cnae'   && !isPJBR) continue
    const custom   = customBySection.get(s.id) ?? []
    const isBlock  = nativeKey ? PARTNER_BLOCK_SECTIONS.has(nativeKey) : false
    // seção de campos nativa esvaziada (0 nativos visíveis e nenhum custom) → não exibe;
    // seção-bloco (Histórico) é atômica: nunca some por contagem
    if (nativeKey && !isBlock && (visibleNativeBySection.get(s.id) ?? 0) === 0 && custom.length === 0) continue
    out.push({
      id:          s.id,
      key:         nativeKey ?? s.id,
      label:       s.label,
      nativeKey,
      defaultOpen: s.defaultOpen,
      order:       s.order,
      // visibilidade efetiva do campo nativo para o tipo; ausente na tela → cai no intrínseco
      screenVis:   (key: string) => {
        const f = nativeByKey.get(key)
        return f ? fieldVisibleFor(f, category) : nativeAppliesTo(key, category)
      },
      screenLock:  nativeLock,
      locked:      sectionIsLocked(s, ctx),
      customFields: custom,
    })
  }
  return out
}
