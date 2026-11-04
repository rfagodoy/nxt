'use client'

/* ─── Condição na seta (desenho livre, PO 30/10/2026) ──────────────────────────
   O caminho de uma escolha MORA na seta que sai do losango. Clicar numa dessas setas abre
   este editor: o mesmo construtor de condição da gaveta da escolha e o rótulo que aparece no
   desenho. No losango que ainda não fecha em blocos, o "Editar" de cada caminho da gaveta
   (gaveta-losango) abre este mesmo editor. */
import type { JSX } from 'react'
import { Route } from 'lucide-react'
import type { EdgeConditionSpec, SetaDesenho } from '@nxt/types'
import type { CampoDisponivel } from '@/lib/flow-conditions'
import { Input } from '@/components/ui/input'
import { CondBuilder } from '../condition-builder'

export type PatchDaSeta = Partial<Pick<SetaDesenho, 'condition' | 'conditionSpec' | 'rotulo'>>

/** Traçado da seta (pontas livres, PO 03/11/2026): com as pontas ajustadas à mão, volta ao
 *  caminho automático; sem elas, explica como ajustar. Na gaveta da seta, da condição do
 *  caminho e do fluxo de mensagem. */
export function CaminhoAutomatico({ ajustado, onRestaurar }: { ajustado: boolean; onRestaurar: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <Route aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-[11.5px] leading-snug text-muted-foreground">
        {ajustado ? 'As pontas desta seta foram ajustadas à mão.' : 'Traçado automático. Para ajustar, selecione a seta e arraste uma das pontas pelo contorno da forma.'}
      </p>
      {ajustado && (
        <button type="button" onClick={onRestaurar}
          className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-[11.5px] font-semibold text-[var(--e-11804F)] hover:bg-[rgba(17,128,79,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--e-11804F)] dark:text-spark dark:hover:bg-white/5 dark:focus-visible:outline-spark">
          Caminho automático
        </button>
      )}
    </div>
  )
}

export function EditorDaSeta({ seta, campos, onPatch, onCaminhoAutomatico }: {
  seta: SetaDesenho; campos: CampoDisponivel[]; onPatch: (p: PatchDaSeta) => void
  /** com ela, mostra o traçado (pontas livres) e o "Caminho automático" */
  onCaminhoAutomatico?: () => void
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
      {onCaminhoAutomatico && <CaminhoAutomatico ajustado={!!(seta.saida || seta.entrada)} onRestaurar={onCaminhoAutomatico} />}
    </div>
  )
}
