/* Massa de DEMONSTRAÇÃO: parceiros, contratos e processos em situações variadas,
 * para avaliar os gráficos do dashboard e a caixa de tarefas com volume real.
 *
 * Tudo que este script cria fica marcado com o prefixo "DEMO" na razão social / no
 * título — é assim que `--limpar` encontra o que remover sem tocar em dado de verdade.
 *
 *   node tools/smoke/run-with-env.mjs tools/seed-demo.mjs            (cria)
 *   node tools/smoke/run-with-env.mjs tools/seed-demo.mjs --limpar   (remove)
 *
 * ⚠️ Base de desenvolvimento apenas. Não aponte para instalação de cliente.
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()
const MARCA = 'DEMO'

/* Semente fixa: rodar duas vezes gera a MESMA base. Dados de demonstração que mudam
   a cada execução tornam impossível dizer se a tela mudou porque o código mudou. */
let semente = 20260727
const rnd = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const escolhe = (arr) => arr[Math.floor(rnd() * arr.length)]
const inteiro = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const dias = (n) => new Date(Date.now() + n * 86_400_000)
const iso = (d) => d.toISOString().slice(0, 10)

/* CNPJ válido a partir de um índice — o cadastro valida dígito verificador. */
function cnpjDe(i) {
  const base = String(20000000 + i).padStart(8, '0') + '0001'
  const dv = (nums, pesos) => {
    const s = nums.reduce((acc, n, k) => acc + n * pesos[k], 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  const n = base.split('').map(Number)
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return base + d1 + d2
}

const RAZOES = ['Alfa', 'Bravo', 'Cedro', 'Delta', 'Everest', 'Ferrus', 'Gaia', 'Horizonte',
  'Ipê', 'Jangada', 'Kaizen', 'Lumen', 'Marlim', 'Nimbus', 'Órion', 'Pampa', 'Quartzo',
  'Rubi', 'Sirius', 'Titan', 'Umbra', 'Vertex', 'Wander', 'Xisto', 'Zênite']
const SUFIXOS = ['LTDA', 'S/A', 'ME', 'EIRELI', 'Serviços', 'Engenharia', 'Logística', 'Tecnologia']
const OBJETOS = ['Manutenção predial', 'Locação de veículos', 'Consultoria tributária',
  'Fornecimento de material de escritório', 'Serviços de limpeza', 'Suporte de TI',
  'Vigilância patrimonial', 'Assessoria jurídica', 'Transporte de cargas',
  'Licenciamento de software', 'Obras civis', 'Marketing digital']

/* Distribuição das situações: proporções de uma carteira real — a maioria vigente,
   uma minoria em cada estado terminal. Gráfico com fatias iguais não parece dado. */
const SITUACOES_CONTRATO = [
  ...Array(26).fill('VIGENTE'),
  ...Array(11).fill('VENCIDO_ALVO'),   // grava VIGENTE com término no passado → deriva VENCIDO
  ...Array(8).fill('EM_CADASTRO'),
  ...Array(7).fill('ENCERRADO'),
  ...Array(4).fill('RESCINDIDO'),
  ...Array(3).fill('CANCELADO'),
]

const NOMES_TAREFA = [
  'Preencher/complementar os dados do contrato',
  'Aprovar a minuta e conferir as cláusulas de reajuste',
  'Validar documentação do parceiro e certidões negativas',
  'Revisar valores e condições de pagamento antes da assinatura',
  'Assinar o contrato e anexar a via digitalizada',
  'Conferir o cadastro bancário para o primeiro pagamento',
]

async function limpar() {
  const insts = await prisma.processInstance.findMany({
    where: { state: { contains: MARCA } }, select: { id: true },
  })
  const ids = insts.map((i) => i.id)
  if (ids.length) {
    await prisma.workflowTask.deleteMany({ where: { instanceId: { in: ids } } })
    await prisma.workflowEvent.deleteMany({ where: { instanceId: { in: ids } } })
    await prisma.processInstance.deleteMany({ where: { id: { in: ids } } })
  }
  const c = await prisma.contract.deleteMany({ where: { titulo: { startsWith: MARCA } } })
  const p = await prisma.partner.deleteMany({ where: { razaoSocial: { startsWith: MARCA } } })
  return { instancias: ids.length, contratos: c.count, parceiros: p.count }
}

async function main() {
  if (process.argv.includes('--limpar')) {
    console.log('Removido:', await limpar())
    return
  }

  const org = await prisma.organization.findFirst()
  if (!org) throw new Error('nenhuma organização no banco')
  const admin = await prisma.user.findFirst({ where: { role: 'admin', status: 'ATIVO' }, select: { id: true, email: true } })
  const def = await prisma.processDefinition.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: 'desc' } })

  console.log('Limpando massa DEMO anterior…', await limpar())

  /* ── Parceiros ────────────────────────────────────────────────────────────── */
  const statusParceiro = [...Array(28).fill('ATIVO'), ...Array(9).fill('INATIVO'), ...Array(8).fill('EM_CADASTRAMENTO')]
  const parceiros = []
  for (let i = 0; i < statusParceiro.length; i++) {
    parceiros.push(await prisma.partner.create({
      data: {
        organizationId: org.id,
        categoria: 'PJ_BR',
        razaoSocial: `${MARCA} ${escolhe(RAZOES)} ${escolhe(SUFIXOS)} ${i + 1}`,
        documento: cnpjDe(i),
        status: statusParceiro[i],
        createdAt: dias(-inteiro(10, 400)),
      },
    }))
  }
  console.log(`Parceiros: ${parceiros.length}`)

  /* ── Contratos ────────────────────────────────────────────────────────────── */
  let seq = 0
  for (const alvo of SITUACOES_CONTRATO) {
    seq++
    const parceiro = escolhe(parceiros)
    const vencido = alvo === 'VENCIDO_ALVO'
    const situacao = vencido ? 'VIGENTE' : alvo
    const inicio = dias(-inteiro(120, 900))
    /* VENCIDO não existe no banco: é VIGENTE com término no passado. Gravar a
       situação seria criar um estado que o sistema não conhece. */
    const termino = vencido ? dias(-inteiro(1, 90)) : dias(inteiro(30, 900))

    await prisma.contract.create({
      data: {
        organizationId: org.id,
        numero: `${MARCA}-${String(seq).padStart(4, '0')}`,
        titulo: `${MARCA} ${escolhe(OBJETOS)}`,
        tipo: '1',
        natureza: rnd() > 0.25 ? 'DESPESA' : 'RECEITA',
        situacao,
        inicioVigencia: iso(inicio),
        terminoVigencia: iso(termino),
        prazoIndeterminado: false,
        valorTotal: inteiro(6, 900) * 1000 + inteiro(0, 99) * 10,
        moeda: 'BRL',
        dataAssinatura: iso(inicio),
        createdAt: inicio,
        partes: JSON.stringify([{
          id: randomUUID(), papel: 'CONTRATADO', ref_tipo: 'PARCEIRO',
          ref_id: parceiro.id, nome: parceiro.razaoSocial, documento: parceiro.documento,
        }]),
      },
    })
  }
  console.log(`Contratos: ${SITUACOES_CONTRATO.length}`)

  /* ── Processos ────────────────────────────────────────────────────────────── */
  if (!def) {
    console.log('Nenhum workflow desenhado — processos não foram criados.')
  } else {
    /* Mistura pensada para o gráfico: em andamento (no prazo e atrasados), concluídos,
       cancelados e um com erro. */
    const plano = [
      ...Array(9).fill('RUNNING_NO_PRAZO'),
      ...Array(6).fill('RUNNING_ATRASADO'),
      ...Array(7).fill('COMPLETED'),
      ...Array(3).fill('CANCELLED'),
      ...Array(2).fill('ERROR'),
    ]
    let numero = 1000
    let tarefasCriadas = 0

    for (const tipo of plano) {
      numero++
      /* Atrasado começa há muito tempo (o SLA de 3 dias úteis já estourou); em dia
         começa agora (ainda dentro do prazo). */
      const inicio = tipo === 'RUNNING_ATRASADO' ? dias(-inteiro(12, 45)) : dias(-inteiro(0, 2))
      const rodando = tipo.startsWith('RUNNING')
      const status = rodando ? 'RUNNING' : tipo

      /* O atraso do PROCESSO vem do SLA somado das atividades do grafo congelado —
         não do prazo da tarefa. Sem graphSnapshot, `processOverdue` é sempre falso e o
         gráfico nunca mostraria a fatia vermelha, que é justamente a que pede ação.
         Um nó de 3 dias úteis + início antigo produz atraso real. */
      const grafo = {
        nodes: {
          'etapa-demo': { id: 'etapa-demo', type: 'userTask', name: 'Etapa da demonstração', slaBusinessDays: 3 },
        },
        edges: [],
      }

      const inst = await prisma.processInstance.create({
        data: {
          processDefinitionId: def.id,
          status,
          numero,
          graphSnapshot: JSON.stringify(grafo),
          startedAt: inicio,
          startedBy: admin?.email ?? 'demo',
          completedAt: tipo === 'COMPLETED' ? dias(-inteiro(0, 2)) : null,
          /* O erro do processo é derivado do STATE (token parado), não de coluna —
             por isso a instância com erro guarda o token travado aqui. */
          state: JSON.stringify({
            variables: { origem: MARCA },
            ...(tipo === 'ERROR' ? { tokens: [{ id: randomUUID(), at: 'etapa-demo', error: 'Falha ao criar o contrato: parceiro sem documento' }] } : {}),
          }),
        },
      })

      /* Cancelamento com MOTIVO: ele vive em workflow_events, não numa coluna —
         um processo que termina em silêncio é um processo que ninguém explica. */
      if (tipo === 'CANCELLED') {
        await prisma.workflowEvent.create({
          data: {
            instanceId: inst.id,
            event: 'CANCELADO',
            reason: escolhe(['Solicitação retirada pela área', 'Duplicidade com outro processo', 'Fornecedor desistiu da proposta']),
            user: admin?.email ?? 'demo',
          },
        })
      }

      /* Tarefa PENDENTE só nos que estão rodando — e é ela que alimenta a caixa.
         O atraso vem do dueAt no passado. */
      if (rodando) {
        const atrasado = tipo === 'RUNNING_ATRASADO'
        await prisma.workflowTask.create({
          data: {
            instanceId: inst.id,
            tokenId: randomUUID(),
            nodeId: 'etapa-demo',
            name: escolhe(NOMES_TAREFA),
            status: 'PENDING',
            assignees: JSON.stringify(admin ? [admin.id] : []),
            dueAt: atrasado ? dias(-inteiro(1, 12)) : dias(inteiro(0, 9)),
            createdAt: inicio,
          },
        })
        tarefasCriadas++
      }
    }
    console.log(`Processos: ${plano.length} · tarefas pendentes: ${tarefasCriadas}`)
  }

  const [cc, pp, ii, tt] = await Promise.all([
    prisma.contract.count({ where: { titulo: { startsWith: MARCA } } }),
    prisma.partner.count({ where: { razaoSocial: { startsWith: MARCA } } }),
    prisma.processInstance.count({ where: { state: { contains: MARCA } } }),
    prisma.workflowTask.count({ where: { status: 'PENDING' } }),
  ])
  console.log(`\nNo banco: ${pp} parceiros · ${cc} contratos · ${ii} processos · ${tt} tarefas pendentes`)
  console.log('Para remover: node tools/smoke/run-with-env.mjs tools/seed-demo.mjs --limpar')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
