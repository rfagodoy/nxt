/* Regras das TELAS — implementação ÚNICA, compartilhada pelo front (apps/web) e pela
   API (apps/api). A tela diz quem pode alterar o quê (travas) e o que é exigido
   (obrigatórios); até este pacote isso só valia no navegador, e quem chamasse a API
   direto gravava campo travado numa boa. Tudo aqui é função PURA. */

export * from './src/types'
export * from './src/native'
export * from './src/categories'
export * from './src/locks'
export * from './src/layout-partner'
export * from './src/layout-contract'
export * from './src/obrigatorios'
export * from './src/conferencia'
export * from './src/gravacao'
export * from './src/tarefa'
