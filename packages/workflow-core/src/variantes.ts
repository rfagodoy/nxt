/* Variantes das formas do desenho (editor no estilo Bizagi): o que cada forma é de fato
   (início agendado, envio de mensagem, fim com erro…) e se o motor já a executa. */

import type { FormaDesenho, LayoutDesenho, TipoForma, VarianteForma } from '@nxt/types'

type FormaComVariante = Pick<FormaDesenho, 'tipo' | 'variante'>

const PADRAO: Partial<Record<TipoForma, VarianteForma>> = {
  start: 'simples',
  end: 'simples',
  userTask: 'usuario',
  subProcess: 'chamada',
  intermediateEvent: 'temporizador',
}

/** A variante da forma; sem `variante` gravada vale o padrão do tipo (os demais tipos não têm). */
export function varianteDe(f: FormaComVariante): VarianteForma | undefined {
  return f.variante ?? PADRAO[f.tipo]
}

const ROTULOS: Record<string, string> = {
  'start:simples': 'um início simples',
  'start:agendado': 'um início agendado',
  'start:evento': 'um início por evento',
  'userTask:usuario': 'uma tarefa de usuário',
  'userTask:envio': 'um envio de mensagem',
  'userTask:recebimento': 'um recebimento de mensagem',
  'subProcess:chamada': 'um subprocesso',
  'subProcess:embutido': 'um subprocesso embutido',
  'intermediateEvent:temporizador': 'um temporizador',
  'intermediateEvent:recebe': 'um evento que recebe mensagem',
  'intermediateEvent:envia': 'um evento que envia mensagem',
  'end:simples': 'um fim simples',
  'end:erro': 'um fim com erro',
  'end:cancela': 'um fim com cancelamento',
  'end:terminar': 'um fim que termina tudo',
}
const ROTULOS_DO_TIPO: Partial<Record<TipoForma, string>> = {
  serviceTask: 'uma tarefa automática',
  exclusiveGateway: 'um losango de escolha',
  parallelGateway: 'um losango de ao mesmo tempo',
  eventGateway: 'um losango baseado em evento',
}

/** Artigo + nome da forma, para as frases ("um fim com erro"). */
export function rotuloDaVariante(f: FormaComVariante): string {
  const v = varianteDe(f)
  return (v && ROTULOS[`${f.tipo}:${v}`]) || ROTULOS_DO_TIPO[f.tipo] || 'um elemento'
}

/** O motor já executa a forma? Só as de sempre; o resto pode ser desenhado e salvo em rascunho. */
export function executaHoje(f: FormaComVariante): boolean {
  switch (f.tipo) {
    case 'serviceTask': case 'exclusiveGateway': case 'parallelGateway': return true
    case 'start': case 'end': return varianteDe(f) === 'simples'
    case 'userTask': return varianteDe(f) === 'usuario'
    default: return false
  }
}

export const LAYOUT_PADRAO: LayoutDesenho = { orientacao: 'horizontal', fases: [], piscinasExternas: [], fluxosMensagem: [], tamanhos: {} }
