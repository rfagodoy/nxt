/* eslint-disable @typescript-eslint/no-explicit-any */
/* Módulos customizados do bpmn-js para o designer do Nxt:
 *  1) PalettePT — paleta ENXUTA, só com os elementos que o motor executa
 *     (@nxt/workflow-core: start/end, tarefa do usuário, ação automática,
 *     decisão exclusiva e paralela), com rótulos em pt-BR. Evita oferecer
 *     construções que a ativação rejeitaria.
 *  2) engineReplaceMenu — filtra o menu "Trocar tipo" para os MESMOS tipos
 *     suportados, para o usuário não trocar por algo que não compila. */

// Tipos que o compilador (@nxt/workflow-core) executa.
const ALLOWED_REPLACE_IDS = new Set([
  'replace-with-user-task',
  'replace-with-service-task',
  'replace-with-task',
  'replace-with-exclusive-gateway',
  'replace-with-parallel-gateway',
  'replace-with-none-start', // start event simples
  'replace-with-none-end', // end event simples
  // eventos de fronteira/subprocess ficam de fora (não suportados no motor)
])

// ── 1) Paleta customizada ────────────────────────────────────────────────────
function PalettePT(
  this: any,
  palette: any,
  create: any,
  elementFactory: any,
  handTool: any,
  lassoTool: any,
  spaceTool: any,
  globalConnect: any,
) {
  this.create = create
  this.elementFactory = elementFactory
  this.handTool = handTool
  this.lassoTool = lassoTool
  this.spaceTool = spaceTool
  this.globalConnect = globalConnect
  palette.registerProvider(this)
}

PalettePT.$inject = [
  'palette',
  'create',
  'elementFactory',
  'handTool',
  'lassoTool',
  'spaceTool',
  'globalConnect',
]

PalettePT.prototype.getPaletteEntries = function () {
  const { create, elementFactory, handTool, lassoTool, spaceTool, globalConnect } = this

  const spawn = (type: string, title: string, className: string, options?: any) => {
    const start = (event: any) => {
      const shape = elementFactory.createShape({ type, ...(options ?? {}) })
      create.start(event, shape)
    }
    return { group: 'nxt', className, title, action: { dragstart: start, click: start } }
  }

  return {
    'hand-tool': {
      group: 'tools',
      className: 'bpmn-icon-hand-tool',
      title: 'Mover a tela',
      action: { click: (e: any) => handTool.activateHand(e) },
    },
    'lasso-tool': {
      group: 'tools',
      className: 'bpmn-icon-lasso-tool',
      title: 'Seleção em laço',
      action: { click: (e: any) => lassoTool.activateSelection(e) },
    },
    'space-tool': {
      group: 'tools',
      className: 'bpmn-icon-space-tool',
      title: 'Criar/remover espaço',
      action: { click: (e: any) => spaceTool.activateSelection(e) },
    },
    'global-connect-tool': {
      group: 'tools',
      className: 'bpmn-icon-connection-multi',
      title: 'Conectar elementos',
      action: { click: (e: any) => globalConnect.start(e) },
    },
    'tool-separator': { group: 'tools', separator: true },

    'create.start-event': spawn('bpmn:StartEvent', 'Início', 'bpmn-icon-start-event-none'),
    'create.user-task': spawn('bpmn:UserTask', 'Tarefa do usuário', 'bpmn-icon-user-task'),
    'create.service-task': spawn('bpmn:ServiceTask', 'Ação automática', 'bpmn-icon-service-task'),
    'create.exclusive-gateway': spawn('bpmn:ExclusiveGateway', 'Decisão (ou/ou)', 'bpmn-icon-gateway-xor'),
    'create.parallel-gateway': spawn('bpmn:ParallelGateway', 'Paralelo (e/e)', 'bpmn-icon-gateway-parallel'),
    'create.end-event': spawn('bpmn:EndEvent', 'Fim', 'bpmn-icon-end-event-none'),
  }
}

// ── 2) Filtro do menu "Trocar tipo" ──────────────────────────────────────────
function EngineReplaceMenu(this: any, popupMenu: any) {
  popupMenu.registerProvider('bpmn-replace', this)
}
EngineReplaceMenu.$inject = ['popupMenu']

EngineReplaceMenu.prototype.getPopupMenuEntries = function () {
  // middleware: recebe as entradas padrão e remove as não suportadas.
  return function (entries: Record<string, any>) {
    for (const id of Object.keys(entries)) {
      if (!ALLOWED_REPLACE_IDS.has(id)) delete entries[id]
    }
    return entries
  }
}

export const paletteModulePT = {
  __init__: ['paletteProvider'],
  paletteProvider: ['type', PalettePT],
}

export const replaceMenuModulePT = {
  __init__: ['engineReplaceMenu'],
  engineReplaceMenu: ['type', EngineReplaceMenu],
}
