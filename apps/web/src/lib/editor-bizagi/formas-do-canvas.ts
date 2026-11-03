/* ─── Como cada forma do desenho aparece no canvas ─────────────────────────────
   Puro: a família da forma (tarefa, losango, evento), o ícone de cada variante, o nome
   que o leitor de tela anuncia e a caixa (o tamanho gravado, quando a forma o aceita). */
import type { LayoutDesenho, VarianteForma } from '@nxt/types'
import { ehRedimensionavel } from './layout'

export type FamiliaDaForma = 'tarefa' | 'losango' | 'evento'
export type TipoDoEvento = 'inicio' | 'intermediario' | 'fim'

/** Tarefa, ação automática e subprocesso são caixas; os gateways, losangos; o resto, eventos. */
export function familiaDaForma(tipo: string): FamiliaDaForma {
  switch (tipo) {
    case 'userTask': case 'serviceTask': case 'subProcess': return 'tarefa'
    case 'exclusiveGateway': case 'inclusiveGateway': case 'parallelGateway': case 'eventGateway': return 'losango'
    default: return 'evento'
  }
}

export function tipoDoEvento(tipo: string): TipoDoEvento {
  return tipo === 'start' ? 'inicio' : tipo === 'intermediateEvent' ? 'intermediario' : 'fim'
}

export type IconeDoEvento = 'relogio' | 'envelope' | 'envelopeCheio' | 'raio' | 'xis' | 'disco'
/** Marca dentro do círculo; `null` = círculo liso (início e fim simples, como sempre). */
export function iconeDoEvento(variante: VarianteForma | undefined): IconeDoEvento | null {
  switch (variante) {
    case 'agendado': case 'temporizador': return 'relogio'
    case 'evento': case 'recebe': return 'envelope'
    case 'envia': return 'envelopeCheio'
    case 'erro': return 'raio'
    case 'cancela': return 'xis'
    case 'terminar': return 'disco'
    default: return null
  }
}

export type IconeDaTarefa = 'usuario' | 'engrenagem' | 'envelope' | 'envelopeCheio'
/** Ícone ao lado do nome; o subprocesso não tem (leva o quadrinho "+" embaixo). */
export function iconeDaTarefa(tipo: string, variante: VarianteForma | undefined): IconeDaTarefa | null {
  if (tipo === 'subProcess') return null
  if (tipo === 'serviceTask') return 'engrenagem'
  if (variante === 'envio') return 'envelopeCheio'
  if (variante === 'recebimento') return 'envelope'
  return 'usuario'
}

const NOME_DO_EVENTO: Record<TipoDoEvento, Partial<Record<VarianteForma, string>>> = {
  inicio: { simples: 'Início do processo', agendado: 'Início agendado', evento: 'Início por evento' },
  intermediario: { temporizador: 'Temporizador', recebe: 'Recebe mensagem', envia: 'Envia mensagem' },
  fim: { simples: 'Fim do processo', erro: 'Fim com erro', cancela: 'Fim com cancelamento', terminar: 'Terminar tudo' },
}
const NOME_PADRAO_DO_EVENTO: Record<TipoDoEvento, string> = { inicio: 'Início do processo', intermediario: 'Evento intermediário', fim: 'Fim do processo' }

/** Nome do evento para o leitor de tela: "Temporizador: Aguardar assinatura". O nome que só
 *  repete o tipo (o padrão da paleta: "Temporizador", "Início") não é dito duas vezes. */
export function nomeDoEvento(tipo: TipoDoEvento, variante: VarianteForma | undefined, nome?: string): string {
  const base = (variante && NOME_DO_EVENTO[tipo][variante]) || NOME_PADRAO_DO_EVENTO[tipo]
  const n = nome?.trim() ?? ''
  const repete = n.toLowerCase() === base.toLowerCase() || base.toLowerCase().startsWith(`${n.toLowerCase()} `)
  return n && !repete ? `${base}: ${n}` : base
}

/** Tipo da tarefa para o leitor de tela (o nome e o resto vêm depois). */
export function tipoDaTarefa(automatica: boolean, variante: VarianteForma | undefined, subprocesso?: 'chamada' | 'embutido'): string {
  if (subprocesso) return subprocesso === 'embutido' ? 'Subprocesso embutido' : 'Subprocesso'
  if (automatica) return 'Ação automática'
  if (variante === 'envio') return 'Envio de mensagem'
  if (variante === 'recebimento') return 'Recebimento de mensagem'
  return 'Tarefa'
}

/** A caixa da forma: o tamanho gravado no layout, se a forma aceita ser redimensionada;
 *  senão o de sempre (`padrao`, o que o layout reserva). */
export function caixaDaForma(id: string, tipo: string, padrao: { w: number; h: number }, tamanhos: LayoutDesenho['tamanhos']): { w: number; h: number } {
  const t = ehRedimensionavel(tipo) ? tamanhos[id] : undefined
  return t ? { w: t.largura, h: t.altura } : padrao
}
