/* Smoke dos TRÊS CENÁRIOS: cancelar um processo desfaz o que ele produziu no
   domínio, e desfazer o cancelamento restaura. Cria workflows com ação automática
   (contrato, aditivo, distrato) e exercita o ciclo completo. */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => { if (ok) { pass++; console.log(`  OK   ${label}`) } else { fail++; console.log(`  FALHA ${label} ${extra}`) } }

const bpmn = (id) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d_${id}" targetNamespace="http://nxt">
  <bpmn:process id="P_${id}" isExecutable="true">
    <bpmn:startEvent id="start"><bpmn:outgoing>e1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="acao" name="Acao"><bpmn:incoming>e1</bpmn:incoming><bpmn:outgoing>e2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="conferir" name="Conferir"><bpmn:incoming>e2</bpmn:incoming><bpmn:outgoing>e3</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="end"><bpmn:incoming>e3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="e1" sourceRef="start" targetRef="acao" />
    <bpmn:sequenceFlow id="e2" sourceRef="acao" targetRef="conferir" />
    <bpmn:sequenceFlow id="e3" sourceRef="conferir" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`

/* O PrismaClient CRU não tem a extensão que (de)serializa JSON — ela vive no
   PrismaService do Nest. Por isso os campos JSON chegam como STRING aqui. */
const jsonOf = (v) => (typeof v === 'string' ? JSON.parse(v || '[]') : (v ?? []))

const run = async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@nxt.local', password: PASS }),
  })
  const token = (await r.json()).accessToken
  const A = async (path, init = {}) => {
    const res = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    const t = await res.text()
    return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }
  }
  const org = (await p.user.findFirst({ where: { email: 'admin@nxt.local' }, select: { organizationId: true } })).organizationId

  /** cria um workflow com uma ação automática e o ativa (direto no banco: o objetivo
   *  aqui é o comportamento do cancelamento, não o designer) */
  const criarDef = async (nome, connector) => {
    await p.processDefinition.deleteMany({ where: { name: nome, organizationId: org } })
    const graph = {
      startId: 'start',
      nodes: {
        start:    { id: 'start', type: 'start', name: 'Início' },
        acao:     { id: 'acao', type: 'serviceTask', name: 'Ação', connector },
        conferir: { id: 'conferir', type: 'userTask', name: 'Conferir', slaBusinessDays: 1 },
        end:      { id: 'end', type: 'end', name: 'Fim' },
      },
      edges: [
        { id: 'e1', from: 'start', to: 'acao' },
        { id: 'e2', from: 'acao', to: 'conferir' },
        { id: 'e3', from: 'conferir', to: 'end' },
      ],
    }
    return p.processDefinition.create({
      data: {
        organizationId: org, name: nome, description: 'smoke de efeitos',
        bpmnXml: bpmn(connector.replace(/\W/g, '')), formSchema: JSON.stringify({ steps: [] }),
        compiledGraph: JSON.stringify(graph), version: 1, status: 'ACTIVE', kind: 'CONTRATO',
      },
    })
  }

  // ── Cenário 1: processo CRIA contrato ────────────────────────────────────────
  const defCreate = await criarDef('ZZ Efeito Create (SMOKE)', 'contracts.create')
  const s1 = await A('/instances', {
    method: 'POST',
    body: JSON.stringify({ processDefinitionId: defCreate.id, variables: { titulo: 'Contrato do smoke', tipo: 'SERVICO', valorTotal: 1000 } }),
  })
  check(s1.ok, 'cenário 1: processo inicia e cria o contrato', JSON.stringify(s1.body).slice(0, 140))
  const inst1 = s1.body?.instance?.id
  const ctx1 = await A(`/instances/${inst1}`)
  const contratoId = ctx1.body?.state?.variables?.contratoId
  check(!!contratoId, 'contrato criado pelo processo', String(contratoId))

  const efeito = await p.workflowCompensation.findFirst({ where: { instanceId: inst1, kind: 'CREATE' } })
  check(efeito?.entityId === contratoId, 'o VÍNCULO processo→contrato ficou registrado', String(efeito?.entityId))

  const prev1 = await A(`/instances/${inst1}/cancel-preview`)
  check(prev1.body?.efeitos?.some((e) => /Cancelado/.test(e.descricao)), 'prévia avisa que o contrato será cancelado', JSON.stringify(prev1.body?.efeitos))
  check(prev1.body?.requerConfirmacao === false, 'contrato em cadastro não exige confirmação', JSON.stringify(prev1.body?.requerConfirmacao))

  // guarda a situação REAL de origem: o create grava o legado 'PENDENTE', que
  // `normalizeSituacao` lê como "em cadastro" — o desfazer tem de devolver exatamente
  // o que havia, não um valor normalizado.
  const situacaoOrigem = (await p.contract.findUnique({ where: { id: contratoId }, select: { situacao: true } })).situacao

  const c1 = await A(`/instances/${inst1}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'engano' }) })
  check(c1.ok, 'cancela o processo', String(c1.status))
  let contrato = await p.contract.findUnique({ where: { id: contratoId }, select: { situacao: true } })
  check(contrato?.situacao === 'CANCELADO', 'CENÁRIO 1: contrato fica CANCELADO junto com o processo', contrato?.situacao)

  const u1 = await A(`/instances/${inst1}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'reabrindo' }) })
  check(u1.ok, 'desfaz o cancelamento', JSON.stringify(u1.body).slice(0, 120))
  contrato = await p.contract.findUnique({ where: { id: contratoId }, select: { situacao: true } })
  check(contrato?.situacao === situacaoOrigem, `CENÁRIO 1: contrato volta à situação anterior (${situacaoOrigem})`, contrato?.situacao)

  // proteção: alguém mexe no contrato depois do cancelamento → reabrir é recusado
  await A(`/instances/${inst1}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'de novo' }) })
  await p.contract.update({ where: { id: contratoId }, data: { situacao: 'VIGENTE' } })
  const conflito = await A(`/instances/${inst1}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'tentando' }) })
  check(conflito.status === 409, 'reabrir é RECUSADO quando alguém alterou o contrato depois', `${conflito.status} ${conflito.body?.message ?? ''}`)

  // ── Cenário 2: processo lança ADITIVO ────────────────────────────────────────
  const alvo = await p.contract.create({
    data: { organizationId: org, numero: 'SMOKE_ADIT_1', titulo: 'Alvo do aditivo', tipo: 'SERVICO', situacao: 'VIGENTE', valorTotal: 5000 },
  })
  const defAdit = await criarDef('ZZ Efeito Aditivo (SMOKE)', 'contracts.aditivo')
  const s2 = await A('/instances', {
    method: 'POST',
    body: JSON.stringify({ processDefinitionId: defAdit.id, variables: { contratoId: alvo.id, descricao: 'Prorrogação', novoTermino: '2027-12-31', alteraTermino: true } }),
  })
  check(s2.ok, 'cenário 2: processo de aditivo inicia', JSON.stringify(s2.body).slice(0, 140))
  const inst2 = s2.body?.instance?.id
  let alvoDb = await p.contract.findUnique({ where: { id: alvo.id }, select: { aditivos: true } })
  const aditivo = jsonOf(alvoDb.aditivos)[0]
  check(aditivo?.situacao === 'ATIVO', 'aditivo nasce ATIVO (vale no contrato)', aditivo?.situacao)

  await A(`/instances/${inst2}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'aditivo errado', confirmar: true }) })
  alvoDb = await p.contract.findUnique({ where: { id: alvo.id }, select: { aditivos: true } })
  check(jsonOf(alvoDb.aditivos)[0]?.situacao === 'RASCUNHO', 'CENÁRIO 2: aditivo volta a RASCUNHO (não é apagado)', jsonOf(alvoDb.aditivos)[0]?.situacao)
  check(jsonOf(alvoDb.aditivos).length === 1, 'o aditivo continua existindo, com o preenchimento preservado', String(jsonOf(alvoDb.aditivos).length))

  await A(`/instances/${inst2}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'era certo' }) })
  alvoDb = await p.contract.findUnique({ where: { id: alvo.id }, select: { aditivos: true } })
  check(jsonOf(alvoDb.aditivos)[0]?.situacao === 'ATIVO', 'CENÁRIO 2: desfazer devolve o aditivo para ATIVO', jsonOf(alvoDb.aditivos)[0]?.situacao)

  // ── Cenário 3: processo ENCERRA (distrato) ───────────────────────────────────
  const alvo3 = await p.contract.create({
    data: { organizationId: org, numero: 'SMOKE_DIST_1', titulo: 'Alvo do distrato', tipo: 'SERVICO', situacao: 'VIGENTE', valorTotal: 3000 },
  })
  const defDist = await criarDef('ZZ Efeito Distrato (SMOKE)', 'contracts.distrato')
  const s3 = await A('/instances', {
    method: 'POST',
    body: JSON.stringify({ processDefinitionId: defDist.id, variables: { contratoId: alvo3.id, motivo: 'fim' } }),
  })
  check(s3.ok, 'cenário 3: processo de encerramento inicia', JSON.stringify(s3.body).slice(0, 140))
  const inst3 = s3.body?.instance?.id
  let c3 = await p.contract.findUnique({ where: { id: alvo3.id }, select: { situacao: true } })
  check(c3?.situacao === 'RESCINDIDO', 'contrato é rescindido pelo processo', c3?.situacao)

  await A(`/instances/${inst3}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'encerramento indevido', confirmar: true }) })
  c3 = await p.contract.findUnique({ where: { id: alvo3.id }, select: { situacao: true } })
  check(c3?.situacao === 'VIGENTE', 'CENÁRIO 3: contrato volta a VIGENTE quando o encerramento é cancelado', c3?.situacao)

  await A(`/instances/${inst3}/uncancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'era certo' }) })
  c3 = await p.contract.findUnique({ where: { id: alvo3.id }, select: { situacao: true } })
  check(c3?.situacao === 'RESCINDIDO', 'CENÁRIO 3: desfazer devolve o contrato para RESCINDIDO', c3?.situacao)

  // ── Confirmação obrigatória para contrato vigente ────────────────────────────
  const defCreate2 = await criarDef('ZZ Efeito Create Vigente (SMOKE)', 'contracts.create')
  const s4 = await A('/instances', { method: 'POST', body: JSON.stringify({ processDefinitionId: defCreate2.id, variables: { titulo: 'Contrato vigente' } }) })
  const inst4 = s4.body?.instance?.id
  const ctx4 = await A(`/instances/${inst4}`)
  const contrato4 = ctx4.body?.state?.variables?.contratoId
  await p.contract.update({ where: { id: contrato4 }, data: { situacao: 'VIGENTE' } })

  const semConfirmar = await A(`/instances/${inst4}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'x' }) })
  check(semConfirmar.status === 409, 'contrato VIGENTE: cancelamento é recusado sem confirmação', String(semConfirmar.status))
  check(Array.isArray(semConfirmar.body?.efeitos), 'a recusa devolve a lista do que está em jogo', JSON.stringify(semConfirmar.body?.efeitos ?? []).slice(0, 120))

  const comConfirmar = await A(`/instances/${inst4}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason: 'ciente', confirmar: true }) })
  check(comConfirmar.ok, 'com confirmação explícita, o cancelamento acontece', String(comConfirmar.status))

  // limpeza
  for (const def of [defCreate, defAdit, defDist, defCreate2]) {
    const insts = await p.processInstance.findMany({ where: { processDefinitionId: def.id }, select: { id: true } })
    const ids = insts.map((i) => i.id)
    if (ids.length) {
      await p.notification.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowEvent.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowCompensation.deleteMany({ where: { instanceId: { in: ids } } })
      await p.workflowTask.deleteMany({ where: { instanceId: { in: ids } } })
      await p.processInstance.deleteMany({ where: { id: { in: ids } } })
    }
    await p.module.deleteMany({ where: { processDefinitionId: def.id } })
    await p.processDefinition.delete({ where: { id: def.id } })
  }
  await p.contractAuditLog.deleteMany({ where: { contractId: { in: [alvo.id, alvo3.id, contratoId, contrato4].filter(Boolean) } } })
  await p.contract.deleteMany({ where: { id: { in: [alvo.id, alvo3.id, contratoId, contrato4].filter(Boolean) } } })

  console.log(`\n${pass}/${pass + fail} verificações passaram`)
  await p.$disconnect()
  if (fail > 0) process.exit(1)
}
run().catch(async (e) => { console.error('ERRO:', e); await p.$disconnect(); process.exit(1) })
