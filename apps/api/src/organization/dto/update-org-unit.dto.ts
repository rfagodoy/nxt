import { IsString, IsOptional, IsArray } from 'class-validator'
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

  @ApiPropertyOptional({ type: [Object], description: 'Usuários envolvidos (lista livre)' })
  @IsOptional()
  @IsArray()
  usuarios?: object[]

  @ApiPropertyOptional({ description: 'Usuário que originou o registro (auditoria futura)' })
  @IsOptional()
  @IsString()
  user?: string
}
