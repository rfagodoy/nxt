import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ReportsService, type ParametrosRelatorio } from './reports.service'
import { CurrentOrg } from '../auth/current-org.decorator'

/* POST para o relatório, e não GET: os filtros são listas (situações, tipos,
   parceiros) e cabem mal numa query string — que ainda por cima ficaria no log de
   acesso do proxy e no histórico do navegador. */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('contratos/opcoes')
  @ApiOperation({ summary: 'Valores disponíveis para montar os filtros' })
  opcoes(@CurrentOrg() org: string) {
    return this.svc.opcoes(org)
  }

  @Post('contratos')
  @ApiOperation({ summary: 'Relatório de contratos com situação efetiva (Vencido derivado)' })
  contratos(@CurrentOrg() org: string, @Body() body: ParametrosRelatorio) {
    return this.svc.contratos(org, body ?? {})
  }
}
