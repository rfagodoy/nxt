import { notFound } from 'next/navigation'

/* Endereço que não casa com nenhuma tela: cai aqui, DENTRO do grupo (app), para a
   página de erro abrir com o menu e a faixa do topo (ver not-found.tsx ao lado). As
   rotas que existem têm prioridade sobre esta, que é a última opção do roteador. */
export default function RotaInexistente() {
  notFound()
}
