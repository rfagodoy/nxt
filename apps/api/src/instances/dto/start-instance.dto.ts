import { IsString, IsObject, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class StartInstanceDto {
  @ApiProperty()
  @IsString()
  processDefinitionId: string

  @ApiPropertyOptional({ description: 'Variáveis iniciais do processo' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>
}
