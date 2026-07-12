/* Regras de negócio do Contrato — implementação ÚNICA, compartilhada pelo front
   (apps/web) e pelo backend (apps/api). Antes deste pacote, cada lado tinha a sua
   cópia das derivações (terminoVigente/valorVigente/parcelaVigente/…) e elas já
   divergiam em casos de borda. Tudo aqui é função PURA: sem React, sem Prisma e
   sem relógio implícito — quem depende de "hoje" recebe `today` por parâmetro. */

export * from './src/num'
export * from './src/dates'
export * from './src/types'
export * from './src/derive'
export * from './src/reajuste'
export * from './src/parcelas'
export * from './src/renovacao'
export * from './src/motor'
