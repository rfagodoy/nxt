import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { UpdateProcessDto } from './dto/update-process.dto'
import { ProcessFormSchema, isCompensable } from '@nxt/types'
import { compileBpmn, CompileError, type WfGraph } from '@nxt/workflow-core'

/** Autor da ação, vindo do JWT (nunca do corpo da requisição). */
export interface Autor { name: string; sub?: string }
const AUTOR_SISTEMA = 'Usuário do sistema'

type DefinicaoSalva = { bpmnXml: string; formSchema: unknown; compiledGraph: unknown; status: string; version: number }

/** Nº de ATIVIDADES de um formSchema — a medida que interessa para saber se uma
 *  gravação está destruindo o desenho. Gateways e eventos não contam: um fluxo pode
 *  legitimamente perder um losango, mas perder as atividades é perder o processo. */
export function contarAtividades(formSchema: unknown): number {
  const fs = formSchema as ProcessFormSchema | null | undefined
  if (!fs) return 0
  const porSteps = (fs.steps ?? []).length
  const porGrafo = (fs.graph?.nodes ?? []).filter((n) => n.type === 'userTask' || n.type === 'serviceTask').length
  // o grafo é a fonte de verdade da autoria; steps pode ficar para trás em rascunho
  return Math.max(porSteps, porGrafo)
}

/** Decide se uma gravação é DESTRUTIVA a ponto de exigir confirmação consciente.
 *  Puro de propósito: é a regra que protege o desenho do cliente e precisa de teste.
 *
 *  Zerar as atividades sempre pede confirmação. Fora isso, pede quando a gravação
 *  remove METADE OU MAIS — e só a partir de 2 atividades, senão editar um fluxo de
 *  uma atividade só viraria um interrogatório. */
export function checarReducao(antes: number, depois: number): { removidas: number; restantes: number } | null {
  if (antes > 0 && depois === 0) return { removidas: antes, restantes: 0 }
  if (antes >= 2 && depois * 2 < antes) return { removidas: antes - depois, restantes: depois }
  return null
}

