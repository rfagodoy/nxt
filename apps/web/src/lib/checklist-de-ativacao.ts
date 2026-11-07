/* Checklist "Antes de ativar" do editor de workflow (opção C, PO 07/11/2026).
 *
 * As pendências de ativação eram uma lista de frases longas, uma por problema, numa pílula
 * no topo — dez frases técnicas cobrindo o desenho. Aqui elas viram poucas linhas por
 * ASSUNTO, com a contagem; cada linha abre os itens para ir até cada um. "Quem pode
 * iniciar" é configuração do workflow, não do desenho: fica na seção de configuração.
 * Aviso não impede a ativação e fica separado. */

import type { Pendencia } from '@/components/processes/flow-shared'

export interface GrupoDoChecklist {
  chave: string
  titulo: string
  itens: Pendencia[]
}

export interface Checklist {
  /** quantas coisas impedem a ativação */
  faltam: number
  /** os problemas de "Quem pode iniciar" (vazio = ok) */
  quemInicia: Pendencia[]
  quemIniciaOk: boolean
  /** o resto, por assunto, na ordem em que se resolve */
  grupos: GrupoDoChecklist[]
  /** o que só informa */
  avisos: Pendencia[]
}

const QUEM_INICIA = new Set(['quem-inicia-vazio', 'quem-inicia-invalido', 'iniciador-sem-regra'])

/** assunto → título, na ordem de exibição */
const GRUPOS: ReadonlyArray<{ chave: string; titulo: string; tipos: readonly string[] }> = [
  { chave: 'fim', titulo: 'Caminhos que não chegam ao Fim', tipos: ['nao-alcanca-fim', 'fim-inalcancavel', 'inalcancavel-do-inicio', 'inicio-desligado', 'trecho-inalcancavel', 'inicio-fim', 'fim-sem-seta'] },
  { chave: 'ligacao', titulo: 'Formas sem ligação', tipos: ['sem-saida', 'gateway-sem-saida', 'solto', 'sem-chegada', 'fora-do-fluxo', 'juncao-travada', 'todos-com-saida', 'seta-no-inicio'] },
  { chave: 'escolhas', titulo: 'Escolhas e caminhos incompletos', tipos: ['decisao-sem-padrao', 'decisao-multipadrao', 'escolha-sem-caminho', 'caminho-sem-condicao', 'paralelo-com-um-caminho', 'saida-dentro-de-paralelo', 'volta-invalida', 'senao-descontinuado',
    'saidas-multiplas', 'juncao-de-escolha', 'junta-e-divide', 'ramos-sem-juncao', 'salto-do-encontro', 'senao-repetido', 'volta-sem-decisao', 'ciclo'] },
  { chave: 'tarefas', titulo: 'Tarefas sem quem faz, prazo ou nome', tipos: ['atividade-incompleta', 'executor-sem-stakeholder', 'executor-incompativel', 'executor-sem-contrato', 'executor-sem-entidade', 'executor-vago'] },
  { chave: 'telas', titulo: 'Telas das tarefas', tipos: ['tela-so-consulta', 'registro-sem-origem'] },
  { chave: 'nao-executa', titulo: 'Formas que o sistema não executa', tipos: ['ainda-nao-executa'] },
]
const OUTROS = { chave: 'outros', titulo: 'Outros ajustes no desenho' }

export function montarChecklist(pendencias: readonly Pendencia[]): Checklist {
  const bloqueia = pendencias.filter((p) => p.severidade !== 'aviso')
  const avisos = pendencias.filter((p) => p.severidade === 'aviso')
  const quemInicia = bloqueia.filter((p) => QUEM_INICIA.has(p.tipo))
  const doDesenho = bloqueia.filter((p) => !QUEM_INICIA.has(p.tipo))

  const porChave = new Map<string, Pendencia[]>()
  for (const p of doDesenho) {
    const chave = GRUPOS.find((g) => g.tipos.includes(p.tipo))?.chave ?? OUTROS.chave
    porChave.set(chave, [...(porChave.get(chave) ?? []), p])
  }
  const grupos = [...GRUPOS, OUTROS]
    .filter((g) => porChave.has(g.chave))
    .map((g) => ({ chave: g.chave, titulo: g.titulo, itens: porChave.get(g.chave)! }))

  return { faltam: bloqueia.length, quemInicia, quemIniciaOk: quemInicia.length === 0, grupos, avisos }
}

/** Rótulo curto de um item dentro do grupo: o `rotulo` do motor, ou a frase cortada. */
export function rotuloDoItem(p: Pendencia): string {
  if (p.rotulo?.trim()) return p.rotulo.trim()
  const m = p.mensagem.trim()
  return m.length > 90 ? `${m.slice(0, 87).trimEnd()}…` : m
}
