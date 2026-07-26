import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { WorkflowCalendarService, type StoredCalendar } from './workflow-calendar.service'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

/* Calendário comercial da organização. Até aqui o calendário existia só no código:
   o serviço lia um AppSetting que NENHUMA tela escrevia, então toda instalação
   rodava no padrão (seg–sex, 9h–18h, zero feriados) — e o motor contava o Natal
   como dia útil. Estas rotas são o que faltava para ele ser configurável. */
@ApiTags('workflow-calendar')
@ApiBearerAuth()
@Controller('workflow-calendar')
export class WorkflowCalendarController {
  constructor(private readonly calendar: WorkflowCalendarService) {}

  @Get()
  @ApiOperation({ summary: 'Calendário comercial da organização (expediente, intervalo, dias não úteis)' })
  async get(@CurrentOrg() organizationId: string, @Query('year') year?: string) {
    const cal = await this.calendar.get(organizationId)
    const ano = Number(year) || new Date().getFullYear()
    return { calendar: cal, summary: this.calendar.summary(cal, ano) }
  }

  @Get('national-holidays')
  @ApiOperation({ summary: 'Feriados nacionais do ano que ainda não estão no calendário' })
  missing(@CurrentOrg() organizationId: string, @Query('year') year?: string) {
    return this.calendar.missingNationalHolidays(organizationId, Number(year) || new Date().getFullYear())
  }

  @Put()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Grava o calendário comercial — admin' })
  async put(@CurrentOrg() organizationId: string, @Body() body: Partial<StoredCalendar>, @Query('year') year?: string) {
    const cal = await this.calendar.put(organizationId, body)
    const ano = Number(year) || new Date().getFullYear()
    return { calendar: cal, summary: this.calendar.summary(cal, ano) }
  }
}
