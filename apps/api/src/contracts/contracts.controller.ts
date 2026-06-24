import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { ContractsService } from './contracts.service'
import { CreateContractDto } from './dto/create-contract.dto'
import { UpdateContractDto } from './dto/update-contract.dto'

@ApiTags('contracts')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo contrato' })
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Lista contratos da organização' })
  @ApiQuery({ name: 'organizationId', required: true })
  findAll(@Query('organizationId') organizationId: string) {
    return this.contractsService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca contrato por ID' })
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza contrato' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove contrato' })
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id)
  }
}
