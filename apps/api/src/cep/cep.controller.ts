import { Controller, Get, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { CepService } from './cep.service'

@ApiTags('cep')
@ApiBearerAuth()
@Controller('cep')
export class CepController {
  constructor(private readonly service: CepService) {}

  @Get(':cep')
  @ApiOperation({ summary: 'Consulta endereço por CEP (proxy ViaCEP server-side)' })
  @ApiParam({ name: 'cep', description: 'CEP (8 dígitos; pontuação é ignorada)' })
  lookup(@Param('cep') cep: string) {
    return this.service.lookup(cep)
  }
}
