/* ─── Catálogo da paleta do editor (estilo Bizagi) ─────────────────────────────
   Os seis grupos da paleta, na ordem do mockup, com as variações de cada um. Cada item diz
   que forma cria (tipo + variante/modo) e se o motor já a executa (etiqueta "Executa hoje"
   ou "Próxima rodada"). `formaNova` monta a forma com o nome e a configuração padrão. */
import type { ConfigSubprocesso, ConfigTemporizador, FormaDesenho, TipoForma, VarianteForma } from '@nxt/types'
import { executaHoje } from '@nxt/workflow-core'

export type GrupoPaleta = 'inicio' | 'tarefa' | 'subprocesso' | 'losango' | 'intermediario' | 'fim'

export type ItemCatalogo = {
  grupo: GrupoPaleta
  tipo: TipoForma
  variante?: VarianteForma
  modo?: 'primeiro' | 'todos'
  nome: string
  etiqueta: 'hoje' | 'proxima'
}

export const ROTULO_ETIQUETA = { hoje: 'Executa hoje', proxima: 'Próxima rodada' } as const

type Base = Omit<ItemCatalogo, 'grupo' | 'etiqueta'>
const grupo = (g: GrupoPaleta, itens: Base[]): ItemCatalogo[] =>
  itens.map((i) => ({ ...i, grupo: g, etiqueta: executaHoje(i) ? 'hoje' : 'proxima' }))

export const CATALOGO: Record<GrupoPaleta, ItemCatalogo[]> = {
  inicio: grupo('inicio', [
    { tipo: 'start', variante: 'simples', nome: 'Início' },
    { tipo: 'start', variante: 'agendado', nome: 'Início agendado' },
    { tipo: 'start', variante: 'evento', nome: 'Início por evento' },
  ]),
  tarefa: grupo('tarefa', [
    { tipo: 'userTask', variante: 'usuario', nome: 'Tarefa de usuário' },
    { tipo: 'serviceTask', nome: 'Ação automática' },
    { tipo: 'userTask', variante: 'envio', nome: 'Envio de mensagem' },
    { tipo: 'userTask', variante: 'recebimento', nome: 'Recebimento de mensagem' },
  ]),
  subprocesso: grupo('subprocesso', [
    { tipo: 'subProcess', variante: 'chamada', nome: 'Subprocesso' },
    { tipo: 'subProcess', variante: 'embutido', nome: 'Subprocesso embutido' },
  ]),
  losango: grupo('losango', [
    { tipo: 'exclusiveGateway', modo: 'primeiro', nome: 'Escolha' },
    { tipo: 'parallelGateway', nome: 'Ao mesmo tempo' },
    { tipo: 'exclusiveGateway', modo: 'todos', nome: 'Inclusivo' },
    { tipo: 'eventGateway', nome: 'Baseado em evento' },
  ]),
  intermediario: grupo('intermediario', [
    { tipo: 'intermediateEvent', variante: 'temporizador', nome: 'Temporizador' },
    { tipo: 'intermediateEvent', variante: 'recebe', nome: 'Recebe mensagem' },
    { tipo: 'intermediateEvent', variante: 'envia', nome: 'Envia mensagem' },
  ]),
  fim: grupo('fim', [
    { tipo: 'end', variante: 'simples', nome: 'Fim' },
    { tipo: 'end', variante: 'erro', nome: 'Fim com erro' },
    { tipo: 'end', variante: 'cancela', nome: 'Fim com cancelamento' },
    { tipo: 'end', variante: 'terminar', nome: 'Terminar tudo' },
  ]),
}

const TEMPORIZADOR_PADRAO: ConfigTemporizador = { espera: 'prazo', n: 1, unidade: 'diasUteis' }
const SUBPROCESSO_PADRAO: ConfigSubprocesso = { versao: 'ativa', levarContrato: true, campos: [], esperar: true }

function nomePadrao(item: ItemCatalogo): string | undefined {
  switch (item.grupo) {
    case 'tarefa': return 'Nova tarefa'
    case 'subprocesso': return 'Novo subprocesso'
    case 'losango': return item.tipo === 'exclusiveGateway' ? 'Nova pergunta?' : undefined
    case 'intermediario': return item.nome
    case 'inicio': return 'Início'
    case 'fim': return 'Fim'
  }
}

/** A forma que o item da paleta cria, com nome e configuração padrão. */
export function formaNova(item: ItemCatalogo, id: string): FormaDesenho {
  const f: FormaDesenho = { id, tipo: item.tipo }
  if (item.variante) f.variante = item.variante
  if (item.modo) f.modo = item.modo
  const nome = nomePadrao(item)
  if (nome) f.nome = nome
  if (item.tipo === 'intermediateEvent' && item.variante === 'temporizador') f.config = { ...TEMPORIZADOR_PADRAO }
  if (item.tipo === 'subProcess') f.config = { ...SUBPROCESSO_PADRAO, campos: [] }
  return f
}

/** O item que a paleta pôs no `dataTransfer` (`{ grupo, indice }`); `null` se não for dela. */
export function itemDoArrasto(dado: string): ItemCatalogo | null {
  try {
    const { grupo, indice } = JSON.parse(dado) as { grupo?: unknown; indice?: unknown }
    if (typeof grupo !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOGO, grupo) || typeof indice !== 'number') return null
    return CATALOGO[grupo as GrupoPaleta][indice] ?? null
  } catch {
    return null
  }
}
