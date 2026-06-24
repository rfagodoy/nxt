import { IsString, IsOptional } from 'class-validator'
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

  @ApiPropertyOptional({ description: 'ATIVA | INATIVA' })
  @IsOptional()
  @IsString()
  status?: string
}
