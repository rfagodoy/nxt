/* Smoke do AVISO DE PRAZO: preventivo (vence em N horas) e vencido.
   Manipula o dueAt pelo banco (o prazo real levaria um dia útil) e chama a
   varredura pela API, como o agendador faz a cada 5 minutos. */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'

/* O painel do sininho devolve { items, unread } (antes era um array cru): a leitura
   passou a ser paginada quando o histórico deixou de ser descartável. */
const avisos = (res) => (Array.isArray(res?.body) ? res.body : res?.body?.items) ?? []

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) } else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

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

  const def = (await A('/processes')).body.find((d) => d.name === 'ZZ Notificacoes (SMOKE)')
  const started = await A('/instances', { method: 'POST', body: JSON.stringify({ processDefinitionId: def.id }) })
  const instanceId = started.body.instance.id
  const taskId = started.body.tasks[0].id

  // ── 1) prazo PERTO (2h à frente; antecedência padrão = 24h) ──
  await p.workflowTask.update({ where: { id: taskId }, data: { dueAt: new Date(Date.now() + 2 * 3600_000), escalatedAt: null } })
  const sweep1 = await A('/instances/sweep-overdue', { method: 'POST' })
  check(sweep1.body?.avisadas >= 1, 'varredura avisa tarefa perto do prazo', JSON.stringify(sweep1.body))

  let notifs = avisos(await A('/notifications'))
  const preventivo = notifs.find((n) => n.taskId === taskId && n.tipo === 'TAREFA_A_VENCER')
  check(!!preventivo, 'aviso PREVENTIVO chega antes do vencimento', notifs.map((n) => n.tipo).join(','))

  // idempotência: rodar de novo não duplica
  await A('/instances/sweep-overdue', { method: 'POST' })
  notifs = avisos(await A('/notifications'))
  check(notifs.filter((n) => n.taskId === taskId && n.tipo === 'TAREFA_A_VENCER').length === 1, 'varredura repetida não duplica o aviso')

  // ── 2) prazo VENCIDO ──
  await p.workflowTask.update({ where: { id: taskId }, data: { dueAt: new Date(Date.now() - 3600_000), escalatedAt: null } })
  const sweep2 = await A('/instances/sweep-overdue', { method: 'POST' })
  check(sweep2.body?.escalated >= 1, 'varredura escalona a tarefa vencida', JSON.stringify(sweep2.body))

  notifs = avisos(await A('/notifications'))
  check(notifs.some((n) => n.taskId === taskId && n.tipo === 'TAREFA_VENCIDA' && n.severidade === 'CRITICO'), 'aviso de prazo VENCIDO é crítico')
  check(!notifs.some((n) => n.taskId === taskId && n.tipo === 'TAREFA_A_VENCER'), 'aviso preventivo some quando o prazo estoura')

  const task = await p.workflowTask.findUnique({ where: { id: taskId }, select: { escalatedAt: true } })
  check(!!task.escalatedAt, 'escalatedAt gravado (o campo deixou de ser fantasma)')

  // ── 3) desligar o preventivo nos parâmetros ──
  const org = (await p.user.findFirst({ where: { email: 'admin@nxt.local' } })).organizationId
  const KEY = 'nxt:settings:notificacoes'
  const prev = await p.appSetting.findFirst({ where: { organizationId: org, key: KEY } })
  const value = JSON.stringify({ ...(prev ? JSON.parse(prev.value) : {}), tarefas: { enabled: false, antecedenciaHoras: 24 } })
  if (prev) await p.appSetting.update({ where: { id: prev.id }, data: { value } })
  else await p.appSetting.create({ data: { organizationId: org, userId: '', key: KEY, value } })

  const started2 = await A('/instances', { method: 'POST', body: JSON.stringify({ processDefinitionId: def.id }) })
  const task2 = started2.body.tasks[0].id
  await p.workflowTask.update({ where: { id: task2 }, data: { dueAt: new Date(Date.now() + 2 * 3600_000), escalatedAt: null } })
  const sweep3 = await A('/instances/sweep-overdue', { method: 'POST' })
  const notifs3 = avisos(await A('/notifications'))
  check(!notifs3.some((n) => n.taskId === task2 && n.tipo === 'TAREFA_A_VENCER'), 'parâmetro desligado suprime o aviso preventivo', JSON.stringify(sweep3.body))

  // restaura o parâmetro e limpa as instâncias do smoke
  const restored = JSON.stringify({ ...(prev ? JSON.parse(prev.value) : {}), tarefas: { enabled: true, antecedenciaHoras: 24 } })
  const cur = await p.appSetting.findFirst({ where: { organizationId: org, key: KEY } })
  await p.appSetting.update({ where: { id: cur.id }, data: { value: restored } })
  for (const id of [instanceId, started2.body.instance.id]) {
    await p.notification.deleteMany({ where: { instanceId: id } })
    await p.workflowEvent.deleteMany({ where: { instanceId: id } })
    await p.workflowTask.deleteMany({ where: { instanceId: id } })
    await p.processInstance.delete({ where: { id } })
  }

  console.log(`\n${pass}/${pass + fail} verificações passaram`)
  await p.$disconnect()
  if (fail > 0) process.exit(1)
}

run().catch(async (e) => { console.error('ERRO:', e); await p.$disconnect(); process.exit(1) })
