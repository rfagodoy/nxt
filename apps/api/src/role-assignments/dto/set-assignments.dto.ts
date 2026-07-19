import { IsString, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export const ENTITY_TYPES = ['EMPRESA', 'PARCEIRO', 'UNIDADE', 'CONTRATO', 'ORG'] as const

export class AssignmentItemDto {
  @ApiProperty()
  @IsString()
  papelId: string

  @ApiProperty()
  @IsString()
  userId: string
}

export class SetAssignmentsDto {
  @ApiProperty({ enum: ENTITY_TYPES })
  @IsString()
  @IsIn(ENTITY_TYPES as unknown as string[])
  entityType: string

  @ApiPropertyOptional({ description: 'id da entidade-anfitriã; ausente para ORG (papel global)' })
  @IsOptional()
  @IsString()
  entityId?: string

  @ApiProperty({ type: [AssignmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  items: AssignmentItemDto[]
}
