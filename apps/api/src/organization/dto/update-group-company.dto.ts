import { IsString, IsOptional, IsArray } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateGroupCompanyDto {
  @ApiPropertyOptional({ description: 'Código alfanumérico (até 15 posições), manual' })
  @IsOptional()
  @IsString()
  codigo?: string

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
  cnpj?: string

  @ApiPropertyOptional({ description: 'Inscrição estadual' })
  @IsOptional()
  @IsString()
  ie?: string

  @ApiPropertyOptional({ description: 'Inscrição municipal' })
  @IsOptional()
  @IsString()
  im?: string

  @ApiPropertyOptional({ description: 'ATIVA | INATIVA' })
  @IsOptional()
  @IsString()
  status?: string

  // Blocos PJ (mesma modelagem de Parceiros) — arrays de objetos serializados em JSON.
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  contatos?: unknown[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  enderecos?: unknown[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  bancos?: unknown[]

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  socios?: unknown[]
}
