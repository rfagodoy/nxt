'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cacheRead, pushSetting, pullSetting } from '@/lib/settings-store'

/* Valores mensais dos índices (fonte de verdade da Fase 3, funciona offline/on-prem).
   Estrutura: { [indiceId]: { 'yyyy-mm': percentual } }. Alimenta a sugestão de % ao
   registrar um reajuste; pode ser preenchida manualmente ou importada do Banco Central. */
export const INDICE_VALORES_KEY = 'nxt:settings:contratos:indice-valores'
export type IndiceValores = Record<string, Record<string, number>>

export function useIndiceValores() {
  const [valores, setValores] = useState<IndiceValores>({})
  const ref    = useRef<IndiceValores>({})
  const loaded = useRef(false)
  const changeEvent = `${INDICE_VALORES_KEY}:change`

  const apply = useCallback((next: IndiceValores) => { ref.current = next; setValores(next) }, [])
  const persist = useCallback((next: IndiceValores) => {
    apply(next); pushSetting(INDICE_VALORES_KEY, next); window.dispatchEvent(new Event(changeEvent))
  }, [apply, changeEvent])

  useEffect(() => {
    if (!loaded.current) { loaded.current = true; apply(cacheRead<IndiceValores>(INDICE_VALORES_KEY, {})) }
    void pullSetting<IndiceValores>(INDICE_VALORES_KEY).then(r => { if (r) apply(r) })
    const handler = () => apply(cacheRead<IndiceValores>(INDICE_VALORES_KEY, {}))
    window.addEventListener(changeEvent, handler)
    return () => window.removeEventListener(changeEvent, handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** % do índice numa competência (yyyy-mm), ou null se não houver. */
  const get = useCallback((indiceId: string, yyyymm: string): number | null => {
    const val = ref.current[indiceId]?.[yyyymm]
    return typeof val === 'number' && Number.isFinite(val) ? val : null
  }, [])
  const setValor = useCallback((indiceId: string, yyyymm: string, pct: number) =>
    persist({ ...ref.current, [indiceId]: { ...(ref.current[indiceId] ?? {}), [yyyymm]: pct } }), [persist])
  const removeValor = useCallback((indiceId: string, yyyymm: string) => {
    const cur = { ...(ref.current[indiceId] ?? {}) }; delete cur[yyyymm]
    persist({ ...ref.current, [indiceId]: cur })
  }, [persist])
  /** Mescla vários valores de uma vez (ex.: import do Banco Central). */
  const mergeMany = useCallback((indiceId: string, map: Record<string, number>) =>
    persist({ ...ref.current, [indiceId]: { ...(ref.current[indiceId] ?? {}), ...map } }), [persist])

  return { valores, get, setValor, removeValor, mergeMany }
}
