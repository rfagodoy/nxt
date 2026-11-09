'use client'

/* ─── Caminho: a seta que sai de uma escolha (desenho livre, PO 30/10/2026) ─────
   O caminho de uma escolha MORA na seta que sai do losango. Clicar numa dessas setas abre
   esta gaveta: o mesmo construtor de condição da gaveta da escolha e o rótulo que aparece no
   desenho. No losango que ainda não fecha em blocos, o "Editar" de cada caminho da gaveta
   (gaveta-losango) abre esta mesma gaveta.
   Padrão das gavetas (gaveta-padrao, PO 07/11/2026): resumo no cabeçalho, seções e o rodapé
   com Cancelar / Aplicar. O que se muda vale ao vivo no desenho; Cancelar, o X e o Esc voltam
   a condição e o rótulo ao que eram na abertura. */
import type { JSX } from 'react'
import { useRef } from 'react'
import { Route, SlidersHorizontal, Tag } from 'lucide-react'
import type { EdgeConditionSpec, SetaDesenho } from '@nxt/types'
import type { CampoDisponivel } from '@/lib/flow-conditions'
import { Input } from '@/components/ui/input'
import { CondBuilder } from '../condition-builder'
import { GatewayGlyph } from '../flow-shared'
import { GavetaLateral } from './gaveta'
import { CAMPO, CORPO_DA_GAVETA, Pergunta, ROTULO, RodapePadrao, ResumoFalta, ResumoForte, TOM_DO_TIPO, useEscCancela } from './gaveta-padrao'

export type PatchDaSeta = Partial<Pick<SetaDesenho, 'condition' | 'conditionSpec' | 'rotulo'>>

/** Traçado da seta (pontas livres, PO 03/11/2026): com as pontas ajustadas à mão, volta ao
 *  caminho automático; sem elas, explica como ajustar. Na gaveta da seta, do caminho e do
 *  fluxo de mensagem. */
export function CaminhoAutomatico({ ajustado, onRestaurar }: { ajustado: boolean; onRestaurar: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 shadow-sm">
      <Route aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-[11.5px] leading-snug text-muted-foreground">
        {ajustado ? 'As pontas desta seta foram ajustadas à mão.' : 'Traçado automático. Para ajustar, selecione a seta e arraste uma das pontas pelo contorno da forma.'}
      </p>
      {ajustado && (
        <button type="button" onClick={onRestaurar}
          className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-[11.5px] font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Caminho automático
        </button>
      )}
    </div>
  )
}

export function GavetaDoCaminho({ seta, pergunta, para, campos, onPatch, onCaminhoAutomatico, onFechar, focarAoAbrir }: {
  seta: SetaDesenho
  /** a pergunta da escolha de onde o caminho sai (pode faltar) e a forma onde ele chega */
  pergunta?: string; para: string
  campos: CampoDisponivel[]
  onPatch: (p: PatchDaSeta) => void
  /** com ela, mostra o traçado (pontas livres) e o "Caminho automático" */
  onCaminhoAutomatico?: () => void
  onFechar: () => void
  focarAoAbrir?: boolean
}): JSX.Element {
  /* retrato da abertura: o Cancelar devolve a condição e o rótulo */
  const original = useRef<PatchDaSeta>({ condition: seta.condition, conditionSpec: seta.conditionSpec, rotulo: seta.rotulo })
  const cancelar = () => { onPatch(original.current); onFechar() }
  useEscCancela(cancelar)

  /* "Caso contrário" (seta padrão) não tem condição: é o que sobra */
  const temCondicao = !!seta.condition?.trim()
  const okCondicao = temCondicao || !!seta.padrao
  const rotulo = seta.rotulo?.trim()
  const resumo = (
    <>
      {pergunta ? <>Na escolha “<ResumoForte>{pergunta}</ResumoForte>”</> : 'Nesta escolha'}
      {seta.padrao ? ', quando nenhum outro caminho servir' : temCondicao ? <>, se <ResumoForte>{rotulo || seta.condition}</ResumoForte></> : <>, <ResumoFalta>falta a condição</ResumoFalta></>}
      {', vai para '}<ResumoForte>{para}</ResumoForte>.
    </>
  )

  return (
    <GavetaLateral rotulo="Caminho" rotuloTom={TOM_DO_TIPO.escolha} rotuloIcone={<GatewayGlyph kind="exclusive" className="h-3 w-3" />}
      titulo={`Para ${para}`} resumo={resumo} rotuloFechar="Fechar sem aplicar" onFechar={cancelar} focarAoAbrir={focarAoAbrir}
      rodape={<RodapePadrao pendentes={okCondicao ? 0 : 1} faltam={['condição']} onCancelar={cancelar} onAplicar={onFechar} />}>
      <div className={CORPO_DA_GAVETA}>
        {!seta.padrao && (
          <Pergunta id="caminho-condicao" titulo="Condição" ok={okCondicao} icone={<SlidersHorizontal />} valor={rotulo || seta.condition}
            ajuda="Quando o processo segue por este caminho.">
            <CondBuilder edge={{ condition: seta.condition, conditionSpec: seta.conditionSpec as EdgeConditionSpec | undefined, label: seta.rotulo }}
              campos={campos}
              semCampos={<p role="status" className="text-[11.5px] leading-snug text-muted-foreground">Nenhum campo para filtrar: nem as etapas antes desta escolha nem as depois desta seta têm tela de contrato.</p>}
              onSet={(p) => onPatch({
                ...('condition' in p ? { condition: p.condition } : {}),
                ...('conditionSpec' in p ? { conditionSpec: p.conditionSpec } : {}),
                ...('label' in p ? { rotulo: p.label } : {}),
              })} />
          </Pergunta>
        )}
        <Pergunta id="caminho-rotulo" titulo="Rótulo no desenho" ok icone={<Tag />} valor={rotulo || 'Sem rótulo'}>
          <div className="flex flex-col gap-1">
            <label htmlFor={`rotulo-seta-${seta.id}`} className={ROTULO}>Como este caminho aparece no desenho</label>
            <Input id={`rotulo-seta-${seta.id}`} className={CAMPO} value={seta.rotulo ?? ''} placeholder="Ex.: Precisa do Patrimônio"
              onChange={(e) => onPatch({ rotulo: e.target.value })} />
          </div>
        </Pergunta>
        {onCaminhoAutomatico && <CaminhoAutomatico ajustado={!!(seta.saida || seta.entrada)} onRestaurar={onCaminhoAutomatico} />}
      </div>
    </GavetaLateral>
  )
}
