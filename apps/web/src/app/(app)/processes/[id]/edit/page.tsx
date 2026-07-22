'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { apiJson } from '@/lib/http'
import { ProcessFlow, type FlowInitial } from '@/components/processes/process-flow'
import type { ProcessFormSchema } from '@nxt/types'

interface Proc {
  id: string
  name: string
  description?: string | null
  bpmnXml: string
  kind?: string | null
  formSchema: ProcessFormSchema
}

export default function EditProcessPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [initial, setInitial] = useState<FlowInitial | null | undefined>(undefined)

  useEffect(() => {
    void (async () => {
      const p = await apiJson<Proc>(`/api/processes/${id}`)
      if (!p) { setInitial(null); return }
      setInitial({ id: p.id, name: p.name, description: p.description, kind: p.kind, bpmnXml: p.bpmnXml, steps: p.formSchema?.steps ?? [], positions: p.formSchema?.positions, graph: p.formSchema?.graph })
    })()
  }, [id])

  if (initial === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando editor…
      </div>
    )
  }
  if (initial === null) {
    return (
      <div className="space-y-3">
        <Link href="/processes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Workflows
        </Link>
        <p className="text-sm">Processo não encontrado.</p>
      </div>
    )
  }
  return <ProcessFlow initial={initial} />
}
