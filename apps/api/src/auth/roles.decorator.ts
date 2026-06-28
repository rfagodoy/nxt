import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'roles'

/** Exige que o usuário tenha pelo menos um dos papéis informados (usar com RolesGuard). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
