import { IsOptional, IsString, IsArray } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdatePartnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoria?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documento?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  razaoSocial?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nomeFantasia?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ie?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  im?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rg?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgaoExpedidor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dataNascimento?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dataAbertura?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  naturezaJuridica?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paisOrigem?: string

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  contatos?: object[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  enderecos?: object[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  bancos?: object[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  socios?: object[]

  @ApiPropertyOptional({ description: 'Usuário que originou a alteração (para auditoria)' })
  @IsOptional()
  @IsString()
  user?: string

  @ApiPropertyOptional({ description: 'Motivo da mudança de situação (para auditoria)' })
  @IsOptional()
  @IsString()
  motivo?: string
}
