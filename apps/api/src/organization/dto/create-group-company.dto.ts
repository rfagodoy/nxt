import { IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateGroupCompanyDto {
  @ApiPropertyOptional({ description: 'Código alfanumérico (até 15 posições), manual' })
  @IsOptional()
  @IsString()
  codigo?: string

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
  cnpj?: string

  @ApiPropertyOptional({ description: 'ATIVA | INATIVA' })
  @IsOptional()
  @IsString()
  status?: string
}
