import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Clock } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

const STATUS_CLS: Record<string, { label: string; cls: string }> = {
  RUNNING:   { label: 'Em andamento', cls: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Concluído',    cls: 'bg-green-100 text-green-800'   },
  CANCELLED: { label: 'Cancelado',    cls: 'bg-red-100 text-red-700'       },
  ERROR:     { label: 'Erro',         cls: 'bg-red-100 text-red-700'       },
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return value.toLocaleString('pt-BR')
  return String(value)
}

export default async function RecordDetailPage({ params }: Props) {
  const { slug, id } = await params
  const orgId = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'

  const [recordRes, moduleRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modules/${slug}/records/${id}?organizationId=${orgId}`, { cache: 'no-store' }),
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/modules/${slug}?organizationId=${orgId}`, { cache: 'no-store' }),
  ])

  if (!recordRes.ok || !moduleRes.ok) notFound()

  const [record, module] = await Promise.all([recordRes.json(), moduleRes.json()])
  const data = record.data as Record<string, unknown>
  const status = record.processInstance?.status
  const badge = status ? STATUS_CLS[status] : null
  const columns = module.schema.columns as Array<{ name: string; label: string; type: string; stepId: string }>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/modules/${slug}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-base font-semibold tracking-tight">Detalhes do registro</h1>
            {badge && (
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Criado em {new Date(record.createdAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
          </p>
        </div>
      </div>

      {/* Dados */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold">Dados coletados</h2>
        </div>
        <div className="divide-y">
          {columns.map((col) => (
            <div key={col.name} className="px-4 py-2 grid grid-cols-3 gap-3">
              <span className="text-xs text-muted-foreground font-medium">{col.label}</span>
              <span className="text-xs col-span-2">{formatValue(data[col.name])}</span>
            </div>
          ))}
          {columns.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>

      {/* Documentos */}
      {record.documents?.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30">
            <h2 className="text-xs font-semibold">Documentos anexados</h2>
          </div>
          <div className="divide-y">
            {record.documents.map((doc: { id: string; name: string; mimeType: string; uploadedAt: string }) => (
              <div key={doc.id} className="px-4 py-2 flex items-center gap-3">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.name}</p>
                  <p className="text-[11px] text-muted-foreground">{doc.mimeType}</p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linha do tempo */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold">Histórico do processo</h2>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-muted-foreground">Processo iniciado em</span>
            <span className="font-medium">
              {new Date(record.processInstance?.startedAt || record.createdAt).toLocaleString('pt-BR')}
            </span>
          </div>
          {record.processInstance?.completedAt && (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
              <span className="text-muted-foreground">Concluído em</span>
              <span className="font-medium">
                {new Date(record.processInstance.completedAt).toLocaleString('pt-BR')}
              </span>
            </div>
          )}
          {status === 'RUNNING' && (
            <div className="flex items-center gap-2 text-xs">
              <div className="h-2 w-2 rounded-full bg-yellow-500 shrink-0 animate-pulse" />
              <span className="text-muted-foreground">Aguardando etapa</span>
              <span className="font-medium">{record.processInstance?.currentStep}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
