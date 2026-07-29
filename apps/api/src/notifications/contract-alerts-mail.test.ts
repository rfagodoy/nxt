import { describe, it, expect } from 'vitest'
import { ContractAlertsMailService } from './contract-alerts-mail.service'
import { contratosEmailParams, DEFAULT_CONTRATOS_EMAIL } from './notification-params'

/* O que se testa aqui é QUEM RECEBE — a regra que decide se um aviso de vigência
   chega em alguém ou morre no banco. As três camadas (responsável → destinatário
   fixo → administrador) são a diferença entre um alerta e um registro. */

interface Fixture {
  notifications: Array<{ id: string; contractId: string | null; severidade: string; titulo: string; mensagem: string }>
  assignments?: Array<{ entityId: string; userId: string }>
  users: Array<{ id: string; name: string; email: string; role: string; status: string }>
  params?: unknown
  /** e-mails cujo envio deve falhar (SMTP fora, endereço recusado) */
  falham?: string[]
}

function montar(f: Fixture) {
  const enviados: Array<{ to: string; subject: string; text: string }> = []
  const marcados: string[] = []

  const prisma = {
    notification: {
      findMany: async () => f.notifications,
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        marcados.push(...where.id.in)
        return { count: where.id.in.length }
      },
    },
    roleAssignment: { findMany: async () => f.assignments ?? [] },
    user: {
      findMany: async ({ where }: { where: { role?: string; id?: { in: string[] } } }) =>
        where.role === 'admin'
          ? f.users.filter((u) => u.role === 'admin' && u.status === 'ATIVO')
          : f.users.filter((u) => where.id!.in.includes(u.id) && u.status === 'ATIVO'),
    },
  }
  const settings = { get: async () => ({ value: f.params ?? {} }) }
  const mailer = {
    enabled: async () => true,
    send: async (_org: string, msg: { to: string; subject: string; text: string }) => {
      enviados.push(msg)
      return !(f.falham ?? []).includes(msg.to)
    },
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const svc = new ContractAlertsMailService(prisma as any, settings as any, mailer as any)
  return { svc, enviados, marcados }
}

const aviso = (id: string, contractId: string | null, severidade = 'ALERTA') => ({
  id, contractId, severidade, titulo: `Vigência ${id}`, mensagem: `Contrato ${contractId} vence.`,
})

const user = (id: string, role = 'user', status = 'ATIVO') => ({
  id, name: `Pessoa ${id}`, email: `${id}@empresa.com.br`, role, status,
})

describe('ContractAlertsMailService', () => {
  it('entrega ao responsável pelo contrato', async () => {
    const { svc, enviados, marcados } = montar({
      notifications: [aviso('n1', 'c1')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1'), user('admin', 'admin')],
    })
    expect(await svc.enviar('org')).toBe(1)
    expect(enviados.map((e) => e.to)).toEqual(['u1@empresa.com.br'])
    expect(marcados).toEqual(['n1'])
  })

  it('destinatário fixo recebe ALÉM do responsável', async () => {
    const { svc, enviados } = montar({
      notifications: [aviso('n1', 'c1')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1'), user('u2')],
      params: { emailContratos: { enabled: true, destinatarios: ['u2'] } },
    })
    await svc.enviar('org')
    expect(enviados.map((e) => e.to).sort()).toEqual(['u1@empresa.com.br', 'u2@empresa.com.br'])
  })

  it('contrato sem responsável e sem destinatário fixo cai nos administradores', async () => {
    const { svc, enviados } = montar({
      notifications: [aviso('n1', 'c1')],
      users: [user('u1'), user('chefe', 'admin')],
    })
    await svc.enviar('org')
    expect(enviados.map((e) => e.to)).toEqual(['chefe@empresa.com.br'])
  })

  it('agrupa: uma pessoa com três avisos recebe UM e-mail', async () => {
    const { svc, enviados, marcados } = montar({
      notifications: [aviso('n1', 'c1'), aviso('n2', 'c2'), aviso('n3', 'c3')],
      assignments: [
        { entityId: 'c1', userId: 'u1' },
        { entityId: 'c2', userId: 'u1' },
        { entityId: 'c3', userId: 'u1' },
      ],
      users: [user('u1')],
    })
    expect(await svc.enviar('org')).toBe(1)
    expect(enviados).toHaveLength(1)
    expect(enviados[0].subject).toContain('3 avisos')
    expect(marcados.sort()).toEqual(['n1', 'n2', 'n3'])
  })

  it('ordena o mais grave primeiro', async () => {
    const { svc, enviados } = montar({
      notifications: [aviso('n1', 'c1', 'INFO'), aviso('n2', 'c1', 'CRITICO'), aviso('n3', 'c1', 'ALERTA')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1')],
    })
    await svc.enviar('org')
    expect(enviados[0].text.indexOf('n2')).toBeLessThan(enviados[0].text.indexOf('n3'))
    expect(enviados[0].text.indexOf('n3')).toBeLessThan(enviados[0].text.indexOf('n1'))
  })

  it('envio que falha NÃO marca como enviado — o aviso tenta de novo amanhã', async () => {
    const { svc, marcados } = montar({
      notifications: [aviso('n1', 'c1')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1')],
      falham: ['u1@empresa.com.br'],
    })
    expect(await svc.enviar('org')).toBe(0)
    expect(marcados).toEqual([])
  })

  it('usuário inativo não recebe, e o aviso segue pendente', async () => {
    const { svc, enviados, marcados } = montar({
      notifications: [aviso('n1', 'c1')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1', 'user', 'INATIVO')],
    })
    await svc.enviar('org')
    expect(enviados).toEqual([])
    expect(marcados).toEqual([])
  })

  it('desligado na tela: não envia nada', async () => {
    const { svc, enviados } = montar({
      notifications: [aviso('n1', 'c1')],
      assignments: [{ entityId: 'c1', userId: 'u1' }],
      users: [user('u1')],
      params: { emailContratos: { enabled: false, destinatarios: [] } },
    })
    expect(await svc.enviar('org')).toBe(0)
    expect(enviados).toEqual([])
  })
})

describe('contratosEmailParams', () => {
  it('usa o padrão quando o bloco não existe (config gravada antes do cartão)', () => {
    expect(contratosEmailParams(null)).toEqual(DEFAULT_CONTRATOS_EMAIL)
    expect(contratosEmailParams({ email: { imediato: true } })).toEqual(DEFAULT_CONTRATOS_EMAIL)
  })

  it('limpa lixo da lista de destinatários e remove repetidos', () => {
    expect(contratosEmailParams({ emailContratos: { destinatarios: ['u1', 'u1', '', null] } }).destinatarios)
      .toEqual(['u1'])
    expect(contratosEmailParams({ emailContratos: { destinatarios: 'u1' } }).destinatarios).toEqual([])
  })
})
