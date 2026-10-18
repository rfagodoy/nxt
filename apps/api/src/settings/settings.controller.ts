import { Controller, Get, Put, Param, Body, Query, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { SettingsService } from './settings.service'
import { PutSettingDto } from './dto/put-setting.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'

// Chaves de CONFIGURAÇÃO da organização (numeração, motor de notificações/reajuste,
// tabelas auxiliares, índices) vivem sob este prefixo e só admin pode gravar. As
// preferências de UI (nxt:columns:/nxt:sections:/nxt:fields:/nxt:views:) ficam de fora
// — qualquer usuário salva o próprio layout.
const ORG_CONFIG_PREFIX = 'nxt:settings:'

/** Preferências PESSOAIS (ex.: densidade da tela) vivem sob este prefixo e são gravadas
 *  com o id do usuário do TOKEN — nunca de um parâmetro do cliente. Cada um vê só a sua. */
export const USER_PREF_PREFIX = 'nxt:me:'
export function escopoDaChave(key: string, userId: string): string {
  if (!key.startsWith(USER_PREF_PREFIX)) return ''
  // sem usuário no token, a preferência "pessoal" cairia no escopo da organização
  if (!userId) throw new ForbiddenException('Preferência pessoal exige usuário identificado')
  return userId
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lê várias configurações de uma vez' })
  @ApiQuery({ name: 'keys', required: true, description: 'Chaves separadas por vírgula' })
  async getMany(
    @CurrentOrg() organizationId: string,
    @Query('keys') keys: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Organização ('') para as chaves comuns; o usuário do TOKEN para `nxt:me:`.
    const todas = (keys ?? '').split(',').filter(Boolean)
    const daOrg = todas.filter((k) => !k.startsWith(USER_PREF_PREFIX))
    const minhas = todas.filter((k) => k.startsWith(USER_PREF_PREFIX))
    const [org, pessoais] = await Promise.all([
      daOrg.length ? this.service.getMany(organizationId, daOrg, '') : {},
      minhas.length ? this.service.getMany(organizationId, minhas, escopoDaChave(minhas[0], user.sub)) : {},
    ])
    return { ...org, ...pessoais }
  }

  @Get(':key')
  @ApiOperation({ summary: 'Lê uma configuração' })
  get(
    @Param('key') key: string,
    @CurrentOrg() organizationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.get(organizationId, key, escopoDaChave(key, user.sub))
  }

  @Put(':key')
  @ApiOperation({ summary: 'Grava uma configuração (upsert)' })
  put(
    @Param('key') key: string,
    @Body() dto: PutSettingDto,
    @CurrentOrg() organizationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (key.startsWith(ORG_CONFIG_PREFIX) && !user.roles.includes('admin')) {
      throw new ForbiddenException('Configuração da organização — restrita a administradores')
    }
    return this.service.put(organizationId, key, dto.value, escopoDaChave(key, user.sub))
  }
}
