/**
 * Cadastro do Contrato DIRIGIDO pela tela padrão. A resolução das seções (visibilidade,
 * trava, natureza, modo) é do @nxt/screens-core — a MESMA que a API usa para conferir
 * travas e obrigatórios ao gravar. Aqui só se acrescenta o que é de UI: o ícone.
 */
import {
  FileText, Users, Calendar, Banknote, TrendingDown, TrendingUp,
  RefreshCw, FilePlus2, Paperclip, Clock, Layers, type LucideIcon,
} from 'lucide-react'
import type { Screen } from './screen-types'
import type { LockContext } from './screen-locks'
import {
  resolveContractSections as resolveCore, CONTRACT_BLOCK_SECTIONS, pickDefaultScreen,
  type ResolvedContractSection as CoreSection, type ContractVisFn,
} from '@nxt/screens-core'

export { CONTRACT_BLOCK_SECTIONS, pickDefaultScreen, type ContractVisFn }

/** Ícone por seção nativa do Contrato (mesma linguagem visual do cadastro atual). */
const NATIVE_ICON: Record<string, LucideIcon> = {
  dados_gerais: FileText,     partes:       Users,
  vigencia:     Calendar,     valor:        Banknote,
  pagamentos:   TrendingDown, recebimentos: TrendingUp,
  reajuste:     RefreshCw,    aditivos:     FilePlus2,
  documentos:   Paperclip,    historico:    Clock,
}

export interface ResolvedContractSection extends CoreSection { icon: LucideIcon }

export function resolveContractSections(
  screen: Screen,
  natureza: string,
  mode: 'new' | 'detail',
  lock: LockContext = {},
): ResolvedContractSection[] {
  return resolveCore(screen, natureza, mode, lock)
    .map(s => ({ ...s, icon: s.nativeKey ? (NATIVE_ICON[s.nativeKey] ?? Layers) : Layers }))
}
