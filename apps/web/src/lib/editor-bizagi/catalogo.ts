/* ─── Catálogo da paleta do editor (estilo Bizagi) ─────────────────────────────
   Os grupos da paleta, na ordem do mockup. Só entra na paleta o que o motor executa: cada item
   diz que forma cria (tipo + variante/modo). O que não executa fica em `CATALOGO_FORA_DA_PALETA`,
   só para reconhecer formas de desenhos gravados. `formaNova` monta a forma com o nome padrão. */
import type { FormaDesenho, TipoForma, VarianteForma } from '@nxt/types'

/** Os grupos da paleta: Início, Tarefa, Escolha, Ao mesmo tempo (estes dois com um item só) e Fim. */
export type GrupoPaleta = 'inicio' | 'tarefa' | 'escolha' | 'paralelo' | 'fim'
/** Grupos dos itens que já não estão na paleta, mas continuam existindo nos desenhos. */
export type GrupoForaDaPaleta = 'subprocesso' | 'losango' | 'intermediario'
export type GrupoItem = GrupoPaleta | GrupoForaDaPaleta

export type ItemCatalogo = {
  grupo: GrupoItem
  tipo: TipoForma
  variante?: VarianteForma
  modo?: 'primeiro' | 'todos'
  nome: string
}

type Base = Omit<ItemCatalogo, 'grupo'>
const grupo = (g: GrupoItem, itens: Base[]): ItemCatalogo[] => itens.map((i) => ({ ...i, grupo: g }))

export const CATALOGO: Record<GrupoPaleta, ItemCatalogo[]> = {
  inicio: grupo('inicio', [{ tipo: 'start', variante: 'simples', nome: 'Início' }]),
  /* Toda atividade é feita por uma pessoa (PO, 07/11/2026): a Ação automática saiu da paleta.
     Aditivo e encerramento se registram pela Tela do contrato, no modo Editar. */
  tarefa: grupo('tarefa', [{ tipo: 'userTask', variante: 'usuario', nome: 'Tarefa de usuário' }]),
  escolha: grupo('escolha', [{ tipo: 'exclusiveGateway', modo: 'primeiro', nome: 'Escolha' }]),
  paralelo: grupo('paralelo', [{ tipo: 'parallelGateway', nome: 'Ao mesmo tempo' }]),
  fim: grupo('fim', [{ tipo: 'end', variante: 'simples', nome: 'Fim' }]),
}

/** Formas que já não estão na paleta, mas existem em desenhos gravados (e nas gavetas): só para
 *  achar o nome e o ícone da forma, nunca para criar. */
export const CATALOGO_FORA_DA_PALETA: ItemCatalogo[] = [
  ...grupo('inicio', [
    { tipo: 'start', variante: 'agendado', nome: 'Início agendado' },
    { tipo: 'start', variante: 'evento', nome: 'Início por evento' },
  ]),
  ...grupo('tarefa', [
    { tipo: 'serviceTask', nome: 'Ação automática' },
    { tipo: 'userTask', variante: 'envio', nome: 'Envio de mensagem' },
    { tipo: 'userTask', variante: 'recebimento', nome: 'Recebimento de mensagem' },
  ]),
  ...grupo('fim', [
    { tipo: 'end', variante: 'erro', nome: 'Fim com erro' },
    { tipo: 'end', variante: 'cancela', nome: 'Fim com cancelamento' },
    { tipo: 'end', variante: 'terminar', nome: 'Terminar tudo' },
  ]),
  ...grupo('subprocesso', [
    { tipo: 'subProcess', variante: 'chamada', nome: 'Subprocesso' },
    { tipo: 'subProcess', variante: 'embutido', nome: 'Subprocesso embutido' },
  ]),
  ...grupo('losango', [
    { tipo: 'exclusiveGateway', modo: 'todos', nome: 'Inclusivo' },
    { tipo: 'eventGateway', nome: 'Baseado em evento' },
  ]),
  ...grupo('intermediario', [
    { tipo: 'intermediateEvent', variante: 'temporizador', nome: 'Temporizador' },
    { tipo: 'intermediateEvent', variante: 'recebe', nome: 'Recebe mensagem' },
    { tipo: 'intermediateEvent', variante: 'envia', nome: 'Envia mensagem' },
  ]),
]

/** Todo item que uma forma do desenho pode ter: o da paleta e o que saiu dela. */
export const TODOS_OS_ITENS: ItemCatalogo[] = [...Object.values(CATALOGO).flat(), ...CATALOGO_FORA_DA_PALETA]

/** Posição do item da paleta no seu grupo (o `indice` do arrasto); -1 se não for da paleta. */
export const indiceNaPaleta = (item: ItemCatalogo): number =>
  Object.prototype.hasOwnProperty.call(CATALOGO, item.grupo) ? CATALOGO[item.grupo as GrupoPaleta].indexOf(item) : -1

function nomePadrao(item: ItemCatalogo): string | undefined {
  switch (item.grupo) {
    case 'tarefa': return 'Nova tarefa'
    case 'subprocesso': return 'Novo subprocesso'
    case 'escolha': case 'losango': return item.tipo === 'exclusiveGateway' ? 'Nova pergunta?' : undefined
    case 'paralelo': return undefined
    case 'intermediario': return item.nome
    case 'inicio': return 'Início'
    case 'fim': return 'Fim'
  }
}

/** A forma que o item da paleta cria, com o nome padrão (nenhum item da paleta tem configuração). */
export function formaNova(item: ItemCatalogo, id: string): FormaDesenho {
  const f: FormaDesenho = { id, tipo: item.tipo }
  if (item.variante) f.variante = item.variante
  if (item.modo) f.modo = item.modo
  const nome = nomePadrao(item)
  if (nome) f.nome = nome
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
