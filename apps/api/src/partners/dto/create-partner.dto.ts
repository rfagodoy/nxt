import { IsString, IsOptional, IsArray } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreatePartnerDto {
  @ApiProperty()
  @IsString()
  categoria: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documento?: string

  @ApiProperty()
  @IsString()
  razaoSocial: string

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

  @ApiProperty({ type: [Object] })
  @IsArray()
  contatos: object[]

  @ApiProperty({ type: [Object] })
  @IsArray()
  enderecos: object[]

  @ApiProperty({ type: [Object] })
  @IsArray()
  bancos: object[]

  @ApiProperty({ type: [Object] })
  @IsArray()
  socios: object[]

  @ApiPropertyOptional({ description: 'Usuário que originou o registro (para auditoria)' })
  @IsOptional()
  @IsString()
  user?: string
}
