import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DashboardService } from './dashboard.service'
import { CurrentOrg } from '../auth/current-org.decorator'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumo agregado para o painel inicial' })
  getSummary(@CurrentOrg() organizationId: string) {
    return this.dashboardService.getSummary(organizationId)
  }
}
