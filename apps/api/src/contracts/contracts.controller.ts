import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ContractsService } from './contracts.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo contrato' })
  create(@Body() dto: CreateContractDto, @CurrentOrg() organizationId: string) {
    return this.contractsService.create(dto, organizationId)
  }

  @Get()
  @ApiOperation({ summary: 'Lista contratos da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.contractsService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca contrato por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.findOne(id, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza contrato' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentOrg() organizationId: string) {
    return this.contractsService.update(id, dto, organizationId)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove contrato' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.contractsService.remove(id, organizationId)
  }
}
