/* Trava de RBAC nas superfícies de CONFIGURAÇÃO.
 *
 * A auditoria de 2026-08-21 encontrou mutações de config sem @Roles('admin') —
 * qualquer usuário autenticado podia apagar Telas, unidades do organograma,
 * empresas do grupo e papéis do workflow por API. Este teste lê os METADADOS dos
 * decorators (o mesmo que o RolesGuard lê em runtime): se um refactor remover o
 * gate de uma dessas rotas, o CI acusa aqui — em vez de o buraco voltar em silêncio.
 *
 * De fora, POR DECISÃO (não por esquecimento):
 * - role-assignments (Responsáveis): editado por usuário comum DENTRO dos cadastros
 *   de Contrato/Parceiro (PR #13) — gatear quebraria a rotina operacional.
 * - screen-values: é o usuário preenchendo campos custom no formulário da entidade.
 * - GETs: os selects do app (papéis, unidades, telas) são de leitura para todos.
 */
import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { ROLES_KEY } from './roles.decorator'
import { RolesGuard } from './roles.guard'
import { ScreensController } from '../screens/screens.controller'
import { OrgUnitsController } from '../organization/org-units.controller'
import { GroupCompaniesController } from '../organization/group-companies.controller'
import { WorkflowRolesController } from '../workflow-roles/workflow-roles.controller'

const GUARDS_KEY = '__guards__' // GUARDS_METADATA do Nest — onde @UseGuards grava

/* eslint-disable @typescript-eslint/no-explicit-any */
function gateDo(ctrl: any, metodo: string) {
  const fn = ctrl.prototype[metodo]
  expect(fn, `${ctrl.name}.${metodo} não existe — o teste ficou desatualizado`).toBeTypeOf('function')
  return {
    roles:  Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined,
    guards: (Reflect.getMetadata(GUARDS_KEY, fn) as unknown[] | undefined) ?? [],
  }
}

const MUTACOES_ADMIN: Array<[any, string[]]> = [
  [ScreensController,        ['create', 'update', 'remove']],
  [OrgUnitsController,       ['create', 'update', 'remove']],
  [GroupCompaniesController, ['create', 'update', 'remove']],
  [WorkflowRolesController,  ['create', 'update', 'remove']],
]

describe('RBAC das superfícies de configuração', () => {
  for (const [ctrl, metodos] of MUTACOES_ADMIN) {
    for (const metodo of metodos) {
      it(`${ctrl.name}.${metodo} exige admin (Roles + RolesGuard)`, () => {
        const { roles, guards } = gateDo(ctrl, metodo)
        expect(roles).toEqual(['admin'])
        // @Roles sem o guard é decorativo — os dois têm que estar juntos.
        expect(guards).toContain(RolesGuard)
      })
    }
  }

  it('as leituras continuam abertas (selects do app usam)', () => {
    for (const [ctrl, metodo] of [
      [ScreensController, 'list'],
      [OrgUnitsController, 'findAll'],
      [WorkflowRolesController, 'list'],
    ] as Array<[any, string]>) {
      expect(gateDo(ctrl, metodo).roles).toBeUndefined()
    }
  })
})
