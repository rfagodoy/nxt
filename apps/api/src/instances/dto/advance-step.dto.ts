import { IsObject } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class AdvanceStepDto {
  @ApiProperty({ description: 'Dados coletados na etapa atual' })
  @IsObject()
  data: Record<string, unknown>
}
