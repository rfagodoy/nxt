/* ─── A linha "tela" do cartão da atividade no editor (PO, 22/11/2026) ─────────
   O cartão diz quais telas a tarefa abre: o nome da primeira (na ordem da execução)
   e "+N" quando há mais. A dica traz a lista inteira, com editar/consulta e fechada. */
import type { StepFormSchema } from '@nxt/types'
import { telasDaTarefa } from '@nxt/screens-core'

export interface ResumoDasTelas {
  /** "Dados do contrato", "Dados do contrato +2" ou "Sem tela" */
  texto: string
  /** a lista na ordem da execução, uma tela por linha */
  dica: string
  /** a atividade não abre tela nenhuma */
  semTela: boolean
}

type PassoComTelas = Pick<StepFormSchema, 'screenRef' | 'entityMode' | 'extraScreens' | 'posicaoDaPrincipal' | 'principalFechada'>

export function resumoDasTelas(step: PassoComTelas | undefined, nomeDaTela: (id: string) => string | undefined): ResumoDasTelas {
  const telas = step ? telasDaTarefa(step) : []
  if (!telas.length) return { texto: 'Sem tela', dica: 'Esta atividade não abre tela', semTela: true }
  const nome = (id: string) => nomeDaTela(id) ?? 'Tela removida'
  const resto = telas.length - 1
  return {
    texto: `${nome(telas[0].screenRef)}${resto > 0 ? ` +${resto}` : ''}`,
    dica: telas.map((t, i) => `${i + 1}. ${nome(t.screenRef)} · ${t.editavel ? 'editar' : 'consulta'}${t.aberta ? '' : ' · fechada'}`).join('\n'),
    semTela: false,
  }
}
