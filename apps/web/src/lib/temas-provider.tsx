'use client'

/* Aplica o tema do usuário: `data-tema` no <html> (cores, em globals.css) e a base clara ou
   escura no next-themes (a classe `.dark`). Salvo como a densidade: cache local primeiro
   (sem piscar — o script do layout já pôs o `data-tema`), depois a verdade do servidor. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'
import { useSession } from '@/lib/session-context'
import { CHAVE_TEMA, TEMA_PADRAO, baseDoTema, temaDoLegado, temaValido, type IdTema } from '@/lib/temas'

/** Põe o tema no <html> JÁ (antes de renderizar quem lê as cores resolvidas, como o desenho). */
const aplicar = (t: IdTema) => { document.documentElement.dataset.tema = t }

const Ctx = createContext<{ tema: IdTema; setTema: (t: IdTema) => void }>({ tema: TEMA_PADRAO, setTema: () => {} })

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const [tema, setEstado] = useState<IdTema>(TEMA_PADRAO)
  const { data: sessao } = useSession()
  const usuario = sessao?.user.id ?? null

  useEffect(() => {
    const local = cacheRead<unknown>(CHAVE_TEMA, null)
    // sem tema salvo: quem já usava claro/escuro (chave "theme" do next-themes) continua nele
    let legado: string | undefined
    try { legado = localStorage.getItem('theme') ?? undefined } catch { /* sem storage */ }
    const inicial = temaValido(local) ? local : temaDoLegado(legado)
    aplicar(inicial)
    setEstado(inicial)
    if (!usuario) return
    void pullSetting<unknown>(CHAVE_TEMA).then((remoto) => { if (temaValido(remoto)) { aplicar(remoto); setEstado(remoto) } })
  }, [usuario])

  /* Outra aba trocou o tema: esta adota o novo. Sem isso, cada aba reaplicava o SEU tema ao
     ouvir a troca da outra (o next-themes sincroniza a base clara/escura entre abas) e as duas
     brigavam até uma vencer — a página ficava com a base errada para o tema. */
  useEffect(() => {
    const ouvir = (e: StorageEvent) => {
      if (e.key !== CHAVE_TEMA || !e.newValue) return
      try { const t: unknown = JSON.parse(e.newValue); if (temaValido(t)) setEstado(t) } catch { /* valor estranho */ }
    }
    window.addEventListener('storage', ouvir)
    return () => window.removeEventListener('storage', ouvir)
  }, [])

  /* Aplica só quando o TEMA muda (não quando o next-themes recria o setTheme). */
  const setThemeRef = useRef(setTheme)
  setThemeRef.current = setTheme
  useEffect(() => {
<<<<<<< HEAD
    aplicar(tema)
    setTheme(baseDoTema(tema))
  }, [tema, setTheme])
=======
    document.documentElement.dataset.tema = tema
    setThemeRef.current(baseDoTema(tema))
  }, [tema])
>>>>>>> feat/temas

  const setTema = useCallback((t: IdTema) => {
    aplicar(t)
    setEstado(t)
    pushSetting(CHAVE_TEMA, t)
  }, [])

  return <Ctx.Provider value={{ tema, setTema }}>{children}</Ctx.Provider>
}

export const useTema = () => useContext(Ctx)
