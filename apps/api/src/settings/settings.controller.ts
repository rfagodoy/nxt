import { Controller, Get, Put, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { SettingsService } from './settings.service'
import { PutSettingDto } from './dto/put-setting.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lê várias configurações de uma vez' })
  @ApiQuery({ name: 'keys', required: true, description: 'Chaves separadas por vírgula' })
  @ApiQuery({ name: 'userId', required: false })
  getMany(
    @CurrentOrg() organizationId: string,
    @Query('keys') keys: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.getMany(organizationId, (keys ?? '').split(',').filter(Boolean), userId ?? '')
  }

  @Get(':key')
  @ApiOperation({ summary: 'Lê uma configuração' })
  @ApiQuery({ name: 'userId', required: false })
  get(
    @Param('key') key: string,
    @CurrentOrg() organizationId: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.get(organizationId, key, userId ?? '')
  }

  @Put(':key')
  @ApiOperation({ summary: 'Grava uma configuração (upsert)' })
  put(@Param('key') key: string, @Body() dto: PutSettingDto, @CurrentOrg() organizationId: string) {
    return this.service.put(organizationId, key, dto.value, dto.userId ?? '')
  }
}
