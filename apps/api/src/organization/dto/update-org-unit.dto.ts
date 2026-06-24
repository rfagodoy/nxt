import { IsString, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateOrgUnitDto {
  @ApiPropertyOptional({ description: 'Unidade pai no organograma (null = raiz)' })
  @IsOptional()
  @IsString()
  parentId?: string | null

  @ApiPropertyOptional({ description: 'ADMINISTRATIVA | CENTRO_CUSTO | CENTRO_LUCRO' })
  @IsOptional()
  @IsString()
  natureza?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codigo?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nome?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsavel?: string

  @ApiPropertyOptional({ description: 'ATIVA | INATIVA' })
  @IsOptional()
  @IsString()
  status?: string
}
