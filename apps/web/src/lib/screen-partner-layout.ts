/**
 * Cadastro do Fornecedor DIRIGIDO pela tela padrão. A resolução das seções (visibilidade
 * e obrigatoriedade por tipo de parceiro, trava) é do @nxt/screens-core — a MESMA que a API
 * usa ao gravar. Aqui só se acrescenta o que é de UI: o ícone.
 */
import { Building2, Briefcase, Phone, MapPin, CreditCard, Users, Clock, Layers, type LucideIcon } from 'lucide-react'
import type { Screen, PartnerCategory } from './screen-types'
import type { LockContext } from './screen-locks'
import {
  resolvePartnerSections as resolveCore, PARTNER_BLOCK_SECTIONS, pickDefaultScreen,
  type ResolvedPartnerSection as CoreSection, type PartnerVisFn,
} from '@nxt/screens-core'

export { PARTNER_BLOCK_SECTIONS, pickDefaultScreen, type PartnerVisFn }

/** Ícone por seção nativa do Fornecedor (mesma linguagem visual do cadastro atual). */
const NATIVE_ICON: Record<string, LucideIcon> = {
  identificacao: Building2,
  cnae:          Briefcase,
  contato:       Phone,
  endereco:      MapPin,
  bancario:      CreditCard,
  socios:        Users,
  historico:     Clock,
}

export interface ResolvedPartnerSection extends CoreSection { icon: LucideIcon }

export function resolvePartnerSections(
  screen: Screen,
  category: PartnerCategory,
  mode: 'new' | 'detail' = 'detail',
  lock: LockContext = {},
): ResolvedPartnerSection[] {
  return resolveCore(screen, category, mode, lock)
    .map(s => ({ ...s, icon: s.nativeKey ? (NATIVE_ICON[s.nativeKey] ?? Layers) : Layers }))
}
