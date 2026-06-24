import { notFound } from 'next/navigation'
import { ModuleDetail } from './module-detail'

interface Props {
  params: Promise<{ slug: string }>
}

async function getModule(orgId: string, slug: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/modules/${slug}?organizationId=${orgId}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  return res.json()
}

async function getDashboard(orgId: string, slug: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/modules/${slug}/dashboard?organizationId=${orgId}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  return res.json()
}

export default async function ModuleSlugPage({ params }: Props) {
  const { slug } = await params
  const orgId = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'dev'

  const [module, dashboard] = await Promise.all([
    getModule(orgId, slug),
    getDashboard(orgId, slug),
  ])

  if (!module) notFound()

  return <ModuleDetail module={module} dashboard={dashboard} organizationId={orgId} />
}
