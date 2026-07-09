/**
 * Parâmetros de numeração de contratos (Configurações › Tabelas › Parâmetros gerais).
 * Persistido como um único objeto em AppSetting (org-level). A GERAÇÃO efetiva do número
 * acontece no backend ao criar o contrato (contracts.service) — aqui ficam o tipo, o default,
 * e as funções de formatação/preview (a formatação é ESPELHADA no backend).
 */

export const CONTRACT_NUMBERING_KEY = 'nxt:settings:parametros:contrato-numeracao'

export interface NumberingCfg {
  modo: 'AUTO' | 'MANUAL'
  prefixo: string
  separador: string
  incluirAno: boolean
  digitos: number
  sufixo: string
  inicio: number
  /** contador vivo (próxima sequência a atribuir) — gerido pelo backend */
  proximo?: number
  /** ano de validade do contador vivo — usado para o reinício anual */
  ano?: number
}

/** Default: MANUAL (mantém o comportamento atual até o usuário optar por automático). */
export const DEFAULT_NUMBERING: NumberingCfg = {
  modo: 'MANUAL', prefixo: 'CTR', separador: '-', incluirAno: true,
  digitos: 4, sufixo: '', inicio: 1, proximo: 1,
}

/** Formata o número a partir de uma sequência e um ano. ESPELHADO no backend (contracts.service). */
export function formatNumero(cfg: NumberingCfg, seq: number, year: number): string {
  const pad = String(Math.max(0, seq)).padStart(Math.max(0, cfg.digitos || 0), '0')
  const parts: string[] = []
  if (cfg.prefixo) parts.push(cfg.prefixo)
  if (cfg.incluirAno) parts.push(String(year))
  parts.push(pad)
  if (cfg.sufixo) parts.push(cfg.sufixo)
  return parts.join(cfg.separador ?? '')
}

/** Sequência que o próximo contrato receberá (considera o reinício anual pendente). */
export function proximaSeq(cfg: NumberingCfg, year: number): number {
  if (cfg.incluirAno && cfg.ano !== year) return cfg.inicio ?? 1
  return cfg.proximo ?? cfg.inicio ?? 1
}

/** Preview do próximo número a ser gerado. */
export function previewNumero(cfg: NumberingCfg, year: number): string {
  return formatNumero(cfg, proximaSeq(cfg, year), year)
}
