'use client'

/* Renderiza os documentos abertos da área de trabalho (acima do roteamento).
   Todos ficam montados (escondidos quando inativos) para preservar edições não salvas. */

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/http'
import { useWorkspace, type WorkspaceTab } from '@/contexts/workspace-context'
import { ContractDetailView, type Row as ContractRow } from '@/components/contracts/contract-detail-view'
import { PartnerDetailView, type PartnerAPI } from '@/components/partners/partner-detail-view'
import { UnitDetailView, type Unit } from '@/components/organization/unit-detail-view'
import ContractNewForm from '@/components/contracts/contract-new-form'
import PartnerNewForm from '@/components/partners/partner-new-form'

const Loader = () => <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">Carregando...</div>

/* parceiro: busca os dados pelo id da aba quando ausentes (ex.: após recarregar a página) */
function PartnerDoc({ tab }: { tab: WorkspaceTab }) {
  const { close, setDirty } = useWorkspace()
  const [partner, setPartner] = useState<PartnerAPI | null>((tab.data as PartnerAPI | undefined) ?? null)
  useEffect(() => {
    if (partner) return
    const id = tab.id.slice('partner:'.length)
    let cancel = false
    void (async () => {
      try { const res = await apiFetch(`/api/partners/${id}`); if (res.ok && !cancel) setPartner(await res.json() as PartnerAPI) } catch { /* ignore */ }
    })()
    return () => { cancel = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!partner) return <Loader />
  return <PartnerDetailView partner={partner} onClose={() => close(tab.id)} onSaved={fireRefresh} onDirtyChange={d => setDirty(tab.id, d)} />
}

/* avisa as listas para recarregarem após salvar/ativar/transição */
function fireRefresh() { try { window.dispatchEvent(new Event('nxt:workspace:refresh')) } catch { /* SSR */ } }

function Document({ tab }: { tab: WorkspaceTab }) {
  const { close, setDirty } = useWorkspace()

  if (tab.kind === 'contract') {
    if (tab.mode === 'new') {
      return (
        <div className="max-w-3xl mx-auto">
          <ContractNewForm embedded onSaved={() => { fireRefresh(); close(tab.id) }} onCancel={() => close(tab.id)} />
        </div>
      )
    }
    return <ContractDetailView row={tab.data as ContractRow} onClose={() => close(tab.id)} onSaved={fireRefresh} onDirtyChange={d => setDirty(tab.id, d)} />
  }

  if (tab.kind === 'unit') {
    if (tab.mode === 'new') {
      const d = tab.data as { companyId: string; parentId: string | null; parentName: string | null }
      return <UnitDetailView mode="new" companyId={d.companyId} parentId={d.parentId} parentName={d.parentName}
        onClose={() => close(tab.id)} onSaved={() => { fireRefresh(); close(tab.id) }} onDirtyChange={dy => setDirty(tab.id, dy)} />
    }
    return <UnitDetailView mode="detail" unit={tab.data as Unit} onClose={() => close(tab.id)} onSaved={fireRefresh} onDirtyChange={dy => setDirty(tab.id, dy)} />
  }

  // parceiro
  if (tab.mode === 'new') {
    return (
      <div className="max-w-3xl mx-auto">
        <PartnerNewForm embedded onSaved={() => { fireRefresh(); close(tab.id) }} onCancel={() => close(tab.id)} />
      </div>
    )
  }
  return <PartnerDoc tab={tab} />
}

export function WorkspaceHost() {
  const { tabs, activeId } = useWorkspace()
  if (tabs.length === 0) return null
  return (
    <>
      {tabs.map(t => (
        <div key={t.id} className={activeId === t.id ? 'h-full' : 'hidden'}>
          <Document tab={t} />
        </div>
      ))}
    </>
  )
}
