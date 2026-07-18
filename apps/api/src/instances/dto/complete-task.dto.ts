import { IsObject, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class CompleteTaskDto {
  @ApiPropertyOptional({ description: 'Dados preenchidos na atividade (viram variáveis do processo)' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>
}
