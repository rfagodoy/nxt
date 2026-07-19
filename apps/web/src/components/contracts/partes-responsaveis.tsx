'use client'

import type { ReactNode } from 'react'
import { PartesFields } from './contract-fields'
import { ResponsaveisSection } from '@/components/responsaveis/responsaveis-section'

type PartesProps = Parameters<typeof PartesFields>[0]

function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</h4>
      {children}
    </div>
  )
}

/** Seção "Partes envolvidas" do contrato = dois blocos: as PARTES (entidades que
 *  assinam: Contratante/Contratada…) e os RESPONSÁVEIS (pessoas por papel). Reúne o
 *  que o PO chama de "partes envolvidas" num lugar só. */
export function PartesEResponsaveis({ contractId, ...partes }: PartesProps & { contractId?: string }) {
  return (
    <div className="space-y-4">
      <SubBlock title="Partes (entidades)">
        <PartesFields {...partes} />
      </SubBlock>
      <SubBlock title="Responsáveis (pessoas)">
        <ResponsaveisSection entityType="CONTRATO" entityId={contractId} readOnly={partes.ro} />
      </SubBlock>
    </div>
  )
}
