import { Controller, Get, Post, Patch, Delete, Param, Body, Headers } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { PartnersService } from './partners.service'
import { CreatePartnerDto } from './dto/create-partner.dto'
import { UpdatePartnerDto } from './dto/update-partner.dto'
import { QueryPartnersDto } from './dto/query-partners.dto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator'
import { ConferenciaTelaService } from '../screens/conferencia-tela.service'
import { ScreensService } from '../screens/screens.service'

@ApiTags('partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly conferencia: ConferenciaTelaService,
    private readonly screens: ScreensService,
  ) {}

  /* As Telas valem AQUI, no pedido da tela — antes de gravar qualquer coisa, a gravação
     (registro + personalizados que vêm junto) é conferida contra a tela que vale: a padrão,
     ou a da aba da tarefa (cabeçalhos x-nxt-tarefa/x-nxt-tela). Travas e obrigatórios são
     os do @nxt/screens-core, os mesmos da tela. Importação, rotina automática e conectores
     do workflow chamam o service direto e não passam por aqui. */
  private async gravarPersonalizados(organizationId: string, id: string, valores: Record<string, string> | undefined, actor: CurrentUserData) {
    if (!valores) return
    await this.screens.putValues(organizationId, 'PARTNER', id,
      Object.entries(valores).map(([fieldId, value]) => ({ fieldId, value: value == null ? '' : String(value) })),
      { nome: actor.name, id: actor.sub })
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo parceiro' })
  async create(@Body() dto: CreatePartnerDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData, @Headers() headers: Record<string, unknown>) {
    const { valoresPersonalizados, ...dados } = dto
    await this.conferencia.conferir({
      organizationId, subject: 'FORNECEDOR', actor, origem: ConferenciaTelaService.origemDe(headers),
      entidadeId: null, antes: null, depois: dados, customDepois: valoresPersonalizados,
    })
    const criado = await this.partnersService.create(dados, organizationId, actor.name, actor.sub)
    await this.gravarPersonalizados(organizationId, criado.id, valoresPersonalizados, actor)
    return criado
  }

  @Post('query')
  @ApiOperation({ summary: 'Consulta parceiros com paginação server-side, filtros e ordenação' })
  query(@Body() dto: QueryPartnersDto, @CurrentOrg() organizationId: string) {
    return this.partnersService.query(dto, organizationId)
  }

  @Get()
  @ApiOperation({ summary: 'Lista parceiros da organização' })
  findAll(@CurrentOrg() organizationId: string) {
    return this.partnersService.findAll(organizationId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca parceiro por ID' })
  findOne(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.findOne(id, organizationId)
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Histórico de auditoria (alterações) do parceiro' })
  audit(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.getAuditLogs(id, organizationId)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza parceiro' })
  async update(@Param('id') id: string, @Body() dto: UpdatePartnerDto, @CurrentOrg() organizationId: string, @CurrentUser() actor: CurrentUserData, @Headers() headers: Record<string, unknown>) {
    const { valoresPersonalizados, ...dados } = dto
    const antes = await this.conferencia.registro(organizationId, 'FORNECEDOR', id)
    await this.conferencia.conferir({
      organizationId, subject: 'FORNECEDOR', actor, origem: ConferenciaTelaService.origemDe(headers),
      entidadeId: id, antes, depois: dados, customDepois: valoresPersonalizados,
    })
    const salvo = await this.partnersService.update(id, dados, organizationId, actor.name, actor.sub)
    await this.gravarPersonalizados(organizationId, id, valoresPersonalizados, actor)
    return salvo
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove parceiro' })
  remove(@Param('id') id: string, @CurrentOrg() organizationId: string) {
    return this.partnersService.remove(id, organizationId)
  }
}
