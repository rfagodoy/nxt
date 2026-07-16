import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { CnpjService } from './cnpj.service'

@ApiTags('cnpj')
@ApiBearerAuth()
@Controller('cnpj')
export class CnpjController {
  constructor(private readonly service: CnpjService) {}

  @Get(':cnpj')
  @ApiOperation({ summary: 'Consulta cadastro de PJ por CNPJ (proxy BrasilAPI/base aberta da RFB)' })
  @ApiParam({ name: 'cnpj', description: 'CNPJ (14 dígitos; pontuação é ignorada)' })
  lookup(@Param('cnpj') cnpj: string) {
    return this.service.lookup(cnpj)
  }
}
