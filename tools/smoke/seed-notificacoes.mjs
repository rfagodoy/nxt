// Semeia o cenário das BORDAS de processo (notificação / delegação / cancelamento):
//  - workflow ATIVO: start -> Preencher (prazo 1 dia) -> Aprovar (prazo 1 dia) -> end
//  - um segundo usuário ATIVO ("Bruno Teste") para receber a delegação
// Idempotente: recria a definição e o usuário a cada execução.
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const NAME = 'ZZ Notificacoes (SMOKE)'
const BRUNO = 'bruno.teste@nxt.local'

const graph = {
  startId: 'start',
  nodes: {
    start:     { id: 'start', type: 'start', name: 'Início' },
    preencher: { id: 'preencher', type: 'userTask', name: 'Preencher pedido', slaBusinessDays: 1 },
    aprovar:   { id: 'aprovar', type: 'userTask', name: 'Aprovar pedido', slaBusinessDays: 1 },
    end:       { id: 'end', type: 'end', name: 'Fim' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'preencher' },
    { id: 'e2', from: 'preencher', to: 'aprovar' },
    { id: 'e3', from: 'aprovar', to: 'end' },
  ],
}
const formSchema = {
  steps: [
    { stepId: 'preencher', stepName: 'Preencher pedido', slaBusinessDays: 1, fields: [] },
    { stepId: 'aprovar', stepName: 'Aprovar pedido', slaBusinessDays: 1, fields: [] },
  ],
}

const run = async () => {
  const admin = await p.user.findFirst({ where: { email: 'admin@nxt.local' }, select: { id: true, organizationId: true, name: true, passwordHash: true } })
  if (!admin) throw new Error('admin@nxt.local não encontrado')
  const organizationId = admin.organizationId

  const prev = await p.processDefinition.findFirst({ where: { name: NAME, organizationId } })
  if (prev) {
    const insts = await p.processInstance.findMany({ where: { processDefinitionId: prev.id }, select: { id: true } })
    const ids = insts.map((i) => i.id)
    if (ids.length) {
      await p.notification.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowEvent.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowReturn.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowCompensation.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowTask.deleteMany({ where: { instanceId: { in: ids } } })
      await p.moduleRecord.deleteMany({ where: { processInstanceId: { in: ids } } })
      await p.processInstance.deleteMany({ where: { id: { in: ids } } })
    }
    await p.module.deleteMany({ where: { processDefinitionId: prev.id } })
    await p.processDefinition.delete({ where: { id: prev.id } })
    console.log('limpou definição anterior (instâncias:', ids.length, ')')
  }

  const def = await p.processDefinition.create({
    data: {
      organizationId, name: NAME,
      description: 'Smoke das bordas: notificação, delegação e cancelamento',
      bpmnXml: '<seed/>',
      formSchema: JSON.stringify(formSchema),
      compiledGraph: JSON.stringify(graph),
      version: 1, status: 'ACTIVE', kind: null,
    },
  })

  // segundo usuário (mesma senha do admin — é só para o smoke local)
  let bruno = await p.user.findFirst({ where: { email: BRUNO, organizationId } })
  if (!bruno) {
    bruno = await p.user.create({
      data: { organizationId, email: BRUNO, name: 'Bruno Teste', passwordHash: admin.passwordHash, role: 'user', status: 'ATIVO' },
    })
  }

  console.log('DEFINIÇÃO ATIVA:', def.id)
  console.log('admin:', admin.id, '| bruno:', bruno.id)
  await p.$disconnect()
}

run().catch(async (e) => { console.error('ERRO:', e); await p.$disconnect(); process.exit(1) })
