/* Regras PURAS do que acontece com contrato/parceiro quando o processo que os
   produziu é cancelado — e do caminho de volta.

   Ficam fora do service porque decidem sobre DINHEIRO e sobre acordo com terceiro:
   um contrato assinado marcado como cancelado por engano administrativo é o pior
   defeito que este módulo pode ter. Aqui está escrito o que pode ser desfeito
   sozinho e o que exige alguém dizer "sim, eu sei o que estou fazendo". */

import { normalizeSituacao } from '@nxt/contracts-core'

export type EffectKind = 'CREATE' | 'ADITIVO' | 'DISTRATO' | 'ACTIVATE'
export type EntityType = 'CONTRACT' | 'PARTNER'

/** Situação de contrato que aceita ser cancelada sem perguntar: ainda não produziu
 *  efeito para fora da empresa.
 *  ⚠️ Passa por `normalizeSituacao` porque o banco guarda estados LEGADOS
 *  (PENDENTE, REVISAO, SUSPENSO) que significam "em cadastro" — comparar a string
 *  crua fazia um contrato recém-criado pedir confirmação sem motivo. */
const RASCUNHO_DE_CONTRATO = new Set(['EM_CADASTRO'])

export interface ContractSnapshot {
  situacao: string
  /** o contrato já andou por conta própria? (aditivo, lançamento, documento) */
  temMovimento: boolean
}

export interface EffectPlanItem {
  effectId: string
  kind: EffectKind
  entityType: EntityType
  entityId: string
  /** rótulo humano do que será feito, mostrado antes de confirmar */
  descricao: string
  /** true quando a ação mexe em algo que já vale para fora e precisa de confirmação */
  requerConfirmacao: boolean
  /** motivo da confirmação, para a tela explicar em vez de só bloquear */
  aviso?: string
}

/**
 * O que fazer com um contrato CRIADO por um processo que está sendo cancelado.
 *
 * - Em cadastro e parado: cancela junto, sem cerimônia — nada saiu da empresa.
 * - Vigente, encerrado, rescindido OU com movimento: exige confirmação explícita.
 *   O processo interno ter sido cancelado não desfaz um acordo assinado, e quem
 *   cancela pode não saber que o contrato andou.
 */
export function planContractCreate(snap: ContractSnapshot): { requerConfirmacao: boolean; aviso?: string } {
  const situacao = normalizeSituacao(snap.situacao)
  if (RASCUNHO_DE_CONTRATO.has(situacao) && !snap.temMovimento) return { requerConfirmacao: false }
  if (snap.temMovimento) {
    return { requerConfirmacao: true, aviso: 'O contrato já tem aditivo, lançamento ou documento registrado.' }
  }
  return { requerConfirmacao: true, aviso: `O contrato está ${situacao === 'VIGENTE' ? 'VIGENTE' : `com situação ${situacao}`} e pode ter efeito para terceiros.` }
}

/** Descrição humana do que a reversão fará — é o texto que a pessoa lê antes de
 *  confirmar, então fala de contrato e aditivo, não de conector e efeito. */
export function describeRevert(kind: EffectKind, entityType: EntityType, rotulo: string): string {
  switch (kind) {
    case 'CREATE':
      return entityType === 'CONTRACT'
        ? `Contrato ${rotulo} passa a Cancelado`
        : `Parceiro ${rotulo} permanece como está (criação de parceiro não é revertida)`
    case 'ADITIVO':   return `Aditivo lançado no contrato ${rotulo} volta para Rascunho (deixa de valer)`
    case 'DISTRATO':  return `Encerramento do contrato ${rotulo} é revertido (volta à situação anterior)`
    case 'ACTIVATE':  return `Parceiro ${rotulo} volta ao status anterior à ativação`
  }
}

/** Descrição do caminho de volta, para a tela de reabertura. */
export function describeRestore(kind: EffectKind, entityType: EntityType, rotulo: string): string {
  switch (kind) {
    case 'CREATE':
      return entityType === 'CONTRACT' ? `Contrato ${rotulo} volta à situação anterior ao cancelamento` : `Parceiro ${rotulo} permanece como está`
    case 'ADITIVO':   return `Aditivo do contrato ${rotulo} volta a valer (Ativo)`
    case 'DISTRATO':  return `Encerramento do contrato ${rotulo} volta a valer`
    case 'ACTIVATE':  return `Parceiro ${rotulo} volta a Ativo`
  }
}

/**
 * A entidade continua como o cancelamento a deixou?
 *
 * Entre cancelar e reabrir, alguém pode ter mexido no contrato por outra via —
 * reativado à mão, encerrado, lançado aditivo. Restaurar por cima disso apagaria uma
 * decisão mais recente e legítima, e ninguém saberia. Quando diverge, a reabertura
 * recusa e diz o que mudou.
 */
export function isUntouched(estadoAtual: string | undefined, estadoDeixado: string | undefined): boolean {
  if (!estadoDeixado) return true // cancelamento antigo, sem foto: nada a conferir
  return estadoAtual === estadoDeixado
}

/** Criação de PARCEIRO não é revertida: parceiro costuma ser cadastro de referência,
 *  usado por outros contratos e processos. Apagá-lo (ou inativá-lo) por causa de um
 *  processo cancelado quebraria vínculos alheios ao processo. */
export function isRevertible(kind: EffectKind, entityType: EntityType): boolean {
  if (kind === 'CREATE' && entityType === 'PARTNER') return false
  return true
}
