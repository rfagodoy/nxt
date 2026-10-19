'use client'

/* Densidade da tela — preferência PESSOAL (PO, 18/10/2026): Compacta (menos espaço),
   Média e Alta (mais espaço). Fica salva no usuário (`nxt:me:` = escopo do token na API),
   então vale em todas as telas e em qualquer computador.

   Quem aplica é o CSS: o provedor só põe `data-densidade` no <html> e as listas leem as
   variáveis `--lista-*` de globals.css. Assim trocar numa lista muda todas, sem cada tela
   precisar ouvir nada. */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { cacheRead, pullSetting, pushSetting } from '@/lib/settings-store'
import { useSession } from '@/lib/session-context'

export type Densidade = 'compacta' | 'media' | 'alta'

export const DENSIDADES: ReadonlyArray<{ valor: Densidade; rotulo: string; descricao: string }> = [
  { valor: 'compacta', rotulo: 'Compacta', descricao: 'Mais linhas na tela, letra menor' },
  { valor: 'media',    rotulo: 'Média',    descricao: 'Equilíbrio entre leitura e quantidade' },
  { valor: 'alta',     rotulo: 'Alta',     descricao: 'Mais espaço, letra maior' },
]

const CHAVE = 'nxt:me:densidade'
/* Compacta é o padrão: é a densidade que o sistema sempre teve (o PO não gosta de tela arejada). */
const PADRAO: Densidade = 'compacta'

const valida = (v: unknown): v is Densidade => v === 'compacta' || v === 'media' || v === 'alta'

const Ctx = createContext<{ densidade: Densidade; setDensidade: (d: Densidade) => void }>({
  densidade: PADRAO, setDensidade: () => {},
})

export function DensidadeProvider({ children }: { children: React.ReactNode }) {
  const [densidade, setEstado] = useState<Densidade>(PADRAO)
  const { data: sessao } = useSession()
  const usuario = sessao?.user.id ?? null

  // cache local primeiro (sem piscar), depois a verdade do servidor — de novo a cada
  // troca de usuário: na tela de login ainda não há de quem ler
  useEffect(() => {
    const local = cacheRead<unknown>(CHAVE, null)
    setEstado(valida(local) ? local : PADRAO)
    if (!usuario) return
    void pullSetting<unknown>(CHAVE).then((remoto) => { if (valida(remoto)) setEstado(remoto) })
  }, [usuario])

  useEffect(() => {
    document.documentElement.dataset.densidade = densidade
  }, [densidade])

  const setDensidade = useCallback((d: Densidade) => {
    setEstado(d)
    pushSetting(CHAVE, d)
  }, [])

  return <Ctx.Provider value={{ densidade, setDensidade }}>{children}</Ctx.Provider>
}

export const useDensidade = () => useContext(Ctx)

/* Classes das listas — lêem as variáveis `--lista-*` (globals.css). Uma lista nova usa
   estas três e já segue a densidade escolhida pelo usuário. */
export const DENS_TABELA = 'text-[length:var(--lista-fonte)]'
export const DENS_CAB = 'px-[var(--lista-px)] h-[var(--lista-cab)]'
/* `[&>*]:align-middle`: elemento em linha (selo, interruptor, botão) alinhado pela BASE do texto
   soma a descida da letra e estica a linha além da densidade — pelo meio, não estica. */
export const DENS_CEL = 'px-[var(--lista-px)] py-[var(--lista-py)] h-[var(--lista-linha)] leading-[var(--lista-lh)] [&>*]:align-middle'
