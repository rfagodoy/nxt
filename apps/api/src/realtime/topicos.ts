/* Quais gravações viram aviso "algo mudou" para os navegadores abertos.
 *
 * Regra puro-HTTP (sem conhecer cada serviço): toda requisição que MUDA dado e deu
 * certo avisa a organização, com o recurso da rota como tópico ("contracts",
 * "partners", "instances"…). O que fica de fora é o que usa método de escrita sem
 * mudar nada de ninguém. */

/** Rotas de escrita que não alteram dado compartilhado. */
const SEM_EFEITO: RegExp[] = [
  /^auth\//,       // login, refresh, logout, esqueci a senha
  /\/query$/,      // listas usam POST para LER (filtros no corpo)
  /^cep(\/|$)/,    // consulta externa
  /^cnpj(\/|$)/,   // consulta externa
  /^files(\/|$)/,  // anexo sobe antes de o documento ser salvo; quem avisa é o save
  /^realtime(\/|$)/,
]

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Tópicos a avisar para uma requisição bem-sucedida (vazio = não avisa ninguém). */
export function topicosDaRota(method: string, url: string): string[] {
  if (LEITURA.has(method.toUpperCase())) return []
  const caminho = url.split('?')[0].replace(/^\/+/, '').replace(/^api\//, '')
  if (!caminho || SEM_EFEITO.some(r => r.test(caminho))) return []
  return [caminho.split('/')[0]]
}

/** Uma mudança endereçada a uma organização — ou a todas ('*'), quando vem de um
 *  agendador que não sabe dizer de quem era o dado. */
export interface Mudanca { organizationId: string; topicos: string[]; em: string }
export const TODAS_AS_ORGANIZACOES = '*'

export const pertenceA = (m: Mudanca, organizationId: string) =>
  m.organizationId === organizationId || m.organizationId === TODAS_AS_ORGANIZACOES
