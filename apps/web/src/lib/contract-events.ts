/** Emitido quando algo FORA da tela alterou contratos (hoje: o motor de datas, via
 *  POST /api/notifications/run). Quem estiver com um contrato aberto recarrega — ou,
 *  se houver edição não salva, avisa em vez de descartar o trabalho do usuário. */
export const CONTRACTS_CHANGED_EVENT = 'nxt:contracts:changed'

export const emitContractsChanged = () => window.dispatchEvent(new Event(CONTRACTS_CHANGED_EVENT))