@Injectable()
export class ProcessesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─── Camada 1: histórico ────────────────────────────────────────────────────
     Retrato da definição, para poder voltar atrás. Gravado ANTES de cada sobrescrita
     (o que estava lá) e DEPOIS de cada ativação (o estado publicado, já compilado).
     Nunca deixa a operação principal falhar: perder o retrato é ruim, impedir o
     usuário de salvar por causa dele seria pior. */
  private async retratar(processId: string, def: DefinicaoSalva, reason: 'SOBRESCRITA' | 'ATIVACAO' | 'RESTAURACAO', autor?: Autor) {
    try {
      await this.prisma.processDefinitionVersion.create({
        data: {
          processId,
          version: def.version,
          bpmnXml: def.bpmnXml,
          formSchema: def.formSchema as never,
          compiledGraph: (def.compiledGraph ?? null) as never,
          status: def.status,
          reason,
          atividades: contarAtividades(def.formSchema),
          user: autor?.name ?? AUTOR_SISTEMA,
          userId: autor?.sub ?? null,
        },
      })
    } catch (e) {
      console.error('[processes] falha ao gravar versão', { processId, reason, e })
    }
  }

  /* ─── Camada 2: auditoria ──────────────────────────────────────────────────── */
  private async auditar(processId: string, event: string, changes: { field: string; label: string; before: string; after: string }[], autor?: Autor) {
    try {
      await this.prisma.processAuditLog.create({
        data: {
          processId,
          user: autor?.name ?? AUTOR_SISTEMA,
          userId: autor?.sub ?? null,
          event,
          changes: changes as never,
        },
      })
    } catch (e) {
      console.error('[processes] falha ao gravar auditoria', { processId, event, e })
    }
  }

  /** Versões de uma definição, da mais recente para a mais antiga (sem o conteúdo
   *  pesado — a lista só precisa do resumo; o conteúdo sai no restore). */
  async listVersions(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.processDefinitionVersion.findMany({
      where: { processId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, version: true, status: true, reason: true, atividades: true, user: true, userId: true, createdAt: true },
      take: 50,
    })
  }

  /** Auditoria da definição (quem mexeu no desenho). */
  async listAudit(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    return this.prisma.processAuditLog.findMany({
      where: { processId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  /** Repõe uma versão anterior. O estado ATUAL vira retrato antes de ser substituído —
   *  restaurar nunca é um caminho sem volta. Volta a DRAFT: o desenho mudou, tem de
   *  ser reativado (recompilado) para valer em produção. */
  async restoreVersion(id: string, versionId: string, organizationId: string, autor?: Autor) {
    const process = await this.findOne(id, organizationId)
    const alvo = await this.prisma.processDefinitionVersion.findFirst({ where: { id: versionId, processId: id } })
    if (!alvo) throw new NotFoundException('Versão não encontrada para este workflow')

    await this.retratar(id, process as DefinicaoSalva, 'RESTAURACAO', autor)
    const restaurado = await this.prisma.processDefinition.update({
      where: { id },
      data: { bpmnXml: alvo.bpmnXml, formSchema: alvo.formSchema as never, status: 'DRAFT' },
    })
    await this.auditar(id, 'RESTAURADO', [
      { field: 'atividades', label: 'Atividades', before: String(contarAtividades(process.formSchema)), after: String(alvo.atividades) },
      { field: 'versao', label: 'Versão reposta', before: '—', after: `v${alvo.version} de ${alvo.createdAt.toLocaleString('pt-BR')}` },
    ], autor)
    return restaurado
  }

  async findAll(organizationId: string) {
    return this.prisma.processDefinition.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, organizationId: string) {
    const process = await this.prisma.processDefinition.findFirst({
      where: { id, organizationId },
    })
    if (!process) throw new NotFoundException('Processo não encontrado')
    return process
  }

  async create(dto: CreateProcessDto, organizationId: string, autor?: Autor) {
    const criado = await this.prisma.processDefinition.create({
      data: {
        name: dto.name,
        description: dto.description,
        bpmnXml: dto.bpmnXml,
        formSchema: dto.formSchema as never,
        kind: dto.kind ?? null,
        organizationId,
        status: 'DRAFT',
      },
    })
    await this.auditar(criado.id, 'CRIADO', [
      { field: 'atividades', label: 'Atividades', before: '—', after: String(contarAtividades(criado.formSchema)) },
    ], autor)
    return criado
  }

  async activate(id: string, organizationId: string, autor?: Autor) {
    const process = await this.findOne(id, organizationId)

    // TIPO obrigatório para ativar: é ele que decide onde o workflow aparece no
    // "Novo processo" (Contratos mostra CONTRATO/ADITIVO, Parceiros mostra PARCEIRO).
    // Sem tipo, o workflow nasce ativo e invisível — só o Dashboard o lista.
    if (!process.kind) {
      throw new BadRequestException('Informe o tipo do workflow (contrato, aditivo ou parceiro) antes de ativar.')
    }

    // Compila o BPMN → grafo executável. É AQUI que o diagrama deixa de ser
    // cosmético: se o desenho for inválido (seta órfã, sem início, construção
    // não suportada), a ativação FALHA com a causa — em vez de "ativar" algo
    // que o motor não consegue executar.
    let graph: WfGraph
    try {
      graph = compileBpmn(process.bpmnXml)
    } catch (e) {
      if (e instanceof CompileError) throw new BadRequestException(`Diagrama inválido: ${e.message}`)
      throw e
    }

    const formSchema = process.formSchema as unknown as ProcessFormSchema

    // OBRIGATORIEDADE (política do produto): toda TAREFA DO USUÁRIO precisa de nome,
    // executor (papel) e prazo (SLA). Bloqueia a ativação com a lista de pendências —
    // em vez de deixar ativar um processo com atividades incompletas.
    const incompletos: string[] = []
    for (const step of formSchema.steps ?? []) {
      const node = graph.nodes[step.stepId]
      if (node?.type !== 'userTask') continue
      const hasSla = (step.slaBusinessDays ?? 0) > 0 || (step.slaBusinessHours ?? 0) > 0 || (step.slaBusinessMinutes ?? 0) > 0
      if (!step.stepName?.trim() || !step.executor?.papelId || !hasSla) {
        incompletos.push(step.stepName?.trim() || 'Tarefa sem nome')
      }
    }
    if (incompletos.length) {
      throw new BadRequestException(
        `Preencha nome, executor e prazo em todas as tarefas antes de ativar: ${incompletos.join(', ')}`,
      )
    }

    // Mescla o que foi configurado no painel "Atividade" do designer (guardado no
    // formSchema por nó): executor (papel) e prazo/SLA. É a forma explícita de
    // definir esses atributos sem depender de raias/extensões no XML.
    for (const step of formSchema.steps ?? []) {
      const node = graph.nodes[step.stepId]
      if (!node) continue
      if (step.role) node.role = step.role
      if (typeof step.slaMinutes === 'number' && step.slaMinutes > 0) node.slaMinutes = step.slaMinutes
      // Prazo em dias/horas ÚTEIS (Storyboard) — o dueAt da tarefa é calculado no
      // calendário comercial da org na criação (persistTasks). Precede o slaMinutes legado.
      if (typeof step.slaBusinessDays === 'number' && step.slaBusinessDays > 0) node.slaBusinessDays = step.slaBusinessDays
      if (typeof step.slaBusinessHours === 'number' && step.slaBusinessHours > 0) node.slaBusinessHours = step.slaBusinessHours
      if (typeof step.slaBusinessMinutes === 'number' && step.slaBusinessMinutes > 0) node.slaBusinessMinutes = step.slaBusinessMinutes
      // Instruções livres exibidas ao executor ao abrir a tarefa.
      if (step.instructions?.trim()) node.instructions = step.instructions.trim()
      // Conector de domínio da atividade de serviço (ação automática). Definido no
      // painel "Ação automática" do designer; tem precedência sobre nxt:connector do XML.
      if (step.connector) node.connector = step.connector
      // Política de retorno (F5). COMPENSATE só vale se o conector tem inversa — senão
      // seguir de novo após devolver duplicaria a operação sem forma de desfazer.
      if (step.onReturn) {
        if (step.onReturn === 'COMPENSATE' && !isCompensable(step.connector)) {
          throw new BadRequestException(
            `A ação "${step.stepName || step.stepId}" não pode usar retorno com compensação: o conector não tem inversa definida.`,
          )
        }
        node.onReturn = step.onReturn
      }
      /* Política de devolução da TAREFA: para onde ela pode devolver o processo.
         Valida aqui, na ativação, porque um nodeId que não existe (etapa apagada
         depois de escolhida) viraria uma lista de destinos silenciosamente vazia —
         o desenhista acharia que configurou e o botão simplesmente não apareceria. */
      if (step.returnPolicy && node.type === 'userTask') {
        const { mode, nodeIds } = step.returnPolicy
        if (mode === 'SELECTED') {
          const escolhidos = nodeIds ?? []
          if (escolhidos.length === 0) {
            throw new BadRequestException(
              `A tarefa "${step.stepName || step.stepId}" está configurada para devolver só para etapas escolhidas, mas nenhuma foi marcada.`,
            )
          }
          const inexistente = escolhidos.find((id) => graph.nodes[id]?.type !== 'userTask')
          if (inexistente) {
            throw new BadRequestException(
              `A tarefa "${step.stepName || step.stepId}" aponta a devolução para uma etapa que não existe mais no fluxo. Reveja os destinos.`,
            )
          }
        }
        node.returnPolicy = step.returnPolicy
      }
      // Mapa entrada-do-conector → variável-do-processo (re-liga nomes no designer).
      if (step.connectorInputs && Object.keys(step.connectorInputs).length) {
        node.connectorInputs = step.connectorInputs
      }
      // Executor por papel+entidade (resolve para usuário(s) responsável(is) em runtime).
      if (step.executor?.papelId) node.executor = step.executor
      // Tela (Personalização de Telas) que serve de formulário da atividade — o runtime
      // renderiza o cadastro dirigido por ela e cria/edita a entidade real. (F3e)
      if (step.screenRef) node.formRef = step.screenRef
    }

    const updatedProcess = await this.prisma.processDefinition.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        compiledGraph: graph as never,
        version: { increment: 1 },
      },
    })

    /* Retrato do estado PUBLICADO (já com o grafo compilado). É o marco a que se quer
       voltar quando algo dá errado depois — "o desenho de quando estava rodando". */
    await this.retratar(id, updatedProcess as DefinicaoSalva, 'ATIVACAO', autor)
    await this.auditar(id, 'ATIVADO', [
      { field: 'status', label: 'Situação', before: process.status, after: 'ACTIVE' },
      { field: 'versao', label: 'Versão', before: String(process.version), after: String(updatedProcess.version) },
    ], autor)

    return updatedProcess
  }

  /** Edição do processo (designer). Alterar diagrama/campos invalida o grafo
   *  compilado → volta a DRAFT até reativar (recompila). Instâncias em andamento
   *  seguem no `graphSnapshot`, imunes. Renomear só (sem diagrama) mantém o status. */
  async update(id: string, organizationId: string, dto: UpdateProcessDto, autor?: Autor) {
    const antes = await this.findOne(id, organizationId)
    const mudaDesenho = dto.bpmnXml !== undefined || dto.formSchema !== undefined

    /* ─── Camada 3: guarda de gravação destrutiva ──────────────────────────────
       Em 01/08/2026 um editor com o estado vazio gravou 2 nós por cima de 7 e apagou
       o desenho do cliente. Nada comparava antes com depois. Agora compara: zerar as
       atividades — ou cortar METADE ou mais — exige confirmação EXPLÍCITA de quem
       está salvando. Continua sendo possível esvaziar um fluxo de propósito; o que
       deixa de ser possível é fazê-lo sem querer. */
    if (mudaDesenho && !dto.confirmarReducao) {
      const nAntes = contarAtividades(antes.formSchema)
      const risco = checarReducao(nAntes, contarAtividades(dto.formSchema))
      if (risco) {
        throw new ConflictException({
          code: 'REDUCAO_DESTRUTIVA',
          ...risco,
          message: risco.restantes === 0
            ? `Esta gravação remove todas as ${nAntes} atividade(s) do workflow e deixaria o fluxo vazio. Se for intencional, confirme; se não, feche sem salvar — o desenho atual continua guardado.`
            : `Esta gravação remove ${risco.removidas} das ${nAntes} atividades do workflow (restariam ${risco.restantes}). Se for intencional, confirme; se não, feche sem salvar.`,
        })
      }
    }

    // retrato do que está lá ANTES de sobrescrever — é o que permite voltar atrás
    if (mudaDesenho) await this.retratar(id, antes as DefinicaoSalva, 'SOBRESCRITA', autor)

    const data: Record<string, unknown> = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.description !== undefined) data.description = dto.description
    if (dto.bpmnXml !== undefined) data.bpmnXml = dto.bpmnXml
    if (dto.formSchema !== undefined) data.formSchema = dto.formSchema as never
    if (dto.kind !== undefined) data.kind = dto.kind || null
    if (mudaDesenho) data.status = 'DRAFT'
    const salvo = await this.prisma.processDefinition.update({ where: { id }, data: data as never })

    const changes: { field: string; label: string; before: string; after: string }[] = []
    if (dto.name !== undefined && dto.name !== antes.name) changes.push({ field: 'name', label: 'Nome', before: antes.name, after: dto.name })
    if (mudaDesenho) {
      const nAntes = contarAtividades(antes.formSchema), nDepois = contarAtividades(salvo.formSchema)
      changes.push({ field: 'atividades', label: 'Atividades', before: String(nAntes), after: String(nDepois) })
      if (antes.status !== salvo.status) changes.push({ field: 'status', label: 'Situação', before: antes.status, after: salvo.status })
    }
    if (changes.length) await this.auditar(id, 'ATUALIZADO', changes, autor)
    return salvo
  }

  /** Inativa um workflow ATIVO → deixa de aparecer em "Novo processo" (StartProcessButton
   *  só lista ACTIVE). Preserva o grafo compilado; instâncias em andamento seguem no
   *  graphSnapshot. Reversível via reactivate. Distinto de ARCHIVED (que vem do delete). */
  async inactivate(id: string, organizationId: string, autor?: Autor) {
    const process = await this.findOne(id, organizationId)
    if (process.status !== 'ACTIVE') {
      throw new BadRequestException('Só é possível inativar um workflow ativo.')
    }
    const salvo = await this.prisma.processDefinition.update({ where: { id }, data: { status: 'INACTIVE' } })
    await this.auditar(id, 'INATIVADO', [{ field: 'status', label: 'Situação', before: 'ACTIVE', after: 'INACTIVE' }], autor)
    return salvo
  }

  /** Reativa um workflow INATIVO → volta a ficar disponível. O grafo já está compilado
   *  (o diagrama não mudou na inativação), então só reabre o status. */
  async reactivate(id: string, organizationId: string, autor?: Autor) {
    const process = await this.findOne(id, organizationId)
    if (process.status !== 'INACTIVE') {
      throw new BadRequestException('Só é possível reativar um workflow inativo.')
    }
    const salvo = await this.prisma.processDefinition.update({ where: { id }, data: { status: 'ACTIVE' } })
    await this.auditar(id, 'REATIVADO', [{ field: 'status', label: 'Situação', before: 'INACTIVE', after: 'ACTIVE' }], autor)
    return salvo
  }

  /** Remove um processo. Sem instâncias → exclusão limpa (apaga o módulo gerado).
   *  Com histórico de execuções → ARQUIVA (preserva instâncias/auditoria), não apaga. */
  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId)
    const instances = await this.prisma.processInstance.count({ where: { processDefinitionId: id } })
    if (instances > 0) {
      await this.prisma.processDefinition.update({ where: { id }, data: { status: 'ARCHIVED' } })
      return { action: 'archived' as const, instances }
    }
    // Sem instâncias, a definição some direto.
    await this.prisma.processDefinition.delete({ where: { id } })
    return { action: 'deleted' as const }
  }
}
