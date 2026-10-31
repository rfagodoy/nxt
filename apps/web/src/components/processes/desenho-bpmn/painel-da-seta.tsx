'use client'

/* ─── Condição na seta (desenho livre, PO 30/10/2026) ──────────────────────────
   O caminho de uma escolha MORA na seta que sai do losango. Clicar numa dessas setas abre
   este editor: o mesmo construtor de condição do Roteiro e o rótulo que aparece no
   desenho. `PainelDasSetas` é a lista usada no losango quando o desenho ainda não fecha em
   blocos (sem conversão não há ConfiguracaoDoBloco): cada seta que sai, com o mesmo editor. */
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

export function PainelDasSetas({ setas, paraOnde, camposDe, onPatch }: {
  setas: SetaDesenho[]
  /** nome da forma onde a seta chega ("Analisar contrato", "Fim") */
  paraOnde: (seta: SetaDesenho) => string
  camposDe: (seta: SetaDesenho) => CampoDisponivel[]
  onPatch: (setaId: string, p: PatchDaSeta) => void
}): JSX.Element {
  if (!setas.length) return <p className="text-sm text-muted-foreground">Nenhuma seta sai deste losango ainda. Puxe uma seta dele até o próximo passo.</p>
  return (
    <div className="space-y-5">
      {setas.map((s, i) => (
        <section key={s.id} aria-label={`Caminho ${i + 1}`} className="space-y-2 rounded-lg border p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">{i + 1}º caminho · para {paraOnde(s)}</p>
          <EditorDaSeta seta={s} campos={camposDe(s)} onPatch={(p) => onPatch(s.id, p)} />
        </section>
      ))}
    </div>
  )
}
