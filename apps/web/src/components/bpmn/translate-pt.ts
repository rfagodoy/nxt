/* Tradução pt-BR do bpmn-js (menu de troca "Change element", tooltips do context
 * pad e da paleta, rótulos dos tipos). Substitui o serviço `translate` do modeler.
 * Cobre as strings VISÍVEIS no designer do Nxt; o que não estiver no dicionário
 * cai no template original (com as {substituições}). */

const DICT: Record<string, string> = {
  // ── Context pad (ações ao redor do elemento) ──
  'Append {type}': 'Adicionar {type}',
  'Append task': 'Adicionar tarefa',
  'Append Task': 'Adicionar tarefa',
  'Append end event': 'Adicionar fim',
  'Append EndEvent': 'Adicionar fim',
  'Append gateway': 'Adicionar decisão',
  'Append Gateway': 'Adicionar decisão',
  'Append intermediate/boundary event': 'Adicionar evento intermediário',
  'Append Intermediate/Boundary Event': 'Adicionar evento intermediário',
  'Append text annotation': 'Adicionar anotação',
  'Append TextAnnotation': 'Adicionar anotação',
  'Append element': 'Adicionar elemento',
  'Add Lane above': 'Adicionar raia acima',
  'Add Lane below': 'Adicionar raia abaixo',
  'Divide into two Lanes': 'Dividir em duas raias',
  'Divide into three Lanes': 'Dividir em três raias',
  'Connect using Sequence/MessageFlow or Association': 'Conectar (fluxo/associação)',
  'Connect using DataInputAssociation': 'Conectar (dados)',
  'Connect using Association': 'Conectar (associação)',
  'Connect using Sequence/MessageFlow': 'Conectar',
  'Remove': 'Remover',
  'Change type': 'Trocar tipo',
  'Change element': 'Trocar tipo de etapa',

  // ── Paleta / ferramentas ──
  'Activate the hand tool': 'Mover a tela',
  'Activate hand tool': 'Mover a tela',
  'Activate the lasso tool': 'Seleção em laço',
  'Activate the create/remove space tool': 'Criar/remover espaço',
  'Activate the global connect tool': 'Conectar elementos',
  'Create expanded SubProcess': 'Criar subprocesso',
  'Create Pool/Participant': 'Criar pool',
  'Create Group': 'Criar grupo',

  // ── Tipos: eventos ── (bpmn-js v17 usa sentence-case: "Start event")
  'Start event': 'Início',
  'Start Event': 'Início',
  'End event': 'Fim',
  'End Event': 'Fim',
  'Intermediate throw event': 'Evento intermediário (lança)',
  'Intermediate catch event': 'Evento intermediário (captura)',
  'Message start event': 'Início por mensagem',
  'Timer start event': 'Início por tempo',
  'Conditional start event': 'Início condicional',
  'Signal start event': 'Início por sinal',
  'Error end event': 'Fim por erro',
  'Message end event': 'Fim por mensagem',
  'Terminate end event': 'Fim (encerra tudo)',

  // ── Tipos: gateways ──
  'Exclusive gateway': 'Decisão exclusiva (ou/ou)',
  'Exclusive Gateway': 'Decisão exclusiva (ou/ou)',
  'Parallel gateway': 'Paralelo (e/e)',
  'Parallel Gateway': 'Paralelo (e/e)',
  'Inclusive gateway': 'Decisão inclusiva',
  'Complex gateway': 'Decisão complexa',
  'Event-based gateway': 'Decisão por evento',
  'Event based gateway': 'Decisão por evento',

  // ── Tipos: tarefas/atividades ──
  'Task': 'Tarefa',
  'User task': 'Tarefa do usuário',
  'User Task': 'Tarefa do usuário',
  'Service task': 'Ação automática',
  'Service Task': 'Ação automática',
  'Send task': 'Enviar',
  'Receive task': 'Receber',
  'Manual task': 'Tarefa manual',
  'Business rule task': 'Regra de negócio',
  'Script task': 'Script',
  'Call activity': 'Chamar processo',
  'Sub-process (collapsed)': 'Subprocesso (recolhido)',
  'Sub-process (expanded)': 'Subprocesso (expandido)',
  'Sub-process': 'Subprocesso',
  'Sub Process': 'Subprocesso',
  'Transaction': 'Transação',
  'Event sub-process': 'Subprocesso de evento',
  'Ad-hoc sub-process (collapsed)': 'Subprocesso ad-hoc (recolhido)',
  'Ad-hoc sub-process (expanded)': 'Subprocesso ad-hoc (expandido)',

  // ── Tipos: dados / diversos ──
  'Data store reference': 'Referência a armazenamento',
  'Data object reference': 'Referência a objeto de dados',
  'Text annotation': 'Anotação',
  'Group': 'Grupo',
  'Pool': 'Pool',
  'Participant': 'Participante',
  'Expanded pool/participant': 'Pool (expandido)',
  'Empty pool/participant': 'Pool (vazio)',
  'Loop': 'Laço',
  'Parallel multi-instance': 'Múltiplas instâncias (paralelo)',
  'Sequential multi-instance': 'Múltiplas instâncias (sequencial)',

  // ── Erros comuns do importador (aparecem em toasts) ──
  'no diagram to display': 'nenhum diagrama para exibir',
  'no process or collaboration to display': 'nenhum processo para exibir',
  'element {element} referenced by {referenced}#{property} not yet drawn':
    'elemento {element} referenciado por {referenced}#{property} ainda não desenhado',
}

/** Função de tradução compatível com o serviço `translate` do diagram-js:
 *  substitui {chaves} pelas replacements após buscar o template no dicionário. */
export function translatePT(template: string, replacements?: Record<string, string>): string {
  const translated = DICT[template] ?? template
  return translated.replace(/{([^}]+)}/g, (_, key) => String(replacements?.[key] ?? `{${key}}`))
}

/** Módulo do diagram-js que sobrescreve o serviço `translate` por pt-BR. */
const translateModulePT = {
  translate: ['value', translatePT],
}

export default translateModulePT
