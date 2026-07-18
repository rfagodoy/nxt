import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { Prisma, PrismaClient } from '@nxt/database'

// ── (De)serialização JSON para SQL Server ──────────────────────────────────
// O conector SQL Server do Prisma não suporta o tipo `Json`, então no schema
// esses campos são `String @db.NVarChar(Max)` guardando JSON serializado.
// Esta Client Extension serializa na escrita e desserializa na leitura, de modo
// que os services continuam lendo/gravando objetos e arrays como antes (Postgres).
const JSON_FIELDS: Record<string, string[]> = {
  ProcessDefinition: ['formSchema', 'compiledGraph'],
  ProcessInstance: ['data', 'state', 'graphSnapshot'],
  WorkflowTask: ['data'],
  WorkflowRole: ['members'],
  Module: ['schema'],
  ModuleRecord: ['data'],
  Partner: ['contatos', 'enderecos', 'bancos', 'socios', 'cnaesSecundarios'],
  PartnerAuditLog: ['changes'],
  Contract: ['objeto', 'partes', 'reajustes', 'documentos', 'pagamentos', 'recebimentos', 'aditivos', 'renovacoes', 'reajustesRealizados'],
  ContractAuditLog: ['changes'],
  OrgUnit: ['usuarios'],
  GroupCompany: ['contatos', 'enderecos', 'bancos', 'socios'],
  AppSetting: ['value'],
  ScreenField: ['options', 'validation', 'hiddenCategories'],
}

function serialize(model: string | undefined, data: unknown) {
  if (!model || !data || typeof data !== 'object') return
  const fields = JSON_FIELDS[model]
  if (!fields) return
  const d = data as Record<string, unknown>
  for (const f of fields) {
    const v = d[f]
    if (v !== undefined && v !== null && typeof v !== 'string') d[f] = JSON.stringify(v)
  }
}

// Mapa relação → modelo alvo, derivado do DMMF, para desserializar includes aninhados.
// Ex.: RELATIONS['ProcessDefinition'] = { module: 'Module', instances: 'ProcessInstance', ... }
const RELATIONS: Record<string, Record<string, string>> = {}
for (const m of Prisma.dmmf.datamodel.models) {
  const rels: Record<string, string> = {}
  for (const f of m.fields) if (f.kind === 'object') rels[f.name] = f.type
  RELATIONS[m.name] = rels
}

function deserialize(model: string | undefined, node: unknown) {
  if (!model) return
  if (Array.isArray(node)) {
    node.forEach((n) => deserialize(model, n))
    return
  }
  if (!node || typeof node !== 'object') return
  const r = node as Record<string, unknown>

  // campos JSON do próprio modelo
  for (const f of JSON_FIELDS[model] ?? []) {
    const v = r[f]
    if (typeof v === 'string') {
      try {
        r[f] = JSON.parse(v)
      } catch {
        /* mantém a string crua se não for JSON válido */
      }
    }
  }

  // recursão nas relações incluídas (include/select aninhado)
  const rels = RELATIONS[model]
  if (rels) {
    for (const field in rels) {
      if (r[field] != null && typeof r[field] === 'object') deserialize(rels[field], r[field])
    }
  }
}

const jsonExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          const a = args as Record<string, unknown> | undefined
          if (a?.data) {
            if (Array.isArray(a.data)) a.data.forEach((d) => serialize(model, d))
            else serialize(model, a.data)
          }
          if (a?.create) serialize(model, a.create)
          if (a?.update) serialize(model, a.update)

          const result = await query(args)

          deserialize(model, result)
          return result
        },
      },
    },
  }),
)

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Client estendido (mesma engine/conexão do client base) que aplica a
  // (de)serialização JSON. O Proxy abaixo encaminha o acesso aos modelos para
  // este client estendido, mantendo os métodos de ciclo de vida no client base.
  private readonly extended = this.$extends(jsonExtension)

  constructor() {
    super()
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target.extended) {
          const value = Reflect.get(target.extended as object, prop)
          return typeof value === 'function' ? value.bind(target.extended) : value
        }
        return Reflect.get(target, prop, receiver)
      },
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
