/* Smoke do ALERTA DE CONTRATO POR E-MAIL — a parte que não dá para ver olhando:
   quando o aviso volta a ser enviado.

   O aviso de vigência é UM registro que se atualiza no tempo ("vence em 60" vira
   "vence em 7"). Se o e-mail saísse toda vez, o canal seria desligado na primeira
   semana; se saísse só uma vez, quem leu o aviso de 60 dias nunca saberia que
   agora faltam 7. A regra é: reenvia quando PIORA, e só então.

   Manipula o término do contrato pelo banco (esperar 40 dias não é teste) e chama o
   motor pela API, como o agendador das 3h faz. Restaura o contrato ao final. */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const API = 'http://localhost:3001/api'
const PASS = process.env.SMOKE_PASS || 'Nxt@2026'

let pass = 0, fail = 0
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  OK   ${label}`) } else { fail++; console.log(`  FALHA ${label} ${extra}`) }
}

const emDias = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

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

  /* contrato-cobaia: vigente e com prazo. Preferimos um SEM linha de reajuste, para
     que o motor não tenha nada a aplicar nele durante o teste; se todos tiverem
     (é o caso da massa de demonstração), qualquer um serve — os reajustes devidos já
     foram aplicados nas execuções anteriores e o motor é idempotente. */
  const candidatos = await p.contract.findMany({
    where: { situacao: 'VIGENTE', prazoIndeterminado: false },
    select: { id: true, numero: true, terminoVigencia: true, acaoTermino: true, reajustes: true },
  })
  const alvo = candidatos.find((c) => !((c.reajustes ?? []).length)) ?? candidatos[0]
  if (!alvo) { console.log('  SEM CONTRATO ELEGÍVEL — rode o seed de demonstração primeiro'); process.exitCode = 1; return }
  console.log(`  contrato-cobaia: ${alvo.numero}`)

  const original = { terminoVigencia: alvo.terminoVigencia, acaoTermino: alvo.acaoTermino }
  const dedupKey = `vigencia:${alvo.id}`
  const lerAviso = () => p.notification.findFirst({
    where: { dedupKey }, select: { severidade: true, emailedAt: true, titulo: true },
  })

  try {
    // acaoTermino MANUAL: o motor não pode renovar/encerrar a cobaia no meio do teste
    const mover = async (dias) => {
      await p.contract.update({ where: { id: alvo.id }, data: { terminoVigencia: emDias(dias), acaoTermino: 'MANUAL' } })
      await A('/notifications/run', { method: 'POST' })
    }

    // ── 1) faixa mais folgada (45 dias → INFO, dentro da faixa de 60) ──
    await mover(45)
    let aviso = await lerAviso()
    check(aviso?.severidade === 'INFO', 'aviso nasce INFO a 45 dias do término', JSON.stringify(aviso))
    check(aviso?.emailedAt === null, 'aviso novo nasce pendente de e-mail')

    // ── 2) e-mail já saiu; nada mudou → NÃO pode sair de novo ──
    await p.notification.updateMany({ where: { dedupKey }, data: { emailedAt: new Date() } })
    await A('/notifications/run', { method: 'POST' })
    aviso = await lerAviso()
    check(aviso?.emailedAt !== null, 'motor rodando de novo NÃO reenvia o mesmo aviso')

    // ── 3) ESCALADA: 20 dias (faixa de 30 → ALERTA) ──
    await mover(20)
    aviso = await lerAviso()
    check(aviso?.severidade === 'ALERTA', 'aviso sobe para ALERTA a 20 dias', JSON.stringify(aviso))
    check(aviso?.emailedAt === null, 'ESCALADA reabre o envio (emailedAt volta a nulo)')

    // ── 4) escalada de novo: 5 dias (faixa de 7 → CRITICO) ──
    await p.notification.updateMany({ where: { dedupKey }, data: { emailedAt: new Date() } })
    await mover(5)
    aviso = await lerAviso()
    check(aviso?.severidade === 'CRITICO', 'aviso sobe para CRITICO a 5 dias', JSON.stringify(aviso))
    check(aviso?.emailedAt === null, 'segunda escalada reabre o envio')

    // ── 5) MELHORAR não reenvia (renovou, voltou para 45 dias) ──
    await p.notification.updateMany({ where: { dedupKey }, data: { emailedAt: new Date() } })
    await mover(45)
    aviso = await lerAviso()
    check(aviso?.severidade === 'INFO', 'aviso volta a INFO quando o prazo se afasta')
    check(aviso?.emailedAt !== null, 'aviso que MELHORA não reenvia e-mail')
  } finally {
    await p.contract.update({ where: { id: alvo.id }, data: original })
    await A('/notifications/run', { method: 'POST' })  // devolve as notificações ao estado real
  }

  console.log(`\n  ${pass} OK, ${fail} falha(s)`)
  process.exitCode = fail ? 1 : 0
}

run().finally(() => p.$disconnect())
