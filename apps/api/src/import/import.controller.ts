import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { ImportService, MAX_LINHAS, type ModoImport } from './import.service'
import { colunasDe, type TipoImport } from './import-core'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'

interface CorpoImport {
  linhas: Record<string, unknown>[]
  modo?: ModoImport
}

@ApiTags('import')
@ApiBearerAuth()
@Controller('import')
export class ImportController {
  constructor(private readonly svc: ImportService) {}

  /** Colunas esperadas — alimenta o modelo baixável e o mapeamento na tela. */
  @Get(':tipo/colunas')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Colunas esperadas na planilha — admin' })
  colunas(@Param('tipo') tipo: string) {
    return colunasDe(this.tipoValido(tipo))
  }

  /** Confere sem gravar nada. */
  @Post(':tipo/conferir')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Confere a planilha e diz o que aconteceria, sem gravar — admin' })
  conferir(@Param('tipo') tipo: string, @Body() body: CorpoImport, @CurrentOrg() org: string) {
    return this.svc.avaliar(this.tipoValido(tipo), this.linhasValidas(body), org, body.modo ?? 'CRIAR')
  }

  /** Grava. Só depois de conferir — a tela obriga, e aqui a conferência roda de novo:
   *  entre uma etapa e outra o banco pode ter mudado, e o que vale é o estado de agora. */
  @Post(':tipo/aplicar')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Importa de verdade — admin' })
  aplicar(
    @Param('tipo') tipo: string,
    @Body() body: CorpoImport,
    @CurrentOrg() org: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.aplicar(this.tipoValido(tipo), this.linhasValidas(body), org, body.modo ?? 'CRIAR', {
      nome: user.name ?? user.email ?? 'Usuário do sistema',
      id: user.sub,
    })
  }

  private tipoValido(tipo: string): TipoImport {
    if (tipo === 'parceiros' || tipo === 'contratos') return tipo
    throw new BadRequestException('Tipo de importação inválido. Use "parceiros" ou "contratos".')
  }

  private linhasValidas(body: CorpoImport): Record<string, unknown>[] {
    if (!Array.isArray(body?.linhas)) throw new BadRequestException('Envie as linhas da planilha.')
    if (body.linhas.length > MAX_LINHAS) {
      throw new BadRequestException(
        `A planilha tem ${body.linhas.length} linhas e o limite por importação é ${MAX_LINHAS}. ` +
        'Divida em partes — assim um erro de mapeamento aparece cedo, e não depois de milhares de linhas.',
      )
    }
    return body.linhas
  }
}
