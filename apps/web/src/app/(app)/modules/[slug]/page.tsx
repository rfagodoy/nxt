import { notFound } from 'next/navigation'
import { serverFetch } from '@/lib/http-server'
import { ModuleDetail } from './module-detail'

interface Props {
  params: Promise<{ slug: string }>
}

async function getModule(slug: string) {
  const res = await serverFetch(`/api/modules/${slug}`)
  if (!res.ok) return null
  return res.json()
}

async function getDashboard(slug: string) {
  const res = await serverFetch(`/api/modules/${slug}/dashboard`)
  if (!res.ok) return null
  return res.json()
}

export default async function ModuleSlugPage({ params }: Props) {
  const { slug } = await params

  const [module, dashboard] = await Promise.all([
    getModule(slug),
    getDashboard(slug),
  ])

  if (!module) notFound()

  return <ModuleDetail module={module} dashboard={dashboard} />
}
