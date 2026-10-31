/* Temas do sistema — preferência PESSOAL (PO, 30/10/2026), salva no usuário como a densidade.
   Cada tema tem uma BASE clara ou escura: a base é o "light/dark" do next-themes (a classe
   `.dark` que as telas já usam); por cima dela, `data-tema` no <html> troca as cores em
   globals.css. Nxt-Claro e Nxt-Escuro são os temas de sempre, só com nome novo. */

export type IdTema = 'nxt-claro' | 'nxt-escuro' | 'porcelana' | 'oceano' | 'cerrado' | 'meia-noite' | 'grafite' | 'alto-contraste'

export interface Tema {
  id: IdTema
  nome: string
  base: 'light' | 'dark'
  /** cores da amostra no menu: fundo, menu lateral, ação, destaque */
  amostra: [string, string, string, string]
}

export const TEMAS: readonly Tema[] = [
  { id: 'nxt-claro', nome: 'Nxt-Claro', base: 'light', amostra: ['#E3E9E4', '#2E3B33', '#169E62', '#D9F26B'] },
  { id: 'nxt-escuro', nome: 'Nxt-Escuro', base: 'dark', amostra: ['#1D2621', '#141B17', '#35C489', '#C8E35A'] },
  { id: 'porcelana', nome: 'Porcelana', base: 'light', amostra: ['#F2F4F8', '#1F2B47', '#2F5BD3', '#8FB2FF'] },
  { id: 'oceano', nome: 'Oceano', base: 'light', amostra: ['#EAF2F4', '#1A3F48', '#0F7C8C', '#7FE0D4'] },
  { id: 'cerrado', nome: 'Cerrado', base: 'light', amostra: ['#F5EFE7', '#3B2B24', '#B8562A', '#F2B880'] },
  { id: 'meia-noite', nome: 'Meia-noite', base: 'dark', amostra: ['#0F1524', '#0A0F1C', '#5B8CFF', '#9DBBFF'] },
  { id: 'grafite', nome: 'Grafite', base: 'dark', amostra: ['#1B1D20', '#131416', '#3FC1C9', '#8FE6EC'] },
  { id: 'alto-contraste', nome: 'Alto contraste', base: 'dark', amostra: ['#000000', '#000000', '#FFD400', '#FFFFFF'] },
]

export const TEMA_PADRAO: IdTema = 'nxt-claro'
/** chave da preferência (escopo do usuário na API; espelho no localStorage) */
export const CHAVE_TEMA = 'nxt:me:tema'

export const temaValido = (v: unknown): v is IdTema => TEMAS.some((t) => t.id === v)

export const baseDoTema = (id: IdTema): 'light' | 'dark' => TEMAS.find((t) => t.id === id)?.base ?? 'light'

/** Antes dos temas só havia claro/escuro (next-themes): cada um vira o tema de mesmo nome. */
export const temaDoLegado = (tema: string | undefined): IdTema => (tema === 'dark' ? 'nxt-escuro' : tema === 'light' ? 'nxt-claro' : TEMA_PADRAO)
