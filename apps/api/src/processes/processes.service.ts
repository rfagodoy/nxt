import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateProcessDto } from './dto/create-process.dto'
import { UpdateProcessDto } from './dto/update-process.dto'
import { ProcessFormSchema, isCompensable } from '@nxt/types'
import { compileBpmn, CompileError, type WfGraph, validarDesenho, validarDecisoes, validarAtividades, formatarProblemas, bloqueantes, type ProblemaAtivacao, resumoDeInicio, type EtapaPrevia } from '@nxt/workflow-core'
import { RoleAssignmentsService } from '../role-assignments/role-assignments.service'

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignments: RoleAssignmentsService,
  ) {}

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

  /* ─── Prévia de início ──────────────────────────────────────────────────────
     Alimenta a conferência do "Novo processo": antes de iniciar, a pessoa vê onde
     ELA entra, quem recebe, o prazo e o tamanho do que vem. O grafo é lido pelo
     núcleo puro (resumoDeInicio); aqui só se HIDRATA o que mora no banco — rótulo
     do papel, nome da entidade, nomes das pessoas e nome da tela.

     Só faz sentido em workflow ATIVO: a prévia lê o `compiledGraph`, que nasce na
     ativação. Em rascunho não existe grafo compilado — e prometer uma prévia a
     partir do XML cru seria mostrar um caminho que o motor ainda não executa. */
  async resumoInicio(id: string, organizationId: string) {
    const proc = await this.findOne(id, organizationId)
    if (proc.status !== 'ACTIVE') {
      throw new BadRequestException('Este workflow não está ativo — só workflows ativos podem ser iniciados.')
    }
    if (!proc.compiledGraph) {
      throw new BadRequestException('Este workflow não tem desenho compilado. Ative-o novamente para gerar o fluxo.')
    }

    // O PrismaService desserializa as colunas JSON declaradas (ProcessDefinition.
    // compiledGraph está entre elas), então aqui o campo JÁ chega como objeto. Fora
    // da extensão — script, teste, outro cliente — chega como texto. Aceitar os dois
    // evita o "[object Object] is not valid JSON" que só aparece em runtime.
    const bruto: unknown = proc.compiledGraph
    const graph = (typeof bruto === 'string' ? JSON.parse(bruto) : bruto) as WfGraph
    const resumo = resumoDeInicio(graph)

    const papeis = await this.roleAssignments.papelLabels(organizationId)
    const primeira = resumo.primeira
      ? {
          nome: resumo.primeira.nome,
          prazoDiasUteis: resumo.primeira.prazoDiasUteis ?? null,
          tela: await this.nomeDaTela(resumo.primeira.formRef, organizationId),
          responsavel: await this.responsavelDe(resumo.primeira, papeis, organizationId),
        }
      : null

    return {
      processo: { id: proc.id, nome: proc.name, descricao: proc.description, kind: proc.kind },
      primeira,
      frentes: resumo.frentes.map((e) => ({ nome: e.nome, decisao: e.decisao ?? null })),
      proximas: resumo.proximas.map((e) => ({ nome: e.nome, decisao: e.decisao ?? null })),
      podeTerminarCedo: resumo.podeTerminarCedo,
      caminhoVaria: resumo.caminhoVaria,
      totais: resumo.totais,
    }
  }

  /** Quem recebe a primeira atividade. Devolve o que É verdade agora, sem inventar:
   *  se o papel não tem ninguém atribuído naquela entidade, a tarefa nasce ABERTA —
   *  e é melhor a pessoa saber disso ANTES de iniciar do que descobrir depois. */
  private async responsavelDe(
    etapa: EtapaPrevia,
    papeis: Map<string, string>,
    organizationId: string,
  ): Promise<{ papel: string | null; entidade: string | null; pessoas: string[]; aberta: boolean; dependeDoProcesso: boolean }> {
    const ex = etapa.executor
    if (!ex?.papelId) {
      return { papel: null, entidade: null, pessoas: [], aberta: true, dependeDoProcesso: false }
    }
    const papel = papeis.get(ex.papelId) ?? null

    // Entidade por VARIÁVEL só é conhecida durante a execução (ex.: a unidade vem do
    // contrato que ainda será preenchido). Dizer "sem responsável" aqui seria falso.
    if (ex.entityType !== 'ORG' && ex.mode === 'VARIAVEL') {
      return { papel, entidade: null, pessoas: [], aberta: false, dependeDoProcesso: true }
    }

    const entityId = ex.entityType === 'ORG' ? undefined : ex.entityId || undefined
    if (ex.entityType !== 'ORG' && !entityId) {
      return { papel, entidade: null, pessoas: [], aberta: true, dependeDoProcesso: false }
    }

    const [entidade, ids] = await Promise.all([
      this.nomeDaEntidade(ex.entityType, entityId, organizationId),
      this.roleAssignments.resolveUsers(organizationId, ex.papelId, ex.entityType, entityId),
    ])
    const pessoas = ids.length
      ? (await this.prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { name: true } })).map((u) => u.name)
      : []
    return { papel, entidade, pessoas, aberta: pessoas.length === 0, dependeDoProcesso: false }
  }

  /** Nome legível da entidade-anfitriã do papel (a "unidade" do executor). */
  private async nomeDaEntidade(tipo: string, id: string | undefined, organizationId: string): Promise<string | null> {
    if (!id) return null
    if (tipo === 'UNIDADE') {
      const u = await this.prisma.orgUnit.findFirst({ where: { id, organizationId }, select: { nome: true } })
      return u?.nome ?? null
    }
    if (tipo === 'EMPRESA') {
      const c = await this.prisma.groupCompany.findFirst({ where: { id, organizationId }, select: { razaoSocial: true, nomeFantasia: true } })
      return c ? c.nomeFantasia || c.razaoSocial : null
    }
    if (tipo === 'PARCEIRO') {
      const pa = await this.prisma.partner.findFirst({ where: { id, organizationId }, select: { razaoSocial: true, nomeFantasia: true } })
      return pa ? pa.nomeFantasia || pa.razaoSocial : null
    }
    if (tipo === 'CONTRATO') {
      const ct = await this.prisma.contract.findFirst({ where: { id, organizationId }, select: { numero: true } })
      return ct?.numero ?? null
    }
    return null
  }

  /** Nome da tela que a pessoa preenche na atividade (o id sozinho não diz nada). */
  private async nomeDaTela(formRef: string | undefined, organizationId: string): Promise<string | null> {
    if (!formRef) return null
    const t = await this.prisma.screen.findFirst({ where: { id: formRef, organizationId }, select: { name: true } })
    return t?.name ?? null
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

    const formSchema = process.formSchema as unknown as ProcessFormSchema

    // GUARDAS AMIGÁVEIS primeiro, no grafo do EDITOR (que tem os nomes): desenho
    // conectado, decisões completas e atividades completas — TODOS os problemas de
    // uma vez, na língua do usuário. O compilador (abaixo) segue validando, mas como
    // rede de segurança: com os guardas na frente, o usuário não deve ver id interno.
    const problemas: ProblemaAtivacao[] = []
    const editorGraph = formSchema.graph
    const nomeDoStep = new Map((formSchema.steps ?? []).map((s) => [s.stepId, s.stepName?.trim() || '']))
    if (editorGraph) {
      const vnodes = editorGraph.nodes.map((n) => ({ ...n, name: nomeDoStep.get(n.id) || n.name }))
      problemas.push(...validarDesenho(vnodes, editorGraph.edges))
      problemas.push(...validarDecisoes(vnodes, editorGraph.edges))
    }
    // OBRIGATORIEDADE (política do produto): toda TAREFA DO USUÁRIO precisa de nome,
    // executor (papel) e prazo. O tipo vem do grafo do editor; processo legado sem
    // grafo valida depois da compilação (o tipo compilado distingue serviceTask).
    if (editorGraph) {
      const stepsDeUsuario = (formSchema.steps ?? []).filter(
        (s) => editorGraph.nodes.find((n) => n.id === s.stepId)?.type === 'userTask',
      )
      problemas.push(...validarAtividades(stepsDeUsuario))
    }
    // Só o que IMPEDE barra a ativação. AVISO (ex.: atividade que executa mas não
    // leva ao fim) é desenho legítimo desde a regra do fim: informa no editor, não
    // recusa aqui.
    if (bloqueantes(problemas).length) throw new BadRequestException(formatarProblemas(problemas))

    // Compila o BPMN → grafo executável. Rede de segurança: se ainda assim o desenho
    // for inválido para o motor, a ativação falha — com os ids trocados pelos nomes
    // das atividades, para a mensagem não vazar identificador interno.
    let graph: WfGraph
    try {
      graph = compileBpmn(process.bpmnXml)
    } catch (e) {
      if (e instanceof CompileError) {
        let msg = e.message
        for (const n of editorGraph?.nodes ?? []) {
          const nome = nomeDoStep.get(n.id) || n.name
          if (nome) msg = msg.split(`"${n.id}"`).join(`"${nome}"`)
        }
        throw new BadRequestException(`O desenho do fluxo tem um problema que impediu a ativação: ${msg}`)
      }
      throw e
    }

    // Processo legado sem grafo do editor: valida decisões e atividades sobre o
    // grafo COMPILADO (única fonte de tipos disponível).
    if (!editorGraph) {
      const problemasLegado = [
        ...validarDecisoes(Object.values(graph.nodes), graph.edges),
        ...validarAtividades((formSchema.steps ?? []).filter((s) => graph.nodes[s.stepId]?.type === 'userTask')),
      ]
      if (bloqueantes(problemasLegado).length) throw new BadRequestException(formatarProblemas(problemasLegado))
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
