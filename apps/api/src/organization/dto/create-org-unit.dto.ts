import { IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateOrgUnitDto {
  @ApiProperty()
  @IsString()
  organizationId: string

  @ApiProperty()
  @IsString()
  groupCompanyId: string

  @ApiPropertyOptional({ description: 'Unidade pai no organograma (null = raiz)' })
  @IsOptional()
  @IsString()
  parentId?: string

  @ApiPropertyOptional({ description: 'ADMINISTRATIVA | CENTRO_CUSTO | CENTRO_LUCRO' })
  @IsOptional()
  @IsString()
  natureza?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codigo?: string

  @ApiProperty()
  @IsString()
  nome: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsavel?: string

  @ApiPropertyOptional({ description: 'ATIVA | INATIVA' })
  @IsOptional()
  @IsString()
  status?: string
}
