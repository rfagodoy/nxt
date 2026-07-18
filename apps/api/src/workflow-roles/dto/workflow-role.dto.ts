import { IsString, IsOptional, IsArray } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateWorkflowRoleDto {
  @ApiProperty({ description: 'Nome do papel (ex.: Gestor de Contratos)' })
  @IsString()
  name: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: 'Ids dos usuários que participam do papel', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  members?: string[]
}

export class UpdateWorkflowRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  members?: string[]
}
