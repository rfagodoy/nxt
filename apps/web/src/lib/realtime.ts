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

function conectar() {
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
