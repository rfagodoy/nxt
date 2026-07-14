'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getScreen } from '@/hooks/use-screens'
import { ScreenBuilder } from '@/components/screens/screen-builder'
import type { Screen } from '@/lib/screen-types'

export default function ScreenBuilderPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const isNew = id === 'new'

  const [screen, setScreen]   = useState<Screen | null>(null)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (isNew || !id) return
    let alive = true
    void getScreen(id).then(s => { if (alive) { setScreen(s); setLoading(false) } })
    return () => { alive = false }
  }, [id, isNew])

  if (isNew) return <ScreenBuilder />
  if (loading) return <div className="max-w-4xl mx-auto p-8 text-center text-xs text-muted-foreground">Carregando tela…</div>
  if (!screen) return <div className="max-w-4xl mx-auto p-8 text-center text-xs text-muted-foreground">Tela não encontrada.</div>
  return <ScreenBuilder initial={screen} />
}
