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

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lê várias configurações de uma vez' })
  @ApiQuery({ name: 'keys', required: true, description: 'Chaves separadas por vírgula' })
  getMany(
    @CurrentOrg() organizationId: string,
    @Query('keys') keys: string,
  ) {
    // userId sempre '' (nível organização). Um escopo por usuário virá do TOKEN
    // quando houver login pessoal — nunca de um parâmetro informado pelo cliente.
    return this.service.getMany(organizationId, (keys ?? '').split(',').filter(Boolean), '')
  }

  @Get(':key')
  @ApiOperation({ summary: 'Lê uma configuração' })
  get(
    @Param('key') key: string,
    @CurrentOrg() organizationId: string,
  ) {
    return this.service.get(organizationId, key, '')
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
    return this.service.put(organizationId, key, dto.value, '')
  }
}
