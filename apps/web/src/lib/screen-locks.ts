/**
 * Trava de edição das Telas — quem pode alterar o quê.
 *
 * Camadas encaixadas, e a de baixo NUNCA afrouxa a de cima:
 *  1. TELA — `readOnly`: a tela inteira é consulta. É o PISO de tudo.
 *  2. SEÇÃO — `locked`: a seção inteira é consulta. É o piso dos campos dela.
 *  3. CAMPO — `locked`: só aquele campo.
 *  4. ATIVIDADE do workflow — a etapa pode travar campos ADICIONAIS (`stepLocked`).
 * A trava efetiva é a UNIÃO: cada nível só aperta, nenhum destrava o de cima.
 * A mesma pergunta ("permite alteração ou é só consulta?") em três alturas.
 *
 * ⚠️ `ScreenField.mode` NÃO é trava. Nos campos nativos ele sempre valeu `'VIEW'`
 * (quer dizer "a tela apenas EXIBE o dado nativo, não define o widget"), então usá-lo
 * como trava congelaria de uma vez todo cadastro já existente. A trava é `locked`.
 */
import { PARTNER_CATEGORIES, fieldValueKey, type Screen, type ScreenField, type ScreenSection } from './screen-types'
import { fieldVisibleFor, requiredFor } from './screen-partner-categories'

export interface LockContext {
  /** Tela inteira em somente consulta. */
  screenReadOnly?: boolean
  /** Ids das SEÇÕES em somente consulta. */
  lockedSections?: ReadonlySet<string>
  /** CHAVES de campo travadas pela ATIVIDADE do workflow (última camada). São chaves do
   *  TIPO (`fieldKey`), não ids de linha: a mesma etapa vale para qualquer tela do subject,
   *  e o que já estava gravado continua batendo (a chave nasceu igual ao id antigo). */
  stepLocked?: ReadonlySet<string>
}

/**
 * Contexto de trava a partir da própria tela — quem chama não precisa saber montar
 * as camadas. `extra` sobrescreve (a etapa do workflow entra por aqui).
 */
export function lockCtx(screen: Pick<Screen, 'readOnly' | 'sections'>, extra: LockContext = {}): LockContext {
  return {
    screenReadOnly: extra.screenReadOnly ?? screen.readOnly,
    lockedSections: extra.lockedSections ?? new Set(screen.sections.filter(s => s.locked).map(s => s.id)),
    stepLocked:     extra.stepLocked,
  }
}

/** Trava efetiva de UM campo, com todas as camadas aplicadas. */
export function fieldLocked(field: Pick<ScreenField, 'id' | 'locked' | 'sectionId'>, ctx: LockContext = {}): boolean {
  if (ctx.screenReadOnly) return true
  if (field.locked) return true
  if (field.sectionId && ctx.lockedSections?.has(field.sectionId)) return true
  return ctx.stepLocked?.has(fieldValueKey(field)) ?? false
}

/** A seção inteira está em consulta? (a tela em consulta arrasta todas). */
export const sectionIsLocked = (
  section: Pick<ScreenSection, 'id' | 'locked'>,
  ctx: LockContext = {},
): boolean => Boolean(ctx.screenReadOnly || section.locked || ctx.lockedSections?.has(section.id))

/**
 * Predicado de trava por chave NATIVA — o par do `screenVis` da visibilidade, para
 * ser passado aos grupos de campos nativos (identificação, contato, …).
 * Chave que a tela não conhece = não travada (o cadastro segue como sempre foi).
 */
export function nativeLockFn(screen: Pick<Screen, 'fields' | 'readOnly' | 'sections'>, ctx: LockContext = {}): (key: string) => boolean {
  const full = ctx.screenReadOnly ?? screen.readOnly
  const secoes = ctx.lockedSections ?? new Set(screen.sections.filter(s => s.locked).map(s => s.id))
  if (full) return () => true
  const byKey = new Map(
    screen.fields.filter(f => f.source === 'NATIVE' && f.nativeKey).map(f => [f.nativeKey!, f]),
  )
  return (key: string) => {
    const f = byKey.get(key)
    return f ? fieldLocked(f, { ...ctx, lockedSections: secoes, screenReadOnly: false }) : false
  }
}

/**
 * Seção de LISTA (contatos, endereços, bancos, sócios) sem NENHUM campo editável.
 * Aí não se adiciona nem se remove item: apagar a linha destruiria justamente o valor
 * que a trava protege, e a linha nova nasceria impossível de preencher. Seção sem
 * campo visível nenhum não conta como travada — ela simplesmente não aparece.
 */
export const secaoTotalmenteTravada = (
  keys: readonly string[],
  isVisible: (key: string) => boolean,
  isLocked: (key: string) => boolean,
): boolean => {
  const vis = keys.filter(isVisible)
  return vis.length > 0 && vis.every(isLocked)
}

/** A tela inteira está em consulta? (a etapa do workflow pode impor isso por fora) */
export const screenIsReadOnly = (screen: Pick<Screen, 'readOnly'> | null | undefined, stepReadOnly?: boolean): boolean =>
  Boolean(stepReadOnly || screen?.readOnly)

export interface PendenciaDeTrava {
  fieldId:   string
  sectionId?: string
  label:     string
  /** Onde o conflito aparece: tipos de parceiro, ou vazio nas demais telas. */
  categorias: string[]
}

/**
 * Armadilha: campo TRAVADO e ao mesmo tempo OBRIGATÓRIO — ninguém consegue preenchê-lo
 * e o registro nunca fecha. Não bloqueia salvar a tela (a combinação é legítima quando o
 * valor chega por outra via: importação, ação automática, etapa anterior), mas é acusada
 * em português no construtor, como as pendências de ativação do workflow.
 *
 * Tela inteira em consulta NÃO gera pendência: lá nada é gravado, então obrigatoriedade
 * não se aplica a ninguém.
 */
export function pendenciasDeTrava(screen: Screen): PendenciaDeTrava[] {
  if (screen.readOnly) return []
  const ctx = lockCtx(screen)
  const out: PendenciaDeTrava[] = []
  for (const f of screen.fields) {
    // travado pelo próprio campo OU pela seção — a armadilha é a mesma
    if (!fieldLocked(f, ctx)) continue
    if (screen.subjectType === 'FORNECEDOR') {
      // por TIPO de parceiro: só conta onde o campo aparece E é exigido
      const cats = PARTNER_CATEGORIES
        .filter(c => fieldVisibleFor(f, c.value) && requiredFor(f, c.value))
        .map(c => c.short)
      if (cats.length) out.push({ fieldId: f.id, sectionId: f.sectionId, label: f.label, categorias: cats })
    } else if (f.visible !== false && f.required) {
      out.push({ fieldId: f.id, sectionId: f.sectionId, label: f.label, categorias: [] })
    }
  }
  return out
}

/** Frase da pendência, pronta para a tela. */
export const fraseDaPendencia = (p: PendenciaDeTrava): string =>
  p.categorias.length
    ? `“${p.label}” é obrigatório em ${p.categorias.join(', ')} e está travado — ninguém conseguirá preencher.`
    : `“${p.label}” é obrigatório e está travado — ninguém conseguirá preencher.`
