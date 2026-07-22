/* Motor de workflow (BPMN executável) — implementação ÚNICA e PURA, sem React,
   sem Prisma e sem relógio implícito. O interpretador não conhece banco nem
   domínio: recebe um grafo normalizado + estado + evento e devolve o próximo
   estado + uma lista de EFEITOS que o backend deve executar (criar tarefa na
   caixa, rodar um service-task, concluir a instância). Assim o coração do motor
   — a semântica de token/gateway/condição — é testável isoladamente. */

export * from './src/types'
export * from './src/conditions'
export * from './src/interpreter'
export * from './src/xml'
export * from './src/compile'
export * from './src/generate'
export * from './src/business-time'
