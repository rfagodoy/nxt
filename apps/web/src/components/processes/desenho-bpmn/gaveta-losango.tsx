'use client'

/* ─── Gaveta da escolha que ainda não fecha em blocos (losango solto) ───────────
   Sem conversão para blocos não há `GavetaDoBloco`: os caminhos são as SETAS que saem do
   losango. Mesmo padrão da escolha no bloco (gaveta-padrao): a pergunta e o modo numa seção,
   os caminhos em cartões — Editar abre a condição da seta (a gaveta "Caminho"), Remover apaga a seta. A
   seta marcada como padrão é o "Caso contrário". Mesma regra das outras gavetas: ao vivo;
   Cancelar, X e Esc voltam ao retrato da abertura; Aplicar mantém. */
import type { JSX } from 'react'
import { AlertTriangle, GitBranch, HelpCircle, Pencil, Trash2 } from 'lucide-react'
import type { FormaDesenho, SetaDesenho } from '@nxt/types'
import { Input } from '@/components/ui/input'
import { resumoDaEscolha } from '@/lib/editor-bizagi/resumos'
import { cn } from '@/lib/utils'
import { GatewayGlyph } from '../flow-shared'
import { GavetaLateral } from './gaveta'
import {
  AcaoDoCartao, CAMPO, CampoEscolha, CORPO_DA_GAVETA, FraseDoResumo, Pergunta, ROTULO, RodapePadrao, TOM_DO_TIPO, useEscCancela,
} from './gaveta-padrao'

export function GavetaDoLosango({ forma, setas, nomeDe, anteriores, onMudar, onEditarSeta, onApagarSeta, onRemover, onCancelar, onAplicar, focarAoAbrir }: {
  forma: FormaDesenho
  /** as setas que saem do losango */
  setas: SetaDesenho[]
  /** nome da forma onde uma seta chega */
  nomeDe: (id: string) => string
  /** nomes do que chega ao losango */
  anteriores: string[]
  onMudar: (patch: { pergunta?: string; modo?: 'primeiro' | 'todos' }) => void
  onEditarSeta: (setaId: string) => void
  onApagarSeta: (setaId: string) => void
  onRemover: () => void
  onCancelar: () => void
  onAplicar: () => void
  focarAoAbrir?: boolean
}): JSX.Element {
  useEscCancela(onCancelar)
  const modo = forma.modo ?? 'primeiro'
  const caminhos = setas.filter((x) => !x.padrao)
  const padrao = setas.find((x) => x.padrao)
  const semCondicao = caminhos.filter((x) => !x.condition?.trim()).length
  const okPergunta = !!forma.pergunta?.trim()
  const okCaminhos = caminhos.length > 0 && semCondicao === 0
  const pendentes = (okPergunta ? 0 : 1) + (okCaminhos ? 0 : 1)

  const cartao = (s: SetaDesenho, rotulo: string, i?: number) => {
    const temCond = !!s.condition?.trim()
    return (
      <li key={s.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-3 py-[var(--secao-pad)]">
        <div className="flex items-start gap-2">
          <span className={cn('mt-px flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-mono text-[10.5px] font-bold',
            i === undefined ? 'bg-muted text-muted-foreground' : 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300')}
            aria-label={rotulo}>{i === undefined ? '—' : i + 1}</span>
          <div className="min-w-0 flex-1">
            {i === undefined
              ? <p className="text-[length:var(--campo-fonte)] font-semibold leading-snug">Caso contrário</p>
              : temCond || s.rotulo?.trim()
                ? <p className="break-words text-[length:var(--campo-fonte)] font-semibold leading-snug">{s.rotulo?.trim() || s.condition}</p>
                : <p className="flex items-center gap-1 text-[length:var(--campo-fonte)] font-semibold leading-snug text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />Falta escolher a condição
                  </p>}
            <p className="mt-0.5 break-words text-[11.5px] leading-snug text-muted-foreground">→ {nomeDe(s.para)}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-0.5">
          <AcaoDoCartao rotulo={`Editar ${rotulo.toLowerCase()}`} onClick={() => onEditarSeta(s.id)}><Pencil className="h-3 w-3" />Editar</AcaoDoCartao>
          <AcaoDoCartao rotulo={`Remover ${rotulo.toLowerCase()} (apaga a seta)`} perigo onClick={() => onApagarSeta(s.id)}><Trash2 className="h-3 w-3" />Remover</AcaoDoCartao>
        </div>
      </li>
    )
  }

  return (
    <GavetaLateral rotulo="Escolha" rotuloTom={TOM_DO_TIPO.escolha} rotuloIcone={<GatewayGlyph kind="exclusive" className="h-3 w-3" />}
      titulo={forma.pergunta?.trim() || 'Escolha sem pergunta'} rotuloFechar="Fechar sem aplicar" onFechar={onCancelar} focarAoAbrir={focarAoAbrir}
      resumo={<FraseDoResumo trechos={resumoDaEscolha({ anteriores, pergunta: forma.pergunta, modo, seNenhum: padrao ? nomeDe(padrao.para) : undefined, semCondicao })} />}
      rodape={<RodapePadrao pendentes={pendentes} faltam={[...(okPergunta ? [] : ['pergunta']), ...(okCaminhos ? [] : ['caminhos'])]} onCancelar={onCancelar} onAplicar={onAplicar}
        remover={{ rotulo: 'Remover', nomeAcessivel: 'Remover a escolha', aoRemover: onRemover }} />}>
      <div className={CORPO_DA_GAVETA}>
        <Pergunta id="losango-pergunta" titulo="Pergunta" ok={okPergunta} icone={<HelpCircle />} valor={forma.pergunta}>
          <div className="flex flex-col gap-1">
            <label htmlFor="losango-pergunta-campo" className={ROTULO}>Qual é a pergunta</label>
            <Input id="losango-pergunta-campo" className={CAMPO} value={forma.pergunta ?? ''} placeholder="Ex.: Quais pareceres são necessários?"
              onChange={(e) => onMudar({ pergunta: e.target.value })} />
            <p className="text-[11px] leading-snug text-muted-foreground">Aparece no losango e ajuda quem lê o desenho a entender a decisão.</p>
          </div>
          <CampoEscolha rotulo="Quando mais de um caminho servir" valor={modo} onMudar={(m) => onMudar({ modo: m })} opcoes={[
            { v: 'primeiro', titulo: 'O primeiro que servir', descricao: 'Testa de cima para baixo e segue só pelo primeiro.' },
            { v: 'todos', titulo: 'Todos os que servirem', descricao: 'Os caminhos que servirem acontecem juntos.' },
          ]} />
        </Pergunta>

        <Pergunta id="losango-caminhos" titulo="Caminhos" ok={okCaminhos} icone={<GitBranch />}
          valor={`${caminhos.length} caminho${caminhos.length === 1 ? '' : 's'}`}
          ajuda="Cada seta que sai do losango é um caminho, com a condição dela.">
          {setas.length ? (
            <ul className="flex flex-col gap-2">
              {caminhos.map((s, i) => cartao(s, `${i + 1}º caminho`, i))}
              {padrao && cartao(padrao, 'Caso contrário')}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-[11.5px] text-muted-foreground">Nenhuma seta sai deste losango ainda.</p>
          )}
          <p className="text-[11.5px] leading-snug text-muted-foreground">Para outro caminho, puxe uma seta do losango até o próximo passo.</p>
        </Pergunta>
      </div>
    </GavetaLateral>
  )
}
