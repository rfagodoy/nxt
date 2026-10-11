'use client'

import { useEffect, useRef } from 'react'

/* Tempo real nas telas: recarregar quando algo muda — no servidor (outro usuário, o
 * motor de datas, a varredura de prazos) ou nesta própria aba.
 *
 * Por que precisou existir: o dashboard buscava os dados só ao montar. Prorrogar um
 * contrato numa aba de documento e voltar para a lista não remonta a página (ela fica
 * montada, escondida), então os números ficavam velhos até atualizar o navegador.
 *
 * Uma conexão SSE por aba do navegador, compartilhada por todas as telas que escutam:
 * abrir três telas não abre três conexões. */

type Ouvinte = () => void

const ouvintes = new Set<Ouvinte>()
let fonte: EventSource | null = null
let caiu = false

/** Evento local que a área de trabalho dispara ao salvar um documento. */
export const EVENTO_ATUALIZAR = 'nxt:workspace:refresh'

/* Aba ESCONDIDA solta a conexão (11/10/2026). Em HTTP/1.1 o navegador só abre 6
   conexões por servidor, somando TODAS as abas — e cada aba segurava uma SSE para
   sempre. Com 6 abas do Nxt abertas, nenhuma requisição saía mais: navegação, login e
   cliques ficavam na fila (parecia aba congelada). Em produção com HTTPS o Nginx fala
   HTTP/2 e não sofre disso; acesso por HTTP simples (dev, IP interno) sofria. Ao voltar
   a ficar visível, reconecta — e `useAoVivo` já recarrega nesse momento. */
let soltaAoEsconder = false
function vigiarVisibilidade() {
  if (soltaAoEsconder || typeof document === 'undefined') return
  soltaAoEsconder = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (fonte) { fonte.close(); fonte = null; caiu = false }
    } else if (ouvintes.size > 0) conectar()
  })
}

function conectar() {
  vigiarVisibilidade()
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (fonte || typeof window === 'undefined' || typeof EventSource === 'undefined') return
  fonte = new EventSource('/bff/api/realtime/eventos')
  fonte.addEventListener('mudanca', () => ouvintes.forEach(o => o()))
  /* O EventSource reconecta sozinho. Ao voltar, pode ter perdido mudanças enquanto
     esteve fora — então quem escuta recarrega uma vez. */
  fonte.onopen  = () => { if (caiu) { caiu = false; ouvintes.forEach(o => o()) } }
  fonte.onerror = () => { caiu = true }
}

function desconectarSeOcioso() {
  if (ouvintes.size > 0 || !fonte) return
  fonte.close(); fonte = null; caiu = false
}

/** Chama `recarregar` quando algo muda — e quando a aba do navegador volta a ficar
 *  visível. Várias mudanças em sequência (salvar dispara mais de uma gravação) viram
 *  UMA recarga. */
export function useAoVivo(recarregar: () => void, atrasoMs = 400) {
  const ref = useRef(recarregar)
  useEffect(() => { ref.current = recarregar })

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const agendar = () => { clearTimeout(t); t = setTimeout(() => ref.current(), atrasoMs) }
    const aoVoltar = () => { if (document.visibilityState === 'visible') agendar() }

    ouvintes.add(agendar)
    conectar()
    window.addEventListener(EVENTO_ATUALIZAR, agendar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearTimeout(t)
      ouvintes.delete(agendar)
      window.removeEventListener(EVENTO_ATUALIZAR, agendar)
      document.removeEventListener('visibilitychange', aoVoltar)
      desconectarSeOcioso()
    }
  }, [atrasoMs])
}
