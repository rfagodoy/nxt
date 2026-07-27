import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Public } from '../auth/public.decorator'
import { DiagnosticoService } from './diagnostico.service'
import { CurrentOrg } from '../auth/current-org.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly diagnostico: DiagnosticoService) {}

  /** Liveness: responde se o PROCESSO está vivo. É o que o supervisor consulta a cada
   *  poucos segundos, então continua trivial, aberto e sem tocar no banco — um health
   *  que depende do banco derruba o serviço junto com ele, e reiniciar não resolve. */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness check (rota aberta)' })
  check() {
    return { status: 'ok', service: 'nxt-api' }
  }

  /** Diagnóstico: responde se está FUNCIONANDO. Fechado para admin porque expõe
   *  versão, caminhos e estado da instalação — mapa útil demais para quem está de fora. */
  @Get('diagnostico')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado da instalação: banco, migrações, e-mail, disco, memória, agendador — admin' })
  diagnosticar(@CurrentOrg() org: string) {
    return this.diagnostico.completo(org)
  }
}
