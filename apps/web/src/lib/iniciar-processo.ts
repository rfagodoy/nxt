'use client'

/* ─── Iniciar um processo ─────────────────────────────────────────────────────
   O caminho ÚNICO para começar uma execução, usado pelo botão "Novo processo"
   (Dashboard/Contratos) e pelo "Iniciar" da tela do workflow.

   Iniciar = criar a instância e ABRIR A PRIMEIRA ATIVIDADE COMO ABA, do mesmo jeito
   que a caixa de Tarefas abre uma tarefa. Quem executa é sempre o `TaskDocView`:
   antes havia um segundo executor (`InstanceRunner`) que rodava a atividade dentro
   da tela de edição do workflow, e a MESMA atividade tinha duas caras.

   ⚠️ Iniciar é um EFEITO DE CLIQUE, nunca de carga de página. O runner aposentado
   fazia o POST no efeito de montagem, atrás da URL `?iniciar=1`: recarregar, voltar
   no histórico ou restaurar a aba criava um processo novo em silêncio — foi assim
   que nasceram instâncias que ninguém pediu (três em 30 segundos, em 01/09/2026).
   Não voltar a iniciar processo fora de um clique explícito. */

import { useCallback } from 'react'
import { apiFetch } from '@/lib/http'
import { useWorkspace } from '@/contexts/workspace-context'
import type { Task } from '@/lib/tasks-ui'

/** O mínimo que se precisa saber do workflow para iniciá-lo e rotular a aba. */
export interface ProcessoParaIniciar {
  id: string
  name: string
  kind?: string | null
}

/** Linha crua de tarefa devolvida ao iniciar (o backend manda a linha inteira). */
interface TarefaCriada {
  id: string
  instanceId: string
  nodeId: string
  name?: string | null
  role?: string | null
  dueAt?: string | null
  createdAt?: string
}

/** Resposta de POST /api/instances — o motor já roda até parar num ponto de espera. */
interface InicioResposta {
  instance: { id: string; numero?: number | null }
  tasks?: TarefaCriada[]
  completed?: boolean
  endedIncomplete?: boolean
  errored?: unknown
}

/** Desfecho que NÃO abriu aba. `null` = a aba abriu, não há nada a dizer. */
export type DesfechoInicio = { tom: 'erro' | 'ok'; msg: string } | null

/** Inicia o processo e abre a primeira atividade como aba. Devolve o desfecho a
 *  comunicar quando não houve aba para abrir. */
export function useIniciarProcesso(): (proc: ProcessoParaIniciar) => Promise<DesfechoInicio> {
  const ws = useWorkspace()

  return useCallback(async (proc: ProcessoParaIniciar): Promise<DesfechoInicio> => {
    const res = await apiFetch('/api/instances', {
      method: 'POST',
      body: JSON.stringify({ processDefinitionId: proc.id }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => null) as { message?: string } | null
      return { tom: 'erro', msg: e?.message || 'Não foi possível iniciar o processo.' }
    }

    const data = await res.json() as InicioResposta
    const numero = data.instance?.numero
    const rotulo = numero != null ? `#${numero}` : 'O processo'

    /* Nem todo início para numa atividade humana: o desenho pode ir direto ao fim, ou
       travar numa ação automática. Nesses casos não há aba para abrir — e ficar em
       silêncio faria parecer que o clique não funcionou. */
    const primeira = data.tasks?.[0]
    if (!primeira) {
      if (data.errored) return { tom: 'erro', msg: `${rotulo} parou com erro numa etapa automática. Veja em Processos.` }
      if (data.endedIncomplete) return { tom: 'erro', msg: `${rotulo} encerrou sem conclusão — nenhum caminho chegou ao fim.` }
      if (data.completed) return { tom: 'ok', msg: `${rotulo} foi concluído sem precisar de nenhuma atividade sua.` }
      return { tom: 'ok', msg: `${rotulo} foi iniciado. Nenhuma atividade ficou com você.` }
    }

    /* Monta a tarefa no formato da caixa de Tarefas SEM uma segunda ida à API: a linha
       crua já traz nodeId/prazo/papel, e o nome do processo é conhecido por quem chama. */
    const tarefa: Task = {
      id: primeira.id,
      instanceId: primeira.instanceId,
      nodeId: primeira.nodeId,
      name: primeira.name,
      role: primeira.role,
      dueAt: primeira.dueAt,
      createdAt: primeira.createdAt ?? new Date().toISOString(),
      instance: { numero: numero ?? null, processDefinition: { name: proc.name, kind: proc.kind } },
    }

    ws.open({ id: `task:${tarefa.id}`, kind: 'task', mode: 'detail', label: tarefa.name || tarefa.nodeId, data: tarefa })
    /* A caixa de Tarefas, se estiver aberta, precisa saber que nasceu tarefa nova — é o
       mesmo evento que o host dispara ao concluir. */
    try { window.dispatchEvent(new CustomEvent('nxt:workspace:refresh')) } catch { /* SSR */ }
    return null
  }, [ws])
}
