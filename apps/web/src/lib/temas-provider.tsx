'use client'

/* Aplica o tema do usuário: `data-tema` no <html> (cores, em globals.css) e a base clara ou
   escura no next-themes (a classe `.dark`). Salvo como a densidade: cache local primeiro
   (sem piscar — o script do layout já pôs o `data-tema`), depois a verdade do servidor. */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'
import { useSession } from '@/lib/session-context'
import { CHAVE_TEMA, TEMA_PADRAO, baseDoTema, temaDoLegado, temaValido, type IdTema } from '@/lib/temas'

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
    setEstado(temaValido(local) ? local : temaDoLegado(legado))
    if (!usuario) return
    void pullSetting<unknown>(CHAVE_TEMA).then((remoto) => { if (temaValido(remoto)) setEstado(remoto) })
  }, [usuario])

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    setTheme(baseDoTema(tema))
  }, [tema, setTheme])

  const setTema = useCallback((t: IdTema) => {
    setEstado(t)
    pushSetting(CHAVE_TEMA, t)
  }, [])

  return <Ctx.Provider value={{ tema, setTema }}>{children}</Ctx.Provider>
}

export const useTema = () => useContext(Ctx)
