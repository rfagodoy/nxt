import { Controller, Get, Put, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { SettingsService } from './settings.service'
import { PutSettingDto } from './dto/put-setting.dto'

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lê várias configurações de uma vez' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'keys', required: true, description: 'Chaves separadas por vírgula' })
  @ApiQuery({ name: 'userId', required: false })
  getMany(
    @Query('organizationId') organizationId: string,
    @Query('keys') keys: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.getMany(organizationId, (keys ?? '').split(',').filter(Boolean), userId ?? '')
  }

  @Get(':key')
  @ApiOperation({ summary: 'Lê uma configuração' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'userId', required: false })
  get(
    @Param('key') key: string,
    @Query('organizationId') organizationId: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.get(organizationId, key, userId ?? '')
  }

  @Put(':key')
  @ApiOperation({ summary: 'Grava uma configuração (upsert)' })
  put(@Param('key') key: string, @Body() dto: PutSettingDto) {
    return this.service.put(dto.organizationId, key, dto.value, dto.userId ?? '')
  }
}
