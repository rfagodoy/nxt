'use client'

/* ─── Condição na seta (desenho livre, PO 30/10/2026) ──────────────────────────
   O caminho de uma escolha MORA na seta que sai do losango. Clicar numa dessas setas abre
   este editor: o mesmo construtor de condição da gaveta da escolha e o rótulo que aparece no
   desenho. No losango que ainda não fecha em blocos, o "Editar" de cada caminho da gaveta
   (gaveta-losango) abre este mesmo editor. */
import type { JSX } from 'react'
import type { EdgeConditionSpec, SetaDesenho } from '@nxt/types'
import type { CampoDisponivel } from '@/lib/flow-conditions'
import { Input } from '@/components/ui/input'
import { CondBuilder } from '../condition-builder'

export type PatchDaSeta = Partial<Pick<SetaDesenho, 'condition' | 'conditionSpec' | 'rotulo'>>

export function EditorDaSeta({ seta, campos, onPatch }: {
  seta: SetaDesenho; campos: CampoDisponivel[]; onPatch: (p: PatchDaSeta) => void
}): JSX.Element {
  return (
    <div className="space-y-4">
      <CondBuilder edge={{ condition: seta.condition, conditionSpec: seta.conditionSpec as EdgeConditionSpec | undefined, label: seta.rotulo }}
        campos={campos}
        semCampos={<p role="status" className="text-[11.5px] text-muted-foreground">Nenhum campo para filtrar: as etapas depois desta seta ainda não têm tela de contrato.</p>}
        onSet={(p) => onPatch({
          ...('condition' in p ? { condition: p.condition } : {}),
          ...('conditionSpec' in p ? { conditionSpec: p.conditionSpec } : {}),
          ...('label' in p ? { rotulo: p.label } : {}),
        })} />
      <div className="space-y-1 border-t pt-3">
        <label htmlFor={`rotulo-seta-${seta.id}`} className="block text-xs font-medium">Como este caminho aparece no desenho</label>
        <Input id={`rotulo-seta-${seta.id}`} className="h-9 text-sm" value={seta.rotulo ?? ''} placeholder="Ex.: Precisa do Patrimônio"
          onChange={(e) => onPatch({ rotulo: e.target.value })} />
      </div>
    </div>
  )
}
