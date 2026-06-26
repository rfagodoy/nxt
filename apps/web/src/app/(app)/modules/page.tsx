'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { apiFetch } from '@/lib/http'
import { SYSTEM_MODULES } from '@/lib/modules-catalog'

interface GeneratedModule {
  id: string
  name: string
  slug: string
  processDefinition?: { name: string; status: string }
}

function ModuleCard({
  href,
  name,
  description,
  icon: Icon,
  tag,
}: {
  href: string
  name: string
  description: string
  icon: React.ElementType
  tag: 'Sistema' | 'Gerado'
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-muted shrink-0">
          <Icon className="h-4 w-4 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{name}</h3>
            <span
              className={
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                (tag === 'Sistema'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')
              }
            >
              {tag}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>
    </Link>
  )
}

export default function ModulesPage() {
  const [generated, setGenerated] = useState<GeneratedModule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/modules')
        if (res.ok) setGenerated((await res.json()) as GeneratedModule[])
      } catch {
        /* mantém vazio */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Módulos</h1>
        <p className="text-[11px] text-muted-foreground">
          Módulos do sistema e os gerados automaticamente pelos seus processos
        </p>
      </div>

      {/* Módulos do sistema (catálogo) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SYSTEM_MODULES.map((m) => (
          <ModuleCard
            key={m.slug}
            href={m.href}
            name={m.name}
            description={m.description}
            icon={m.icon}
            tag="Sistema"
          />
        ))}

        {/* Módulos gerados via BPMN */}
        {generated.map((m) => (
          <ModuleCard
            key={m.id}
            href={`/modules/${m.slug}`}
            name={m.name}
            description={
              m.processDefinition?.name
                ? `Gerado do processo "${m.processDefinition.name}"`
                : 'Módulo gerado por processo BPMN'
            }
            icon={Package}
            tag="Gerado"
          />
        ))}
      </div>

      {/* Estado vazio só para os gerados (os de sistema sempre existem) */}
      {!loading && generated.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum módulo gerado ainda. Ative um processo em{' '}
            <Link href="/processes/new" className="text-primary hover:underline">
              Processos
            </Link>{' '}
            para gerar um módulo automaticamente.
          </p>
        </div>
      )}
    </div>
  )
}
